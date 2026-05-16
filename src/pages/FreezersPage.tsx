import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import {
  Plus,
  Snowflake,
  MapPin,
  Thermometer,
  Box,
  ArrowRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Freezer } from '@/types';

const TEMP_COLORS: Record<string, string> = {
  ultra: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  cold: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  cool: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
};

function getTempColor(temp: number) {
  if (temp <= -70) return TEMP_COLORS.ultra;
  if (temp <= -20) return TEMP_COLORS.cold;
  return TEMP_COLORS.cool;
}

interface FreezerFormData {
  name: string;
  temperature: string;
  location: string;
  room: string;
  building: string;
  notes: string;
}

const emptyForm: FreezerFormData = {
  name: '',
  temperature: '-80',
  location: '',
  room: '',
  building: '',
  notes: '',
};

export function FreezersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editTarget, setEditTarget] = useState<Freezer | null>(null);
  const [form, setForm] = useState<FreezerFormData>(emptyForm);
  const [formError, setFormError] = useState('');

  const { data: freezers = [], isLoading } = useQuery({
    queryKey: ['freezers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('freezers')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Freezer[];
    },
    enabled: !!user,
  });

  const { data: boxCounts = {} } = useQuery({
    queryKey: ['freezer-box-counts'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('boxes') as any)
        .select('freezer_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        counts[b.freezer_id] = (counts[b.freezer_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: FreezerFormData) => {
      const payload = {
        name: data.name.trim(),
        temperature: parseInt(data.temperature),
        location: data.location.trim() || null,
        room: data.room.trim() || null,
        building: data.building.trim() || null,
        notes: data.notes.trim() || null,
        laboratory: user!.laboratory,
        created_by: user!.id,
      };
      if (editTarget) {
        const { error } = await (supabase.from('freezers') as any)
          .update(payload)
          .eq('id', editTarget.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('freezers') as any).insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezers'] });
      closeDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('freezers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezers'] });
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setFormError('');
    setShowDialog(true);
  };

  const openEdit = (f: Freezer) => {
    setEditTarget(f);
    setForm({
      name: f.name,
      temperature: String(f.temperature),
      location: f.location || '',
      room: f.room || '',
      building: f.building || '',
      notes: f.notes || '',
    });
    setFormError('');
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('El nombre es obligatorio');
    saveMutation.mutate(form);
  };

  return (
    <AppLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <p className="text-slate-400 text-sm">{freezers.length} congelador{freezers.length !== 1 ? 'es' : ''} registrado{freezers.length !== 1 ? 's' : ''}</p>
          <Button
            onClick={openCreate}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Nuevo congelador
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : freezers.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            <Snowflake className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium mb-2">Sin congeladores</p>
            <p className="mb-6 text-sm">Añade tu primer congelador para empezar a gestionar muestras.</p>
            <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4" /> Añadir congelador
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {freezers.map((f) => (
              <div
                key={f.id}
                className="group bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-slate-600 hover:bg-slate-800/80 transition-all flex flex-col gap-4"
              >
                {/* Top */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Snowflake className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{f.name}</h3>
                      {f.location && (
                        <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" /> {f.location}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(f)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar ${f.name}? Se eliminarán todas las cajas asociadas.`)) {
                          deleteMutation.mutate(f.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3">
                  <span className={`text-sm px-2.5 py-1 rounded-full border font-mono ${getTempColor(f.temperature)}`}>
                    <Thermometer className="w-3 h-3 inline mr-1" />
                    {f.temperature}°C
                  </span>
                  <span className="text-sm text-slate-400 flex items-center gap-1.5">
                    <Box className="w-4 h-4" />
                    {boxCounts[f.id] || 0} caja{boxCounts[f.id] !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Footer */}
                {f.room && (
                  <p className="text-xs text-slate-500">
                    {[f.building, f.room].filter(Boolean).join(' · ')}
                  </p>
                )}

                <Link
                  to={`/freezers/${f.id}`}
                  className="mt-auto flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  Ver detalle <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar congelador' : 'Nuevo congelador'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
                {formError}
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Nombre *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: ULT Freezer A"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Temperatura (°C) *</label>
              <Input
                type="number"
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })}
                placeholder="-80"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Ubicación</label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Lab A"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Sala</label>
                <Input
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="Sala 203"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Edificio</label>
              <Input
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
                placeholder="Edificio Investigación"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Notas</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones..."
                className="bg-slate-800 border-slate-600 text-white"
              />
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
                {saveMutation.isPending ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear congelador'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
