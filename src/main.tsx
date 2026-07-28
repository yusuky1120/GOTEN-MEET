import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installTokenApiFetch } from './api/tokenApiFetch';
import './styles.css';
import './ui-layout.css';

installTokenApiFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
