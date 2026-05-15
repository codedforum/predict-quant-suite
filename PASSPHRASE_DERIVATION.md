# Secret Derivation

Each service in this repo uses its own encryption key, but you only have to remember one root secret. The per-service keys are derived from it deterministically.

## Root secret
- File: `~/.sui-overflow/keystore.json` (chmod 600)
- Contains the bech32 `secretKeyBech32` for the Sui wallet
- This is the only secret you need to back up

## Derivation rule
```
WALLET_ENC_KEY = sha256( secretKeyBech32 + ":" + serviceName )    // 64 hex chars
```

| Service | Salt |
|---|---|
| `predict-tg-bot` | `predict-tg-bot` |
| `predict-vol-arb` | `predict-vol-arb` |

## Recompute

Shell:
```
SECRET=$(python3 -c "import json; print(json.load(open('$HOME/.sui-overflow/keystore.json'))['secretKeyBech32'])")
echo -n "${SECRET}:predict-tg-bot" | shasum -a 256 | awk '{print $1}'
```

Node:
```
crypto.createHash('sha256').update(secret + ':' + service).digest('hex')
```

## Why
Reusing a single secret across services means one leaked `.env` compromises every other service. Per-service derivation gives you the same memorability (one root secret) while keeping each service's stored key unique and one-way: a leaked `.env` reveals only that service's derived key, never the root, and never any other service.

## Rotation
If the root secret is exposed:
1. Generate a new keypair
2. Move funds from old address to new address
3. Re-derive all service keys with the new root + same salts
4. Update each `.env`
