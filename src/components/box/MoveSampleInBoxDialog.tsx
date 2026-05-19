import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DIALOG_MOBILE } from '@/lib/layout';
import { formFooterClass } from '@/lib/formStyles';
import type { Sample } from '@/types';
import { Plus } from 'lucide-react';

interface MoveSampleInBoxDialogProps {
  open: boolean;
  sample: Sample | null;
  rows: number;
  cols: number;
  /** Set of "row_col" occupied positions (excluding current sample cell). */
  occupiedKeys: Set<string>;
  currentRow: number | null;
  currentCol: number | null;
  onClose: () => void;
  onMove: (row: number, col: number) => Promise<void>;
}

export function MoveSampleInBoxDialog({
  open,
  sample,
  rows,
  cols,
  occupiedKeys,
  currentRow,
  currentCol,
  onClose,
  onMove,
}: MoveSampleInBoxDialogProps) {
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setSelected(null);
    setError('');
    onClose();
  };

  const emptyCells = useMemo(() => {
    const cells: { row: number; col: number }[] = [];
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const key = `${r}_${c}`;
        if (!occupiedKeys.has(key)) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }, [rows, cols, occupiedKeys]);

  const handleSubmit = async () => {
    if (!sample || !selected) {
      setError('Elige una celda vacía');
      return;
    }
    if (selected.row === currentRow && selected.col === currentCol) {
      setError('Elige una celda distinta a la actual');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onMove(selected.row, selected.col);
      handleClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al mover la muestra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className={`bg-white border-gray-200 text-gray-900 ${DIALOG_MOBILE}`}>
        <DialogHeader>
          <DialogTitle>Mover muestra</DialogTitle>
        </DialogHeader>
        {sample && (
          <p className="text-sm text-gray-500 font-mono -mt-1">{sample.sample_code}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
        )}
        {emptyCells.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No hay celdas vacías en esta caja.
          </p>
        ) : (
          <div className="overflow-auto rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-4 shadow-inner max-h-[50vh]">
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
                    const key = `${row}_${col}`;
                    const isCurrent = currentRow === row && currentCol === col;
                    const occupied = occupiedKeys.has(key) && !isCurrent;
                    const isSelected = selected?.row === row && selected?.col === col;
                    if (occupied) {
                      return (
                        <div
                          key={c}
                          className="w-10 h-10 rounded-lg border bg-gray-100 border-gray-200 flex items-center justify-center text-gray-300 text-xs"
                        >
                          ·
                        </div>
                      );
                    }
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelected({ row, col })}
                        className={`w-10 h-10 rounded-lg border text-xs font-mono transition-all flex items-center justify-center shadow-sm ${
                          isCurrent
                            ? 'bg-amber-100 border-amber-300 text-amber-800 ring-2 ring-amber-400/50'
                            : isSelected
                              ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105'
                              : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {isCurrent ? '●' : <Plus className="w-3 h-3 text-gray-300" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className={formFooterClass}>
          <Button type="button" variant="outline" onClick={handleClose} className="flex-1 border-gray-200">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selected || emptyCells.length === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Moviendo...' : 'Mover aquí'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
