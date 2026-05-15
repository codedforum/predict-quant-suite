import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

interface Props {
  oracles: SviSnapshot[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

const ATM_T = 1 / 12; // 1-month proxy for the per-oracle ATM IV pill

export default function OracleList({ oracles, selectedIdx, onSelect }: Props) {
  return (
    <div className="oracle-list">
      {oracles.map((o, i) => {
        const atm = iv(o.svi, 0, ATM_T);
        const expiryStr = o.expirySec
          ? new Date(o.expirySec * 1000).toISOString().slice(0, 16).replace('T', ' ')
          : 'live';
        return (
          <div
            key={o.oracleId + ':' + i}
            className={'oracle-row ' + (i === selectedIdx ? 'active' : '')}
            onClick={() => onSelect(i)}
          >
            <div className="idx">{i + 1}</div>
            <div>
              <div className="id">{o.oracleId.slice(0, 14)}...{o.oracleId.slice(-4)}</div>
              <div className="meta">{expiryStr} UTC</div>
            </div>
            <div className="iv-pill">{(atm * 100).toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}
