import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Error inesperado';
}

// Cualquier mutación o consulta que falle y no tenga su propio onError muestra un aviso.
// Así ningún error de Supabase se pierde en silencio.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      toast.error(errorMessage(error));
    },
  }),
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      toast.error(`No se pudieron cargar los datos: ${errorMessage(error)}`);
    },
  }),
});

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
            <Toaster richColors closeButton position="top-center" />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

bootstrap();
