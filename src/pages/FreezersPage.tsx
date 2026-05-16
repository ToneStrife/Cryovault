import { useState, useRef } from 'react';
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
  ChevronRight,
  ChevronLeft,
  Upload,
  X,
  Layers,
} from 'lucide-react';
import type { Freezer } from '@/types';

const TEMP_OPTIONS = [
  { label: '-80°C — Ultra-bajo (ULT)', value: -80 },
  { label: '-20°C — Congelador', value: -20 },
  { label: '4°C — Frigorífico', value: 4 },
  { label: '-196°C — Nitrógeno líquido (LN)', value: -196 },
];

const TEMP_COLORS: Record<string, string> = {
  '-196': 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  '-80': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  '-20': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  '4': 'text-teal-400 bg-teal-500/10 border-teal-500/30',
};

function getTempColor(temp: number) {
  return TEMP_COLORS[String(temp)] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/30';
}

function getTempLabel(temp: number) {
  const opt = TEMP_OPTIONS.find((o) => o.value === temp);
  if (opt) return opt.label.split(' — ')[0];
  return `${temp}°C`;
}

interface RackDraft {
  name: string;
  slot_count: string;
}

interface ShelfDraft {
  racks: RackDraft[];
}

interface FreezerFormData {
  name: string;
  temperature: number;
  location: string;
  room: string;
  building: string;
  notes: string;
  shelf_count: string;
}

const emptyForm: FreezerFormData = {
  name: '',
  temperature: -80,
  location: '',
  room: '',
  building: '',
  notes: '',
  shelf_count: '3',
};

function emptyShelf(): ShelfDraft {
  return { racks: [] };
}

export function FreezersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [editTarget, setEditTarget] = useState<Freezer | null>(null);
  const [form, setForm] = useState<FreezerFormData>(emptyForm);
  const [shelves, setShelves] = useState<ShelfDraft[]>([emptyShelf(), emptyShelf(), emptyShelf()]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);

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
      const { data, error } = await (supabase.from('boxes') as any).select('freezer_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        counts[b.freezer_id] = (counts[b.freezer_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  async function uploadImage(freezerId: string): Promise<string | null> {
    if (!imageFile) return null;
    const ext = imageFile.name.split('.').pop();
    const path = `freezers/${freezerId}.${ext}`;
    const { error } = await supabase.storage.from('cryo-images').upload(path, imageFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('cryo-images').getPublicUrl(path);
    return data.publicUrl;
  }

  const saveMutation = useMutation({
    mutationFn: async (data: FreezerFormData) => {
      setUploading(true);
      const basePayload = {
        name: data.name.trim(),
        temperature: data.temperature,
        location: data.location.trim() || null,
        room: data.room.trim() || null,
        building: data.building.trim() || null,
        notes: data.notes.trim() || null,
        laboratory: user!.laboratory,
        created_by: user!.id,
        shelf_count: parseInt(data.shelf_count) || 3,
      };

      if (editTarget) {
        let imageUrl = editTarget.image_url;
        if (imageFile) {
          imageUrl = await uploadImage(editTarget.id);
        }
        const { error } = await (supabase.from('freezers') as any)
          .update({ ...basePayload, image_url: imageUrl })
          .eq('id', editTarget.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await (supabase.from('freezers') as any)
          .insert([{ ...basePayload, image_url: null }])
          .select('id')
          .single();
        if (error) throw error;
        const freezerId = inserted.id;

        if (imageFile) {
          const imageUrl = await uploadImage(freezerId);
          await (supabase.from('freezers') as any)
            .update({ image_url: imageUrl })
            .eq('id', freezerId);
        }

        const rackInserts: any[] = [];
        shelves.forEach((shelf, shelfIdx) => {
          shelf.racks.forEach((rack) => {
            if (rack.name.trim()) {
              rackInserts.push({
                freezer_id: freezerId,
                name: rack.name.trim(),
                shelf_number: shelfIdx + 1,
                rows: 1,
                columns: parseInt(rack.slot_count) || 5,
                slot_count: parseInt(rack.slot_count) || 5,
                created_by: user!.id,
              });
            }
          });
        });
        if (rackInserts.length > 0) {
          const { error: rErr } = await (supabase.from('racks') as any).insert(rackInserts);
          if (rErr) throw rErr;
        }
      }
    },
    onSuccess: () => {
      setUploading(false);
      queryClient.invalidateQueries({ queryKey: ['freezers'] });
      queryClient.invalidateQueries({ queryKey: ['racks'] });
      closeDialog();
    },
    onError: (e: any) => {
      setUploading(false);
      setFormError(e.message);
    },
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
    setShelves([emptyShelf(), emptyShelf(), emptyShelf()]);
    setImageFile(null);
    setImagePreview(null);
    setFormError('');
    setStep(1);
    setShowDialog(true);
  };

  const openEdit = (f: Freezer) => {
    setEditTarget(f);
    setForm({
      name: f.name,
      temperature: f.temperature,
      location: f.location || '',
      room: f.room || '',
      building: f.building || '',
      notes: f.notes || '',
      shelf_count: String(f.shelf_count || 3),
    });
    setImageFile(null);
    setImagePreview(f.image_url || null);
    setFormError('');
    setStep(1);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditTarget(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setStep(1);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('El nombre es obligatorio');
    const count = Math.max(1, Math.min(20, parseInt(form.shelf_count) || 3));
    setShelves((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(emptyShelf());
      return next.slice(0, count);
    });
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    saveMutation.mutate(form);
  };

  const addRack = (shelfIdx: number) => {
    setShelves((prev) =>
      prev.map((s, i) =>
        i === shelfIdx ? { ...s, racks: [...s.racks, { name: '', slot_count: '5' }] } : s
      )
    );
  };

  const updateRack = (shelfIdx: number, rackIdx: number, field: keyof RackDraft, val: string) => {
    setShelves((prev) =>
      prev.map((s, i) => {
        if (i !== shelfIdx) return s;
        return { ...s, racks: s.racks.map((r, j) => (j === rackIdx ? { ...r, [field]: val } : r)) };
      })
    );
  };

  const removeRack = (shelfIdx: number, rackIdx: number) => {
    setShelves((prev) =>
      prev.map((s, i) =>
        i === shelfIdx ? { ...s, racks: s.racks.filter((_, j) => j !== rackIdx) } : s
      )
    );
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <p className="text-slate-400 text-sm">
            {freezers.length} congelador{freezers.length !== 1 ? 'es' : ''} registrado{freezers.length !== 1 ? 's' : ''}
          </p>
          <Button
            onClick={openCreate}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
          >
            <Plus className="w-4 h-4" />
            Nuevo congelador
          </Button>
        </div>

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
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {f.image_url ? (
                      <img
                        src={f.image_url}
                        alt={f.name}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="p-2 bg-blue-500/10 rounded-lg flex-shrink-0">
                        <Snowflake className="w-5 h-5 text-blue-400" />
                      </div>
                    )}
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

                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`text-sm px-2.5 py-1 rounded-full border font-mono ${getTempColor(f.temperature)}`}>
                    <Thermometer className="w-3 h-3 inline mr-1" />
                    {getTempLabel(f.temperature)}
                  </span>
                  <span className="text-sm text-slate-400 flex items-center gap-1.5">
                    <Box className="w-4 h-4" />
                    {boxCounts[f.id] || 0} caja{boxCounts[f.id] !== 1 ? 's' : ''}
                  </span>
                  <span className="text-sm text-slate-500 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    {f.shelf_count || 3} balda{(f.shelf_count || 3) !== 1 ? 's' : ''}
                  </span>
                </div>

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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editTarget ? 'Editar congelador' : 'Nuevo congelador'}</DialogTitle>
              {!editTarget && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-6">
                  <span className={step === 1 ? 'text-blue-400 font-semibold' : 'text-slate-500'}>1 Datos</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className={step === 2 ? 'text-blue-400 font-semibold' : 'text-slate-500'}>2 Estructura</span>
                </div>
              )}
            </div>
          </DialogHeader>

          {step === 1 && (
            <form onSubmit={editTarget ? handleSubmit : handleStep1Next} className="space-y-4 mt-2">
              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{formError}</p>
              )}

              <div className="space-y-1">
                <label className="text-sm text-slate-300">Nombre *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: ULT Freezer A"
                  className="bg-slate-800 border-slate-600 text-white"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-slate-300">Temperatura *</label>
                <select
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  {TEMP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
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

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-sm text-slate-300">Núm. de baldas</label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.shelf_count}
                    onChange={(e) => setForm({ ...form, shelf_count: e.target.value })}
                    className="bg-slate-800 border-slate-600 text-white"
                  />
                </div>
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

              <div className="space-y-2">
                <label className="text-sm text-slate-300">Foto (opcional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                <div className="flex items-center gap-3">
                  {imagePreview && (
                    <div className="relative flex-shrink-0">
                      <img
                        src={imagePreview}
                        alt="preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-600 rounded-md text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {imagePreview ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                </div>
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
                {editTarget ? (
                  <Button
                    type="submit"
                    disabled={saveMutation.isPending || uploading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                  >
                    {saveMutation.isPending || uploading ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white flex items-center gap-2"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              {formError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{formError}</p>
              )}

              <p className="text-sm text-slate-400">
                Configura los racks de cada balda. Los racks son opcionales — puedes añadirlos o modificarlos más tarde desde el detalle del congelador.
              </p>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {shelves.map((shelf, shelfIdx) => (
                  <div key={shelfIdx} className="border border-slate-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        Balda {shelfIdx + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => addRack(shelfIdx)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Añadir rack
                      </button>
                    </div>

                    {shelf.racks.length === 0 ? (
                      <p className="text-xs text-slate-600 italic">Sin racks — las cajas irán directamente en la balda</p>
                    ) : (
                      <div className="space-y-2">
                        {shelf.racks.map((rack, rackIdx) => (
                          <div key={rackIdx} className="flex items-center gap-2">
                            <Input
                              value={rack.name}
                              onChange={(e) => updateRack(shelfIdx, rackIdx, 'name', e.target.value)}
                              placeholder="Nombre del rack"
                              className="bg-slate-800 border-slate-700 text-white text-sm flex-1"
                            />
                            <Input
                              type="number"
                              min={1}
                              max={50}
                              value={rack.slot_count}
                              onChange={(e) => updateRack(shelfIdx, rackIdx, 'slot_count', e.target.value)}
                              placeholder="5"
                              className="bg-slate-800 border-slate-700 text-white text-sm w-16"
                            />
                            <span className="text-xs text-slate-500 whitespace-nowrap">slots</span>
                            <button
                              type="button"
                              onClick={() => removeRack(shelfIdx, rackIdx)}
                              className="text-slate-500 hover:text-red-400 flex-shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 border-slate-600 text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || uploading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
                >
                  {saveMutation.isPending || uploading ? 'Guardando...' : 'Crear congelador'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
