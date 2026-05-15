export default function TGBotCard() {
  const cmds = [
    ['/up 70k 15m 100usdc', 'CALL · BTC > 70k in 15m'],
    ['/down 80k 1h 50usdc',  'PUT · BTC < 80k in 1h'],
    ['/pnl',                 'show equity + open positions'],
    ['/redeem',              'claim all settled payouts'],
    ['/leaderboard',         'top traders this week'],
  ];
  return (
    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: 'var(--t2)', fontSize: 13, lineHeight: 1.6 }}>
        Trade Predict from any Telegram chat. The bot creates a custodial Sui wallet on first use, faucets dUSDC, and signs every trade as a PTB. Settlements DM you the result.
      </div>
      <div className="tg-cmds">
        {cmds.map(([cmd, desc]) => (
          <div className="tg-cmd" key={cmd}>
            <code>{cmd}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
        Bot ships in the same repo · github.com/codedforum/predict-quant-suite/tree/main/predict-tg-bot
      </div>
    </div>
  );
}
