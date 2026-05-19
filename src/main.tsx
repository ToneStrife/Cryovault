import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { restoreSpaRedirect } from './lib/spaRedirect';
import {
  establishSessionFromUrlOnce,
  hasAuthCallbackInUrl,
  summarizeAuthUrlForDebug,
} from './lib/authCallback';
import { registerSW } from 'virtual:pwa-register';

restoreSpaRedirect();

registerSW({ immediate: true });

const queryClient = new QueryClient();

function shouldBootstrapAuthFromUrl() {
  const path = window.location.pathname;
  return path.includes('accept-invite') || path.includes('login') || hasAuthCallbackInUrl();
}

async function bootstrap() {
  if (shouldBootstrapAuthFromUrl()) {
    if (import.meta.env.DEV) {
      console.log('[CryoVault auth] URL shape:', summarizeAuthUrlForDebug());
    }
    await establishSessionFromUrlOnce();
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error('El div #root no existe en el DOM');
    return;
  }

  createRoot(rootElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

bootstrap();
