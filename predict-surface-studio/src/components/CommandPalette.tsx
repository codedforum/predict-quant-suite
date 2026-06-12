import { useEffect, useMemo, useRef, useState } from 'react';
import { SviSnapshot } from '../lib/predictApi';
import { useModalDismiss } from '../lib/useModalDismiss';

interface Cmd { id: string; label: string; hint?: string; group: string; run: () => void }
interface Props {
  open: boolean;
  onClose: () => void;
  tabs: { key: string; label: string }[];
  onTab: (k: string) => void;
  oracles: SviSnapshot[];
  onSelectOracle: (i: number) => void;
  onOpenCalc: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onStartTour: () => void;
  onRefresh: () => void;
}

// ⌘K command palette: fuzzy-jump to any tab, oracle, or action.
export default function CommandPalette(p: Props) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const cmds = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [];
    p.tabs.forEach((t) => c.push({ id: 'tab-' + t.key, label: `Go to ${t.label}`, hint: 'tab', group: 'Navigate', run: () => p.onTab(t.key) }));
    c.push({ id: 'calc', label: 'Open Calculator', hint: 'C', group: 'Actions', run: p.onOpenCalc });
    c.push({ id: 'refresh', label: 'Refresh data', hint: '↻', group: 'Actions', run: p.onRefresh });
    c.push({ id: 'settings', label: 'Open Settings', group: 'Actions', run: p.onOpenSettings });
    c.push({ id: 'about', label: 'About this app', hint: '?', group: 'Actions', run: p.onOpenAbout });
    c.push({ id: 'tour', label: 'Start guided tour', group: 'Actions', run: p.onStartTour });
    p.oracles.forEach((o, i) => c.push({
      id: 'orc-' + o.oracleId,
      label: `${o.oracleId.slice(0, 10)}…${o.oracleId.slice(-4)}`,
      hint: `$${(o.forward / 1000).toFixed(1)}k`,
      group: 'Oracles',
      run: () => p.onSelectOracle(i),
    }));
    return c;
  }, [p.tabs, p.oracles]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cmds;
    return cmds.filter((c) => (c.label + ' ' + (c.hint || '') + ' ' + c.group).toLowerCase().includes(s));
  }, [q, cmds]);

  useEffect(() => { if (p.open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [p.open]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  useModalDismiss(p.onClose, p.open);

  if (!p.open) return null;

  const run = (c?: Cmd) => { if (!c) return; c.run(); p.onClose(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(filtered[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); p.onClose(); }
  };

  let lastGroup = '';
  return (
    <div className="cmdk-scrim" onClick={p.onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <span className="cmdk-search">⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search tabs, oracles, actions…" className="cmdk-input" spellCheck={false} />
          <kbd className="cmdk-esc">esc</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No matches for “{q}”</div>}
          {filtered.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head && <div className="cmdk-group">{head}</div>}
                <button
                  ref={i === sel ? activeRef : undefined}
                  className={'cmdk-item' + (i === sel ? ' active' : '')}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(c)}
                >
                  <span className="cmdk-label">{c.label}</span>
                  {c.hint && <span className="cmdk-hint">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> select · <kbd>esc</kbd> close</div>
      </div>
    </div>
  );
}
