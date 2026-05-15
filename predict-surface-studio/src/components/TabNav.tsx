export type TabKey = 'surface' | 'smile' | 'term' | 'activity' | 'markets';

export const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'surface',  label: 'Surface',  icon: '◆' },
  { key: 'smile',    label: 'Smile',    icon: '◡' },
  { key: 'term',     label: 'Term',     icon: '⌒' },
  { key: 'activity', label: 'Activity', icon: '⚡' },
  { key: 'markets',  label: 'Markets',  icon: '☰' },
];

export function TabsTop({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="tabs-top">
      {TABS.map((t) => (
        <button key={t.key} className={'tab-btn ' + (active === t.key ? 'active' : '')} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

export function TabsBottom({ active, onChange }: { active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button key={t.key} className={'tab-btn ' + (active === t.key ? 'active' : '')} onClick={() => onChange(t.key)}>
          <span className="icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
