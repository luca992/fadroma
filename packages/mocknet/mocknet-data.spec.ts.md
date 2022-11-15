# Fadroma Mocknet: Data passing

```typescript
import assert from 'assert'
```

## Base64 IO

* **Base64 I/O:** Fields that are of type `Binary` (query responses and the `data` field of handle
  responses) are returned by the contract as Base64-encoded strings
  * If `to_binary` is used to produce the `Binary`, it's also JSON encoded through Serde.
  * These functions are used by the mocknet code to encode/decode the base64.

```typescript
import { b64toUtf8, utf8toB64 } from './mocknet-data'

assert.equal(b64toUtf8('IkVjaG8i'), '"Echo"')
assert.equal(utf8toB64('"Echo"'), 'IkVjaG8i')
```