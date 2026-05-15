import { useEffect, useState } from 'react';

interface Section { id: string; label: string }
interface Props { sections: Section[] }

export default function ScrollSpy({ sections }: Props) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);

  function jump(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <nav className="spy-nav">
      {sections.map((s) => (
        <button key={s.id} className={'spy-link ' + (active === s.id ? 'active' : '')} onClick={() => jump(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
