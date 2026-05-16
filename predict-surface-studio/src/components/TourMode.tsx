import { useEffect, useState } from 'react';

interface Step { selector?: string; title: string; body: string; tab?: string }

const STEPS: Step[] = [
  { title: 'Welcome to Predict Quant Suite', body: 'Live volatility tooling for DeepBook Predict on Sui. Six tabs, calculator, oracle drilldowns, wallet lookup, on-chain orderbook, vol-arb signals. Use arrow keys to navigate, esc to skip.' },
  { tab: 'surface', selector: '.surface-controls', title: 'Surface tab · 3D viewer', body: 'IV / Δ / ν / Γ surfaces, camera presets, auto-rotate, wireframe, HD/std/low resolution, PNG download, Twitter share. Press R to reset, A to toggle rotate, W for wireframe.' },
  { tab: 'surface', selector: '.iv-legend', title: 'Color legend', body: 'Cool blue = low metric value, hot red = high. Bar shows the visible range across the surface.' },
  { tab: 'smile', selector: '.tab-panel', title: 'Smile tab', body: 'Overlay every oracle smile on one chart, then compare any two side-by-side with a delta column.' },
  { tab: 'term', selector: '.tab-panel', title: 'Term tab', body: 'ATM and 25-delta wing IV across days-to-expiry, plus a volatility cone comparing realized BTC vol vs implied vol.' },
  { tab: 'volarb', selector: '.spy-nav', title: 'Vol-Arb tab', body: '24h stats, spread chart, backtest, live opportunities, bot health, on-chain vault, wallet lookup, Telegram bot. Right rail jumps between sections.' },
  { tab: 'activity', selector: '.tab-panel', title: 'Activity tab', body: 'Recent on-chain events, leaderboard with the #1 traders equity curve, plus a 7-day day-of-week x hour-of-day mint heatmap.' },
  { tab: 'markets', selector: '.tab-panel', title: 'Markets tab', body: 'Sortable oracle table, real on-chain order book with edge column (chain vs SVI fair value), and a per-strike trade flow histogram.' },
  { selector: '.btn-primary', title: 'Trade calculator', body: 'Open anywhere with C. Pick CALL/PUT/RANGE, see cost, ITM probability, payoff diagram, and Greeks against the live SVI surface.' },
  { title: 'Done', body: 'Read-only frontend. No wallet connection needed. Press ? for the about modal anytime, or click ⚙ for settings (compact density, webhook alerts).' },
];

const STORAGE_KEY = 'pqs-tour-v1';

interface Props { open: boolean; onClose: () => void; onTabChange?: (t: string) => void }

export default function TourMode({ open, onClose, onTabChange }: Props) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = STEPS[step];
    if (s.tab && onTabChange) onTabChange(s.tab);
    const after = s.tab ? 280 : 0;
    setTimeout(() => {
      if (!s.selector) { setRect(null); return; }
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setRect(el.getBoundingClientRect()), 250);
    }, after);
  }, [open, step, onTabChange]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { if (step < STEPS.length - 1) setStep(step + 1); else onClose(); }
      if (e.key === 'ArrowLeft') { if (step > 0) setStep(step - 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, step, onClose]);

  if (!open) return null;
  const s = STEPS[step];

  return (
    <div className="tour-overlay">
      <svg className="tour-mask">
        <defs>
          <mask id="tour-cutout">
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left - 10} y={rect.top - 10} width={rect.width + 20} height={rect.height + 20} rx={12} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(6,6,18,0.78)" mask="url(#tour-cutout)" />
        {rect && (
          <rect x={rect.left - 10} y={rect.top - 10} width={rect.width + 20} height={rect.height + 20} rx={12}
            fill="none" stroke="var(--sui-blue)" strokeWidth="2" />
        )}
      </svg>
      <div className="tour-card" style={rect ? {
        top: Math.min(rect.bottom + 18, window.innerHeight - 220),
        left: Math.max(20, Math.min(rect.left, window.innerWidth - 380)),
      } : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
        <div className="tour-step">{step + 1} / {STEPS.length}</div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tour-actions">
          <button className="btn btn-ghost" onClick={onClose}>Skip</button>
          {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
          <button className="btn btn-primary" onClick={() => { if (step < STEPS.length - 1) setStep(step + 1); else { localStorage.setItem(STORAGE_KEY, '1'); onClose(); } }}>
            {step < STEPS.length - 1 ? 'Next →' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function shouldShowTour(): boolean {
  try { return !localStorage.getItem(STORAGE_KEY); } catch { return false; }
}
