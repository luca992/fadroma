export * from './DevnetError'
export { default as DevnetError } from './DevnetError'

export * from './DevnetConsole'
export { default as DevnetConsole } from './DevnetConsole'

export * from './DevnetConfig'
export { default as DevnetConfig } from './DevnetConfig'

export * from './DevnetCommands'
export { default as DevnetCommands } from './DevnetCommands'

export * from './DevnetBase'
export { default as Devnet } from './DevnetBase'

export * from './DevnetContainer'
export { default as DevnetContainer } from './DevnetContainer'

export * from './DevnetRemote'
export { default as DevnetRemote } from './DevnetRemote'

import DevnetConfig from './DevnetConfig'
/** @returns Devnet configured as per environment and options. */
export function getDevnet (options: Partial<DevnetConfig> = {}) {
  return new DevnetConfig(options).getDevnet()
}
