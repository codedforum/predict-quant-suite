import { useEffect, useState } from 'react';

interface Step { selector?: string; title: string; body: string }

const STEPS: Step[] = [
  { title: 'Welcome to Predict Quant Suite', body: 'Live volatility tooling for DeepBook Predict on Sui. Hover the volatility surface to see strike, expiry, and implied vol at any point.' },
  { selector: '.tabs-row .tab', title: 'Six tabs', body: 'Surface (3D + heatmap), Smile (per-expiry vol), Term (vol vs days), Vol-Arb (Predict vs Polymarket), Activity (events feed), Markets (oracle table).' },
  { selector: '.surface-controls', title: 'Surface controls', body: 'Camera presets (perspective / top / side / front), auto-rotate, wireframe, resolution. Press R to reset, A for rotate, W for wireframe. Drag with one finger or mouse to orbit, pinch or scroll to zoom.' },
  { selector: '.iv-legend', title: 'Color legend', body: 'Cool blue = low IV, hot red = high IV. The mini-bar shows the IV range across the visible surface.' },
  { selector: '.btn-primary', title: 'Trade calculator', body: 'Open with C anywhere. Pick CALL / PUT / RANGE, see live cost, ITM probability, payoff diagram, and Greeks (delta, vega, theta) computed against the live SVI surface.' },
  { selector: '.icon-btn', title: 'About + keyboard shortcuts', body: 'Press ? to open the about modal. 1-5 switch tabs. Esc closes overlays.' },
  { title: 'Done', body: 'Everything is read-only. No wallet connection needed. The frontend never signs anything; trading happens via the calculator + (optionally) the Telegram bot.' },
];

const STORAGE_KEY = 'pqs-tour-v1';

export default function TourMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = STEPS[step];
    if (!s.selector) { setRect(null); return; }
    const el = document.querySelector(s.selector) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => setRect(el.getBoundingClientRect()), 200);
  }, [open, step]);

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
