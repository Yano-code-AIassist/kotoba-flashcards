import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './components/auth/AuthGate';
import './index.css';
import './styles/editor.css';
import './styles/word-table.css';
import './styles/word-transfer.css';
import './styles/storage.css';
import './styles/study.css';
import './styles/settings.css';
import './styles/auth.css';
import './styles/folders.css';
import './styles/mobile-access.css';
import './styles/ai-import.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate />
  </StrictMode>,
);
