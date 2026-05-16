import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Apply persisted density before first paint
try {
  const d = localStorage.getItem('pqs-density');
  if (d === 'compact') document.documentElement.dataset.density = 'compact';
} catch {}

// Register service worker for PWA installability
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="page-in">
      <App />
    </div>
  </React.StrictMode>
);
