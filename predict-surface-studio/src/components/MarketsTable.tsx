import { useMemo, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

type SortKey = 'idx' | 'expiry' | 'atm' | 'days';

export default function MarketsTable({ oracles, selectedIdx, onSelect }: { oracles: SviSnapshot[]; selectedIdx: number; onSelect: (i: number) => void }) {
  const [sort, setSort] = useState<SortKey>('idx');
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const decorated = oracles.map((o, i) => {
      const days = o.expirySec ? (o.expirySec - Date.now() / 1000) / 86400 : 0;
      const T = Math.max(days * 86400, 60) / (365 * 86400);
      return {
        i, oracle: o,
        days,
        atm: iv(o.svi, 0, T),
        skew: iv(o.svi, -0.25, T) - iv(o.svi, 0.25, T),
      };
    });
    decorated.sort((a, b) => {
      const ax = sort === 'idx' ? a.i : sort === 'expiry' ? a.oracle.expirySec : sort === 'atm' ? a.atm : a.days;
      const bx = sort === 'idx' ? b.i : sort === 'expiry' ? b.oracle.expirySec : sort === 'atm' ? b.atm : b.days;
      return (ax - bx) * (asc ? 1 : -1);
    });
    return decorated;
  }, [oracles, sort, asc]);

  const head = (key: SortKey, label: string) => (
    <th onClick={() => { sort === key ? setAsc(!asc) : (setSort(key), setAsc(true)); }} style={{ cursor: 'pointer' }}>
      {label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className="markets-wrap">
      <table className="markets-table">
        <thead>
          <tr>
            {head('idx', '#')}
            <th>Oracle</th>
            {head('expiry', 'Expiry (UTC)')}
            {head('days', 'Days')}
            {head('atm', 'ATM IV')}
            <th>25Δ Skew</th>
            <th>Forward</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.i} className={r.i === selectedIdx ? 'active' : ''} onClick={() => onSelect(r.i)}>
              <td>{r.i + 1}</td>
              <td>{r.oracle.oracleId.slice(0, 16)}...{r.oracle.oracleId.slice(-4)}</td>
              <td>{r.oracle.expirySec ? new Date(r.oracle.expirySec * 1000).toISOString().slice(0, 16).replace('T', ' ') : '-'}</td>
              <td>{r.days.toFixed(2)}d</td>
              <td>{(r.atm * 100).toFixed(2)}%</td>
              <td style={{ color: r.skew >= 0 ? 'var(--bad)' : 'var(--good)' }}>{(r.skew * 100).toFixed(2)}%</td>
              <td>${r.oracle.forward.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
