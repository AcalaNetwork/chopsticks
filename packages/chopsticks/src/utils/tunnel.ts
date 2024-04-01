import { bootstrap } from 'global-agent'
bootstrap()
import { environment } from '@acala-network/chopsticks-core'
import npmConf from '@pnpm/npm-conf'

const npmConfig = npmConf().config

global.GLOBAL_AGENT.HTTP_PROXY =
  environment().HTTP_PROXY ||
  process.env.http_proxy ||
  environment().HTTPS_PROXY ||
  process.env.https_proxy ||
  npmConfig.get('proxy') ||
  npmConfig.get('https-proxy') ||
  global.GLOBAL_AGENT.HTTP_PROXY
