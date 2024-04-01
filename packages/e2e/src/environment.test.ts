import { describe, expect, it } from 'vitest'
import { environment } from '@acala-network/chopsticks'

describe('environment', () => {
  it('defaults are correct', async () => {
    expect(environment()).toMatchObject({
      DISABLE_AUTO_HRMP: false,
      DISABLE_PLUGINS: false,
      VERBOSE_LOG: false,
      LOG_COMPACT: false,
    })
  })

  it('parsing is correct', async () => {
    process.env = {
      DISABLE_AUTO_HRMP: 'true',
      PORT: '8001',
      DISABLE_PLUGINS: 'false',
      HTTP_PROXY: 'http://localhost:8080',
      HTTPS_PROXY: 'https://localhost:8080',
      LOG_LEVEL: 'info',
      VERBOSE_LOG: 'false',
      LOG_COMPACT: 'true',
    }
    expect(environment()).toMatchObject({
      DISABLE_AUTO_HRMP: true,
      PORT: '8001',
      DISABLE_PLUGINS: false,
      HTTP_PROXY: 'http://localhost:8080',
      HTTPS_PROXY: 'https://localhost:8080',
      LOG_LEVEL: 'info',
      VERBOSE_LOG: false,
      LOG_COMPACT: true,
    })
  })
})
