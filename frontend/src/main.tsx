// Entry point — imports Friend 1's App.tsx.
// Friend 1 owns App/layout/pages/components/styles.
// This file coordinates creation rather than overwriting.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
