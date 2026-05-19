import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { restoreSpaRedirect } from './lib/spaRedirect';
import { registerSW } from 'virtual:pwa-register';

restoreSpaRedirect();

registerSW({ immediate: true });

const queryClient = new QueryClient();

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
         <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
} else {
  console.error('El div #root no existe en el DOM');
}
