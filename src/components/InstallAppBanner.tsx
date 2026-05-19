import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'cryovault-install-banner-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && webkit && notChrome;
}

export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed) return;

    if (isIosSafari()) {
      setShowIosHint(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [dismissed]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (isStandalone() || dismissed) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div className="mx-4 mb-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 px-4 py-3 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <Download className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Instalar CryoVault</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {showIosHint
              ? 'En Safari: Compartir → Añadir a pantalla de inicio para acceder como app.'
              : 'Accede más rápido desde el escritorio o la pantalla de inicio.'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!showIosHint && (
          <Button type="button" size="sm" onClick={install} className="bg-blue-600 hover:bg-blue-700 text-white">
            Instalar
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-white/80 hover:text-gray-700"
          aria-label="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
