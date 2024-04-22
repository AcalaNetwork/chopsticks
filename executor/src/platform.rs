use core::{future, mem, ops, pin, str, task, time::Duration};
use futures_lite::future::FutureExt as _;
use smoldot_light::platform::{read_write, SubstreamDirection};
use std::{
    borrow::Cow,
    collections::{BTreeMap, VecDeque},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use crate::{
    light_client::{monotonic_clock_us, JsLightClientCallback},
    timers::Delay,
};

/// Total number of bytes that all the connections created through [`PlatformRef`] combined have
/// received.
pub static TOTAL_BYTES_RECEIVED: AtomicU64 = AtomicU64::new(0);
/// Total number of bytes that all the connections created through [`PlatformRef`] combined have
/// sent.
pub static TOTAL_BYTES_SENT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub(crate) struct JsPlatform {
    pub callback: Arc<JsLightClientCallback>,
}

unsafe impl Sync for JsPlatform {}
unsafe impl Send for JsPlatform {}

impl smoldot_light::platform::PlatformRef for JsPlatform {
    type Delay = Delay;
    type Instant = Duration;
    type MultiStream = MultiStreamWrapper; // Entry in the ̀`CONNECTIONS` map.
    type Stream = StreamWrapper;
    type ReadWriteAccess<'a> = ReadWriteAccess<'a>;
    type StreamErrorRef<'a> = StreamError;
    // Entry in the ̀`STREAMS` map and a read buffer.
    type StreamConnectFuture = future::Ready<Self::Stream>;
    type MultiStreamConnectFuture = pin::Pin<
        Box<
            dyn future::Future<
                    Output = smoldot_light::platform::MultiStreamWebRtcConnection<
                        Self::MultiStream,
                    >,
                > + Send,
        >,
    >;
    type StreamUpdateFuture<'a> = pin::Pin<Box<dyn future::Future<Output = ()> + Send + 'a>>;
    type NextSubstreamFuture<'a> = pin::Pin<
        Box<dyn future::Future<Output = Option<(Self::Stream, SubstreamDirection)>> + Send + 'a>,
    >;

    fn now_from_unix_epoch(&self) -> Duration {
        Duration::from_micros(monotonic_clock_us())
    }

    fn now(&self) -> Self::Instant {
        Duration::from_micros(monotonic_clock_us())
    }

    fn fill_random_bytes(&self, buffer: &mut [u8]) {
        buffer[0..8].copy_from_slice(&js_sys::Math::random().to_le_bytes());
        buffer[8..16].copy_from_slice(&js_sys::Math::random().to_le_bytes());
        buffer[16..24].copy_from_slice(&js_sys::Math::random().to_le_bytes());
        buffer[24..32].copy_from_slice(&js_sys::Math::random().to_le_bytes());
    }

    fn sleep(&self, duration: Duration) -> Self::Delay {
        Delay::new(duration, self.callback.clone())
    }

    fn sleep_until(&self, when: Self::Instant) -> Self::Delay {
        Delay::new_at_monotonic_clock(when, self.callback.clone())
    }

    fn spawn_task(
        &self,
        task_name: Cow<str>,
        task: impl future::Future<Output = ()> + Send + 'static,
    ) {
        // The code below processes tasks that have names.
        #[pin_project::pin_project]
        struct FutureAdapter<F> {
            name: String,
            #[pin]
            future: F,
        }

        impl<F: future::Future> future::Future for FutureAdapter<F> {
            type Output = F::Output;
            fn poll(self: pin::Pin<&mut Self>, cx: &mut task::Context) -> task::Poll<Self::Output> {
                let this = self.project();
                log::trace!("current_task_entered {}", this.name);
                let out = this.future.poll(cx);
                log::trace!("current_task_exit {}", this.name);
                out
            }
        }

        let task = FutureAdapter {
            name: task_name.into_owned(),
            future: task,
        };

        wasm_bindgen_futures::spawn_local(task);
    }

    fn log<'a>(
        &self,
        log_level: smoldot_light::platform::LogLevel,
        log_target: &'a str,
        message: &'a str,
        key_values: impl Iterator<Item = (&'a str, &'a dyn core::fmt::Display)>,
    ) {
        // TODO:
    }

    fn client_name(&self) -> Cow<str> {
        env!("CARGO_PKG_NAME").into()
    }

    fn client_version(&self) -> Cow<str> {
        env!("CARGO_PKG_VERSION").into()
    }

    fn supports_connection_type(
        &self,
        connection_type: smoldot_light::platform::ConnectionType,
    ) -> bool {
        match connection_type {
            smoldot_light::platform::ConnectionType::TcpIpv4
            | smoldot_light::platform::ConnectionType::TcpIpv6
            | smoldot_light::platform::ConnectionType::TcpDns => false,
            smoldot_light::platform::ConnectionType::WebSocketIpv4 { .. } => true,
            smoldot_light::platform::ConnectionType::WebSocketIpv6 { .. } => false,
            smoldot_light::platform::ConnectionType::WebSocketDns { .. } => true,
            smoldot_light::platform::ConnectionType::WebRtcIpv4 => false,
            smoldot_light::platform::ConnectionType::WebRtcIpv6 => false,
        }
    }

    fn connect_stream(
        &self,
        address: smoldot_light::platform::Address,
    ) -> Self::StreamConnectFuture {
        let mut lock = STATE.try_lock().unwrap();

        let connection_id = lock.next_connection_id;
        lock.next_connection_id += 1;

        let encoded_address = match address {
            smoldot_light::platform::Address::WebSocketIp {
                ip: core::net::IpAddr::V4(ip),
                port,
            } => format!("ws://{ip}:{port}"),
            smoldot_light::platform::Address::WebSocketIp {
                ip: core::net::IpAddr::V6(ip),
                port,
            } => format!("ws://[{ip}]:{port}"),
            smoldot_light::platform::Address::WebSocketDns {
                hostname,
                port,
                secure: false,
            } => format!("ws://{hostname}:{port}"),
            smoldot_light::platform::Address::WebSocketDns {
                hostname,
                port,
                secure: true,
            } => format!("wss://{hostname}:{port}"),
            _ => panic!("unsupported address type"),
        };

        let write_closable = match address {
            smoldot_light::platform::Address::TcpIp { .. }
            | smoldot_light::platform::Address::TcpDns { .. } => true,
            smoldot_light::platform::Address::WebSocketIp { .. }
            | smoldot_light::platform::Address::WebSocketDns { .. } => false,
        };

        self.callback
            .connect(connection_id, encoded_address, vec![]);

        let _prev_value = lock.connections.insert(
            connection_id,
            Connection {
                inner: ConnectionInner::SingleStreamMsNoiseYamux,
                something_happened: event_listener::Event::new(),
            },
        );
        debug_assert!(_prev_value.is_none());

        let _prev_value = lock.streams.insert(
            (connection_id, None),
            Stream {
                reset: None,
                messages_queue: VecDeque::with_capacity(8),
                messages_queue_total_size: 0,
                something_happened: event_listener::Event::new(),
                writable_bytes_extra: 0,
            },
        );
        debug_assert!(_prev_value.is_none());

        future::ready(StreamWrapper {
            connection_id,
            stream_id: None,
            read_buffer: Vec::new(),
            inner_expected_incoming_bytes: Some(1),
            is_reset: None,
            writable_bytes: 0,
            write_closable,
            write_closed: false,
            when_wake_up: None,
            callback: self.callback.clone(),
        })
    }

    fn connect_multistream(
        &self,
        address: smoldot_light::platform::MultiStreamAddress,
    ) -> Self::MultiStreamConnectFuture {
        let mut lock = STATE.try_lock().unwrap();

        let connection_id = lock.next_connection_id;
        lock.next_connection_id += 1;

        let mut cert = vec![];

        let encoded_address: String = match address {
            smoldot_light::platform::MultiStreamAddress::WebRtc {
                ip: core::net::IpAddr::V4(ip),
                port,
                remote_certificate_sha256,
            } => {
                cert.copy_from_slice(remote_certificate_sha256);
                format!("webrtc://{ip}:{port}").into()
            }
            smoldot_light::platform::MultiStreamAddress::WebRtc {
                ip: core::net::IpAddr::V6(ip),
                port,
                remote_certificate_sha256,
            } => {
                cert.copy_from_slice(remote_certificate_sha256);
                format!("webrtc://[{ip}]:{port}").into()
            }
        };

        self.callback.connect(connection_id, encoded_address, cert);

        let _prev_value = lock.connections.insert(
            connection_id,
            Connection {
                inner: ConnectionInner::MultiStreamUnknownHandshake {
                    opened_substreams_to_pick_up: VecDeque::with_capacity(0),
                    connection_handles_alive: 1,
                },
                something_happened: event_listener::Event::new(),
            },
        );
        debug_assert!(_prev_value.is_none());

        let js_callback = self.callback.clone();

        Box::pin(async move {
            // Wait until the connection state is no longer "unknown handshake".
            let mut lock = loop {
                let something_happened = {
                    let mut lock = STATE.try_lock().unwrap();
                    let connection = lock.connections.get_mut(&connection_id).unwrap();

                    if matches!(
                        connection.inner,
                        ConnectionInner::Reset { .. } | ConnectionInner::MultiStreamWebRtc { .. }
                    ) {
                        break lock;
                    }

                    connection.something_happened.listen()
                };

                something_happened.await
            };
            let lock = &mut *lock;

            let connection = lock.connections.get_mut(&connection_id).unwrap();

            match &mut connection.inner {
                ConnectionInner::SingleStreamMsNoiseYamux { .. }
                | ConnectionInner::MultiStreamUnknownHandshake { .. } => {
                    unreachable!()
                }
                ConnectionInner::MultiStreamWebRtc {
                    local_tls_certificate_sha256,
                    ..
                } => smoldot_light::platform::MultiStreamWebRtcConnection {
                    connection: MultiStreamWrapper(connection_id, js_callback),
                    local_tls_certificate_sha256: *local_tls_certificate_sha256,
                },
                ConnectionInner::Reset { .. } => {
                    // If the connection was already reset, we proceed anyway but provide a fake
                    // certificate hash. This has absolutely no consequence.
                    smoldot_light::platform::MultiStreamWebRtcConnection {
                        connection: MultiStreamWrapper(connection_id, js_callback),
                        local_tls_certificate_sha256: [0; 32],
                    }
                }
            }
        })
    }

    fn open_out_substream(
        &self,
        MultiStreamWrapper(connection_id, _callback): &mut Self::MultiStream,
    ) {
        match STATE
            .try_lock()
            .unwrap()
            .connections
            .get(connection_id)
            .unwrap()
            .inner
        {
            ConnectionInner::MultiStreamWebRtc { .. }
            | ConnectionInner::MultiStreamUnknownHandshake { .. } => {
                self.callback.connection_stream_open(*connection_id);
            }
            ConnectionInner::Reset { .. } => {}
            ConnectionInner::SingleStreamMsNoiseYamux { .. } => {
                unreachable!()
            }
        }
    }

    fn next_substream<'a>(
        &self,
        MultiStreamWrapper(connection_id, _callback): &'a mut Self::MultiStream,
    ) -> Self::NextSubstreamFuture<'a> {
        let connection_id = *connection_id;
        let callback = self.callback.clone();
        Box::pin(async move {
            let (stream_id, direction) = loop {
                let something_happened = {
                    let mut lock = STATE.try_lock().unwrap();
                    let connection = lock.connections.get_mut(&connection_id).unwrap();

                    match &mut connection.inner {
                        ConnectionInner::Reset { .. } => return None,
                        ConnectionInner::MultiStreamWebRtc {
                            opened_substreams_to_pick_up,
                            connection_handles_alive,
                            ..
                        }
                        | ConnectionInner::MultiStreamUnknownHandshake {
                            opened_substreams_to_pick_up,
                            connection_handles_alive,
                            ..
                        } => {
                            if let Some((substream, direction)) =
                                opened_substreams_to_pick_up.pop_front()
                            {
                                *connection_handles_alive += 1;
                                break (substream, direction);
                            }
                        }
                        ConnectionInner::SingleStreamMsNoiseYamux { .. } => {
                            unreachable!()
                        }
                    }

                    connection.something_happened.listen()
                };

                something_happened.await
            };

            Some((
                StreamWrapper {
                    connection_id,
                    stream_id: Some(stream_id),
                    read_buffer: Vec::new(),
                    inner_expected_incoming_bytes: Some(1),
                    is_reset: None,
                    writable_bytes: 0,
                    write_closable: false, // Note: this is currently hardcoded for WebRTC.
                    write_closed: false,
                    when_wake_up: None,
                    callback,
                },
                direction,
            ))
        })
    }

    fn read_write_access<'a>(
        &self,
        stream: pin::Pin<&'a mut Self::Stream>,
    ) -> Result<Self::ReadWriteAccess<'a>, Self::StreamErrorRef<'a>> {
        let stream = stream.get_mut();

        if let Some(message) = &stream.is_reset {
            return Err(StreamError {
                message: message.clone(),
            });
        }

        Ok(ReadWriteAccess {
            read_write: read_write::ReadWrite {
                now: Duration::from_micros(monotonic_clock_us()),
                incoming_buffer: mem::take(&mut stream.read_buffer),
                expected_incoming_bytes: Some(0),
                read_bytes: 0,
                write_buffers: Vec::new(),
                write_bytes_queued: 0,
                write_bytes_queueable: if !stream.write_closed {
                    Some(stream.writable_bytes)
                } else {
                    None
                },
                wake_up_after: None,
            },
            stream,
        })
    }

    fn wait_read_write_again<'a>(
        &self,
        stream: pin::Pin<&'a mut Self::Stream>,
    ) -> Self::StreamUpdateFuture<'a> {
        Box::pin(async move {
            let stream = stream.get_mut();

            if stream.is_reset.is_some() {
                future::pending::<()>().await;
            }

            loop {
                let listener = {
                    let mut lock = STATE.try_lock().unwrap();
                    let stream_inner = lock
                        .streams
                        .get_mut(&(stream.connection_id, stream.stream_id))
                        .unwrap();

                    if let Some(msg) = &stream_inner.reset {
                        stream.is_reset = Some(msg.clone());
                        return;
                    }

                    let mut shall_return = false;

                    // Move the buffers from `STATE` into `read_buffer`.
                    if !stream_inner.messages_queue.is_empty() {
                        stream
                            .read_buffer
                            .reserve(stream_inner.messages_queue_total_size);

                        while let Some(msg) = stream_inner.messages_queue.pop_front() {
                            stream_inner.messages_queue_total_size -= msg.len();
                            // TODO: could be optimized by reworking the bindings
                            stream.read_buffer.extend_from_slice(&msg);
                            if stream
                                .inner_expected_incoming_bytes
                                .map_or(false, |expected| expected <= stream.read_buffer.len())
                            {
                                shall_return = true;
                                break;
                            }
                        }
                    }

                    if stream_inner.writable_bytes_extra != 0 {
                        // As documented, the number of writable bytes must never become
                        // exceedingly large (a few megabytes). As such, this can't overflow
                        // unless there is a bug on the JavaScript side.
                        stream.writable_bytes += stream_inner.writable_bytes_extra;
                        stream_inner.writable_bytes_extra = 0;
                        shall_return = true;
                    }

                    if shall_return {
                        return;
                    }

                    stream_inner.something_happened.listen()
                };

                let timer_stop = async move {
                    listener.await;
                    false
                }
                .or(async {
                    if let Some(when_wake_up) = stream.when_wake_up.as_mut() {
                        when_wake_up.await;
                        stream.when_wake_up = None;
                        true
                    } else {
                        future::pending().await
                    }
                })
                .await;

                if timer_stop {
                    return;
                }
            }
        })
    }
}

pub(crate) struct ReadWriteAccess<'a> {
    pub read_write: read_write::ReadWrite<Duration>,
    pub stream: &'a mut StreamWrapper,
}

impl<'a> ops::Deref for ReadWriteAccess<'a> {
    type Target = read_write::ReadWrite<Duration>;

    fn deref(&self) -> &Self::Target {
        &self.read_write
    }
}

impl<'a> ops::DerefMut for ReadWriteAccess<'a> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.read_write
    }
}

impl<'a> Drop for ReadWriteAccess<'a> {
    fn drop(&mut self) {
        let mut lock = STATE.try_lock().unwrap();

        let stream_inner = lock
            .streams
            .get_mut(&(self.stream.connection_id, self.stream.stream_id))
            .unwrap();

        if (self.read_write.read_bytes != 0
            && self
                .read_write
                .expected_incoming_bytes
                .map_or(false, |expected| {
                    expected >= self.read_write.incoming_buffer.len()
                }))
            || (self.read_write.write_bytes_queued != 0
                && self.read_write.write_bytes_queueable.is_some())
        {
            self.read_write.wake_up_asap();
        }

        self.stream.when_wake_up = self
            .read_write
            .wake_up_after
            .map(|until| Delay::new_at_monotonic_clock(until, self.stream.callback.clone()));

        self.stream.read_buffer = mem::take(&mut self.read_write.incoming_buffer);

        self.stream.inner_expected_incoming_bytes = self.read_write.expected_incoming_bytes;

        for buffer in self.read_write.write_buffers.drain(..) {
            assert!(buffer.len() <= self.stream.writable_bytes);
            self.stream.writable_bytes -= buffer.len();

            // `unwrap()` is ok as there's no way that `buffer.len()` doesn't fit in a `u64`.
            TOTAL_BYTES_SENT.fetch_add(u64::try_from(buffer.len()).unwrap(), Ordering::Relaxed);

            if stream_inner.reset.is_none() {
                self.stream
                    .callback
                    .stream_send(self.stream.connection_id, buffer);
            }
        }

        if self.read_write.write_bytes_queueable.is_none() && !self.stream.write_closed {
            if stream_inner.reset.is_none() && self.stream.write_closable {
                // TODO: we don't support multiple streams yet
                // self.stream.callback.close_stream(self.stream.connection_id, self.stream.stream_id);
            }

            self.stream.write_closed = true;
        }
    }
}

pub struct StreamWrapper {
    pub connection_id: u32,
    pub stream_id: Option<u32>,
    pub read_buffer: Vec<u8>,
    pub inner_expected_incoming_bytes: Option<usize>,
    /// `Some` if the remote has reset the stream and `update_stream` has since then been called.
    /// Contains the error message.
    pub is_reset: Option<String>,
    pub writable_bytes: usize,
    pub write_closable: bool,
    pub write_closed: bool,
    /// The stream should wake up after this delay.
    pub when_wake_up: Option<Delay>,
    pub callback: Arc<JsLightClientCallback>,
}

unsafe impl Sync for StreamWrapper {}
unsafe impl Send for StreamWrapper {}

impl Drop for StreamWrapper {
    fn drop(&mut self) {
        let mut lock = STATE.try_lock().unwrap();
        let lock = &mut *lock;

        let connection = lock.connections.get_mut(&self.connection_id).unwrap();
        let removed_stream = lock
            .streams
            .remove(&(self.connection_id, self.stream_id))
            .unwrap();

        let remove_connection = match &mut connection.inner {
            ConnectionInner::SingleStreamMsNoiseYamux { .. } => {
                if removed_stream.reset.is_none() {
                    self.callback.reset_connection(self.connection_id);
                }

                debug_assert!(self.stream_id.is_none());
                true
            }
            ConnectionInner::MultiStreamWebRtc {
                connection_handles_alive,
                ..
            }
            | ConnectionInner::MultiStreamUnknownHandshake {
                connection_handles_alive,
                ..
            } => {
                if removed_stream.reset.is_none() {
                    self.callback
                        .connection_stream_reset(self.connection_id, self.stream_id.unwrap());
                }
                *connection_handles_alive -= 1;
                let remove_connection = *connection_handles_alive == 0;
                if remove_connection {
                    self.callback.reset_connection(self.connection_id)
                }
                remove_connection
            }
            ConnectionInner::Reset {
                connection_handles_alive,
                ..
            } => {
                *connection_handles_alive -= 1;
                *connection_handles_alive == 0
            }
        };

        if remove_connection {
            lock.connections.remove(&self.connection_id).unwrap();
        }
    }
}

pub(crate) struct MultiStreamWrapper(u32, Arc<JsLightClientCallback>);

impl Drop for MultiStreamWrapper {
    fn drop(&mut self) {
        let mut lock = STATE.try_lock().unwrap();

        let connection = lock.connections.get_mut(&self.0).unwrap();
        let (remove_connection, reset_connection) = match &mut connection.inner {
            ConnectionInner::SingleStreamMsNoiseYamux { .. } => {
                unreachable!()
            }
            ConnectionInner::MultiStreamWebRtc {
                connection_handles_alive,
                ..
            }
            | ConnectionInner::MultiStreamUnknownHandshake {
                connection_handles_alive,
                ..
            } => {
                *connection_handles_alive -= 1;
                let v = *connection_handles_alive == 0;
                (v, v)
            }
            ConnectionInner::Reset { .. } => (true, false),
        };

        if remove_connection {
            lock.connections.remove(&self.0).unwrap();
        }
        if reset_connection {
            self.1.reset_connection(self.0);
        }
    }
}

#[derive(Debug, derive_more::Display, Clone)]
#[display(fmt = "{message}")]
pub(crate) struct StreamError {
    message: String,
}

static STATE: Mutex<NetworkState> = Mutex::new(NetworkState {
    next_connection_id: 0,
    connections: hashbrown::HashMap::with_hasher(FnvBuildHasher),
    streams: BTreeMap::new(),
});

// TODO: we use a custom `FnvBuildHasher` because it's not possible to create `fnv::FnvBuildHasher` in a `const` context
struct FnvBuildHasher;
impl core::hash::BuildHasher for FnvBuildHasher {
    type Hasher = fnv::FnvHasher;
    fn build_hasher(&self) -> fnv::FnvHasher {
        fnv::FnvHasher::default()
    }
}

/// All the connections and streams that are alive.
///
/// Single-stream connections have one entry in `connections` and one entry in `streams` (with
/// a `stream_id` always equal to `None`).
/// Multi-stream connections have one entry in `connections` and zero or more entries in `streams`.
struct NetworkState {
    next_connection_id: u32,
    connections: hashbrown::HashMap<u32, Connection, FnvBuildHasher>,
    streams: BTreeMap<(u32, Option<u32>), Stream>,
}

#[derive(Debug)]
struct Connection {
    /// Type of connection and extra fields that depend on the type.
    inner: ConnectionInner,
    /// Event notified whenever one of the fields above is modified.
    something_happened: event_listener::Event,
}

#[derive(Debug)]
enum ConnectionInner {
    SingleStreamMsNoiseYamux,
    MultiStreamUnknownHandshake {
        /// List of substreams that the host (i.e. JavaScript side) has reported have been opened,
        /// but that haven't been reported through
        /// [`smoldot_light::platform::PlatformRef::next_substream`] yet.
        opened_substreams_to_pick_up: VecDeque<(u32, SubstreamDirection)>,
        /// Number of objects (connections and streams) in the [`PlatformRef`] API that reference
        /// this connection. If it switches from 1 to 0, the connection must be removed.
        connection_handles_alive: u32,
    },
    MultiStreamWebRtc {
        /// List of substreams that the host (i.e. JavaScript side) has reported have been opened,
        /// but that haven't been reported through
        /// [`smoldot_light::platform::PlatformRef::next_substream`] yet.
        opened_substreams_to_pick_up: VecDeque<(u32, SubstreamDirection)>,
        /// Number of objects (connections and streams) in the [`PlatformRef`] API that reference
        /// this connection. If it switches from 1 to 0, the connection must be removed.
        connection_handles_alive: u32,
        /// SHA256 hash of the TLS certificate used by the local node at the DTLS layer.
        local_tls_certificate_sha256: [u8; 32],
    },
    /// [`bindings::connection_reset`] has been called
    Reset {
        /// Message given by the bindings to justify the closure.
        // TODO: why is this unused? shouldn't it be not unused?
        _message: String,
        /// Number of objects (connections and streams) in the [`PlatformRef`] API that reference
        /// this connection. If it switches from 1 to 0, the connection must be removed.
        connection_handles_alive: u32,
    },
}

struct Stream {
    /// `Some` if [`bindings::stream_reset`] has been called. Contains the error message.
    reset: Option<String>,
    /// Sum of the writable bytes reported through [`bindings::stream_writable_bytes`] that
    /// haven't been processed yet in a call to `update_stream`.
    writable_bytes_extra: usize,
    /// List of messages received through [`bindings::stream_message`]. Must never contain
    /// empty messages.
    messages_queue: VecDeque<Box<[u8]>>,
    /// Total size of all the messages stored in [`Stream::messages_queue`].
    messages_queue_total_size: usize,
    /// Event notified whenever one of the fields above is modified, such as a new message being
    /// queued.
    something_happened: event_listener::Event,
}

pub(crate) fn stream_writable_bytes(connection_id: u32, stream_id: u32, bytes: u32) {
    let mut lock = STATE.try_lock().unwrap();
    let connection = lock.connections.get_mut(&connection_id).unwrap();

    // For single stream connections, the docs of this function mentions that `stream_id` can be
    // any value.
    let actual_stream_id = match connection.inner {
        ConnectionInner::MultiStreamWebRtc { .. }
        | ConnectionInner::MultiStreamUnknownHandshake { .. } => Some(stream_id),
        ConnectionInner::SingleStreamMsNoiseYamux { .. } => None,
        ConnectionInner::Reset { .. } => unreachable!(),
    };

    let stream = lock
        .streams
        .get_mut(&(connection_id, actual_stream_id))
        .unwrap();
    debug_assert!(stream.reset.is_none());

    // As documented, the number of writable bytes must never become exceedingly large (a few
    // megabytes). As such, this can't overflow unless there is a bug on the JavaScript side.
    stream.writable_bytes_extra += usize::try_from(bytes).unwrap();
    stream.something_happened.notify(usize::MAX);
}

pub fn stream_message(connection_id: u32, stream_id: u32, message: Vec<u8>) {
    let mut lock = STATE.try_lock().unwrap();
    let connection = lock.connections.get_mut(&connection_id);
    if connection.is_none() {
        return;
    }
    let connection = connection.unwrap();

    // For single stream connections, the docs of this function mentions that `stream_id` can be
    // any value.
    let actual_stream_id = match connection.inner {
        ConnectionInner::MultiStreamWebRtc { .. }
        | ConnectionInner::MultiStreamUnknownHandshake { .. } => Some(stream_id),
        ConnectionInner::SingleStreamMsNoiseYamux { .. } => None,
        ConnectionInner::Reset { .. } => unreachable!(),
    };

    let stream = lock
        .streams
        .get_mut(&(connection_id, actual_stream_id))
        .unwrap();
    debug_assert!(stream.reset.is_none());

    TOTAL_BYTES_RECEIVED.fetch_add(u64::try_from(message.len()).unwrap(), Ordering::Relaxed);

    // Ignore empty message to avoid all sorts of problems.
    if message.is_empty() {
        return;
    }

    // There is unfortunately no way to instruct the browser to back-pressure connections to
    // remotes.
    //
    // In order to avoid DoS attacks, we refuse to buffer more than a certain amount of data per
    // connection. This limit is completely arbitrary, and this is in no way a robust solution
    // because this limit isn't in sync with any other part of the code. In other words, it could
    // be legitimate for the remote to buffer a large amount of data.
    //
    // This corner case is handled by discarding the messages that would go over the limit. While
    // this is not a great solution, going over that limit can be considered as a fault from the
    // remote, the same way as it would be a fault from the remote to forget to send some bytes,
    // and thus should be handled in a similar way by the higher level code.
    //
    // A better way to handle this would be to kill the connection abruptly. However, this would
    // add a lot of complex code in this module, and the effort is clearly not worth it for this
    // niche situation.
    //
    // While this problem is specific to browsers (Deno and NodeJS have ways to back-pressure
    // connections), we add this hack for all platforms, for consistency. If this limit is ever
    // reached, we want to be sure to detect it, even when testing on NodeJS or Deno.
    //
    // See <https://github.com/smol-dot/smoldot/issues/109>.
    // TODO: do this properly eventually ^
    if stream.messages_queue_total_size >= 25 * 1024 * 1024 {
        return;
    }

    stream.messages_queue_total_size += message.len();
    stream.messages_queue.push_back(message.into_boxed_slice());
    stream.something_happened.notify(usize::MAX);
}

pub fn connection_reset(connection_id: u32, message: Vec<u8>) {
    let message = str::from_utf8(&message)
        .unwrap_or_else(|_| panic!("non-UTF-8 message"))
        .to_owned();

    let mut lock = STATE.try_lock().unwrap();
    let connection = lock.connections.get_mut(&connection_id);
    let connection = match connection {
        Some(connection) => connection,
        None => return,
    };

    let connection_handles_alive = match &connection.inner {
        ConnectionInner::SingleStreamMsNoiseYamux { .. } => 1, // TODO: I believe that this is correct but a bit confusing; might be helpful to refactor with an enum or something
        ConnectionInner::MultiStreamWebRtc {
            connection_handles_alive,
            ..
        }
        | ConnectionInner::MultiStreamUnknownHandshake {
            connection_handles_alive,
            ..
        } => *connection_handles_alive,
        ConnectionInner::Reset { .. } => unreachable!(),
    };

    connection.inner = ConnectionInner::Reset {
        connection_handles_alive,
        _message: message.clone(),
    };

    connection.something_happened.notify(usize::MAX);

    for ((_, _), stream) in lock
        .streams
        .range_mut((connection_id, Some(u32::MAX))..=(connection_id, Some(u32::MAX)))
    {
        stream.reset = Some(message.clone());
        stream.something_happened.notify(usize::MAX);
    }
    if let Some(stream) = lock.streams.get_mut(&(connection_id, None)) {
        stream.reset = Some(message);
        stream.something_happened.notify(usize::MAX);
    }
}

pub(crate) fn connection_stream_opened(connection_id: u32, stream_id: u32, outbound: u32) {
    let mut lock = STATE.try_lock().unwrap();
    let lock = &mut *lock;

    let connection = lock.connections.get_mut(&connection_id).unwrap();
    if let ConnectionInner::MultiStreamWebRtc {
        opened_substreams_to_pick_up,
        ..
    } = &mut connection.inner
    {
        let _prev_value = lock.streams.insert(
            (connection_id, Some(stream_id)),
            Stream {
                reset: None,
                messages_queue: VecDeque::with_capacity(8),
                messages_queue_total_size: 0,
                something_happened: event_listener::Event::new(),
                writable_bytes_extra: 0,
            },
        );

        if _prev_value.is_some() {
            panic!("same stream_id used multiple times in connection_stream_opened")
        }

        opened_substreams_to_pick_up.push_back((
            stream_id,
            if outbound != 0 {
                SubstreamDirection::Outbound
            } else {
                SubstreamDirection::Inbound
            },
        ));

        connection.something_happened.notify(usize::MAX);
    } else {
        panic!()
    }
}

pub fn stream_reset(connection_id: u32, stream_id: u32, message: Vec<u8>) {
    let message: String = str::from_utf8(&message)
        .unwrap_or_else(|_| panic!("non-UTF-8 message"))
        .to_owned();

    // Note that, as documented, it is illegal to call this function on single-stream substreams.
    // We can thus assume that the `stream_id` is valid.
    let mut lock = STATE.try_lock().unwrap();
    let stream = lock
        .streams
        .get_mut(&(connection_id, Some(stream_id)))
        .unwrap();
    stream.reset = Some(message);
    stream.something_happened.notify(usize::MAX);
}
