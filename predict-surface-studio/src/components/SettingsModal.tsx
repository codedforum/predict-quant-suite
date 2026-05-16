import { useEffect, useState } from 'react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'https://predict-api.smartcodedbot.com';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [density, setDensity] = useState<'normal' | 'compact'>(() => (typeof document !== 'undefined' && document.documentElement.dataset.density === 'compact') ? 'compact' : 'normal');
  const [webhook, setWebhook] = useState(() => { try { return localStorage.getItem('pqs-webhook') || ''; } catch { return ''; } });
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function applyDensity(d: 'normal' | 'compact') {
    setDensity(d);
    if (d === 'compact') document.documentElement.dataset.density = 'compact'; else document.documentElement.removeAttribute('data-density');
    try { localStorage.setItem('pqs-density', d); } catch {}
  }

  function saveWebhook() {
    try { localStorage.setItem('pqs-webhook', webhook); } catch {}
  }

  async function testWebhook() {
    if (!webhook) return;
    setBusy(true); setTestStatus(null);
    try {
      const r = await fetch(`${API_BASE}/api/webhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhook, text: 'Predict Quant Suite test webhook ✓ (BTC vol surface live at predict.smartcoded.xyz)' }),
      });
      const j = await r.json();
      setTestStatus(j.ok ? 'sent ✓' : `failed: ${j.error || j.status}`);
    } catch (e: any) {
      setTestStatus('failed: ' + (e?.message || 'network'));
    }
    setBusy(false);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <h3>Density</h3>
          <p>Compact reduces padding and font sizes for trader-style information density.</p>
          <div className="toggle-group" style={{ marginTop: 8 }}>
            <button className={density === 'normal'  ? 'active' : ''} onClick={() => applyDensity('normal')}>Comfortable</button>
            <button className={density === 'compact' ? 'active' : ''} onClick={() => applyDensity('compact')}>Compact</button>
          </div>

          <h3>Webhook alerts</h3>
          <p>Paste a Slack or Discord incoming-webhook URL. The server proxies POST so the URL never leaves your browser to a third party. Configure your bot to fire on settlements, large redemptions, or arb signals.</p>
          <input
            type="text" placeholder="https://hooks.slack.com/... or https://discord.com/api/webhooks/..."
            value={webhook} onChange={(e) => setWebhook(e.target.value)} onBlur={saveWebhook}
            style={{ width: '100%', background: 'var(--bg)', color: 'var(--t1)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={() => { saveWebhook(); testWebhook(); }} disabled={busy || !webhook}>{busy ? 'sending...' : 'Send test'}</button>
            {testStatus && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: testStatus.startsWith('sent') ? 'var(--green)' : 'var(--red)' }}>{testStatus}</span>}
          </div>

          <h3>Install as app</h3>
          <p>Add to home screen on mobile, or click the install icon in your browser address bar to install as a desktop app. Service worker caches assets so the surface loads instantly.</p>
        </div>
      </div>
    </>
  );
}
