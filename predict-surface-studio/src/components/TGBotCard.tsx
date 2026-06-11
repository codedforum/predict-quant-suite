export default function TGBotCard() {
  const cmds = [
    ['/faucet',     'one-time testnet dUSDC and gas'],
    ['/up · /down', 'open a BTC position in a few taps'],
    ['/pnl',        'balance, equity and open positions'],
    ['/redeem',     'settle and sweep payouts to your wallet'],
    ['/export',     'take your wallet into Slush, self custody'],
  ];
  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: 'var(--t2)', fontSize: 13, lineHeight: 1.6 }}>
        Trade the same on-chain market from any Telegram chat. The bot creates a Sui wallet you own on first use, faucets testnet dUSDC, and signs every trade on-chain. Tap a strike, confirm, done.
      </div>
      <div className="tg-cmds">
        {cmds.map(([cmd, desc]) => (
          <div className="tg-cmd" key={cmd}>
            <code>{cmd}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>
      <a className="btn btn-primary" href="https://t.me/TheSmartPredictBot" target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>
        Open @TheSmartPredictBot ↗
      </a>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        Same repo · github.com/codedforum/predict-quant-suite/tree/main/predict-tg-bot
      </div>
    </div>
  );
}
