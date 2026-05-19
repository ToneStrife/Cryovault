import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface BoxDeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxName: string;
  sampleCount: number;
  inUseCount: number;
  isPending?: boolean;
  onConfirm: () => void;
}

export function BoxDeleteConfirmDialog({
  open,
  onOpenChange,
  boxName,
  sampleCount,
  inUseCount,
  isPending,
  onConfirm,
}: BoxDeleteConfirmDialogProps) {
  const [nameConfirm, setNameConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (!open) {
      setNameConfirm('');
      setUnderstood(false);
    }
  }, [open]);

  const nameMatches = nameConfirm.trim() === boxName.trim();
  const canDelete = understood && nameMatches && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-red-200 text-gray-900 max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 text-xl">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            Eliminar caja permanentemente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
            <p className="font-semibold text-base mb-2">
              Se eliminarán la caja «{boxName}» y {sampleCount} muestra{sampleCount !== 1 ? 's' : ''}.
            </p>
            <p>
              Dejarán de aparecer en el inventario, búsqueda y congeladores. Podrás recuperarlas en
              {' '}<span className="font-medium">Informes → Papelera</span> durante un tiempo limitado.
            </p>
            {inUseCount > 0 && (
              <p className="mt-2 font-medium">
                Aviso: {inUseCount} muestra{inUseCount !== 1 ? 's' : ''} están «en uso».
              </p>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span>Entiendo que se eliminarán todas las muestras de esta caja.</span>
          </label>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Escribe el nombre de la caja para confirmar:{' '}
              <span className="font-mono text-red-700">{boxName}</span>
            </label>
            <Input
              value={nameConfirm}
              onChange={(e) => setNameConfirm(e.target.value)}
              placeholder={boxName}
              className="border-gray-300"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="flex-1 border-gray-300"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!canDelete}
              onClick={onConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isPending ? 'Eliminando...' : 'Eliminar caja y muestras'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
