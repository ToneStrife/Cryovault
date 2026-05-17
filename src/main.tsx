import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
    },
  },
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('CryoVault: #root element not found. App cannot mount.');
} else {
  createRoot(rootElement).render(
    <React.StrictMode>
      {/* HashRouter es ideal para GitHub Pages ya que maneja las rutas en el cliente sin depender del servidor */}
      <HashRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HashRouter>
    </React.StrictMode>
  );
}