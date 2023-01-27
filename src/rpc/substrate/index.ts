import author from './author'
import chain from './chain'
import payment from './payment'
import state from './state'
import system from './system'

import { Handlers } from '../shared'

const handlers: Handlers = {
  ...author,
  ...chain,
  ...state,
  ...system,
  ...payment,
}

export default handlers
