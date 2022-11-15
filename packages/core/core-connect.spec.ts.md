# Fadroma Client: Connecting

```typescript
import assert from 'node:assert'
```

The innermost core of Fadroma consists of the `Chain` and `Agent`
abstract base classes. They provide a unified base layer for querying
and transacting on append-only transaction-based systems.

The platform packages (`@fadroma/scrt`, etc.) subclass those,
calling into the platform API client library (e.g. `secretjs`)
in order to implement the abstract methods.

## Chain

This package provides the abstract base class, `Chain`.

Platform packages extend `Chain` to represent connections to different chains.
  * Since the workflow is request-based, no persistent connection is maintained.
  * The `Chain` object keeps track of the globally unique chain `id` and the connection `url`.
    * **TODO:** Load balancing between multiple chain endpoints.

```typescript
import { Chain } from '@fadroma/core'
let chain: Chain = new Chain('id', { url: 'example.com', mode: 'mainnet' })
assert.equal(chain.id,   'id')
assert.equal(chain.url,  'example.com')
assert.equal(chain.mode, 'mainnet')
```

Chains can be in several `mode`s, enumerated by `ChainMode` a.k.a. `Chain.Mode`:

* **Mocknet** is a fast, nodeless way of executing contract code
  in the local JS WASM runtime.
* **Devnet** uses a real chain node, booted up temporarily in
  a local environment.
* **Testnet** is a persistent remote chain used for testing.
* **Mainnet** is the production chain where value is stored.

```typescript
assert(Chain.mocknet('any').isMocknet)
assert(Chain.devnet('any').isDevnet)
assert(Chain.testnet('any').isTestnet)
assert(Chain.mainnet('any').isMainnet)
```

### Dev mode

The `chain.devMode` flag basically corresponds to whether you
have the ability to reset the whole chain and start over.

  * This is true for mocknet and devnet, but not for testnet or mainnet.
  * This can be used to determine whether to e.g. deploy mocks of
    third-party contracts, or to use their official testnet/mainnet addresses.

```typescript
assert(Chain.mocknet('any').devMode)
assert(Chain.devnet('any').devMode)
assert(!Chain.testnet('any').devMode)
assert(!Chain.mainnet('any').devMode)
```

## Agent

To transact on the chain, you need to select an identity (wallet).
In Fadroma, you do this by obtaining an `Agent` from the `Chain` object.

* To authenticate as a specific address, pass a `mnemonic` to the `getAgent` call.
  If you don't a random mnemonic and address will be generated.

```typescript
import { Agent } from '@fadroma/core'
let agent: Agent = await chain.getAgent()

assert(agent instanceof Agent)
assert(agent.chain === chain)
```

Getting an Agent is an asynchronous operation because of the
underlying platform APIs being async.

### Waiting for block height to increment

```
//todo
```

### Native token operations

```typescript
// getting agent's balance in native tokens
const balances = { 'foo': '1', 'bar': '2' }
agent = new class TestAgent1 extends Agent {
  get defaultDenom () { return 'foo' }
  getBalance (denom = this.defaultDenom) {
    return Promise.resolve(balances[denom] || '0')
  }
}

assert.equal(await agent.balance,           '1')
assert.equal(await agent.getBalance(),      '1')
assert.equal(await agent.getBalance('foo'), '1')
assert.equal(await agent.getBalance('bar'), '2')
assert.equal(await agent.getBalance('baz'), '0')
// to one recipient
// TODO
// to many recipients in one transaction
// TODO
```

### Smart contract operations

* **Instantiating** a contract
* **Executing** a transaction
* **Querying** a contract

```typescript
console.info('api methods')
agent = new class TestAgent3 extends Agent { async instantiate () { return {} } }
assert(await agent.instantiate(null, null, null, null))
agent = new class TestAgent4 extends Agent { async execute () { return {} } }
assert(await agent.execute())
agent = new class TestAgent5 extends Agent { async query () { return {} } }
assert(await agent.query())
```

### Genesis accounts

On devnet, Fadroma creates named genesis accounts for you,
which you can use by passing `name` to `getAgent`:

```typescript
const mockNode = { getGenesisAccount () { return {} }, respawn () {} }
chain = new Chain('id', { mode: Chain.Mode.Devnet, node: mockNode })
assert(await chain.getAgent({ name: 'Alice' }) instanceof Agent)
```

## Transaction bundling

To submit multiple messages as a single transaction, you can
use Bundles.
  * A `Bundle` is a special kind of `Agent` that
    does not broadcast messages immediately.
  * Instead, messages are collected inside the bundle until
    the caller explicitly submits them.
  * Bundles can also be saved for manual signing of multisig
    transactions

```typescript
import { Bundle } from '.'
let bundle: Bundle
class TestBundle extends Bundle {
  async submit () { return 'submitted' }
  async save   () { return 'saved' }
}
```

A `Bundle` is designed to serve as a stand-in for its corresponding
`Agent`, and therefore implements the same API methods.
  * However, some operations don't make sense in the middle of a Bundle.
  * Most importantly, querying any state from the chain
    must be done either before or after the bundle.
  * Trying to query state from a `Bundle` agent will fail.

```typescript
import { Client } from '.'
bundle = new Bundle({ chain: {}, checkHash () { return 'hash' } })

assert(bundle.getClient(Client, '') instanceof Client)
assert.equal(await bundle.execute({}), bundle)
assert.equal(bundle.id, 1)
//assert(await bundle.instantiateMany({}, []))
//assert(await bundle.instantiateMany({}, [['label', 'init']]))
//assert(await bundle.instantiate({}, 'label', 'init'))
assert.equal(await bundle.checkHash(), 'hash')

assert.rejects(()=>bundle.query())
assert.rejects(()=>bundle.upload())
assert.rejects(()=>bundle.uploadMany())
assert.rejects(()=>bundle.sendMany())
assert.rejects(()=>bundle.send())
assert.rejects(()=>bundle.getBalance())
assert.throws(()=>bundle.height)
assert.throws(()=>bundle.nextBlock)
assert.throws(()=>bundle.balance)
```

To create and submit a bundle in a single expression,
you can use `bundle.wrap(async (bundle) => { ... })`:

```typescript
assert.equal(await new TestBundle(agent).wrap(async bundle=>{
  assert(bundle instanceof TestBundle)
}), 'submitted')

assert.equal(await new TestBundle(agent).wrap(async bundle=>{
  assert(bundle instanceof TestBundle)
}, undefined, true), 'saved')
```

```typescript
bundle = new TestBundle(agent)
assert.deepEqual(bundle.msgs, [])
assert.equal(bundle.id, 0)
assert.throws(()=>bundle.assertMessages())

bundle.add({})
assert.deepEqual(bundle.msgs, [{}])
assert.equal(bundle.id, 1)
assert.ok(bundle.assertMessages())
```

```typescript
bundle = new TestBundle(agent)
assert.equal(await bundle.run(""),       "submitted")
assert.equal(await bundle.run("", true), "saved")
assert.equal(bundle.depth, 0)

bundle = bundle.bundle()
assert.equal(bundle.depth, 1)
assert.equal(await bundle.run(), null)
```

```typescript
agent = new class TestAgent extends Agent { Bundle = class TestBundle extends Bundle {} }
bundle = agent.bundle()
assert(bundle instanceof Bundle)

agent = new class TestAgent extends Agent { Bundle = class TestBundle extends Bundle {} }
//await agent.instantiateMany(new Contract(), [])
//await agent.instantiateMany(new Contract(), [], 'prefix')
```

## `Fee`: Specifying per-transaction gas fees

```typescript
import { Fee } from '.'
```

* `client.fee` is the default fee for all transactions
* `client.fees: Record<string, IFee>` is a map of default fees for specific transactions
* `client.withFee(fee: IFee)` allows the caller to override the default fees.
  Calling it returns a new instance of the Client, which talks to the same contract
  but executes all transactions with the specified custom fee.

## Contract metadata

The `Metadata` class is the base class of the
`ContractSource`->`ContractTemplate`->`ContractInstance` inheritance chain.

### `ContractInstance`

Represents a contract that is instantiated from a `codeId`.
  * Can have an `address`.
  * You can get a `Client` from a `ContractInstance` using
    the `getClient` family of methods.

```typescript
import { ContractInstance } from '@fadroma/core'
let instance: ContractInstance = new ContractInstance()
assert.ok(instance.asReceipt)
//assert.ok(await instance.define({ agent }).found)
//assert.ok(await instance.define({ agent }).deployed)
```

## Contract client

Represents an interface to an existing contract.
  * The default `Client` class allows passing messages to the contract instance.
  * **Implement a custom subclass of `Client` to define specific messages as methods**.
    This is the main thing to do when defining your Fadroma Client-based API.

User interacts with contract by obtaining an instance of the
appropriate `Client` subclass from the authorized `Agent`.

```typescript
import { Client } from '@fadroma/core'
let client: Client = new Client(agent, 'some-address', 'some-code-hash')

assert.equal(client.agent,    agent)
assert.equal(client.address,  'some-address')
assert.equal(client.codeHash, 'some-code-hash')

client.fees = { 'method': 100 }

assert.equal(
  client.getFee('method'),
  100
)

assert.equal(
  client.getFee({'method':{'parameter':'value'}}),
  100
)

let agent2 = Symbol()
assert.equal(
  client.as(agent2).agent,
  agent2
)

client.agent = { execute: async () => 'ok' }
assert.equal(
  await client.execute({'method':{'parameter':'value'}}),
  'ok'
)
```

```typescript
/*let agent = {
  chain: { id: 'test' },
  getLabel:  () => Promise.resolve('label'),
  getHash:   () => Promise.resolve('hash'),
  getCodeId: () => Promise.resolve('id'),
}
let builder = {
  build: async x => x
}
let uploader = {
  agent,
  upload: async x => x
}*/
```