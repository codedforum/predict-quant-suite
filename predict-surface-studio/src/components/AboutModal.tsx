export default function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-head">
          <h2>About Predict Surface Studio</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p>
            Live volatility tooling for <a href="https://docs.sui.io/onchain-finance/deepbook-predict/" target="_blank" rel="noreferrer">DeepBook Predict</a> — the prediction + options primitive shipping in DeepBook's Sui stack.
          </p>

          <h3>What it shows</h3>
          <ul>
            <li><strong>Surface</strong> — 3D Gatheral SVI volatility surface (strike × expiry → IV) for the selected BTC oracle, with butterfly + calendar arbitrage-free checks running live</li>
            <li><strong>Smile</strong> — overlay of all live oracles' smiles at their actual expiries, so you can see term-by-term skew at a glance</li>
            <li><strong>Term</strong> — ATM and 25-delta wing IV across days-to-expiry — the term structure of vol</li>
            <li><strong>Activity</strong> — every <code>PositionMinted</code>, <code>PositionRedeemed</code>, <code>OracleSettled</code>, <code>Supplied</code> on-chain event, with Suiscan links</li>
            <li><strong>Markets</strong> — sortable table of every live oracle (expiry, days, ATM IV, 25Δ skew, forward)</li>
          </ul>

          <h3>How it's wired</h3>
          <p>
            Frontend (Vite + React + react-three-fiber) is a static build at <code>predict.smartcoded.xyz</code>. The backend at <code>predict-api.smartcodedbot.com</code> is a Node server that queries Sui testnet directly: <code>queryEvents</code> for <code>OracleSVIUpdated</code>, <code>OraclePricesUpdated</code>, plus all Predict trade/settle events. SVI parameters come back as <code>{`{a, b, ρ, m, σ}`}</code> scaled by 1e9; signed values use a custom <code>I64</code> type which we decode client-side. All maths runs in the browser.
          </p>

          <h3>The maths</h3>
          <p>
            Gatheral raw SVI: <code>{`w(k) = a + b·(ρ·(k − m) + √((k − m)² + σ²))`}</code> where <code>k = ln(K / F)</code>. IV = √(w/T). Butterfly arb-free condition is checked numerically across the strike grid; calendar checks run across all live oracles sorted by expiry.
          </p>

          <h3>Stack</h3>
          <p>
            React 18 · react-three-fiber · @mysten/sui · Express · PM2 · nginx · Let's Encrypt. Open source: <a href="https://github.com/codedforum/predict-quant-suite" target="_blank" rel="noreferrer">github.com/codedforum/predict-quant-suite</a>
          </p>

          <h3>Keyboard</h3>
          <p>
            <code>1</code>–<code>5</code> switch tabs · <code>C</code> opens calculator · <code>?</code> opens this dialog · <code>Esc</code> closes overlays
          </p>
        </div>
      </div>
    </>
  );
}
