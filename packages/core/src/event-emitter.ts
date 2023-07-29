type Cb = (...args: any[]) => any

export class EventEmitter {
  readonly callbacks: { [key: string]: Cb[] } = {}

  on(event: string, cb: Cb) {
    if (!this.callbacks[event]) this.callbacks[event] = []
    this.callbacks[event].push(cb)
  }

  removeListener(event: string, cb: Cb) {
    const cbs = this.callbacks[event]
    if (cbs) {
      this.callbacks[event] = cbs.filter((_cb) => _cb !== cb)
    }
  }

  once(event: string, cb: Cb) {
    if (!this.callbacks[event]) this.callbacks[event] = [cb]
    this.callbacks[event].push((...data: any) => cb(...data) && this.removeListener(event, cb))
  }

  emit(event: string, data: any = null) {
    const cbs = this.callbacks[event]
    if (cbs) {
      cbs.forEach((cb) => cb(data))
    }
  }
}
