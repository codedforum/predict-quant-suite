import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const PREDICT_PKG = process.env.PREDICT_PKG ?? '0xPLACEHOLDER';
const RPC = process.env.SUI_RPC ?? getFullnodeUrl('testnet');

const client = new SuiClient({ url: RPC });

function decodeI64(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  const mag = Number(v.magnitude ?? 0);
  return v.is_negative ? -mag : mag;
}

async function tail() {
  let cursor = null;
  while (true) {
    try {
      const res = await client.queryEvents({
        query: { MoveEventType: `${PREDICT_PKG}::oracle::OracleSVIUpdated` },
        cursor,
        limit: 50,
        order: 'ascending',
      });
      for (const ev of res.data) {
        const p = ev.parsedJson ?? {};
        process.stdout.write(JSON.stringify({
          ts: ev.timestampMs,
          oracle: p.oracle_id,
          a: Number(p.a) / 1e9,
          b: Number(p.b) / 1e9,
          rho: decodeI64(p.rho) / 1e9,
          m: decodeI64(p.m) / 1e9,
          sigma: Number(p.sigma) / 1e9,
          chainTs: p.timestamp,
        }) + '\n');
      }
      if (res.hasNextPage && res.nextCursor) cursor = res.nextCursor;
      else await new Promise((r) => setTimeout(r, 3000));
    } catch (e) {
      console.error('poll error', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

tail();
