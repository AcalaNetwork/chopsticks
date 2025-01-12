import type { ApiPromise } from '@polkadot/api'
import type { Codec } from '@polkadot/types/types'

type CodecOrArray = Codec | Codec[]

/**
 * Processes a Codec or array of Codecs with a given transformation function
 * @param codec - Single Codec or array of Codecs to process
 * @param fn - Transformation function to apply to each Codec
 * @returns Processed value(s)
 */
const processCodecOrArray = (codec: CodecOrArray, fn: (c: Codec) => any) =>
  Array.isArray(codec) ? codec.map(fn) : fn(codec)

/**
 * Converts Codec data to human-readable format
 * @param codec - Codec data to convert
 */
const toHuman = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toHuman?.() ?? c)

/**
 * Converts Codec data to hexadecimal format
 * @param codec - Codec data to convert
 */
const toHex = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toHex?.() ?? c)

/**
 * Converts Codec data to JSON format
 * @param codec - Codec data to convert
 */
const toJson = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toJSON?.() ?? c)

/**
 * Defines a filter for blockchain events
 * Can be either a string (section name) or an object with method and section
 */
export type EventFilter = string | { method: string; section: string }

/**
 * Configuration options for data redaction
 */
export type RedactOptions = {
  /** Redact numbers with optional precision */
  number?: boolean | number
  /** Redact 32-byte hex values */
  hash?: boolean
  /** Redact any hex values with 0x prefix */
  hex?: boolean
  /** Redact base58 addresses */
  address?: boolean
  /** Regex pattern for keys whose values should be redacted */
  redactKeys?: RegExp
  /** Regex pattern for keys that should be removed */
  removeKeys?: RegExp
}

/**
 * Function type for test assertions
 */
export type ExpectFn = (value: any) => {
  toMatchSnapshot: (msg?: string) => void
  toMatch(value: any, msg?: string): void
  toMatchObject(value: any, msg?: string): void
}

/**
 * Main class for checking and validating blockchain data
 * Provides a fluent interface for data transformation, filtering, and assertion
 */
export class Checker {
  readonly #expectFn: ExpectFn
  readonly #value: any
  readonly #pipeline: Array<(value: any) => any> = []

  #format: 'human' | 'hex' | 'json' = 'json'
  #message: string | undefined
  #redactOptions: RedactOptions | undefined

  /**
   * Creates a new Checker instance
   * @param expectFn - Function for making test assertions
   * @param value - Value to check
   * @param message - Optional message for assertions
   */
  constructor(expectFn: ExpectFn, value: any, message?: string) {
    this.#expectFn = expectFn
    this.#value = value
    this.#message = message
  }

  /** Convert the checked value to human-readable format */
  toHuman() {
    this.#format = 'human'
    return this
  }

  /** Convert the checked value to hexadecimal format */
  toHex() {
    this.#format = 'hex'
    return this
  }

  /** Convert the checked value to JSON format */
  toJson() {
    this.#format = 'json'
    return this
  }

  /**
   * Set a message for test assertions
   * @param message - Message to use in assertions
   */
  message(message: string) {
    this.#message = message
    return this
  }

  /**
   * Filter blockchain events based on provided filters
   * @param filters - Event filters to apply
   */
  filterEvents(...filters: EventFilter[]) {
    this.toHuman()
    this.#pipeline.push((value) => {
      let data = value.map(({ event: { index: _, ...event } }: any) => event)
      if (filters.length > 0) {
        data = data.filter((evt: any) => {
          return filters.some((filter) => {
            if (typeof filter === 'string') {
              return evt.section === filter
            }
            if ('method' in filter) {
              const { section, method } = filter
              return evt.section === section && evt.method === method
            }
          })
        })
      }
      return data
    })
    return this
  }

  /**
   * Apply redaction rules to the checked value
   * @param options - Redaction options
   */
  redact(options: RedactOptions = { number: 2, hash: true }) {
    this.#redactOptions = {
      ...this.#redactOptions,
      ...options,
    }
    return this
  }

  #redact(value: any) {
    if (!this.#redactOptions) {
      return value
    }

    const redactNumber = this.#redactOptions.number === true || typeof this.#redactOptions.number === 'number'
    const precision = redactNumber
      ? typeof this.#redactOptions.number === 'number'
        ? this.#redactOptions.number
        : 0
      : 0
    const redactHash = this.#redactOptions.hash === true
    const redactHex = this.#redactOptions.hex === true
    const redactAddress = this.#redactOptions.address === true

    const processNumber = (value: number) => {
      if (precision > 0) {
        const rounded = Number.parseFloat(value.toPrecision(precision))
        if (rounded === value) {
          return rounded
        }
        return `(rounded ${rounded})`
      }
      return '(number)'
    }

    const process = (obj: any): any => {
      if (obj == null) {
        return obj
      }
      if (Array.isArray(obj)) {
        return obj.map(process)
      }
      if (redactNumber && typeof obj === 'number') {
        return processNumber(obj)
      }
      if (typeof obj === 'string') {
        if (redactNumber && obj.match(/0x000000[0-9a-f]{26}/)) {
          // this is very likely u128 encoded in hex
          const num = Number.parseInt(obj)
          return processNumber(num)
        }
        if (redactHash && obj.match(/0x[0-9a-f]{64}/)) {
          return '(hash)'
        }
        if (redactHex && obj.match(/0x[0-9a-f]+/)) {
          return '(hex)'
        }
        if (redactAddress && obj.match(/^[1-9A-HJ-NP-Za-km-z]{46,48}$/)) {
          return '(address)'
        }
        if (redactNumber && obj.match(/^-?[\d,]+$/)) {
          const num = Number.parseInt(obj.replace(/,/g, ''))
          return processNumber(num)
        }
        return obj
      }
      if (typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([k]) => {
              if (this.#redactOptions?.removeKeys?.test(k)) {
                return false
              }
              return true
            })
            .map(([k, v]) => {
              if (this.#redactOptions?.redactKeys?.test(k)) {
                return [k, '(redacted)']
              }
              return [k, process(v)]
            }),
        )
      }
      return obj
    }

    return process(value)
  }

  /**
   * Add a transformation function to the processing pipeline
   * @param fn - Transformation function
   */
  map(fn: (value: any) => any) {
    this.#pipeline.push(fn)
    return this
  }

  /**
   * Apply a function to the current Checker instance
   * @param fn - Function to apply
   */
  pipe(fn?: (value: Checker) => Checker) {
    return fn ? fn(this) : this
  }

  /**
   * Get the final processed value
   * @returns Processed value after applying all transformations
   */
  async value() {
    let value = await this.#value

    switch (this.#format) {
      case 'human':
        value = toHuman(value)
        break
      case 'hex':
        value = toHex(value)
        break
      case 'json':
        value = toJson(value)
        break
    }

    for (const fn of this.#pipeline) {
      value = await fn(value)
    }

    value = this.#redact(value)

    return value
  }

  /**
   * Assert that the value matches a snapshot
   * @param msg - Optional message for the assertion
   */
  async toMatchSnapshot(msg?: string) {
    return this.#expectFn(await this.value()).toMatchSnapshot(msg ?? this.#message)
  }

  /**
   * Assert that the value matches an expected value
   * @param value - Expected value
   * @param msg - Optional message for the assertion
   */
  async toMatch(value: any, msg?: string) {
    return this.#expectFn(await this.value()).toMatch(value, msg ?? this.#message)
  }

  /**
   * Assert that the value matches an expected object structure
   * @param value - Expected object structure
   * @param msg - Optional message for the assertion
   */
  async toMatchObject(value: any, msg?: string) {
    return this.#expectFn(await this.value()).toMatchObject(value, msg ?? this.#message)
  }
}

/**
 * Creates a set of checking utilities with a provided assertion function
 * @param expectFn - Function for making test assertions
 * @returns Object containing various checking utilities
 */
export const withExpect = (expectFn: ExpectFn) => {
  /**
   * Create a new Checker instance
   * @param value - Value to check
   * @param msg - Optional message for assertions
   */
  const check = (value: any, msg?: string) => {
    if (value instanceof Checker) {
      if (msg) {
        return value.message(msg)
      }
      return value
    }
    return new Checker(expectFn, value, msg)
  }

  type Api = { api: ApiPromise }

  /**
   * Check blockchain events with filtering and redaction
   * @param events - Events to check
   * @param filters - Event filters to apply
   */
  const checkEvents = ({ events }: { events: Promise<Codec[] | Codec> }, ...filters: EventFilter[]) =>
    check(events, 'events')
      .filterEvents(...filters)
      .redact()

  /**
   * Check system events with filtering and redaction
   * @param api - Polkadot API instance
   * @param filters - Event filters to apply
   */
  const checkSystemEvents = ({ api }: Api, ...filters: EventFilter[]) =>
    check(api.query.system.events(), 'system events')
      .filterEvents(...filters)
      .redact()

  /**
   * Check Upward Message Passing (UMP) messages
   * @param api - Polkadot API instance
   */
  const checkUmp = ({ api }: Api) =>
    check(api.query.parachainSystem.upwardMessages(), 'ump').map((value) =>
      api.createType('Vec<XcmVersionedXcm>', value).toJSON(),
    )

  /**
   * Check HRMP (Horizontal Relay-routed Message Passing) messages
   * @param api - Polkadot API instance
   */
  const checkHrmp = ({ api }: Api) =>
    check(api.query.parachainSystem.hrmpOutboundMessages(), 'hrmp').map((value) =>
      (value as any[]).map(({ recipient, data }) => ({
        data: api.createType('(XcmpMessageFormat, XcmVersionedXcm)', data).toJSON(),
        recipient,
      })),
    )

  /**
   * Check a value in hexadecimal format
   * @param value - Value to check
   * @param msg - Optional message for assertions
   */
  const checkHex = (value: any, msg?: string) => check(value, msg).toHex()

  return {
    check,
    checkEvents,
    checkSystemEvents,
    checkUmp,
    checkHrmp,
    checkHex,
  }
}
