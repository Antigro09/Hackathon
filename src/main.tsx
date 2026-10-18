import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './meter.css';
import './sound-hints.css';
import './print.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
