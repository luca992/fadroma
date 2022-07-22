# Fadroma Platforms Spec

## Chain variants:

* `LegacyScrt`: creates secretjs@0.17.5 based agent using lcd/amino
* `Scrt`: creates secretjs@beta based agent using grpc

```typescript
import { SecretNetwork } from '@fadroma/scrt'
import { SecretNetworkAmino } from '@fadroma/scrt-amino'

const supportedChains = [
  SecretNetwork,
  SecretNetworkAmino
]

for (const Chain of supportedChains) {
  const chain = new Chain('test')
  const agent = await chain.getAgent({ mnemonic: Testing.mnemonics[0] })
  assert(agent instanceof Chain.Agent, `${Chain.name}#getAgent returns Promise<${Chain.Agent.name}>`)
}

for (const Chain of supportedChains) {
  ok(await new Chain('main', { mode: ChainMode.Mainnet }))
  ok(await new Chain('test', { mode: ChainMode.Testnet }))
  const node = { chainId: 'scrt-devnet', url: 'http://test:0' }
  const chain = await new Chain('dev', { mode: ChainMode.Devnet, node })
  ok(chain)
  equal(chain.node, node)
  equal(chain.url,  node.url)
  equal(chain.id,   node.chainId)
}
```

Agent variants:

* **LegacyScrt.Agent** a.k.a. **LegacyScrtAgent**: uses secretjs 0.17.5
* **Scrt.Agent** a.k.a. **ScrtRPCAgent**: which uses the new gRPC API
  provided by secretjs 1.2-beta - as opposed to the old HTTP-based ("Amino"?) API
  supported in secretjs 0.17.5 and older.

```typescript
for (const Chain of supportedChains) {
  const chain    = new Chain('test', {})
  const mnemonic = Testing.mnemonics[0]
  const agent    = await chain.getAgent({ mnemonic })
  assert.equal(agent.chain,    chain)
  assert.equal(agent.address, 'secret17tjvcn9fujz9yv7zg4a02sey4exau40lqdu0r7')
}
// waiting for next block
for (const Chain of [
  SecretNetworkAmino
]) {
  await Testing.withMockAPIEndpoint(async endpoint => {
    const chain    = new Chain('test', { url: endpoint.url })
    const mnemonic = Testing.mnemonics[0]
    const agent    = await chain.getAgent({ mnemonic })
    const [ {header:{height:block1}}, account1, balance1 ] =
      await Promise.all([ agent.block, agent.account, agent.balance ])
    await agent.nextBlock
    const [ {header:{height:block2}}, account2, balance2 ] =
      await Promise.all([ agent.block, agent.account, agent.balance ])
    equal(block1 + 1, block2)
    deepEqual(account1, account2)
    deepEqual(balance1, balance2)
  })
}

// native token balance and transactions
for (const Chain of [
  SecretNetworkAmino
]) {
  continue // TODO
  await withMockAPIEndpoint(async endpoint => {
    const chain     = new Chain('test', { url: endpoint.url })
    const mnemonic1 = Testing.mnemonics[0]
    const mnemonic2 = Testing.mnemonics[1]
    const [agent1, agent2] = await Promise.all([
      chain.getAgent({mnemonic: mnemonic1}),
      chain.getAgent({mnemonic: mnemonic2}),
    ])
    endpoint.state.balances = {
      uscrt: {
        [agent1.address]: BigInt("2000"),
        [agent2.address]: BigInt("3000")
      }
    }
    equal(await agent1.balance, "2000")
    equal(await agent2.balance, "3000")
    await agent1.send(agent2.address, "1000")
    equal(await agent1.balance, "1000")
    equal(await agent2.balance, "4000")
    await agent2.send(agent1.address, 500)
    equal(await agent1.balance, "1500")
    equal(await agent2.balance, "3500")
  })
}

// bundles implemented on all chains
for (const Chain of supportedChains) {
  const mnemonic = Testing.mnemonics[0]
  const agent    = await new Chain('🤡', {}).getAgent({ mnemonic })
  const bundle   = agent.bundle()
  ok(bundle instanceof Chain.Agent.Bundle)
}