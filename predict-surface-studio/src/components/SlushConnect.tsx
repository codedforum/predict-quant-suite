import { useEffect, useState } from 'react';

interface WalletAccount { address: string; publicKey?: string; chains?: string[] }
interface StandardWallet {
  name: string;
  icon?: string;
  features: Record<string, any>;
  accounts?: WalletAccount[];
}

export default function SlushConnect({ onAddress }: { onAddress: (addr: string) => void }) {
  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const found: StandardWallet[] = [];
    const handler = (e: any) => {
      const w: StandardWallet = e.detail?.register?.({ name: 'predict-quant-suite', version: '1.0.0', chains: ['sui:testnet'], features: {} }) ?? null;
      if (e.detail && !w) {
        // Some wallets push themselves on register event
      }
    };
    window.addEventListener('wallet-standard:register-wallet', handler as any);
    // dispatch app-ready - wallets respond by registering themselves
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
      detail: {
        register: (wallet: StandardWallet) => { found.push(wallet); setWallets((s) => [...s, wallet]); return () => {}; },
      },
    }));
    setTimeout(() => setWallets(found.length ? [...found] : []), 200);
    return () => window.removeEventListener('wallet-standard:register-wallet', handler as any);
  }, []);

  async function connect(w: StandardWallet) {
    setBusy(true); setErr(null);
    try {
      const conn = w.features['standard:connect'];
      if (!conn) throw new Error('wallet does not support standard:connect');
      const r = await conn.connect();
      const acc = r.accounts?.[0];
      if (!acc) throw new Error('no accounts returned');
      setAccount(acc);
      onAddress(acc.address);
    } catch (e: any) {
      setErr(e?.message || 'connect failed');
    }
    setBusy(false);
  }

  if (account) {
    return (
      <div className="slush-connected">
        <span className="slush-dot" />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{account.address.slice(0, 14)}...{account.address.slice(-6)}</span>
        <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => { setAccount(null); }}>disconnect</button>
      </div>
    );
  }

  if (!wallets.length) {
    return (
      <div className="slush-empty">
        <p style={{ margin: 0, fontSize: 12, color: 'var(--t2)' }}>No Sui wallet detected.</p>
        <a href="https://chromewebstore.google.com/detail/slush-the-official-sui-wal/opcgpfmipidbgpenhmajoajpbobppdil" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ display: 'inline-flex', marginTop: 8 }}>Install Slush ↗</a>
      </div>
    );
  }

  return (
    <div className="slush-list">
      {wallets.map((w, i) => (
        <button key={w.name + i} className="slush-row" onClick={() => connect(w)} disabled={busy}>
          {w.icon && <img src={w.icon} alt="" />}
          <span className="slush-name">{w.name}</span>
          <span className="slush-cta">{busy ? '...' : 'connect'}</span>
        </button>
      ))}
      {err && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{err}</div>}
    </div>
  );
}
