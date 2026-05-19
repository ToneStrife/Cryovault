import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSampleCheckout } from '@/hooks/useSampleCheckout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Sample, Box } from '@/types';
import { Plus } from 'lucide-react';

interface ReturnSampleDialogProps {
  sample: Sample | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReturnSampleDialog({ sample, open, onClose, onSuccess }: ReturnSampleDialogProps) {
  const { returnSampleAsync, isReturningSample } = useSampleCheckout();
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [error, setError] = useState('');

  const boxId = sample?.box_id ?? '';

  const { data: box } = useQuery({
    queryKey: ['return-box', boxId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('boxes')
        .select('id, name, rows, columns')
        .eq('id', boxId)
        .single();
      if (err) throw err;
      return data as Pick<Box, 'id' | 'name' | 'rows' | 'columns'>;
    },
    enabled: open && !!boxId,
  });

  const { data: boxSamples = [] } = useQuery({
    queryKey: ['return-box-samples', boxId],
    queryFn: async () => {
      const { data, error: err } = await (supabase.from('samples') as any)
        .select('position_row, position_column')
        .eq('box_id', boxId)
        .is('deleted_at', null)
        .not('position_row', 'is', null)
        .not('position_column', 'is', null);
      if (err) throw err;
      return data as { position_row: number; position_column: number }[];
    },
    enabled: open && !!boxId,
  });

  const occupiedSet = useMemo(() => {
    const set = new Set<string>();
    boxSamples.forEach((s) => set.add(`${s.position_row}_${s.position_column}`));
    return set;
  }, [boxSamples]);

  const handleClose = () => {
    setSelectedCell(null);
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!sample || !selectedCell) {
      setError('Selecciona una posición libre');
      return;
    }
    setError('');
    try {
      await returnSampleAsync({
        sample,
        row: selectedCell.row,
        col: selectedCell.col,
      });
      onSuccess?.();
      handleClose();
    } catch (e: any) {
      setError(e.message || 'Error al devolver la muestra');
    }
  };

  const rows = box?.rows ?? 0;
  const cols = box?.columns ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Devolver muestra a la caja</DialogTitle>
        </DialogHeader>
        {sample && (
          <p className="text-sm text-gray-500">
            <span className="font-mono">{sample.sample_code}</span>
            {box && <span className="ml-2">· {box.name}</span>}
          </p>
        )}
        <p className="text-xs text-gray-400">Elige una celda libre (no se restaura la posición anterior).</p>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}
        {box && rows > 0 && cols > 0 && (
          <div className="overflow-auto border border-gray-200 rounded-lg p-3 bg-gray-50 mt-3">
            <div className="inline-block">
              <div className="flex items-center gap-0.5 mb-1 pl-8">
                {Array.from({ length: cols }, (_, c) => (
                  <div key={c} className="w-10 h-5 flex items-center justify-center text-[10px] text-gray-400 font-mono">
                    {c + 1}
                  </div>
                ))}
              </div>
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex items-center gap-0.5 mb-0.5">
                  <div className="w-7 h-10 flex items-center justify-center text-[10px] text-gray-400 font-mono">
                    {String.fromCharCode(65 + r)}
                  </div>
                  {Array.from({ length: cols }, (_, c) => {
                    const row = r + 1;
                    const col = c + 1;
                    const occupied = occupiedSet.has(`${row}_${col}`);
                    const selected = selectedCell?.row === row && selectedCell?.col === col;
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={occupied}
                        onClick={() => setSelectedCell({ row, col })}
                        className={`w-10 h-10 rounded border text-xs font-mono transition-colors flex items-center justify-center ${
                          occupied
                            ? 'bg-gray-200 border-gray-300 cursor-not-allowed text-gray-400'
                            : selected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {occupied ? '·' : <Plus className="w-3 h-3 text-gray-300" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1 border-gray-300">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isReturningSample || !selectedCell}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isReturningSample ? 'Guardando...' : 'Devolver'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
