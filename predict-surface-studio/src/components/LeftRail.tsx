import OracleList from './OracleList';
import SviParamsCard from './SviParamsCard';
import ArbStatus from './ArbStatus';
import { SviSnapshot } from '../lib/predictApi';

interface Props {
  oracles: SviSnapshot[];
  selectedIdx: number;
  onSelect: (i: number) => void;
  current: SviSnapshot | undefined;
}

export default function LeftRail({ oracles, selectedIdx, onSelect, current }: Props) {
  return (
    <div className="rail">
      <div className="rail-section">
        <h3>BTC Oracles <span className="meta">{oracles.length}</span></h3>
        {oracles.length ? (
          <OracleList oracles={oracles} selectedIdx={selectedIdx} onSelect={onSelect} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 5 }).map((_, i) => <span key={i} className="skeleton" style={{ height: 38 }} />)}
          </div>
        )}
      </div>

      <div className="rail-section">
        <h3>SVI Params <span className="meta">Gatheral</span></h3>
        {current ? <SviParamsCard svi={current.svi} /> : <span className="skeleton" style={{ height: 110 }} />}
      </div>

      <div className="rail-section">
        <h3>Arb Status</h3>
        {current ? <ArbStatus snapshot={current} allOracles={oracles} /> : <span className="skeleton" style={{ height: 60 }} />}
      </div>
    </div>
  );
}
