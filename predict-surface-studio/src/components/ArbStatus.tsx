import { butterflyOk } from '../lib/sviMath';
import { SviSnapshot } from '../lib/predictApi';

export default function ArbStatus({ snapshot, allOracles }: { snapshot: SviSnapshot; allOracles: SviSnapshot[] }) {
  const butterflyClean = butterflyOk(snapshot.svi);
  // Calendar check: across all oracles sorted by expiry, w_T2(k) >= w_T1(k) at k=0
  const sorted = [...allOracles].filter((o) => o.expirySec).sort((a, b) => a.expirySec - b.expirySec);
  let calendarClean = true;
  for (let i = 1; i < sorted.length; i++) {
    const wPrev = sorted[i - 1].svi.a + sorted[i - 1].svi.b * sorted[i - 1].svi.sigma;
    const wCur = sorted[i].svi.a + sorted[i].svi.b * sorted[i].svi.sigma;
    if (wCur + 1e-9 < wPrev) { calendarClean = false; break; }
  }
  return (
    <div>
      <div className="arb-row">
        <span className="check">
          <span className={'dot ' + (butterflyClean ? 'ok' : 'bad')} />
          <span className="label">Butterfly arb-free</span>
        </span>
        <span className={'status ' + (butterflyClean ? 'ok' : 'bad')}>{butterflyClean ? 'pass' : 'fail'}</span>
      </div>
      <div className="arb-row">
        <span className="check">
          <span className={'dot ' + (calendarClean ? 'ok' : 'bad')} />
          <span className="label">Calendar arb-free</span>
        </span>
        <span className={'status ' + (calendarClean ? 'ok' : 'bad')}>{calendarClean ? 'pass' : 'fail'}</span>
      </div>
    </div>
  );
}
