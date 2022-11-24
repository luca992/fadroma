import { defineCallable } from '@hackbg/allo'

import type { Task } from '@hackbg/task'
import type { Into, Name, Named, Many, Class } from './core-fields'
import type { ClientClass } from './core-client'
import type { Builder } from './core-build'
import type { Uploader } from './core-upload'
import type { CodeId, CodeHash, Hashed } from './core-code'
import type { ChainId } from './core-chain'
import type { Address, Message, TxHash } from './core-tx'
import type { Label } from './core-labels'
import type { Agent } from './core-agent'
import type { Deployment } from './core-deployment'

import { codeHashOf } from './core-code'
import { assertAddress } from './core-tx'
import {
  override, Maybe, defineTask, into, map, mapAsync, defineDefault, Metadata
} from './core-fields'
import { Client } from './core-client'
import { ClientError as Error } from './core-events'
import { writeLabel } from './core-labels'
import { assertBuilder } from './core-build'
import { upload } from './core-upload'
import { buildMany } from './core-build'
import { uploadMany } from './core-upload'

export interface ContractTemplate<C extends Client> {
  (): Task<ContractTemplate<C>, ContractTemplate<C> & Uploaded>
}

/** Callable object: contract template.
  * Can build and upload, but not instantiate.
  * Can produce deployable Contract instances. */
export class ContractTemplate<C extends Client> extends defineCallable(
  function ensureTemplate <C extends Client> (
    this: ContractTemplate<C>
  ): Task<ContractTemplate<C>, ContractTemplate<C> & Uploaded> {
    return this.uploaded
  },
  Metadata
) {
  context?:    Deployment     = undefined
  /** URL pointing to Git repository containing the source code. */
  repository?: string|URL     = undefined
  /** Branch/tag pointing to the source commit. */
  revision?:   string         = undefined
  /** Whether there were any uncommitted changes at build time. */
  dirty?:      boolean        = undefined
  /** Path to local Cargo workspace. */
  workspace?:  string         = undefined
  /** Name of crate in workspace. */
  crate?:      string         = undefined
  /** List of crate features to enable during build. */
  features?:   string[]       = undefined
  /** Build procedure implementation. */
  builder?:    Builder        = undefined
  /** Builder implementation that produces a Contract from the Source. */
  builderId?:  string         = undefined
  /** URL to the compiled code. */
  artifact?:   string|URL     = undefined
  /** Code hash uniquely identifying the compiled code. */
  codeHash?:   CodeHash       = undefined
  /** ID of chain on which this contract is uploaded. */
  chainId?:    ChainId        = undefined
  /** Object containing upload logic. */
  uploaderId?: string         = undefined
  /** Upload procedure implementation. */
  uploader?:   Uploader       = undefined
  /** Address of agent that performed the upload. */
  uploadBy?:   Address        = undefined
  /** TXID of transaction that performed the upload. */
  uploadTx?:   TxHash         = undefined
  /** Code ID representing the identity of the contract's code on a specific chain. */
  codeId?:     CodeId         = undefined
  /** The Agent instance that will be used to upload and instantiate the contract. */
  agent?:      Agent          = undefined
  /** The Client subclass that exposes the contract's methods.
    * @default the base Client class. */
  client?:     ClientClass<C> = Client as ClientClass<C>

  constructor (options: Partial<ContractTemplate<C>> = {}) {
    super({})
    override(this, options)
    if (this.context) {
      defineDefault(this, this.context, 'agent')
      defineDefault(this, this.context, 'builder')
      defineDefault(this, this.context, 'uploader')
      defineDefault(this, this.context, 'repository')
      defineDefault(this, this.context, 'revision')
      defineDefault(this, this.context, 'workspace')
    }
  }

  /** Set multiple parameters.
    * @returns mutated self */
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
    const self = this // lol
    async function buildContract (this: typeof self) {
      if (!this.crate) throw new Error.NoCrate()
      builder ??= assertBuilder(this)
      const result = await builder!.build(this as Buildable)
      this.define(result as Partial<typeof self>)
      return this
    }
  }

  /** One-shot deployment task. */
  get uploaded (): Task<this, this & Uploaded> {
    if (this.codeId) return Promise.resolve(this)
    const uploading = this.upload()
    Object.defineProperty(this, 'uploaded', { get () { return uploading } })
    return uploading
  }

  /** Upload compiled source code to the selected chain.
    * @returns task performing the upload */
  upload (uploader?: Uploader): Task<this, this & Uploaded> {
    const name = `upload ${this.artifact ?? this.crate ?? 'contract'}`
    return defineTask(name, uploadContract, this)
    const self = this
    async function uploadContract (this: typeof self): Promise<typeof self & Uploaded> {
      await this.compiled
      const result = await upload(this as Uploadable, uploader, uploader?.agent)
      return this.define(result as Partial<typeof self>) as typeof self & Uploaded
    }
  }

  /** Get an instance of this contract, or define a new one. */
  instance (id: Name): Task<Contract<C>, C>
  instance (id: Name, init: Message): Task<Contract<C>, C>
  instance (options?: Partial<Contract<C>>): Task<Contract<C>, C>
  instance (...args: unknown[]): Task<Contract<C>, C> {
    let options: { id?: Name, initMsg?: Message }
    if (args.length >= 2) {
      options = { id: args[0] as Maybe<Name>, initMsg: args[1] as Maybe<Message> }
    } else if (typeof args[0] === 'string') {
      options = { id: args[0] as Maybe<Name> }
    } else {
      options = args[0] ?? {}
    }
    if (this.context) {
      return this.context.defineContract({ ...this, ...options })()
    } else {
      return new Contract({ ...this, ...options })()
    }
  }
}

export type AnyContract = Contract<Client>

export interface Contract<C extends Client> {
  (): Task<ContractTemplate<C>, C>
}

/** Callable object: contract.
  * Can build and upload, and instantiate itself. */
export class Contract<C extends Client> extends defineCallable(
  function ensureContract <C extends Client> (this: Contract<C>): Task<Contract<C>, C> {
    return this.deployed
  },
  Metadata
) {
  context?:    Deployment     = undefined
  /** URL pointing to Git repository containing the source code. */
  repository?: string|URL     = undefined
  /** Branch/tag pointing to the source commit. */
  revision?:   string         = undefined
  /** Whether there were any uncommitted changes at build time. */
  dirty?:      boolean        = undefined
  /** Path to local Cargo workspace. */
  workspace?:  string         = undefined
  /** Name of crate in workspace. */
  crate?:      string         = undefined
  /** List of crate features to enable during build. */
  features?:   string[]       = undefined
  /** Build procedure implementation. */
  builder?:    Builder        = undefined
  /** Builder implementation that produces a Contract from the Source. */
  builderId?:  string         = undefined
  /** URL to the compiled code. */
  artifact?:   string|URL     = undefined
  /** Code hash uniquely identifying the compiled code. */
  codeHash?:   CodeHash       = undefined
  /** ID of chain on which this contract is uploaded. */
  chainId?:    ChainId        = undefined
  /** Object containing upload logic. */
  uploaderId?: string         = undefined
  /** Upload procedure implementation. */
  uploader?:   Uploader       = undefined
  /** Address of agent that performed the upload. */
  uploadBy?:   Address        = undefined
  /** TXID of transaction that performed the upload. */
  uploadTx?:   TxHash         = undefined
  /** Code ID representing the identity of the contract's code on a specific chain. */
  codeId?:     CodeId         = undefined
  /** The Agent instance that will be used to upload and instantiate the contract. */
  agent?:      Agent          = undefined
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
  /** Prefix of the instance label.
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
    super({})
    override(this, options)
    if (this.context) {
      defineDefault(this, this.context, 'agent')
      defineDefault(this, this.context, 'builder')
      defineDefault(this, this.context, 'uploader')
      defineDefault(this, this.context, 'repository')
      defineDefault(this, this.context, 'revision')
      defineDefault(this, this.context, 'workspace')
      const self = this
      setPrefix(this.context.name)
      function setPrefix (value: string) {
        Object.defineProperty(self, 'prefix', {
          enumerable: true,
          get () { return self.context?.name },
          set (v: string) {
            if (v !== self.context?.name) {
              self.log!.warn(`BUG: Overriding prefix from "${self.context?.name}" to "${v}"`)
            }
            setPrefix(v)
          }
        })
      }
    }
    override(this, options)
  }

  /** One-shot deployment task. */
  get deployed (): Task<this, C> {
    if (this.address) {
      this.log?.foundDeployedContract(this.address, this.id)
      const $C     = (this.client ?? Client)
      const client = new $C(this.agent, this.address, this.codeHash, this as any)
      return Promise.resolve(client)
    }
    const deploying = this.deploy()
    Object.defineProperty(this, 'deployed', { get () { return deploying } })
    return deploying
  }

  /** Deploy the contract, or retrieve it if it's already deployed.
    * @returns promise of instance of `this.client`  */
  deploy (initMsg: Into<Message>|undefined = this.initMsg): Task<this, C> {
    return defineTask(`deploy ${this.id ?? 'contract'}`, deployContract, this)
    const self = this
    async function deployContract (this: typeof self) {
      if (!this.agent)   throw new Error.NoAgent()
      if (!this.id)      throw new Error.NoName()
      this.label = writeLabel(this)
      if (!this.label)   throw new Error.NoInitLabel()
      if (!this.initMsg) throw new Error.NoInitMessage()
      await this.uploaded
      if (!this.codeId)  throw new Error.NoInitCodeId()
      this.initMsg ??= await into(initMsg) as Message
      this.log?.beforeDeploy(this, this.label!)
      const contract = await this.agent!.instantiate(this as typeof self)
      this.define(contract as Partial<typeof self>)
      this.log?.afterDeploy(this as Partial<Contract<C>>)
      if (this.context) this.context.addContract(this.id!, contract)
      const $C = (this.client ?? Client)
      const client = new $C(this.agent, this.address, this.codeHash, this as any)
      return client
    }
  }

  /** @returns true if the specified properties match the properties of this contract. */
  matches (predicate: Partial<Contract<C>>): boolean {
    for (const key in predicate) {
      if (this[key as keyof typeof predicate] !== predicate[key as keyof typeof predicate]) {
        return true
      }
    }
    return true
  }

  get asLink (): ContractLink {
    return linkStruct(this as unknown as IntoLink)
  }

  many (
    contracts: Many<[Name, Message]|Partial<this>>
  ): Task<this, Many<Task<this, C>>> {
    const size = Object.keys(contracts).length
    const name = (size === 1) ? `deploy contract` : `deploy ${size} contracts`
    const self = this
    return defineTask(name, deployManyContracts, this)
    function deployManyContracts (this: typeof self): Many<Task<typeof self, C>> {
      type Instance = [Name, Message] | Partial<typeof self>
      return map(contracts, function (instance: Instance): Task<typeof self, C> {
        if (instance instanceof Array) {
          instance = { id: instance[0], initMsg: instance[1] } as Partial<typeof self>
        }
        const contract = new Contract({
          context: self.context,
          ...instance as Partial<Contract<C>>
        })
        return contract.deployed as unknown as Task<typeof self, C>
      })
    }
  }
}

export interface ContractGroup<A extends unknown[]> {
  (): Task<ContractGroup<A>, Many<Client>>
}

/** Callable object: contract group.
  * Can build and upload, and instantiate multiple contracts. */
export class ContractGroup<A extends unknown[]> extends defineCallable(
  function ensureContractGroup <A extends unknown[]> (this: ContractGroup<A>, ...args: any) {
    return this.deploy(...args)
  }
) {

  constructor (
    public readonly context:      Deployment,
    public readonly getContracts: (...args: A)=>Many<AnyContract>
  ) {
    super()
  }

  /** Deploy an instance of this contract group. */
  async deploy (...args: A) {
    const contracts = this.getContracts.apply(this.context, args)
    await buildMany(Object.values(contracts) as unknown as Buildable[], this.context)
    await uploadMany(Object.values(contracts) as unknown as Uploadable[], this.context)
    return await mapAsync(contracts, (contract: AnyContract)=>contract.deployed)
  }

  /** Prepare multiple instances of this contract group for deployment. */
  many (instances: Many<A>) {
    const self = this
    /** Define a contract group corresponding to each member of `instances` */
    const groups = mapAsync(
      instances,
      defineContractGroup as unknown as (x:A[0])=>ContractGroup<A>
    )
    /** Deploy the specified contract groups. */
    return async function deployContractGroups (...args: A) {
      return await mapAsync(
        /** Reify the specified contract groups */
        await groups,
        /** Deploy each contract group. */
        function deployContractGroup (group: ContractGroup<A>) {
          return group.deploy(...args)
        }
      )
    }
    /** Defines a new contract group. */
    function defineContractGroup (...args: A) {
      return new ContractGroup(self.context, ()=>self.getContracts(...args))
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
  artifact:  string|URL
  chainId:   ChainId,
  codeHash?: CodeHash
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
export type IntoLink = Hashed & {
  address: Address
}

/** Reference to an instantiated smart contract,
  * in the format of Fadroma ICC. */
export interface ContractLink {
  readonly address:   Address
  readonly code_hash: CodeHash
}
