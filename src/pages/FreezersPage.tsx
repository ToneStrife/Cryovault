import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { syncFreezerZones } from '@/lib/freezerZones';
import { syncRackZones } from '@/lib/rackZones';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, Snowflake, MapPin, Thermometer, Package2, ArrowRight, Pencil, Trash2,
  ChevronRight, ChevronLeft, Upload, X, Layers,
} from 'lucide-react';
import type { Freezer } from '@/types';

const TEMP_OPTIONS = [
  { label: '-80°C — Ultra-bajo (ULT)', value: -80 },
  { label: '-20°C — Congelador', value: -20 },
  { label: '4°C — Frigorífico', value: 4 },
  { label: '-196°C — Nitrógeno líquido (LN)', value: -196 },
];

const TEMP_COLORS: Record<string, string> = {
  '-196': 'text-sky-700 bg-sky-50 border-sky-200',
  '-80': 'text-blue-700 bg-blue-50 border-blue-200',
  '-20': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  '4': 'text-teal-700 bg-teal-50 border-teal-200',
};

function getTempColor(temp: number) {
  return TEMP_COLORS[String(temp)] ?? 'text-gray-700 bg-gray-50 border-gray-200';
}

function getTempLabel(temp: number) {
  const opt = TEMP_OPTIONS.find((o) => o.value === temp);
  return opt ? opt.label.split(' — ')[0] : `${temp}°C`;
}

interface RackDraft { name: string; slot_count: string; }
interface ShelfDraft { racks: RackDraft[]; }
interface FreezerFormData {
  name: string; temperature: number; location: string; room: string;
  building: string; notes: string; shelf_count: string;
}

const emptyForm: FreezerFormData = {
  name: '', temperature: -80, location: '', room: '', building: '', notes: '', shelf_count: '3',
};

function emptyShelf(): ShelfDraft { return { racks: [] }; }

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
      const { data, error } = await supabase.from('freezers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Freezer[];
    },
    enabled: !!user,
  });

  const { data: boxCounts = {} } = useQuery({
    queryKey: ['freezer-box-counts'],
    queryFn: async () => {
      const { data } = await (supabase.from('boxes') as any).select('freezer_id');
      const counts: Record<string, number> = {};
      (data || []).forEach((b: any) => { counts[b.freezer_id] = (counts[b.freezer_id] || 0) + 1; });
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
        name: data.name.trim(), temperature: data.temperature,
        location: data.location.trim() || null, room: data.room.trim() || null,
        building: data.building.trim() || null, notes: data.notes.trim() || null,
        laboratory: user!.laboratory, created_by: user!.id,
        shelf_count: parseInt(data.shelf_count) || 3,
      };
      const zoneCount = basePayload.shelf_count;
      if (editTarget) {
        let imageUrl = editTarget.image_url;
        if (imageFile) imageUrl = await uploadImage(editTarget.id);
        const { error } = await (supabase.from('freezers') as any).update({ ...basePayload, image_url: imageUrl }).eq('id', editTarget.id);
        if (error) throw error;
        await syncFreezerZones(editTarget.id, zoneCount);
      } else {
        const { data: inserted, error } = await (supabase.from('freezers') as any).insert([{ ...basePayload, image_url: null }]).select('id').single();
        if (error) throw error;
        const freezerId = inserted.id;
        await syncFreezerZones(freezerId, zoneCount);
        if (imageFile) {
          const imageUrl = await uploadImage(freezerId);
          await (supabase.from('freezers') as any).update({ image_url: imageUrl }).eq('id', freezerId);
        }
        const rackInserts: any[] = [];
        shelves.forEach((shelf, shelfIdx) => {
          shelf.racks.forEach((rack) => {
            if (rack.name.trim()) {
              const slots = parseInt(rack.slot_count) || 5;
              rackInserts.push({
                freezer_id: freezerId,
                name: rack.name.trim(),
                shelf_number: shelfIdx + 1,
                rows: 1,
                columns: slots,
                slot_count: slots,
                shelf_count: 1,
                slots_per_shelf: slots,
                created_by: user!.id,
              });
            }
          });
        });
        if (rackInserts.length > 0) {
          const { data: insertedRacks, error: rErr } = await (supabase.from('racks') as any)
            .insert(rackInserts)
            .select('id');
          if (rErr) throw rErr;
          for (const rack of insertedRacks || []) {
            await syncRackZones(rack.id, 1);
          }
        }
      }
    },
    onSuccess: () => { setUploading(false); queryClient.invalidateQueries({ queryKey: ['freezers'] }); queryClient.invalidateQueries({ queryKey: ['racks'] }); closeDialog(); },
    onError: (e: any) => { setUploading(false); setFormError(e.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('freezers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freezers'] }),
  });

  const openCreate = () => {
    setEditTarget(null); setForm(emptyForm); setShelves([emptyShelf(), emptyShelf(), emptyShelf()]);
    setImageFile(null); setImagePreview(null); setFormError(''); setStep(1); setShowDialog(true);
  };
  const openEdit = (f: Freezer) => {
    setEditTarget(f); setForm({ name: f.name, temperature: f.temperature, location: f.location || '', room: f.room || '', building: f.building || '', notes: f.notes || '', shelf_count: String(f.shelf_count || 3) });
    setImageFile(null); setImagePreview(f.image_url || null); setFormError(''); setStep(1); setShowDialog(true);
  };
  const closeDialog = () => { setShowDialog(false); setEditTarget(null); setForm(emptyForm); setImageFile(null); setImagePreview(null); setStep(1); };
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
  };
  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    if (!form.name.trim()) return setFormError('El nombre es obligatorio');
    const count = Math.max(1, Math.min(20, parseInt(form.shelf_count) || 3));
    setShelves((prev) => { const next = [...prev]; while (next.length < count) next.push(emptyShelf()); return next.slice(0, count); });
    setStep(2);
  };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setFormError(''); saveMutation.mutate(form); };
  const addRack = (si: number) => setShelves((prev) => prev.map((s, i) => i === si ? { ...s, racks: [...s.racks, { name: '', slot_count: '5' }] } : s));
  const updateRack = (si: number, ri: number, field: keyof RackDraft, val: string) =>
    setShelves((prev) => prev.map((s, i) => i !== si ? s : { ...s, racks: s.racks.map((r, j) => j === ri ? { ...r, [field]: val } : r) }));
  const removeRack = (si: number, ri: number) =>
    setShelves((prev) => prev.map((s, i) => i !== si ? s : { ...s, racks: s.racks.filter((_, j) => j !== ri) }));

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Congeladores</h1>
              <p className="text-sm text-gray-500 mt-0.5">{freezers.length} congelador{freezers.length !== 1 ? 'es' : ''}</p>
            </div>
            <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
              <Plus className="w-4 h-4" /> Nuevo congelador
            </Button>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-52 bg-gray-100 animate-pulse rounded-xl" />)}
            </div>
          ) : freezers.length === 0 ? (
            <div className="text-center py-24">
              <Snowflake className="w-16 h-16 mx-auto mb-4 text-gray-200" />
              <p className="text-xl font-medium text-gray-400 mb-2">Sin congeladores</p>
              <p className="mb-6 text-sm text-gray-400">Añade tu primer congelador para empezar.</p>
              <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="w-4 h-4" /> Añadir congelador
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {freezers.map((f) => (
                <div key={f.id} className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md hover:border-gray-300 transition-all flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {f.image_url ? (
                        <img src={f.image_url} alt={f.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
                      ) : (
                        <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                          <Snowflake className="w-5 h-5 text-blue-600" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{f.name}</h3>
                        {f.location && <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {f.location}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(f)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => { if (confirm(`¿Eliminar ${f.name}?`)) deleteMutation.mutate(f.id); }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-mono flex items-center gap-1 ${getTempColor(f.temperature)}`}>
                      <Thermometer className="w-3 h-3" /> {getTempLabel(f.temperature)}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Package2 className="w-3.5 h-3.5 text-gray-400" /> {boxCounts[f.id] || 0} caja{boxCounts[f.id] !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-gray-400" /> {f.shelf_count || 3} balda{(f.shelf_count || 3) !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {f.room && <p className="text-xs text-gray-400">{[f.building, f.room].filter(Boolean).join(' · ')}</p>}

                  <Link to={`/freezers/${f.id}`} className="mt-auto flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium">
                    Ver detalle <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{editTarget ? 'Editar congelador' : 'Nuevo congelador'}</DialogTitle>
              {!editTarget && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mr-6">
                  <span className={step === 1 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>1 Datos</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className={step === 2 ? 'text-blue-600 font-semibold' : 'text-gray-400'}>2 Estructura</span>
                </div>
              )}
            </div>
          </DialogHeader>

          {step === 1 && (
            <form onSubmit={editTarget ? handleSubmit : handleStep1Next} className="space-y-4 mt-2">
              {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Nombre *</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ULT Freezer A" className="border-gray-300" autoFocus />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Temperatura *</label>
                <select value={form.temperature} onChange={(e) => setForm({ ...form, temperature: parseInt(e.target.value) })} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {TEMP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Ubicación</label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lab A" className="border-gray-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Sala</label>
                  <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Sala 203" className="border-gray-300" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Edificio</label>
                  <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="Edif. Investigación" className="border-gray-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Núm. de baldas</label>
                  <Input type="number" min={1} max={20} value={form.shelf_count} onChange={(e) => setForm({ ...form, shelf_count: e.target.value })} className="border-gray-300" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Notas</label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones..." className="border-gray-300" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Foto (opcional)</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                <div className="flex items-center gap-3">
                  {imagePreview && (
                    <div className="relative flex-shrink-0">
                      <img src={imagePreview} alt="preview" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5">
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    <Upload className="w-4 h-4" /> {imagePreview ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
                {editTarget ? (
                  <Button type="submit" disabled={saveMutation.isPending || uploading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                    {saveMutation.isPending || uploading ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                ) : (
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white flex items-center gap-2">
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
              <p className="text-sm text-gray-500">Configura los racks de cada balda (opcional).</p>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {shelves.map((shelf, si) => (
                  <div key={si} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-500" /> Balda {si + 1}
                      </p>
                      <button type="button" onClick={() => addRack(si)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Añadir rack
                      </button>
                    </div>
                    {shelf.racks.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">Sin racks — cajas directamente en la balda</p>
                    ) : (
                      <div className="space-y-2">
                        {shelf.racks.map((rack, ri) => (
                          <div key={ri} className="flex items-center gap-2">
                            <Input value={rack.name} onChange={(e) => updateRack(si, ri, 'name', e.target.value)} placeholder="Nombre del rack" className="border-gray-200 text-sm flex-1" />
                            <Input type="number" min={1} max={50} value={rack.slot_count} onChange={(e) => updateRack(si, ri, 'slot_count', e.target.value)} className="border-gray-200 text-sm w-16" />
                            <span className="text-xs text-gray-400 whitespace-nowrap">slots</span>
                            <button type="button" onClick={() => removeRack(si, ri)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)} className="flex items-center gap-1 border-gray-300 text-gray-700">
                  <ChevronLeft className="w-4 h-4" /> Atrás
                </Button>
                <Button type="submit" disabled={saveMutation.isPending || uploading} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
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
