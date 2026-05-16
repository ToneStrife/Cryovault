import { useState, useRef } from 'react';
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
import {
  ChevronLeft,
  Plus,
  Snowflake,
  MapPin,
  Thermometer,
  Grid3x3 as Grid3X3,
  Pencil,
  Layers,
  Package,
  Upload,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Freezer, Box as BoxType, Rack } from '@/types';

interface BoxFormData {
  name: string;
  description: string;
  rows: string;
  columns: string;
  box_type: string;
  shelf_number: string;
  rack_id: string;
}

const emptyBoxForm: BoxFormData = {
  name: '',
  description: '',
  rows: '9',
  columns: '9',
  box_type: 'standard',
  shelf_number: '',
  rack_id: '',
};

function getTempLabel(temp: number) {
  const map: Record<string, string> = {
    '-196': '-196°C (LN)',
    '-80': '-80°C',
    '-20': '-20°C',
    '4': '4°C',
  };
  return map[String(temp)] ?? `${temp}°C`;
}

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editBox, setEditBox] = useState<BoxType | null>(null);
  const [form, setForm] = useState<BoxFormData>(emptyBoxForm);
  const [formError, setFormError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [collapsedShelves, setCollapsedShelves] = useState<Record<number, boolean>>({});

  // Rack management
  const [showRackDialog, setShowRackDialog] = useState(false);
  const [rackForm, setRackForm] = useState({ name: '', shelf_number: '1', slot_count: '5' });
  const [rackError, setRackError] = useState('');

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

  const { data: racks = [] } = useQuery({
    queryKey: ['racks', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('racks') as any)
        .select('*')
        .eq('freezer_id', id!)
        .order('shelf_number', { ascending: true });
      if (error) throw error;
      return data as Rack[];
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

  async function uploadBoxImage(boxId: string): Promise<string | null> {
    if (!imageFile) return null;
    const ext = imageFile.name.split('.').pop();
    const path = `boxes/${boxId}.${ext}`;
    const { error } = await supabase.storage.from('cryo-images').upload(path, imageFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('cryo-images').getPublicUrl(path);
    return data.publicUrl;
  }

  const saveMutation = useMutation({
    mutationFn: async (data: BoxFormData) => {
      const shelfNum = data.shelf_number ? parseInt(data.shelf_number) : null;
      const rackId = data.rack_id || null;

      if (editBox) {
        let imageUrl = editBox.image_url;
        if (imageFile) imageUrl = await uploadBoxImage(editBox.id);
        const { error } = await (supabase.from('boxes') as any)
          .update({
            name: data.name.trim(),
            description: data.description.trim() || null,
            rows: parseInt(data.rows) || 9,
            columns: parseInt(data.columns) || 9,
            box_type: data.box_type,
            shelf_number: shelfNum,
            rack_id: rackId,
            image_url: imageUrl,
          })
          .eq('id', editBox.id);
        if (error) throw error;
      } else {
        const payload = {
          freezer_id: id!,
          name: data.name.trim(),
          description: data.description.trim() || null,
          rows: parseInt(data.rows) || 9,
          columns: parseInt(data.columns) || 9,
          box_type: data.box_type,
          status: 'active' as const,
          occupancy: 0,
          archived: false,
          shelf_number: shelfNum,
          rack_id: rackId,
          image_url: null as string | null,
          created_by: user!.id,
        };
        const { data: inserted, error } = await (supabase.from('boxes') as any)
          .insert([payload])
          .select('id')
          .single();
        if (error) throw error;
        if (imageFile) {
          const imageUrl = await uploadBoxImage(inserted.id);
          await (supabase.from('boxes') as any).update({ image_url: imageUrl }).eq('id', inserted.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
      queryClient.invalidateQueries({ queryKey: ['freezer-box-counts'] });
      closeDialog();
    },
    onError: (e: any) => setFormError(e.message),
  });

  const addRackMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from('racks') as any).insert([{
        freezer_id: id!,
        name: rackForm.name.trim(),
        shelf_number: parseInt(rackForm.shelf_number) || 1,
        rows: 1,
        columns: parseInt(rackForm.slot_count) || 5,
        slot_count: parseInt(rackForm.slot_count) || 5,
        created_by: user!.id,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks', id] });
      setShowRackDialog(false);
      setRackForm({ name: '', shelf_number: '1', slot_count: '5' });
      setRackError('');
    },
    onError: (e: any) => setRackError(e.message),
  });

  const openCreate = () => {
    setEditBox(null);
    setForm({
      ...emptyBoxForm,
      shelf_number: freezer ? '1' : '',
    });
    setImageFile(null);
    setImagePreview(null);
    setFormError('');
    setShowAdvanced(false);
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
      shelf_number: b.shelf_number ? String(b.shelf_number) : '',
      rack_id: b.rack_id || '',
    });
    setImageFile(null);
    setImagePreview(b.image_url || null);
    setFormError('');
    setShowAdvanced(false);
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditBox(null);
    setForm(emptyBoxForm);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('El nombre es obligatorio');
    saveMutation.mutate(form);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const getOccupancyColor = (box: BoxType) => {
    const pct = (box.occupancy / (box.rows * box.columns)) * 100;
    if (pct >= 90) return 'bg-red-500/30 text-red-400';
    if (pct >= 60) return 'bg-orange-500/30 text-orange-400';
    if (pct >= 30) return 'bg-yellow-500/30 text-yellow-400';
    return 'bg-green-500/30 text-green-400';
  };

  const toggleShelf = (shelfNum: number) => {
    setCollapsedShelves((prev) => ({ ...prev, [shelfNum]: !prev[shelfNum] }));
  };

  // Group boxes by shelf
  const shelfCount = freezer?.shelf_count || 3;
  const shelves = Array.from({ length: shelfCount }, (_, i) => i + 1);
  const unassigned = boxes.filter((b) => !b.shelf_number);

  // For each shelf, get racks and boxes
  const getRacksForShelf = (shelfNum: number) => racks.filter((r) => r.shelf_number === shelfNum);
  const getBoxesForShelfDirect = (shelfNum: number) =>
    boxes.filter((b) => b.shelf_number === shelfNum && !b.rack_id);
  const getBoxesForRack = (rackId: string) => boxes.filter((b) => b.rack_id === rackId);

  // Racks in the selected shelf (for form)
  const racksForSelectedShelf = form.shelf_number
    ? racks.filter((r) => r.shelf_number === parseInt(form.shelf_number))
    : [];

  const renderBoxCard = (box: BoxType) => {
    const totalPositions = box.rows * box.columns;
    const pct = Math.round((box.occupancy / totalPositions) * 100);
    return (
      <div
        key={box.id}
        className="group bg-slate-800/60 border border-slate-700 rounded-lg p-3 hover:border-slate-600 transition-all flex flex-col gap-2"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {box.image_url ? (
              <img
                src={box.image_url}
                alt={box.name}
                className="w-8 h-8 rounded object-cover border border-slate-600 flex-shrink-0"
              />
            ) : null}
            <div>
              <p className="text-white font-medium text-sm leading-tight">{box.name}</p>
              <p className="text-slate-500 text-xs mt-0.5">{box.rows}×{box.columns}</p>
            </div>
          </div>
          <button
            onClick={() => openEdit(box)}
            className="p-1 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(box.columns, 9)}, 1fr)` }}
        >
          {Array.from({ length: Math.min(box.rows * box.columns, 81) }).map((_, idx) => (
            <div
              key={idx}
              className={`aspect-square rounded-sm ${idx < box.occupancy ? 'bg-green-500/60' : 'bg-slate-700/60'}`}
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
                {freezer.image_url ? (
                  <img
                    src={freezer.image_url}
                    alt={freezer.name}
                    className="w-14 h-14 rounded-xl object-cover border border-slate-600"
                  />
                ) : (
                  <div className="p-3 bg-blue-500/10 rounded-xl">
                    <Snowflake className="w-7 h-7 text-blue-400" />
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-white">{freezer.name}</h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-blue-400 font-mono flex items-center gap-1">
                      <Thermometer className="w-3 h-3" /> {getTempLabel(freezer.temperature)}
                    </span>
                    {freezer.location && (
                      <span className="text-sm text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {freezer.location}
                      </span>
                    )}
                    <span className="text-sm text-slate-500 flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {shelfCount} baldas
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setRackForm({ name: '', shelf_number: '1', slot_count: '5' });
                    setRackError('');
                    setShowRackDialog(true);
                  }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  <Package className="w-4 h-4" />
                  Añadir rack
                </Button>
                <Button
                  onClick={openCreate}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
                >
                  <Plus className="w-4 h-4" /> Nueva caja
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-16 bg-slate-800 animate-pulse rounded-xl" />
          )}
        </div>

        {/* Shelves view */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {shelves.map((shelfNum) => {
              const shelfRacks = getRacksForShelf(shelfNum);
              const directBoxes = getBoxesForShelfDirect(shelfNum);
              const totalBoxesOnShelf = directBoxes.length + shelfRacks.reduce((sum, r) => sum + getBoxesForRack(r.id).length, 0);
              const isCollapsed = collapsedShelves[shelfNum];

              return (
                <div key={shelfNum} className="border border-slate-700 rounded-xl overflow-hidden">
                  {/* Shelf header */}
                  <button
                    className="w-full flex items-center justify-between px-5 py-3 bg-slate-800/60 hover:bg-slate-800/80 transition-colors"
                    onClick={() => toggleShelf(shelfNum)}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-semibold text-white">Balda {shelfNum}</span>
                      <span className="text-xs text-slate-500">{totalBoxesOnShelf} caja{totalBoxesOnShelf !== 1 ? 's' : ''}</span>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="p-4 space-y-4 bg-slate-900/30">
                      {/* Racks on this shelf */}
                      {shelfRacks.map((rack) => {
                        const rackBoxes = getBoxesForRack(rack.id);
                        return (
                          <div key={rack.id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs font-medium text-slate-300">{rack.name}</span>
                              <span className="text-xs text-slate-600">({rack.slot_count || rack.columns} slots)</span>
                            </div>
                            {rackBoxes.length === 0 ? (
                              <p className="text-xs text-slate-700 ml-5 italic">Sin cajas en este rack</p>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 ml-5">
                                {rackBoxes.map(renderBoxCard)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Direct boxes on shelf (no rack) */}
                      {(directBoxes.length > 0 || shelfRacks.length === 0) && (
                        <div className="space-y-2">
                          {shelfRacks.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-500">Directamente en la balda</span>
                            </div>
                          )}
                          {directBoxes.length === 0 ? (
                            <p className="text-xs text-slate-700 italic">
                              {shelfRacks.length === 0 ? 'Sin cajas ni racks en esta balda' : 'Sin cajas directas en balda'}
                            </p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                              {directBoxes.map(renderBoxCard)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned boxes */}
            {unassigned.length > 0 && (
              <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-800/30">
                  <span className="text-sm font-medium text-slate-400">Sin balda asignada ({unassigned.length})</span>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {unassigned.map(renderBoxCard)}
                </div>
              </div>
            )}

            {boxes.length === 0 && (
              <div className="text-center py-16 text-slate-500">
                <Package className="w-14 h-14 mx-auto mb-3 opacity-25" />
                <p className="text-lg font-medium mb-1">Sin cajas</p>
                <p className="text-sm mb-5">Añade cajas a las baldas de este congelador.</p>
                <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4" /> Añadir caja
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Box Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editBox ? 'Editar caja' : 'Nueva caja'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{formError}</p>
            )}

            <div className="space-y-1">
              <label className="text-sm text-slate-300">Nombre de la caja *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Caja A1 — Sueros"
                className="bg-slate-800 border-slate-600 text-white"
                autoFocus
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

            {/* Shelf + Rack selector */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Balda</label>
                <select
                  value={form.shelf_number}
                  onChange={(e) => setForm({ ...form, shelf_number: e.target.value, rack_id: '' })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  <option value="">Sin asignar</option>
                  {Array.from({ length: shelfCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Balda {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Rack</label>
                <select
                  value={form.rack_id}
                  onChange={(e) => setForm({ ...form, rack_id: e.target.value })}
                  disabled={!form.shelf_number || racksForSelectedShelf.length === 0}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm disabled:opacity-40"
                >
                  <option value="">En la balda</option>
                  {racksForSelectedShelf.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Filas</label>
                <Input
                  type="number"
                  value={form.rows}
                  onChange={(e) => setForm({ ...form, rows: e.target.value })}
                  min={1} max={20}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Columnas</label>
                <Input
                  type="number"
                  value={form.columns}
                  onChange={(e) => setForm({ ...form, columns: e.target.value })}
                  min={1} max={20}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>

            {/* Image upload */}
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
                      className="w-14 h-14 rounded-lg object-cover border border-slate-600"
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
                  className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {imagePreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
            </div>

            {/* Advanced options toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400"
            >
              {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Opciones avanzadas
            </button>

            {showAdvanced && (
              <div className="space-y-1 pl-3 border-l border-slate-700">
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
            )}

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

      {/* Add Rack Dialog */}
      <Dialog open={showRackDialog} onOpenChange={setShowRackDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Añadir rack</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {rackError && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">{rackError}</p>
            )}
            <div className="space-y-1">
              <label className="text-sm text-slate-300">Nombre del rack *</label>
              <Input
                value={rackForm.name}
                onChange={(e) => setRackForm({ ...rackForm, name: e.target.value })}
                placeholder="Ej: Rack R1"
                className="bg-slate-800 border-slate-600 text-white"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Balda</label>
                <select
                  value={rackForm.shelf_number}
                  onChange={(e) => setRackForm({ ...rackForm, shelf_number: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 text-white rounded-md text-sm"
                >
                  {Array.from({ length: shelfCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Balda {i + 1}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-slate-300">Slots</label>
                <Input
                  type="number"
                  min={1} max={50}
                  value={rackForm.slot_count}
                  onChange={(e) => setRackForm({ ...rackForm, slot_count: e.target.value })}
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowRackDialog(false)}
                className="flex-1 border-slate-600 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                disabled={addRackMutation.isPending || !rackForm.name.trim()}
                onClick={() => {
                  if (!rackForm.name.trim()) return setRackError('El nombre es obligatorio');
                  addRackMutation.mutate();
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {addRackMutation.isPending ? 'Guardando...' : 'Añadir rack'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
