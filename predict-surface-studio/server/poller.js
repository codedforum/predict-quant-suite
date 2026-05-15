import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const PREDICT_PKG = process.env.PREDICT_PKG ?? '0xPLACEHOLDER';
const RPC = process.env.SUI_RPC ?? getFullnodeUrl('testnet');

const client = new SuiClient({ url: RPC });

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
          oracle: p.oracle_id ?? p.oracleId,
          fwd: p.forward,
          svi: p.svi ?? { a: p.a, b: p.b, rho: p.rho, m: p.m, sigma: p.sigma },
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
