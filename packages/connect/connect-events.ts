import { Chain, ClientConsole, ClientError } from '@fadroma/client'

export class ConnectConsole extends ClientConsole {
  name = 'Fadroma Connect'
  supportedChains (supportedChains: Record<string, unknown> = Chain.variants) {
    this.log()
    this.info('Known chain names:')
    for (const chain of Object.keys(supportedChains).sort()) {
      this.info(`  ${chain}`)
    }
  }
  noName (chains: Record<string, unknown>) {
    this.error('Pass a known chain name or set FADROMA_CHAIN env var.')
    this.supportedChains(chains)
    return 1
  }
  selectedChain (chain?: string) {
    this.log()
    if (chain) {
      this.info('Selected chain:')
      this.info(`  ${chain}`)
    } else {
      this.info('No selected chain. Set FADROMA_CHAIN in .env or shell environment.')
    }
  }
}

export const log = new ConnectConsole('Fadroma Connect')

export class ConnectError extends ClientError {
  static SelectChainHint =
    `Try setting the FADROMA_CHAIN env var to one of the supported values.`
  static UnknownChainSelected = this.define('UnknownChainSelected',
    (name: string, chains?: Record<string, unknown>)=>{
      chains && log.supportedChains(chains)
      return `Unknown chain "${name}". ${ConnectError.SelectChainHint}`
    })
  static NoChainSelected = this.define('NoChainSelected',
    (chains?: Record<string, unknown>)=>{
      chains && log.supportedChains(chains)
      return `No chain selected. ${ConnectError.SelectChainHint}`
    })
}