import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// One stylesheet for all subsets: unicode-range means only the used ones download.
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import './index.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The build emits sw.js (vite.config.ts), so the game opens offline from the home screen.
// Dev has no sw.js, so it registers only in the build.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((err) => console.warn('service worker not registered', err));
}
