import { SviParams } from '../lib/sviMath';

export default function SviParamsCard({ svi }: { svi: SviParams }) {
  const rows: [string, number][] = [
    ['a', svi.a],
    ['b', svi.b],
    ['ρ', svi.rho],
    ['m', svi.m],
    ['σ', svi.sigma],
  ];
  return (
    <div className="svi-table">
      {rows.map(([k, v]) => (
        <div className="svi-row" key={k}>
          <span className="k">{k}</span>
          <span className={'v ' + (v < 0 ? 'neg' : '')}>{v.toFixed(6)}</span>
        </div>
      ))}
    </div>
  );
}
