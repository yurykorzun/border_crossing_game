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
