import { bootstrap } from 'global-agent'
bootstrap()
import { environment } from '@acala-network/chopsticks-core'
import npmConf from '@pnpm/npm-conf'

const npmConfig = npmConf().config

globalThis.GLOBAL_AGENT.HTTP_PROXY =
  environment.HTTP_PROXY ||
  environment.http_proxy ||
  environment.HTTPS_PROXY ||
  environment.https_proxy ||
  npmConfig.get('proxy') ||
  npmConfig.get('https-proxy') ||
  globalThis.GLOBAL_AGENT.HTTP_PROXY
