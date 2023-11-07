import { bootstrap } from 'global-agent'
bootstrap()
import npmConf from '@pnpm/npm-conf'

const npmConfig = npmConf().config

global.GLOBAL_AGENT.HTTP_PROXY =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  npmConfig.get('proxy') ||
  npmConfig.get('https-proxy') ||
  global.GLOBAL_AGENT.HTTP_PROXY
