export type TabKey = 'surface' | 'smile' | 'term' | 'volarb' | 'activity' | 'markets';

export const TABS: { key: TabKey; label: string; glyph: string }[] = [
  { key: 'surface',  label: 'Surface',  glyph: '◆' },
  { key: 'smile',    label: 'Smile',    glyph: '◡' },
  { key: 'term',     label: 'Term',     glyph: '⌒' },
  { key: 'volarb',   label: 'Vol-Arb',  glyph: '⇄' },
  { key: 'activity', label: 'Activity', glyph: '⚡' },
  { key: 'markets',  label: 'Markets',  glyph: '☰' },
];

export function TabsRow({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="tabs-row">
      {TABS.map((t) => (
        <button key={t.key} className={'tab ' + (active === t.key ? 'active' : '')} onClick={() => onChange(t.key)}>
          <span className="glyph">{t.glyph}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function BottomNav({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button key={t.key} className={'tab ' + (active === t.key ? 'active' : '')} onClick={() => onChange(t.key)}>
          <span className="glyph">{t.glyph}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
