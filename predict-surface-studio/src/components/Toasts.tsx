import { useEffect, useRef, useState } from 'react';
import { fetchActivity, ActivityEvent } from '../lib/predictApi';

const TOAST_FOR = new Set(['PositionMinted', 'PositionRedeemed', 'OracleSettled']);
const SHOW_MS = 7000;
const MAX_VISIBLE = 4;

interface Toast { id: string; ev: ActivityEvent }

export default function Toasts() {
  const [stack, setStack] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const firstFetchRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const events = await fetchActivity();
      if (cancelled) return;
      // First fetch: populate seen set without notifying (avoid burst on load)
      if (firstFetchRef.current) {
        events.forEach((e) => seenRef.current.add(`${e.txDigest}:${e.kind}`));
        firstFetchRef.current = false;
        return;
      }
      const fresh: Toast[] = [];
      for (const ev of events) {
        if (!TOAST_FOR.has(ev.kind)) continue;
        const id = `${ev.txDigest}:${ev.kind}`;
        if (seenRef.current.has(id)) continue;
        seenRef.current.add(id);
        fresh.push({ id, ev });
        if (fresh.length >= MAX_VISIBLE) break;
      }
      if (fresh.length) {
        setStack((s) => [...fresh.reverse(), ...s].slice(0, MAX_VISIBLE));
        fresh.forEach((t) => {
          setTimeout(() => setStack((s) => s.filter((x) => x.id !== t.id)), SHOW_MS);
        });
      }
    };
    tick();
    const id = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!stack.length) return null;

  return (
    <div className="toast-stack">
      {stack.map((t) => {
        const cls = t.ev.kind === 'PositionMinted' ? 'mint' : t.ev.kind === 'PositionRedeemed' ? 'redeem' : 'settle';
        const label = t.ev.kind === 'PositionMinted' ? 'NEW' : t.ev.kind === 'PositionRedeemed' ? 'WIN' : 'SET';
        const titleMap: Record<string, string> = {
          PositionMinted: 'Position minted',
          PositionRedeemed: 'Position redeemed',
          OracleSettled: 'Oracle settled',
        };
        return (
          <div className={`toast ${cls}`} key={t.id}>
            <div className="badge">{label}</div>
            <div className="body">
              <div className="title">{titleMap[t.ev.kind]}</div>
              <div className="sub">{t.ev.summary}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
