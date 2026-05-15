# Sui Overflow 2026 - Secret Derivation

## Root secret
- File: `~/.sui-overflow/keystore.json` (chmod 600)
- Contains the bech32 `secretKeyBech32` for the testnet Sui wallet
- This is the ONLY secret you need to remember. Everything else is derived.

## Per-service derivation
```
WALLET_ENC_KEY = sha256( secretKeyBech32 + ":" + serviceName )
```

| Service | Salt |
|---|---|
| `predict-tg-bot` | `predict-tg-bot` |
| `predict-vol-arb` | `predict-vol-arb` |

## Recompute helpers

Shell:
```
SECRET=$(python3 -c "import json; print(json.load(open('/Users/smartcoded2011/.sui-overflow/keystore.json'))['secretKeyBech32'])")
echo -n "${SECRET}:predict-tg-bot" | shasum -a 256 | awk '{print $1}'
```

Node:
```
crypto.createHash('sha256').update(secret + ':' + service).digest('hex')
```

## Why
Per the user's standing rule: never reuse a raw secret across services. Each service stores only its derived key, so a leaked `.env` cannot be used to forge another service's key. Rotating a service means re-running the derivation with a new salt.

## Rotation
If the root secret is ever exposed:
1. Generate a new Sui keypair (re-run `/tmp/sui-keygen/gen.mjs`)
2. Move funds from old address to new address
3. Re-derive all service keys with the new root
4. Update each `.env`
