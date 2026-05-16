import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, Plus, Box, Snowflake, MapPin, Thermometer, Grid3x3 as Grid3X3, Pencil } from 'lucide-react';
import type { Freezer, Box as BoxType } from '@/types';

interface BoxFormData {
  name: string;
  description: string;
  rows: string;
  columns: string;
  box_type: string;
}

const emptyBoxForm: BoxFormData = {
  name: '',
  description: '',
  rows: '9',
  columns: '9',
  box_type: 'standard',
};

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editBox, setEditBox] = useState<BoxType | null>(null);
  const [form, setForm] = useState<BoxFormData>(emptyBoxForm);
  const [formError, setFormError] = useState('');

  const { data: freezer } = useQuery({
    queryKey: ['freezer', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freezers')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Freezer;
    },
    enabled: !!id && !!user,
  });

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['boxes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boxes')
        .select('*')
        .eq('freezer_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as BoxType[];
    },
    enabled: !!id && !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: BoxFormData) => {
      const payload = {
        freezer_id: id!,
        name: data.name.trim(),
        description: data.description.trim() || null,
        rows: parseInt(data.rows) || 9,
        columns: parseInt(data.columns) || 9,
        box_type: data.box_type as BoxType['box_type'],
        status: 'active' as const,
        occupancy: 0,
        archived: false,
        laboratory: user!.laboratory,
        created_by: user!.id,
      };
      if (editBox) {
        const { error } = await (supabase.from('boxes') as any)
          .update({ name: payload.name, description: payload.description, rows: payload.rows, columns: payload.columns, box_type: payload.box_type })
          .eq('id', editBox.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('boxes') as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
      queryClient.invalidateQueries({ queryKey: ['freezer-box-counts'] });
      closeDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const openCreate = () => {
    setEditBox(null);
    setForm(emptyBoxForm);
    setFormError('');
    setShowDialog(true);
  };

  const openEdit = (b: BoxType) => {
    setEditBox(b);
    setForm({
      name: b.name,
      description: b.description || '',
      rows: String(b.rows),
      columns: String(b.columns),
      box_type: b.box_type,
    });
    setFormError('');
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditBox(null);
    setForm(emptyBoxForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('El nombre es obligatorio');
    saveMutation.mutate(form);
  };

  const getOccupancyColor = (box: BoxType) => {
    const pct = (box.occupancy / (box.rows * box.columns)) * 100;
    if (pct >= 90) return 'bg-red-500/30 text-red-400';
    if (pct >= 60) return 'bg-orange-500/30 text-orange-400';
    if (pct >= 30) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-green-500/30 text-green-400';
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Back + Header */}
        <div className="mb-6">
          <Link
            to="/freezers"
            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-4 w-fit"
          >
            <ChevronLeft className="w-4 h-4" /> Volver a congeladores
          </Link>

          {freezer ? (
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Snowflake className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">{freezer.name}</h1>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm text-blue-400 font-mono flex items-center gap-1">
                      <Thermometer className="w-3 h-3" /> {freezer.temperature}°C
                    </span>
                    {freezer.location && (
                      <span className="text-sm text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {freezer.location}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <Button
                onClick={openCreate}
                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
              >
                <Plus className="w-4 h-4" /> Nueva caja
              </Button>
            </div>
          ) : (
            <div className="h-16 bg-slate-800 animate-pulse rounded-xl" />
          )}
        </div>

        {/* Boxes Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-36 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : boxes.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            <Box className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium mb-2">Sin cajas</p>
            <p className="mb-6 text-sm">Añade cajas a este congelador para almacenar muestras.</p>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> Añadir caja
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {boxes.map((box) => {
              const totalPositions = box.rows * box.columns;
              const pct = Math.round((box.occupancy / totalPositions) * 100);
              return (
                <div
                  key={box.id}
                  className="group bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-all flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white font-medium text-sm leading-tight">{box.name}</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {box.rows}×{box.columns}
                      </p>
                    </div>
                    <button
                      onClick={() => openEdit(box)}
                      className="p-1 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Mini grid preview */}
                  <div
                    className="grid gap-0.5"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(box.columns, 9)}, 1fr)`,
                    }}
                  >
                    {Array.from({ length: Math.min(box.rows * box.columns, 81) }).map((_, idx) => (
                      <div
                        key={idx}
                        className={`aspect-square rounded-sm ${
                          idx < box.occupancy ? 'bg-green-500/60' : 'bg-slate-700/60'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOccupancyColor(box)}`}>
                      {pct}% llena
                    </span>
                    <Link
                      to={`/freezers/${id}/box/${box.id}`}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      Abrir <Grid3X3 className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>{editBox ? 'Editar caja' : 'Nueva caja'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
                {formError}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Nombre de la caja *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Caja A1 - Sueros"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Descripción</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Proyecto X, Ronda 1..."
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Filas</label>
                <Input
                  type="number"
                  value={form.rows}
                  onChange={(e) => setForm({ ...form, rows: e.target.value })}
                  min={1}
                  max={20}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Columnas</label>
                <Input
                  type="number"
                  value={form.columns}
                  onChange={(e) => setForm({ ...form, columns: e.target.value })}
                  min={1}
                  max={20}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Tipo de caja</label>
              <select
                value={form.box_type}
                onChange={(e) => setForm({ ...form, box_type: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
              >
                <option value="standard">Estándar (cryoviales)</option>
                <option value="microtube">Microtubo (1.5 mL)</option>
                <option value="sample_vial">Vial de muestra</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {saveMutation.isPending ? 'Guardando...' : editBox ? 'Guardar' : 'Crear caja'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
