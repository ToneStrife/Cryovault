import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { X, QrCode, CircleCheck as CheckCircle, CircleAlert as AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ScanState = 'scanning' | 'found' | 'not_found' | 'error';

export function QrScannerDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const regionId = 'qr-scan-region';
  const scannerRef = useRef<any>(null);
  const [state, setState] = useState<ScanState>('scanning');
  const [resultMsg, setResultMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setState('scanning');

    let scanner: any;

    async function start() {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode(regionId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText: string) => {
            // Stop scanning immediately
            try { await scanner.stop(); } catch {}

            // Lookup box by id or qr_code
            const { data } = await (supabase as any)
              .from('boxes')
              .select('id, name, freezer_id')
              .or(`id.eq.${decodedText},qr_code.eq.${decodedText}`)
              .maybeSingle();

            const box = data as { id: string; name: string; freezer_id: string } | null;

            if (box) {
              setState('found');
              setResultMsg(box.name);
              setTimeout(() => {
                onClose();
                navigate(`/box/${box.id}`);
              }, 1200);
            } else {
              setState('not_found');
              setResultMsg(decodedText.slice(0, 40));
            }
          },
          () => { /* ignore scan failures */ }
        );
      } catch (err: any) {
        setState('error');
        setResultMsg(err?.message || 'No se pudo acceder a la cámara');
      }
    }

    start();

    return () => {
      scannerRef.current?.stop?.().catch(() => {});
      scannerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-900">Escanear QR de caja</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scanner area */}
        <div className="relative bg-black">
          <div id={regionId} className="w-full" style={{ minHeight: 300 }} />
          {/* Targeting overlay */}
          {state === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 border-2 border-white/60 rounded-xl relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-blue-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-blue-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-blue-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-blue-400 rounded-br-lg" />
              </div>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="px-5 py-4">
          {state === 'scanning' && (
            <p className="text-sm text-gray-500 text-center animate-pulse">Apunta la cámara al código QR de la caja...</p>
          )}
          {state === 'found' && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2.5">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium">Caja encontrada: {resultMsg}</span>
            </div>
          )}
          {state === 'not_found' && (
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">QR no reconocido</p>
                <p className="text-xs text-amber-600 font-mono mt-0.5">{resultMsg}</p>
                <button
                  onClick={() => { setState('scanning'); scannerRef.current?.start?.(); }}
                  className="text-xs text-amber-700 underline mt-1"
                >
                  Intentar de nuevo
                </button>
              </div>
            </div>
          )}
          {state === 'error' && (
            <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{resultMsg}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
