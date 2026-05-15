import { SviSnapshot } from '../lib/predictApi';
import { iv } from '../lib/sviMath';

interface Props {
  oracles: SviSnapshot[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}

const ATM_T = 1 / 12;

function freshness(ageMs: number): { cls: string; label: string } {
  if (ageMs < 30_000) return { cls: 'fresh', label: 'live' };
  if (ageMs < 120_000) return { cls: 'stale', label: 'stale' };
  return { cls: 'old', label: 'cold' };
}

export default function OracleList({ oracles, selectedIdx, onSelect }: Props) {
  const now = Date.now();
  return (
    <div className="oracle-list">
      {oracles.map((o, i) => {
        const atm = iv(o.svi, 0, ATM_T);
        const ageMs = now - o.timestampMs;
        const fresh = freshness(ageMs);
        const expiryStr = o.expirySec
          ? new Date(o.expirySec * 1000).toISOString().slice(5, 16).replace('T', ' ')
          : 'live';
        return (
          <div
            key={o.oracleId + ':' + i}
            className={'oracle-row ' + (i === selectedIdx ? 'active' : '')}
            onClick={() => onSelect(i)}
          >
            <div className="idx">{i + 1}</div>
            <div>
              <div className="id" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={'fresh-dot ' + fresh.cls} title={fresh.label} />
                {o.oracleId.slice(0, 12)}...{o.oracleId.slice(-4)}
              </div>
              <div className="meta">{expiryStr} UTC</div>
            </div>
            <div className="iv-pill">{(atm * 100).toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}
