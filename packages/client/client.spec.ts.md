# Fadroma Client Spec

```typescript
import * as Testing from '../../TESTING.ts.md'
import assert, { ok, equal, deepEqual } from 'assert'
```

## Chain, Agent, Client

Base layer for isomorphic contract clients.

1. User selects chain by instantiating a `Chain` object.
2. User authorizes agent by obtaining an `Agent` instance from the `Chain`.
3. User interacts with contract by obtaining an instance of the
   appropriate `Client` subclass from the authorized `Agent`.

```typescript
import { Chain, Agent, Client } from '.'
```

### Chain

```typescript
let chain: Chain
```

* Chain config

```typescript
chain = new Chain('any', { url: 'example.com' })
assert.equal(chain.id,  'any')
assert.equal(chain.url, 'example.com')
```

* Chain modes

```typescript
import { ChainMode } from '.'

chain = new Chain('any', { mode: ChainMode.Mainnet })
assert(chain.isMainnet)

chain = new Chain('any', { mode: ChainMode.Testnet })
assert(chain.isTestnet && !chain.isMainnet)

chain = new Chain('any', { mode: ChainMode.Devnet })
assert(chain.isDevnet  && !chain.isMainnet && !chain.isTestnet)

chain = new Chain('any', { mode: ChainMode.Mocknet })
assert(chain.isMocknet && !chain.isMainnet && !chain.isDevnet)
```

### Agent

```typescript
let agent: Agent
```

* Getting an agent from a chain
  * This is asynchronous to allow for async crypto functions to run.

```typescript
assert(await chain.getAgent({}) instanceof Agent)
```

* When using devnet, you can also get an agent from a named genesis account:

```typescript
assert(await new Chain('devnet', {
  mode: ChainMode.Devnet,
  node: { getGenesisAccount () { return {} }, respawn () {} }
}).getAgent({ name: 'Alice' }) instanceof Agent)
```

* **Waiting** until the block height has incremented

```
//todo
```

* **Sending** native tokens

```typescript
// getting agent's balance in native tokens
const balances = { 'foo': '1', 'bar': '2' }
agent = new class TestAgent1 extends Agent {
  get defaultDenom () { return 'foo' }
  getBalance (denom = this.defaultDenom) {
    return Promise.resolve(balances[denom] || '0')
  }
}
equal(await agent.balance,           '1')
equal(await agent.getBalance(),      '1')
equal(await agent.getBalance('foo'), '1')
equal(await agent.getBalance('bar'), '2')
equal(await agent.getBalance('baz'), '0')
// to one recipient
// TODO
// to many recipients in one transaction
// TODO
```

* **Instantiating** a contract
* **Executing** a transaction
* **Querying** a contract

```typescript
console.info('api methods')
agent = new class TestAgent3 extends Agent { async instantiate () { return {} } }
assert.ok(await agent.instantiate(null, null, null, null))
agent = new class TestAgent4 extends Agent { async execute () { return {} } }
assert.ok(await agent.execute())
agent = new class TestAgent5 extends Agent { async query () { return {} } }
assert.ok(await agent.query())
```

* **Bundling** transactions:

```typescript
import { Bundle } from '.'
let bundle: Bundle
```

```typescript
console.info('get bundle from agent')
agent = new class TestAgent extends Agent { Bundle = class TestBundle extends Bundle {} }
bundle = agent.bundle()
ok(bundle instanceof Bundle)

console.info('auto use bundle in agent for instantiateMany')
agent = new class TestAgent extends Agent { Bundle = class TestBundle extends Bundle {} }
await agent.instantiateMany([])
await agent.instantiateMany([], 'prefix')
```

### Client

```typescript
let client: Client
```

The `Client` class allows you to transact with a specific smart contract
deployed on a specific [Chain](./Chain.spec.ts.md), as a specific [Agent](./Agent.spec.ts.md).

```typescript
// get a contract client from the agent
client = agent.getClient()
ok(client)
```

### Specifying per-transaction gas fees

* `client.fee` is the default fee for all transactions
* `client.fees: Record<string, IFee>` is a map of default fees for specific transactions
* `client.withFee(fee: IFee)` allows the caller to override the default fees.
  Calling it returns a new instance of the Client, which talks to the same contract
  but executes all transactions with the specified custom fee.