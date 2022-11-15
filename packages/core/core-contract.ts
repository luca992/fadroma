import type { Task } from '@hackbg/komandi'
import type { Into } from './core-fields'
import type { ClientClass } from './core-client'
import type { Builder } from './core-build'
import type { Uploader } from './core-upload'
import type { CodeId, CodeHash } from './core-code'
import type { ChainId } from './core-chain'
import type { Address, Message, TxHash } from './core-tx'
import type { Name, Label, Named } from './core-labels'
import type { Agent } from './core-agent'
import type { Deployment } from './core-deployment'

import { codeHashOf } from './core-code'
import { assertAddress } from './core-tx'
import { rebind, override, Maybe, defineTask, into, map } from './core-fields'
import { Client } from './core-client'
import { ClientError as Error } from './core-events'
import { writeLabel } from './core-labels'
import { assertBuilder } from './core-build'
import { upload } from './core-upload'

export type DeployContract<C extends Client> =
  Contract<C> & (()=> Task<Contract<C>, C>)

export type DeployAnyContract =
  DeployContract<Client>

/** Create a callable object based on Contract. */
export function defineContract <C extends Client> (
  baseOptions: Partial<Contract<C>> = {},
): DeployContract<C> {

  let template = function getOrDeployInstance (
    ...args: [Name, Message]|[Partial<Contract<C>>]
  ): Task<Contract<C>, C> {

    // Parse options
    let options = { ...baseOptions }
    if (typeof args[0] === 'string') {
      const [id, initMsg] = args
      options = { ...options, id, initMsg }
    } else if (typeof args[0] === 'object') {
      options = { ...options, ...args[0] }
    }

    // If there is a deployment, look for the contract in it
    if (options.context && options.id && options.context.contract.has(options.id)) {
      return (options.client ?? Client).fromContract(
        new Contract(options.context.contract.get(options.id))
      )
    }

    // The contract object that we'll be using
    const contract = options
      // If options were passed, define a new Contract
      ? defineContract(override({...template}, options! as object))
      // If no options were passed, use this object
      : template

    return contract.deployed
  }

  template = template.bind(template)

  Object.defineProperty(template, 'name', { enumerable: true, writable: true })

  return rebind(template, new Contract(baseOptions)) as Contract<C> & (()=> Task<Contract<C>, C>)

}

export type AnyContract = Contract<Client>

export class Contract<C extends Client> {
  context?:    Deployment    = undefined
  /** URL pointing to Git repository containing the source code. */
  repository?: string|URL    = undefined
  /** Branch/tag pointing to the source commit. */
  revision?:   string        = undefined
  /** Whether there were any uncommitted changes at build time. */
  dirty?:      boolean       = undefined
  /** Path to local Cargo workspace. */
  workspace?:  string        = undefined
  /** Name of crate in workspace. */
  crate?:      string        = undefined
  /** List of crate features to enable during build. */
  features?:   string[]      = undefined
  /** Build procedure implementation. */
  builder?:    Builder       = undefined
  /** Builder implementation that produces a Contract from the Source. */
  builderId?:  string        = undefined
  /** URL to the compiled code. */
  artifact?:   string|URL    = undefined
  /** Code hash uniquely identifying the compiled code. */
  codeHash?:   CodeHash      = undefined
  /** ID of chain on which this contract is uploaded. */
  chainId?:    ChainId       = undefined
  /** Object containing upload logic. */
  uploaderId?: string        = undefined
  /** Upload procedure implementation. */
  uploader?:   Uploader      = undefined
  /** Address of agent that performed the upload. */
  uploadBy?:   Address       = undefined
  /** TXID of transaction that performed the upload. */
  uploadTx?:   TxHash        = undefined
  /** Code ID representing the identity of the contract's code on a specific chain. */
  codeId?:     CodeId        = undefined
  /** The Agent instance that will be used to upload and instantiate the contract. */
  agent?:      Agent         = undefined
  /** The Client subclass that exposes the contract's methods.
    * @default the base Client class. */
  client?:     ClientClass<C> = Client as ClientClass<C>
  /** Address of agent that performed the init tx. */
  initBy?:     Address       = undefined
  /** Address of agent that performed the init tx. */
  initMsg?:    Into<Message> = undefined
  /** TXID of transaction that performed the init. */
  initTx?:     TxHash        = undefined
  /** Address of this contract instance. Unique per chain. */
  address?:    Address       = undefined
  /** Full label of the instance. Unique for a given Chain. */
  label?:      Label         = undefined
  /** Prefix of the instance.
    * Identifies which Deployment the instance belongs to, if any.
    * Prepended to contract label with a `/`: `PREFIX/NAME...` */
  prefix?:     Name          = undefined
  /** Proper name of the instance. Unique within the deployment.
    * If the instance is not part of a Deployment, this is equal to the label.
    * If the instance is part of a Deployment, this is used as storage key.
    * You are encouraged to store application-specific versioning info in this field. */
  id?:         Name          = undefined
  /** Deduplication suffix.
    * Appended to the contract label with a `+`: `...NAME+SUFFIX`.
    * This field has sometimes been used to redeploy an new instance
    * within the same Deployment, taking the place of the old one.
    * TODO: implement this field's semantics: last result of **alphanumeric** sort of suffixes
    *       is "the real one" (see https://stackoverflow.com/a/54427214. */
  suffix?:     Name          = undefined

  constructor (options: Partial<Contract<C>> = {}) {
    override(this, options)
  }

  /** Provide parameters for a contract.
    * @returns self with overrides from options */
  define <T extends this> (options: Partial<T> = {}): T {
    // FIXME: not all parameters can be overridden at any point in time.
    // reflect this here to ensure proper flow of data along contract lifecycle
    return override(this, options as object) as T
  }

  get compiled (): Promise<this> {
    if (this.artifact) return Promise.resolve(this)
    return this.build()
  }

  /** Compile the source using the selected builder.
    * @returns this */
  build (builder?: Builder): Task<this, this> {
    const name = `compile ${this.crate ?? 'contract'}`
    return defineTask(name, buildContract, this)
    async function buildContract (this: Contract<C>) {
      builder ??= assertBuilder(this)
      const result = await builder!.build(this as Buildable)
      this.define(result as Partial<this>)
      return this
    }
  }

  /** One-shot deployment task. */
  get uploaded (): Task<this, this> {
    if (this.codeId) return Promise.resolve(this)
    const uploading = this.upload()
    Object.defineProperty(this, 'uploaded', { get () { return uploading } })
    return uploading
  }

  /** Upload compiled source code to the selected chain.
    * @returns task performing the upload */
  upload (uploader?: Uploader): Task<this, this> {
    const name = `upload ${this.artifact ?? this.crate ?? 'contract'}`
    return defineTask(name, uploadContract, this)
    async function uploadContract (this: Contract<C>) {
      await this.compiled
      const result = await upload(this as Uploadable, uploader, uploader?.agent)
      return this.define(result as Partial<this>)
    }
  }

  /** One-shot deployment task. */
  get deployed (): Task<Contract<C>, C> {
    if (this.address) {
      this.log?.foundDeployedContract(this.address, this.id)
      return Promise.resolve((this.client ?? Client).fromContract(this) as C)
    }
    const deploying = this.deploy()
    Object.defineProperty(this, 'deployed', { get () { return deploying } })
    return deploying
  }

  /** Deploy the contract, or retrieve it if it's already deployed.
    * @returns promise of instance of `this.client`  */
  deploy (initMsg: Into<Message>|undefined = this.initMsg): Task<Contract<C>, C> {
    return defineTask(`deploy ${this.id ?? 'contract'}`, deployContract, this)
    async function deployContract (this: Contract<C>) {
      if (!this.agent)   throw new Error.NoAgent(this.id)
      if (!this.id)      throw new Error.NoName(this.id)
      this.label = writeLabel(this)
      if (!this.label)   throw new Error.NoInitLabel(this.id)
      if (!this.initMsg) throw new Error.NoInitMessage(this.id)
      await this.uploaded
      if (!this.codeId)  throw new Error.NoInitCodeId(this.id)
      this.initMsg ??= await into(initMsg) as Message
      this.log?.beforeDeploy(this, this.label!)
      const contract = await this.agent!.instantiate(this)
      this.define(contract as Partial<this>)
      this.log?.afterDeploy(this as Partial<Contract<C>>)
      if (this.context) this.context.contract.add(this.id!, contract)
      return (this.client ?? Client).fromContract(this)
    }
  }

  many (contracts: Array<[Name, Message]|Partial<AnyContract>>): Task<Contract<C>, Array<Contract<C>>>
  many (contracts: Named<[Name, Message]|Partial<AnyContract>>): Task<Contract<C>, Named<Contract<C>>>
  many (contracts: any): Task<Contract<C>, Array<Contract<C>>> | Task<Contract<C>, Named<Contract<C>>> {
    const size = Object.keys(contracts).length
    const name = (size === 1) ? `deploy contract` : `deploy ${size} contracts`
    return defineTask(name, deployManyContracts, this)
    function deployManyContracts (this: Contract<C>) {
      return map(contracts, (contract: ([Name, Message]|Partial<AnyContract>)) => {
        if (contract instanceof Array) contract = { name: contract[0], initMsg: contract[1] }
        contract = defineContract({ ...this, ...contract })
        return contract.deployed
      })
    }
  }

}

/** Parameters involved in building a contract. */
export interface Buildable {
  crate:       string
  features?:   string[]
  workspace?:  string
  repository?: string|URL
  revision?:   string
  dirty?:      boolean
  builder?:    Builder
}

/** Result of building a contract. */
export interface Built {
  artifact:   string|URL
  codeHash?:  CodeHash
  builder?:   Builder
  builderId?: string
}

/** @returns the data for saving a build receipt. */
export function toBuildReceipt (s: Buildable & Built) {
  return {
    repository: s.repository,
    revision:   s.revision,
    dirty:      s.dirty,
    workspace:  s.workspace,
    crate:      s.crate,
    features:   s.features?.join(', '),
    builder:    undefined,
    builderId:  s.builder?.id,
    artifact:   s.artifact?.toString(),
    codeHash:   s.codeHash
  }
}

/** Parameters involved in uploading a contract */
export interface Uploadable {
  artifact: string|URL
  chainId:  ChainId
}

/** Result of uploading a contract */
export interface Uploaded {
  chainId:   ChainId
  codeId:    CodeId
  codeHash:  CodeHash
  uploader?: Uploader
  uploadBy?: Address
  uploadTx?: TxHash
}

/** @returns the data for saving an upload receipt. */
export function toUploadReceipt (
  t: Buildable & Built & Uploadable & Uploaded
) {
  return {
    ...toBuildReceipt(t),
    chainId:    t.chainId,
    uploaderId: t.uploader?.id,
    uploader:   undefined,
    uploadBy:   t.uploadBy,
    uploadTx:   t.uploadTx,
    codeId:     t.codeId
  }
}

/** Parameters involved in instantiating a contract */
export interface Instantiable {
  chainId:   ChainId
  codeId:    CodeId
  codeHash?: CodeHash
  label?:    Label
  prefix?:   Name
  name?:     Name
  suffix?:   Name
  initMsg:   Message
}

/** Result of instantiating a contract */
export interface Instantiated {
  chainId:  ChainId
  address:  Address
  codeHash: CodeHash
  label:    Label
  prefix?:  Name
  name?:    Name
  suffix?:  Name
  initBy?:  Address
  initTx?:  TxHash
}

/** @returns the data for a deploy receipt */
export function toInstanceReceipt (
  c: Buildable & Built & Uploadable & Uploaded & Instantiable & Instantiated
) {
  return {
    ...toUploadReceipt(c),
    initBy:  c.initBy,
    initMsg: c.initMsg,
    initTx:  c.initTx,
    address: c.address,
    label:   c.label,
    prefix:  c.prefix,
    name:    c.name,
    suffix:  c.suffix
  }
}

/** Convert Fadroma.Instance to address/hash struct (ContractLink) */
export const linkStruct = (instance: IntoLink): ContractLink => ({
  address:   assertAddress(instance),
  code_hash: codeHashOf(instance)
})

/** Objects that have an address and code hash.
  * Pass to linkTuple or linkStruct to get either format of link. */
export interface IntoLink extends Hashed {
  address: Address
}

/** Reference to an instantiated smart contract,
  * in the format of Fadroma ICC. */
export interface ContractLink {
  readonly address:   Address
  readonly code_hash: CodeHash
}