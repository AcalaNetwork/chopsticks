use core::{future, mem, ops, pin, str, task, time::Duration};
use futures_lite::future::FutureExt as _;
use smoldot_light::platform::{read_write, SubstreamDirection};
use std::{
    borrow::Cow,
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex},
};

use crate::{
    light_client::{monotonic_clock_us, JsLightClientCallback},
    timers::Delay,
};

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
        _log_level: smoldot_light::platform::LogLevel,
        _log_target: &'a str,
        _message: &'a str,
        _key_values: impl Iterator<Item = (&'a str, &'a dyn core::fmt::Display)>,
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
            connection_id,
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
        _address: smoldot_light::platform::MultiStreamAddress,
    ) -> Self::MultiStreamConnectFuture {
        unimplemented!()
    }

    fn open_out_substream(
        &self,
        MultiStreamWrapper(_connection_id, _callback): &mut Self::MultiStream,
    ) {
        unimplemented!()
    }

    fn next_substream<'a>(
        &self,
        MultiStreamWrapper(_connection_id, _callback): &'a mut Self::MultiStream,
    ) -> Self::NextSubstreamFuture<'a> {
        unimplemented!()
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
                    let stream_inner = lock.streams.get_mut(&stream.connection_id).unwrap();

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

        let stream_inner = lock.streams.get_mut(&self.stream.connection_id).unwrap();

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

            if stream_inner.reset.is_none() {
                self.stream
                    .callback
                    .message_send(self.stream.connection_id, buffer);
            }
        }

        if self.read_write.write_bytes_queueable.is_none() && !self.stream.write_closed {
            self.stream.write_closed = true;
        }
    }
}

pub struct StreamWrapper {
    pub connection_id: u32,
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
        lock.connections.remove(&self.connection_id).unwrap();
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
            ConnectionInner::Reset => (true, false),
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

/// All the connections that are alive.
struct NetworkState {
    next_connection_id: u32,
    connections: hashbrown::HashMap<u32, Connection, FnvBuildHasher>,
    streams: BTreeMap<u32, Stream>,
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
    /// [`bindings::connection_reset`] has been called
    Reset,
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

pub(crate) fn connection_writable_bytes(connection_id: u32, bytes: u32) {
    let mut lock = STATE.try_lock().unwrap();
    if lock.connections.get_mut(&connection_id).is_none() {
        return;
    }

    let stream = lock.streams.get_mut(&connection_id).unwrap();
    debug_assert!(stream.reset.is_none());

    // As documented, the number of writable bytes must never become exceedingly large (a few
    // megabytes). As such, this can't overflow unless there is a bug on the JavaScript side.
    stream.writable_bytes_extra += usize::try_from(bytes).unwrap();
    stream.something_happened.notify(usize::MAX);
}

pub fn message_received(connection_id: u32, message: Vec<u8>) {
    if message.is_empty() {
        return;
    }
    let mut lock = STATE.try_lock().unwrap();
    // ensure connection is active
    if lock.connections.get_mut(&connection_id).is_none() {
        return;
    }

    let stream = lock.streams.get_mut(&connection_id).unwrap();
    debug_assert!(stream.reset.is_none());

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

pub fn connection_reset(connection_id: u32) {
    let mut lock = STATE.try_lock().unwrap();
    let connection = lock.connections.get_mut(&connection_id);
    let connection = match connection {
        Some(connection) => connection,
        None => return,
    };

    connection.inner = ConnectionInner::Reset;

    connection.something_happened.notify(usize::MAX);

    if let Some(stream) = lock.streams.get_mut(&connection_id) {
        stream.reset = Some("connection reset".into());
        stream.something_happened.notify(usize::MAX);
    }
}
