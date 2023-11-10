import { ApiPromise } from '@polkadot/api'
import { Codec } from '@polkadot/types/types'
import { expect } from 'vitest'

export * from './check.js'
export * from '@acala-network/chopsticks-utils'

type CodecOrArray = Codec | Codec[]

const processCodecOrArray = (codec: CodecOrArray, fn: (c: Codec) => any) =>
  Array.isArray(codec) ? codec.map(fn) : fn(codec)

const toHuman = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toHuman?.() ?? c)
const toJson = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toJSON?.() ?? c)
const toHex = (codec: CodecOrArray) => processCodecOrArray(codec, (c) => c?.toHex?.() ?? c)

export const expectJson = (codec: CodecOrArray) => {
  return expect(toJson(codec))
}

export const expectHex = (codec: CodecOrArray) => {
  return expect(toHex(codec))
}

type EventFilter = string | { method: string; section: string }

const _matchEvents = async (msg: string, events: Promise<Codec[] | Codec>, ...filters: EventFilter[]) => {
  let data = toHuman(await events).map(({ event: { index: _, ...event } }: any) => event)
  if (filters.length > 0) {
    const filtersArr = Array.isArray(filters) ? filters : [filters]
    data = data.filter((evt: any) => {
      return filtersArr.some((filter) => {
        if (typeof filter === 'string') {
          return evt.section === filter
        }
        const { section, method } = filter
        return evt.section === section && evt.method === method
      })
    })
  }
  return expect(data).toMatchSnapshot(msg)
}

export const matchEvents = async (events: Promise<Codec[] | Codec>, ...filters: EventFilter[]) => {
  return _matchEvents('events', redact(events), ...filters)
}

export const matchSystemEvents = async ({ api }: { api: ApiPromise }, ...filters: EventFilter[]) => {
  await _matchEvents('system events', redact(api.query.system.events()), ...filters)
}

export const redact = async (data: any | Promise<any>) => {
  const json = toHuman(await data)

  const process = (obj: any): any => {
    if (obj == null) {
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map(process)
    }
    if (typeof obj === 'number') {
      const rounded = parseFloat(obj.toPrecision(2))
      if (rounded === obj) {
        return rounded
      }
      return `(rounded ${rounded})`
    }
    if (typeof obj === 'string') {
      if (obj.match(/0x[0-9a-f]{64}/)) {
        return '(hash)'
      }
      if (obj.match(/^[\d,]+$/)) {
        const num = parseInt(obj.replace(/,/g, ''))
        const rounded = parseFloat(num.toPrecision(2))
        if (rounded === num) {
          return rounded
        }
        return `(rounded ${rounded})`
      }
      return obj
    }
    if (typeof obj === 'object') {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, process(v)]))
    }
    return obj
  }

  return process(json)
}
