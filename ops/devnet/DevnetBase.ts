import { Error, Console } from '../util'

import { Chain } from '@fadroma/agent'
import type { AgentOpts, ChainClass, ChainId, DevnetHandle } from '@fadroma/agent'

import $, { OpaqueDirectory, JSONFile } from '@hackbg/file'

/** An ephemeral private instance of a network. */
export default abstract class Devnet implements DevnetHandle {

  /** Create an object representing a devnet.
    * Must call the `respawn` method to get it running. */
  constructor (options?: Partial<DevnetOpts>) {
    let { chainId, identities, stateRoot, host, port, portMode, ephemeral } = options || {}

    this.chainId = chainId ?? this.chainId
    if (!this.chainId) throw new Error.Devnet.NoChainId()

    // FIXME: Is the auto-destroy working?
    this.ephemeral = ephemeral ?? this.ephemeral

    // Define connection method
    this.host     = host ?? this.host
    this.portMode = portMode! // this should go, in favor of exposing all ports
    this.port     = port ?? ((this.portMode === 'lcp') ? 1317 : 9091)

    // Define initial wallets
    this.genesisAccounts = identities ?? this.genesisAccounts

    // Define storage
    this.stateRoot = $(stateRoot || $('state', this.chainId).path).as(OpaqueDirectory)
  }

  /** Logger. */
  log: Console = new Console('@fadroma/devnet')

  /** Whether to destroy this devnet on exit. */
  ephemeral: boolean = false

  /** The chain ID that will be passed to the devnet node. */
  chainId: ChainId = 'fadroma-devnet'

  /** The protocol of the API URL without the trailing colon. */
  protocol: string = 'http'

  /** The hostname of the API URL. */
  host: string = process.env.FADROMA_DEVNET_HOST ?? 'localhost'

  /** The port of the API URL. If `null`, `freePort` will be used to obtain a random port. */
  port: number

  /** Which service does the API URL port correspond to. */
  portMode: DevnetPortMode

  /** The API URL that can be used to talk to the devnet. */
  get url (): URL { return new URL(`${this.protocol}://${this.host}:${this.port}`) }

  /** This directory is created to remember the state of the devnet setup. */
  stateRoot: OpaqueDirectory

  /** This file contains the id of the current devnet container.
    * TODO store multiple containers */
  get nodeState (): JSONFile<DevnetState> {
    return this.stateRoot.at('devnet.json').as(JSONFile) as JSONFile<DevnetState>
  }

  /** List of genesis accounts that will be given an initial balance
    * when creating the devnet container for the first time. */
  genesisAccounts: Array<string> = [
    'Admin',
    'Alice',
    'Bob',
    'Charlie',
    'Mallory'
  ]

  /** Save the info needed to respawn the node */
  save (extraData = {}) {
    const data = { chainId: this.chainId, port: this.port, ...extraData }
    this.nodeState.save(data)
    return this
  }

  /** Restore this node from the info stored in the nodeState file */
  async load (): Promise<DevnetState|null> {
    const path = this.nodeState.shortPath
    if (this.stateRoot.exists() && this.nodeState.exists()) {
      //log.info(bold(`Loading:  `), path)
      try {
        const data = this.nodeState.load()
        const { chainId, port } = data
        if (this.chainId !== chainId) {
          this.log.devnet.loadingState(chainId, this.chainId)
        }
        this.port = port as number
        return data
      } catch (e) {
        this.log.devnet.loadingFailed(path)
        this.stateRoot.delete()
        throw e
      }
    } else {
      this.log.devnet.loadingRejected(path)
      return null
    }
  }

  /** Stop this node and delete its state. */
  async terminate () {
    await this.kill()
    await this.erase()
    return this
  }

  /** Retrieve an identity */
  abstract getGenesisAccount (name: string): Promise<AgentOpts>

  /** Start the node. */
  abstract spawn (): Promise<this>

  /** Start the node if stopped. */
  abstract respawn (): Promise<this>

  /** Stop the node. */
  abstract kill (): Promise<void>

  /** Erase the state of the node. */
  abstract erase (): Promise<void>

  getChain <C extends Chain> (
    $C: ChainClass<C> = Chain as unknown as ChainClass<C>
  ): C {
    return new $C({ id: this.chainId, mode: Chain.Mode.Devnet, devnet: this })
  }

}

/** A Devnet is created from a given chain ID with given pre-configured identities,
  * and its state is stored in a given directory (e.g. `state/fadroma-devnet`). */
export interface DevnetOpts {
  /** Internal name that will be given to chain. */
  chainId?:    string
  /** Names of genesis accounts to be created with the node */
  identities?: Array<string>
  /** Path to directory where state will be stored. */
  stateRoot?:  string,
  /** Host to connect to. */
  host?:       string
  /** Port to connect to. */
  port?:       number
  /** Which of the services should be exposed the devnet's port. */
  portMode?:   DevnetPortMode
  /** Whether to destroy this devnet on exit. */
  ephemeral?:  boolean
}

/** Used to reconnect between runs. */
export interface DevnetState {
  /** ID of Docker container to restart. */
  containerId?: string
  /** Chain ID that was set when creating the devnet. */
  chainId:      string
  /** The port on which the devnet will be listening. */
  host?:        string
  /** The port on which the devnet will be listening. */
  port:         number|string
}

/** Supported connection types. */
export type DevnetPortMode = 'lcp'|'grpcWeb'

/** Supported devnet variants. */
export type DevnetPlatform =
  |'scrt_1.2'
  |'scrt_1.3'
  |'scrt_1.4'
  |'scrt_1.5'
  |'scrt_1.6'
  |'scrt_1.7'
  |'scrt_1.8'

/** Default connection type to expose on each devnet variant. */
export const devnetPortModes: Record<DevnetPlatform, DevnetPortMode> = {
  'scrt_1.2': 'lcp',
  'scrt_1.3': 'grpcWeb',
  'scrt_1.4': 'grpcWeb',
  'scrt_1.5': 'lcp',
  'scrt_1.6': 'lcp',
  'scrt_1.7': 'lcp',
  'scrt_1.8': 'lcp'
}