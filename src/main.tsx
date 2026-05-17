import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <div style={{ padding: '20px', color: 'white' }}>
        <h1>Verificación de carga</h1>
        <App />
      </div>
    </React.StrictMode>
  );
} else {
  console.error('El div #root no existe en el DOM');
}