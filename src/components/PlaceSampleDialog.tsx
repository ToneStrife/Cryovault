import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSampleCheckout } from '@/hooks/useSampleCheckout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Sample, Freezer, Box } from '@/types';
import { Plus } from 'lucide-react';

interface PlaceSampleDialogProps {
  sample: Sample | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function PlaceSampleDialog({ sample, open, onClose, onSuccess }: PlaceSampleDialogProps) {
  const { user } = useAuth();
  const { placeSampleAsync, isPlacingSample } = useSampleCheckout();
  const [freezerId, setFreezerId] = useState('');
  const [boxId, setBoxId] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [error, setError] = useState('');

  const { data: freezers = [] } = useQuery({
    queryKey: ['place-freezers', user?.laboratory],
    queryFn: async () => {
      const { data, error: err } = await supabase.from('freezers').select('id, name, temperature').order('name');
      if (err) throw err;
      return (data || []) as Pick<Freezer, 'id' | 'name' | 'temperature'>[];
    },
    enabled: open && !!user,
  });

  const { data: boxes = [] } = useQuery({
    queryKey: ['place-boxes', freezerId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('boxes')
        .select('id, name, rows, columns, status, freezer_id')
        .eq('freezer_id', freezerId)
        .order('name');
      if (err) throw err;
      return (data || []) as Pick<Box, 'id' | 'name' | 'rows' | 'columns' | 'status' | 'freezer_id'>[];
    },
    enabled: open && !!freezerId,
  });

  const availableBoxes = useMemo(
    () => boxes.filter((b) => b.status !== 'in_use'),
    [boxes],
  );

  const selectedBox = availableBoxes.find((b) => b.id === boxId);

  const { data: boxSamples = [] } = useQuery({
    queryKey: ['place-box-samples', boxId],
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
    setFreezerId('');
    setBoxId('');
    setSelectedCell(null);
    setError('');
    onClose();
  };

  const handleFreezerChange = (id: string) => {
    setFreezerId(id);
    setBoxId('');
    setSelectedCell(null);
    setError('');
  };

  const handleBoxChange = (id: string) => {
    setBoxId(id);
    setSelectedCell(null);
    setError('');
  };

  const handleSubmit = async () => {
    if (!sample || !boxId || !selectedCell) {
      setError('Selecciona congelador, caja y una posición libre');
      return;
    }
    setError('');
    try {
      await placeSampleAsync({
        sample,
        boxId,
        row: selectedCell.row,
        col: selectedCell.col,
      });
      onSuccess?.();
      handleClose();
    } catch (e: any) {
      setError(e.message || 'Error al colocar la muestra');
    }
  };

  const rows = selectedBox?.rows ?? 0;
  const cols = selectedBox?.columns ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Colocar muestra</DialogTitle>
        </DialogHeader>
        {sample && (
          <p className="text-sm text-gray-500 font-mono">{sample.sample_code}</p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
        )}
        <div className="space-y-4 mt-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Congelador</label>
            <select
              value={freezerId}
              onChange={(e) => handleFreezerChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Seleccionar...</option>
              {freezers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.temperature}°C)
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Caja</label>
            <select
              value={boxId}
              onChange={(e) => handleBoxChange(e.target.value)}
              disabled={!freezerId}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
            >
              <option value="">Seleccionar...</option>
              {availableBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.rows}×{b.columns})
                </option>
              ))}
            </select>
            {freezerId && availableBoxes.length === 0 && (
              <p className="text-xs text-amber-600">No hay cajas disponibles (las cajas «en uso» no admiten nuevas muestras).</p>
            )}
          </div>
          {selectedBox && rows > 0 && cols > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Posición libre</label>
              <div className="overflow-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
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
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1 border-gray-300">
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPlacingSample || !selectedCell}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPlacingSample ? 'Colocando...' : 'Colocar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
