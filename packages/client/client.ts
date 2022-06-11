export type Address    = string
export type ChainId    = string
export type CodeHash   = string
export type CodeId     = string
export type Decimal    = string
export type Decimal256 = string
export type Duration   = number
export type Label      = string
export type Message    = string|Record<string, unknown>
export type Moment     = number
export type TxHash     = string
export type Uint128    = string
export type Uint256    = string

/** Reference to a compiled smart contract. */
export interface Artifact {
  url:      URL
  codeHash: CodeHash
}

/** Reference to an uploaded smart contract. */
export interface Template {
  uploadTx?: TxHash
  chainId?:  ChainId
  codeId?:   CodeId
  codeHash?: CodeHash
}

/** Reference to an instantiated smart contract. */
export interface Instance extends Template {
  address:   Address
  codeHash?: CodeHash
  label?:    Label
}

/** Reference to an instantiated smart contract in the format of Fadroma ICC. */
export class ContractLink {
  constructor (
    readonly address:   Address,
    readonly code_hash: CodeHash
  ) {}
}

/** Something that can execute queries -
  * such as a Chain, an Agent, or a Bundle
  * (though the Bundle won't let you query) */
export interface Querier {
  query <U> (contract: Instance, msg: Message): Promise<U>
  getCodeId (address: Address): Promise<string>
  getLabel  (address: Address): Promise<string>
  getHash   (address: Address): Promise<string>
}

/** Something that can execute transactions -
  * such as an Agent or a Bundle. */
export interface Executor extends Querier {
  get height ():  Promise<number>
  fees:           AgentFees
  chain:          Chain
  address?:       Address
  upload          (code: Uint8Array):   Promise<void|Template>
  uploadMany      (code: Uint8Array[]): Promise<void|Template[]>
  instantiate     (template: Template, label: string, msg: Message):   Promise<void|Instance>
  instantiateMany (configs: [Template, string, Message][]):            Promise<void|Instance[]>
  execute   <R>   (contract: Instance, msg: Message, opts?: ExecOpts): Promise<void|R>
  bundle    (): Bundle
  getClient <C extends Client, O extends ClientOptions> (
    Client: ClientCtor<C, O>, arg: Address|O
  ): C
}

/** Options for a compute transaction. */
export interface ExecOpts {
  fee?:  IFee
  send?: ICoin[]
  memo?: string
}

/** A native token. */
export interface ICoin {
  amount: Uint128
  denom:  string
}

/** A native token constructor */
export class Coin implements ICoin {
  constructor (
    amount:         number|string,
    readonly denom: string
  ) {
    this.amount = String(amount)
  }
  readonly amount: string
}

/** A gas fee, payable in native tokens. */
export interface IFee {
  amount: readonly ICoin[]
  gas:    Uint128
}

/** A constructable gas fee in native tokens. */
export class Fee implements IFee {
  constructor (
    amount:       Uint128|number,
    denom:        string,
    readonly gas: string = String(amount)
  ) {
    this.amount = [{ amount: String(amount), denom }]
  }
  readonly amount: readonly ICoin[]
}

export enum ChainMode {
  Mainnet = 'Mainnet',
  Testnet = 'Testnet',
  Devnet  = 'Devnet',
  Mocknet = 'Mocknet'
}

export interface ChainOptions {
  url?:  string
  mode:  ChainMode
  node?: DevnetHandle
}

export interface DevnetHandle {
  chainId: string
  url:     URL
  terminate:         ()             => Promise<void>
  getGenesisAccount: (name: string) => Promise<AgentOptions>
}

export abstract class Chain implements Querier {
  static Mode = ChainMode
  constructor (
    readonly id: ChainId,
    options: ChainOptions
  ) {
    if (!id) {
      throw new Error('Chain: need to pass chain id')
    }
    this.id   = id
    this.mode = options.mode
    if (options.url) {
      this.url = options.url
    }
    if (options.node) {
      if (options.mode === Chain.Mode.Devnet) {
        this.node = options.node
        if (this.url !== String(this.node.url)) {
          console.warn(`chain.url is ${this.url}; node.url is ${this.node.url}; using the latter`)
          this.url = String(this.node.url)
        }
        if (this.id !== this.node.chainId) {
          console.warn(`chain.id is ${this.id}, node.chainId is ${this.node.url}; using the latter`)
          this.id = this.node.chainId
        }
      } else {
        console.warn('Chain: "node" option passed to non-devnet. Ignoring')
      }
    }
  }
  readonly url:   string = ''
  readonly mode:  ChainMode
  readonly node?: DevnetHandle
  get isMainnet () {
    return this.mode === Chain.Mode.Mainnet
  }
  get isTestnet () {
    return this.mode === Chain.Mode.Testnet
  }
  get isDevnet  () {
    return this.mode === Chain.Mode.Devnet
  }
  get isMocknet () {
    return this.mode === Chain.Mode.Mocknet
  }
  abstract query <U> (contract: Instance, msg: Message): Promise<U>
  abstract getCodeId (address: Address): Promise<CodeId>
  abstract getLabel (address: Address): Promise<string>
  abstract getHash (address: Address): Promise<CodeHash>
  abstract Agent: AgentCtor<Agent>
  async getAgent (options: AgentOptions) {
    if (!options.mnemonic && options.name) {
      if (this.node) {
        console.info('Using devnet genesis account:', options.name)
        options = await this.node.getGenesisAccount(options.name)
      } else {
        throw new Error('Chain#getAgent: getting agent by name only supported for devnets')
      }
    }
    return await this.Agent.create(this, options)
  }
}

export interface AgentOptions {
  name?:     string
  mnemonic?: string
  address?:  Address
  fees?:     AgentFees
}

export interface AgentCtor<A extends Agent> {
  new    (chain: Chain, options: AgentOptions): A
  create (chain: Chain, options: AgentOptions): Promise<A>
}

export interface AgentFees {
  send?:   IFee
  upload?: IFee
  init?:   IFee
  exec?:   IFee
}

export abstract class Agent implements Executor {
  static create (chain: Chain, options: AgentOptions = {}): Promise<Agent> {
    throw Object.assign(new Error('Agent.create: abstract, use subclass'), { options })
  }
  constructor (readonly chain: Chain, options: AgentOptions = {}) {
    this.chain = chain
    this.name = options.name || this.name
    this.fees = options.fees || this.fees
  }
  /** The address of this agent. */
  address?: Address
  /** The friendly name of the agent. */
  name?:    string
  /** Default transaction fees to use for interacting with the chain. */
  fees:     AgentFees
  /** The default denomination in which the agent operates. */
  abstract defaultDenom: string
  /** This agent's balance in the chain's native token. */
  get balance (): Promise<string> {
    return this.getBalance(this.defaultDenom)
  }
  /** The chain's current block height. */
  get height (): Promise<number> {
    return Promise.resolve(0)
  }
  /** Wait until the block height increments. */
  get nextBlock () {
    console.info('Waiting for next block...')
    return new Promise<void>((resolve, reject)=>{
      this.height.then(async startingHeight=>{
        try {
          while (true) {
            await new Promise(ok=>setTimeout(ok, 100))
            const height = await this.height
            if (height > startingHeight) {
              resolve()
            }
          }
        } catch (e) {
          reject(e)
        }
      })
    })
  }
  getCodeId (address: Address) {
    return this.chain.getCodeId(address)
  }
  getLabel (address: Address) {
    return this.chain.getLabel(address)
  }
  getHash (address: Address) {
    return this.chain.getHash(address)
  }
  getBalance (denom = this.defaultDenom): Promise<string> {
    return Promise.resolve('0')
  }
  getClient <C extends Client, O extends ClientOptions> (
    Client: ClientCtor<C, O>, arg: Address|O
  ): C {
    return new Client(this, arg)
  }
  query <R> (contract: Instance, msg: Message): Promise<R> {
    return this.chain.query(contract, msg)
  }
  abstract execute <R> (contract: Instance, msg: Message, opts?: ExecOpts): Promise<R>
  abstract upload (blob: Uint8Array): Promise<Template>
  uploadMany (blobs: Uint8Array[] = []): Promise<Template[]> {
    return Promise.all(blobs.map(blob=>this.upload(blob)))
  }
  abstract instantiate <T> (template: Template, label: string, msg: T): Promise<Instance>
  instantiateMany (configs: [Template, string, Message][] = []): Promise<Instance[]> {
    return Promise.all(configs.map(
      async ([template, label, msg])=>Object.assign(await this.instantiate(template, label, msg), {
        codeHash: template.codeHash
      })
    ))
  }
  bundle (): Bundle {
    //@ts-ignore
    return new this.Bundle(this)
  }
  abstract Bundle: typeof Bundle
}

/** Collection of messages to broadcast as a single transaction,
  * effectively executing them simultaneously. */
export abstract class Bundle implements Executor {

  constructor (readonly agent: Agent) {}

  depth  = 0
  Bundle = this.constructor
  bundle (): this {
    console.warn('Nest bundles with care. Depth:', ++this.depth)
    return this
  }

  get chain        () { return this.agent.chain            }
  get address      () { return this.agent.address          }
  get name         () { return `${this.agent.name}@BUNDLE` }
  get fees         () { return this.agent.fees             }
  get defaultDenom () { return this.agent.defaultDenom     }

  getCodeId (address: Address) { return this.agent.getCodeId(address) }
  getLabel  (address: Address) { return this.agent.getLabel(address)  }
  getHash   (address: Address) { return this.agent.getHash(address)   }

  get balance () {
    throw new Error("don't query inside bundle")
    return Promise.resolve('0')
  }

  async getBalance (denom: string) {
    throw new Error("can't get balance in bundle")
    return Promise.resolve('0')
  }

  get height (): Promise<number> {
    throw new Error("don't query block height inside bundle")
  }

  get nextBlock (): Promise<void> {
    throw new Error("can't wait for next block inside bundle")
  }

  async instantiate (
    template: Template, label: Label, msg: Message, init_funds = []
  ): Promise<Instance> {
    await this.init(template, label, msg, init_funds)
    const { codeId, codeHash } = template
    // @ts-ignore
    return { chainId: this.agent.chain.id, codeId, codeHash, address: null }
  }

  async instantiateMany (configs: [Template, Label, Message][]): Promise<Instance[]> {
    return await Promise.all(configs.map(([template, label, initMsg])=>
      this.instantiate(template, label, initMsg)))
  }

  // TODO fold into instantiate?
  async init (template: Template, label: Label, msg: Message, funds = []) {
    this.add({
      init: {
        sender:   this.address,
        codeId:   String(template.codeId),
        codeHash: template.codeHash,
        label,
        msg,
        funds
      }
    })
    return this
  }

  //@ts-ignore
  async execute (instance: Instance, msg: Message, { send }: ExecOpts = {}): Promise<this> {
    this.add({
      exec: {
        sender:   this.address,
        contract: instance.address,
        codeHash: instance.codeHash,
        msg,
        funds: send
      }
    })
    return this
  }

  /** Queries are disallowed in the middle of a bundle because
    * even though the bundle API is structured as multiple function calls,
    * the bundle is ultimately submitted as a single transaction and
    * it doesn't make sense to query state in the middle of that. */
  async query <U> (contract: Instance, msg: Message): Promise<U> {
    throw new Error("don't query inside bundle")
  }

  /** Uploads are disallowed in the middle of a bundle because
    * it's easy to go over the max request size, and
    * difficult to know what that is in advance. */
  //@ts-ignore
  async upload (code: Uint8Array) {
    throw new Error("don't upload inside bundle")
  }

  /** Uploads are disallowed in the middle of a bundle because
    * it's easy to go over the max request size, and
    * difficult to know what that is in advance. */
  //@ts-ignore
  async uploadMany (code: Uint8Array[]) {
    throw new Error("don't upload inside bundle")
  }

  getClient <C extends Client, O extends ClientOptions> (
    Client: ClientCtor<C, O>, arg: Address|O
  ): C {
    return new Client(this as Executor, arg)
  }

  id = 0
  msgs: any[] = []
  add (msg: Message) {
    const id = this.id++
    this.msgs[id] = msg
    return id
  }

  //@ts-ignore
  async wrap (cb: BundleCallback<this>, opts = { memo: "" }): Promise<any[]> {
    await cb(this)
    return this.run(opts.memo)
  }

  run (memo = ""): Promise<any> {
    if (this.depth > 0) {
      console.warn('Unnesting bundle. Depth:', --this.depth)
      this.depth--
      //@ts-ignore
      return null
    } else {
      return this.submit(memo)
    }
  }

  assertCanSubmit () {
    if (this.msgs.length < 1) {
      throw new Error('Trying to submit bundle with no messages')
    }
  }

  abstract submit (memo: string): Promise<any>

  abstract save (name: string)

}

/** Function passed to Bundle#wrap */
export type BundleCallback<B extends Bundle> = (bundle: B)=>Promise<void>

export interface ClientOptions extends Instance {
  name?: string
  fee?:  IFee
  fees?: Record<string, IFee>
}

export interface ClientCtor<C extends Client, O extends ClientOptions> {
  new (agent: Executor, options: Address|O): C
}

/** Interface to a specific contract. Subclass to add contract-specific methods. */
export class Client implements Instance {
  constructor (readonly agent: Executor, arg: Address|ClientOptions) {
    if (typeof arg === 'string') {
      this.address  = arg
    } else {
      this.address  = arg.address
      this.name     = arg.name     || this.name
      this.label    = arg.label    || this.label
      this.codeHash = arg.codeHash || this.codeHash
      this.codeId   = arg.codeId   || this.codeId
      this.fee      = arg.fee      || this.fee
      this.fees = Object.assign(this.fees||{}, arg.fees||{})
    }
  }
  /** Friendly name of the contract. */
  name?: string
  /** The Chain on which this contract exists. */
  get chain () {
    return this.agent.chain
  }
  /** Label of the contract on the chain. */
  label?:    string
  /** Address of the contract on the chain. */
  address:   Address
  /** Code hash representing the content of the contract's code. */
  codeHash?: CodeHash
  /** Code ID representing the identity of the contract's code. */
  codeId?:   CodeId
  /** Default fee for transactions. */
  fee?: IFee
  /** Default fee for specific transactions. */
  fees: Record<string, IFee> = {}
  /** Get the recommended fee for a specific transaction. */
  getFee (msg?: string|Record<string, unknown>): IFee|undefined {
    const defaultFee = this.fee || this.agent.fees?.exec
    if (typeof msg === 'string') {
      return this.fees[msg] || defaultFee
    } else if (typeof msg === 'object') {
      const keys = Object.keys(msg)
      if (keys.length !== 1) {
        throw new Error('Client#getFee: messages must have exactly 1 root key')
      }
      return this.fees[keys[0]] || defaultFee
    }
    return this.fee || defaultFee
  }
  /** Execute a query on the specified contract as the specified Agent. */
  async query <U> (msg: Message): Promise<U> {
    return await this.agent.query(this, msg)
  }
  /** Execute a transaction on the specified contract as the specified Agent. */
  async execute <R> (msg: Message, opt: ExecOpts = {}): Promise<void|R> {
    opt.fee = opt.fee || this.getFee(msg)
    return await this.agent.execute(this, msg, opt)
  }
  /** Fetch the label, code ID, and code hash from the Chain.
    * You can override this method to populate custom contract info from the chain on your client,
    * e.g. fetch the symbol and decimals of a token contract. */
  async populate (): Promise<this> {
    const [label, codeId, codeHash] = await Promise.all([
      this.agent.getLabel(this.address),
      this.agent.getCodeId(this.address),
      this.agent.getHash(this.address)
    ])
    // TODO warn if retrieved values contradict current ones
    this.label    = label
    this.codeId   = codeId
    this.codeHash = codeHash
    return this
  }
  /** Create a copy of this Client with all transaction fees set to the provided value.
    * If the fee is undefined, returns a copy of the client with unmodified fee config. */
  withFee (fee: IFee|undefined): this {
    const Self = this.constructor as ClientCtor<typeof this, any>
    if (fee) {
      return new Self(this.agent, {...this, fee, fees: {}})
    } else {
      return new Self(this.agent, {...this, fee: this.fee, fees: this.fees})
    }
  }
  /** Create a copy of this Client that will execute the transactions as a different Agent. */
  withAgent (agent: Executor): this {
    const Self = this.constructor as ClientCtor<typeof this, any>
    return new Self(agent, { ...this })
  }
}
