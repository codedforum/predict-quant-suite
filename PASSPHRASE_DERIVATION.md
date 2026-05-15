# Encryption keys

Each service that needs an encryption key (currently only `predict-tg-bot`) holds it in its own `.env` file, chmod 600, gitignored.

## Current state

| Service | Key | Source |
|---|---|---|
| `predict-tg-bot` | `WALLET_ENC_KEY` | Random 32-byte hex generated locally and never crosses stdout |
| `predict-vol-arb` | n/a | Doesn't encrypt anything; signs with the keystore directly |
| `predict-surface-studio` | n/a | Read-only frontend, no signing |

## Generating a fresh tg-bot key (rotation)
```bash
node -e "
const fs = require('node:fs');
const crypto = require('node:crypto');
const p = '/Users/smartcoded2011/sui-overflow/predict-tg-bot/.env';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/^WALLET_ENC_KEY=.*$/m, 'WALLET_ENC_KEY=' + crypto.randomBytes(32).toString('hex'));
fs.writeFileSync(p, s);
fs.chmodSync(p, 0o600);
console.log('rotated, new key length 64 hex chars (not printed)');
"
```

After rotation, any user wallet stored in the bot's sqlite DB before the rotation becomes unrecoverable. Only safe to rotate before the bot has live users, or with a planned re-encrypt-DB migration.

## Why a random key, not a derivation
Earlier we used `sha256(walletSecret + ":" + serviceName)` so one root secret could re-derive all per-service keys. That formula was a real value-add when there were multiple services using shared secrets, but in this repo only one service needs an encryption key, so the simpler "fresh random per service, written once, backed up separately" pattern is enough — and avoids the question of what happens when the root wallet secret is exposed.

## Backup
The tg-bot key is in `predict-tg-bot/.env`. If the bot has live users, back up:
- The `.env` file (key)
- The `predict-bot.db` file (encrypted user wallets)

Together those two files restore every user's funds. Lose either and recovery is gone.
