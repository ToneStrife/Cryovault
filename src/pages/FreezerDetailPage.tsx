import { useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core';
import type { CollisionDetection, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  ChevronLeft, Plus, Snowflake, MapPin, Thermometer,
  Pencil, Layers, Package, Upload, X, ChevronDown, ChevronRight, LogOut, GripVertical, Trash2,
} from 'lucide-react';
import { BOX_TYPE_LABEL, labelOption, useSettingsOptions } from '@/lib/settingsOptions';
import { ensureFreezerZones, fetchFreezerZones, syncFreezerZones } from '@/lib/freezerZones';
import { deleteFreezerZone, deleteRack } from '@/lib/freezerLayout';
import { canManageFreezerLayout } from '@/lib/labPermissions';
import { syncRackZones } from '@/lib/rackZones';
import type { Freezer, Box as BoxType, Rack, FreezerZone, RackZone } from '@/types';

interface BoxFormData {
  name: string; description: string; rows: string; columns: string;
  box_type: string; shelf_number: string; rack_id: string; rack_shelf_number: string;
}

interface RackFormData {
  name: string; description: string; shelf_number: string;
  shelf_count: string; slots_per_shelf: string;
}

type BoxDropTargetData = {
  type: 'shelf' | 'rack' | 'rackShelf' | 'unassigned';
  shelfNumber: number | null;
  rackId: string | null;
  rackShelfNumber: number | null;
};

const emptyBoxForm: BoxFormData = {
  name: '', description: '', rows: '9', columns: '9',
  box_type: 'standard', shelf_number: '', rack_id: '', rack_shelf_number: '',
};

const emptyRackForm: RackFormData = {
  name: '', description: '', shelf_number: '1', shelf_count: '1', slots_per_shelf: '5',
};

const BOX_GRID = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2';

function getTempLabel(temp: number) {
  const map: Record<string, string> = { '-196': '-196°C (LN)', '-80': '-80°C', '-20': '-20°C', '4': '4°C' };
  return map[String(temp)] ?? `${temp}°C`;
}

function getOccupancyColor(pct: number) {
  if (pct >= 90) return 'text-red-600';
  if (pct >= 60) return 'text-orange-600';
  if (pct >= 30) return 'text-yellow-600';
  return 'text-green-600';
}

function combineRefs<T>(...refs: Array<(node: T | null) => void>) {
  return (node: T | null) => refs.forEach((ref) => ref(node));
}

// ── Compact draggable box card ──────────────────────────────────────────────────
function DraggableBoxCard({
  box, freezerId, onEdit, onUnassign,
}: {
  box: BoxType;
  freezerId: string;
  onEdit: (b: BoxType) => void;
  onUnassign: (id: string) => void;
}) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: box.id,
    data: { type: 'box', boxId: box.id },
  });
  const total = box.rows * box.columns;
  const pctRaw = total > 0 ? Math.round((box.occupancy / total) * 100) : 0;
  const pct = Math.min(100, pctRaw);
  const overCapacity = total > 0 && box.occupancy > total;

  return (
    <div
      ref={setNodeRef}
      className={`group bg-white border border-gray-100 rounded-xl px-2 py-1.5 flex items-center gap-1.5 shadow-sm transition-all
        ${isDragging ? 'opacity-40 shadow-none' : 'hover:border-gray-200 hover:shadow'}`}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-gray-300 hover:text-gray-500 flex-shrink-0"
        title="Arrastrar caja"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => navigate(`/freezers/${freezerId}/box/${box.id}`)}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-xs font-medium text-gray-900 truncate leading-tight flex items-center gap-1">
          {box.name}
          {box.status === 'in_use' && (
            <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-800 font-semibold shrink-0">En uso</span>
          )}
        </p>
        <p className="text-[10px] text-gray-400 leading-tight">
          {box.rows}×{box.columns} ·{' '}
          <span className={`font-medium ${overCapacity ? 'text-red-600' : getOccupancyColor(pct)}`}>
            {overCapacity ? `${box.occupancy}/${total}` : `${pct}%`}
          </span>
        </p>
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onUnassign(box.id); }}
          className="p-0.5 text-gray-400 hover:text-amber-600 rounded"
          title="Quitar de zona"
        >
          <LogOut className="w-3 h-3" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onEdit(box); }}
          className="p-0.5 text-gray-400 hover:text-gray-700 rounded"
          title="Editar caja"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Droppable zone for boxes ──────────────────────────────────────────────────
function DroppableZone({
  droppableId, data, children, className,
}: {
  droppableId: string;
  data: BoxDropTargetData;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, data });
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors ${isOver ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/40 rounded-lg' : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

// ── Draggable freezer zone section ────────────────────────────────────────────
function FreezerZoneSection({
  zone, boxCount, isCollapsed, onToggle, onEdit, canEdit, children,
}: {
  zone: FreezerZone;
  boxCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: `fz_${zone.id}`,
    data: { type: 'freezerZone', zoneId: zone.id },
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `fz_drop_${zone.id}`,
    data: { type: 'freezerZone', zoneId: zone.id },
  });

  return (
    <div
      ref={combineRefs(dragRef, dropRef)}
      className={`bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm transition-all
        ${isDragging ? 'opacity-50' : ''} ${isOver ? 'ring-2 ring-blue-300' : ''}`}
    >
      <div className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-gray-300 hover:text-gray-500 flex-shrink-0"
            title="Reordenar zona"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <Layers className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800 truncate">{zone.name}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{boxCount} caja{boxCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              title="Editar zona"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onToggle} className="p-1">
            {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Draggable rack internal zone ──────────────────────────────────────────────
function RackZoneBlock({
  zone, rackId, boxCount, slotsPerShelf, onRename, children,
}: {
  zone: RackZone;
  rackId: string;
  boxCount: number;
  slotsPerShelf: number;
  onRename: (name: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(zone.name);
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: `rz_${zone.id}`,
    data: { type: 'rackZone', zoneId: zone.id, rackId },
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `rz_drop_${zone.id}`,
    data: { type: 'rackZone', zoneId: zone.id, rackId },
  });

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== zone.name) onRename(trimmed);
    else setNameDraft(zone.name);
    setEditing(false);
  };

  return (
    <div
      ref={combineRefs(dragRef, dropRef)}
      className={`rounded-lg border border-gray-100 bg-gray-50/40 p-2 space-y-2 transition-all
        ${isDragging ? 'opacity-50' : ''} ${isOver ? 'ring-2 ring-blue-300' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-gray-300 hover:text-gray-500 flex-shrink-0"
            title="Reordenar zona interna"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
          {editing ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameDraft(zone.name); setEditing(false); } }}
              className="h-6 text-xs border-gray-300 max-w-[160px]"
              autoFocus
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-gray-500 truncate hover:text-blue-600 text-left">
              {zone.name}
            </button>
          )}
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{boxCount}/{slotsPerShelf}</span>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { options: settingsOptions } = useSettingsOptions(user?.laboratory);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rackFileInputRef = useRef<HTMLInputElement>(null);

  const [showDialog, setShowDialog] = useState(false);
  const [editBox, setEditBox] = useState<BoxType | null>(null);
  const [form, setForm] = useState<BoxFormData>(emptyBoxForm);
  const [formError, setFormError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>({});
  const [showRackDialog, setShowRackDialog] = useState(false);
  const [editRack, setEditRack] = useState<Rack | null>(null);
  const [rackForm, setRackForm] = useState<RackFormData>(emptyRackForm);
  const [rackImageFile, setRackImageFile] = useState<File | null>(null);
  const [rackImagePreview, setRackImagePreview] = useState<string | null>(null);
  const [rackError, setRackError] = useState('');
  const [moveError, setMoveError] = useState('');
  const [activeDrag, setActiveDrag] = useState<{ type: string; label: string } | null>(null);
  const [showZoneDialog, setShowZoneDialog] = useState(false);
  const [editZone, setEditZone] = useState<FreezerZone | null>(null);
  const [zoneNameDraft, setZoneNameDraft] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
  };

  const { data: freezer } = useQuery({
    queryKey: ['freezer', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('freezers').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Freezer;
    },
    enabled: !!id && !!user,
  });

  const canManageLayout = canManageFreezerLayout(user?.role);

  const {
    data: freezerZones = [],
    isError: zonesError,
    error: zonesQueryError,
    isFetching: zonesFetching,
  } = useQuery({
    queryKey: ['freezer-zones', id, freezer?.shelf_count],
    queryFn: async () => {
      if (!canManageLayout) {
        return fetchFreezerZones(id!);
      }
      return ensureFreezerZones(id!, freezer?.shelf_count || 3);
    },
    enabled: !!id && !!user && !!freezer,
    retry: 1,
  });

  const zonesErrorMessage = zonesQueryError instanceof Error ? zonesQueryError.message : null;

  const zonesLoadHelpMessage = (() => {
    if (!zonesError && !zonesErrorMessage) return null;
    const base = zonesErrorMessage || 'No se pudieron cargar las zonas de este congelador.';
    if (
      base.includes('freezer_zones') ||
      base.includes('does not exist') ||
      base.includes('row-level security') ||
      base.includes('violates') ||
      base.includes('permiso')
    ) {
      return `${base} Aplica en Supabase las migraciones 013 (freezer_zones RLS) y 014 (borrado de racks).`;
    }
    return `${base} Si el problema continúa, aplica las migraciones 013 y 014 en Supabase.`;
  })();

  const { data: racks = [] } = useQuery({
    queryKey: ['racks', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('racks') as any).select('*').eq('freezer_id', id!).order('shelf_number', { ascending: true });
      if (error) throw error;
      return data as Rack[];
    },
    enabled: !!id && !!user,
  });

  const { data: rackZones = [] } = useQuery({
    queryKey: ['rack-zones', id],
    queryFn: async () => {
      const { data: rackRows, error: rackErr } = await supabase.from('racks').select('id').eq('freezer_id', id!);
      if (rackErr) throw rackErr;
      if (!rackRows?.length) return [] as RackZone[];
      const { data, error } = await (supabase.from('rack_zones') as any)
        .select('*')
        .in('rack_id', rackRows.map((r) => r.id))
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as RackZone[];
    },
    enabled: !!id && !!user,
  });

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['boxes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('boxes').select('*').eq('freezer_id', id!).order('created_at', { ascending: true });
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

  async function uploadRackImage(rackId: string): Promise<string | null> {
    if (!rackImageFile) return null;
    const ext = rackImageFile.name.split('.').pop();
    const path = `racks/${rackId}.${ext}`;
    const { error } = await supabase.storage.from('cryo-images').upload(path, rackImageFile, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('cryo-images').getPublicUrl(path);
    return data.publicUrl;
  }

  const saveMutation = useMutation({
    mutationFn: async (data: BoxFormData) => {
      const shelfNum = data.shelf_number ? parseInt(data.shelf_number) : null;
      const rackId = data.rack_id || null;
      const rackShelfNumber = rackId && data.rack_shelf_number ? parseInt(data.rack_shelf_number) : null;
      if (editBox) {
        let imageUrl = editBox.image_url;
        if (imageFile) imageUrl = await uploadBoxImage(editBox.id);
        const { error } = await (supabase.from('boxes') as any).update({
          name: data.name.trim(),
          description: data.description.trim() || null,
          rows: parseInt(data.rows) || 9,
          columns: parseInt(data.columns) || 9,
          box_type: data.box_type,
          shelf_number: shelfNum,
          rack_id: rackId,
          rack_shelf_number: rackShelfNumber,
          image_url: imageUrl,
        }).eq('id', editBox.id);
        if (error) throw error;
      } else {
        const payload = {
          freezer_id: id!,
          name: data.name.trim(),
          description: data.description.trim() || null,
          rows: parseInt(data.rows) || 9,
          columns: parseInt(data.columns) || 9,
          box_type: data.box_type,
          status: settingsOptions.defaultBoxStatus,
          occupancy: 0,
          archived: false,
          shelf_number: shelfNum,
          rack_id: rackId,
          rack_shelf_number: rackShelfNumber,
          image_url: null as string | null,
          created_by: user!.id,
        };
        const { data: inserted, error } = await (supabase.from('boxes') as any).insert([payload]).select('id').single();
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

  const moveBoxMutation = useMutation({
    mutationFn: async ({
      boxId, shelfNumber, rackId, rackShelfNumber,
    }: {
      boxId: string;
      shelfNumber: number | null;
      rackId: string | null;
      rackShelfNumber: number | null;
    }) => {
      const { error } = await (supabase.from('boxes') as any)
        .update({ shelf_number: shelfNumber, rack_id: rackId, rack_shelf_number: rackShelfNumber })
        .eq('id', boxId);
      if (error) throw error;
    },
    onSuccess: () => {
      setMoveError('');
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['freezer-box-counts'] });
    },
    onError: (e: any) => setMoveError(e.message),
  });

  const addFreezerZoneMutation = useMutation({
    mutationFn: async () => {
      if (!canManageLayout) {
        throw new Error('Tu rol no permite gestionar zonas del congelador.');
      }
      const targetCount = freezerZones.length === 0
        ? (freezer?.shelf_count || 3)
        : freezerZones.length + 1;
      if (targetCount > 20) throw new Error('Máximo 20 zonas por congelador.');
      await syncFreezerZones(id!, targetCount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezer-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['freezer', id] });
    },
    onError: (e: Error) => setMoveError(e.message),
  });

  const deleteFreezerZoneMutation = useMutation({
    mutationFn: async ({ zoneId, zoneNumber }: { zoneId: string; zoneNumber: number }) => {
      if (!canManageLayout) throw new Error('Tu rol no permite gestionar zonas.');
      await deleteFreezerZone(id!, zoneId, zoneNumber, freezerZones.length);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezer-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['freezer', id] });
      queryClient.invalidateQueries({ queryKey: ['racks', id] });
      queryClient.invalidateQueries({ queryKey: ['rack-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
    },
    onError: (e: Error) => setMoveError(e.message),
  });

  const deleteRackMutation = useMutation({
    mutationFn: async (rackId: string) => {
      if (!canManageLayout) throw new Error('Tu rol no permite eliminar racks.');
      await deleteRack(rackId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks', id] });
      queryClient.invalidateQueries({ queryKey: ['rack-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
    },
    onError: (e: Error) => setMoveError(e.message),
  });

  const backfillZonesMutation = useMutation({
    mutationFn: async () => {
      if (!canManageLayout) {
        throw new Error('Tu rol no permite gestionar zonas del congelador.');
      }
      const count = freezer?.shelf_count || 3;
      await syncFreezerZones(id!, count);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezer-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['freezer', id] });
    },
    onError: (e: Error) => setMoveError(e.message),
  });

  const renameFreezerZoneMutation = useMutation({
    mutationFn: async ({ zoneId, name }: { zoneId: string; name: string }) => {
      const { error } = await (supabase.from('freezer_zones') as any)
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', zoneId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freezer-zones', id] }),
  });

  const renameRackZoneMutation = useMutation({
    mutationFn: async ({ zoneId, name }: { zoneId: string; name: string }) => {
      const { error } = await (supabase.from('rack_zones') as any)
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', zoneId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rack-zones', id] }),
  });

  const reorderFreezerZonesMutation = useMutation({
    mutationFn: async ({ activeId, overId }: { activeId: string; overId: string }) => {
      const active = freezerZones.find((z) => z.id === activeId);
      const over = freezerZones.find((z) => z.id === overId);
      if (!active || !over) return;
      const { error: e1 } = await (supabase.from('freezer_zones') as any).update({ sort_order: over.sort_order }).eq('id', active.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase.from('freezer_zones') as any).update({ sort_order: active.sort_order }).eq('id', over.id);
      if (e2) throw e2;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['freezer-zones', id] }),
    onError: (e: any) => setMoveError(e.message),
  });

  const reorderRackZonesMutation = useMutation({
    mutationFn: async ({ activeId, overId, rackId }: { activeId: string; overId: string; rackId: string }) => {
      const zones = rackZones.filter((z) => z.rack_id === rackId);
      const active = zones.find((z) => z.id === activeId);
      const over = zones.find((z) => z.id === overId);
      if (!active || !over) return;
      const { error: e1 } = await (supabase.from('rack_zones') as any).update({ sort_order: over.sort_order }).eq('id', active.id);
      if (e1) throw e1;
      const { error: e2 } = await (supabase.from('rack_zones') as any).update({ sort_order: active.sort_order }).eq('id', over.id);
      if (e2) throw e2;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rack-zones', id] }),
    onError: (e: any) => setMoveError(e.message),
  });

  const saveRackMutation = useMutation({
    mutationFn: async () => {
      if (!canManageLayout) {
        throw new Error('Tu rol no permite añadir o editar racks.');
      }
      const shelfNumber = parseInt(rackForm.shelf_number) || 1;
      const shelfCount = Math.max(parseInt(rackForm.shelf_count) || 1, 1);
      const slotsPerShelf = Math.max(parseInt(rackForm.slots_per_shelf) || 5, 1);
      const totalSlots = shelfCount * slotsPerShelf;
      const payload = {
        name: rackForm.name.trim(),
        description: rackForm.description.trim() || null,
        shelf_number: shelfNumber,
        rows: shelfCount,
        columns: slotsPerShelf,
        slot_count: totalSlots,
        shelf_count: shelfCount,
        slots_per_shelf: slotsPerShelf,
      };

      let rackId: string;
      if (editRack) {
        rackId = editRack.id;
        let imageUrl = editRack.image_url;
        if (rackImageFile) imageUrl = await uploadRackImage(editRack.id);
        const { error } = await (supabase.from('racks') as any)
          .update({ ...payload, image_url: imageUrl })
          .eq('id', editRack.id);
        if (error) throw error;

        const { error: boxesError } = await (supabase.from('boxes') as any)
          .update({ shelf_number: shelfNumber })
          .eq('rack_id', editRack.id);
        if (boxesError) throw boxesError;

        if (shelfCount === 1) {
          const { error: clearRackShelfError } = await (supabase.from('boxes') as any)
            .update({ rack_shelf_number: null })
            .eq('rack_id', editRack.id);
          if (clearRackShelfError) throw clearRackShelfError;
        } else {
          const { error: clampRackShelfError } = await (supabase.from('boxes') as any)
            .update({ rack_shelf_number: shelfCount })
            .eq('rack_id', editRack.id)
            .gt('rack_shelf_number', shelfCount);
          if (clampRackShelfError) throw clampRackShelfError;
        }
      } else {
        const { data: inserted, error } = await (supabase.from('racks') as any)
          .insert([{ ...payload, freezer_id: id!, image_url: null, created_by: user!.id }])
          .select('id')
          .single();
        if (error) throw error;
        rackId = inserted.id;
        if (rackImageFile) {
          const imageUrl = await uploadRackImage(inserted.id);
          const { error: imageError } = await (supabase.from('racks') as any)
            .update({ image_url: imageUrl })
            .eq('id', inserted.id);
          if (imageError) throw imageError;
        }
      }
      await syncRackZones(rackId, shelfCount);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['racks', id] });
      queryClient.invalidateQueries({ queryKey: ['rack-zones', id] });
      queryClient.invalidateQueries({ queryKey: ['boxes', id] });
      queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['freezer-box-counts'] });
      setShowRackDialog(false);
      setEditRack(null);
      setRackForm(emptyRackForm);
      setRackImageFile(null);
      setRackImagePreview(null);
      setRackError('');
    },
    onError: (e: any) => setRackError(e.message),
  });

  const openCreate = () => {
    setEditBox(null);
    setForm({
      ...emptyBoxForm,
      rows: String(settingsOptions.defaultBoxRows),
      columns: String(settingsOptions.defaultBoxColumns),
      box_type: settingsOptions.defaultBoxType,
      shelf_number: freezerZones[0] ? String(freezerZones[0].zone_number) : '1',
      rack_shelf_number: '',
    });
    setImageFile(null); setImagePreview(null); setFormError(''); setShowAdvanced(false);
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
      rack_shelf_number: b.rack_shelf_number ? String(b.rack_shelf_number) : '',
    });
    setImageFile(null); setImagePreview(b.image_url || null); setFormError(''); setShowAdvanced(false);
    setShowDialog(true);
  };
  const closeDialog = () => { setShowDialog(false); setEditBox(null); setForm(emptyBoxForm); setImageFile(null); setImagePreview(null); };
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setFormError(''); if (!form.name.trim()) return setFormError('El nombre es obligatorio'); saveMutation.mutate(form); };
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setImageFile(file); setImagePreview(URL.createObjectURL(file)); };
  const openCreateRack = () => {
    setEditRack(null);
    setRackForm({ ...emptyRackForm, shelf_number: freezerZones[0] ? String(freezerZones[0].zone_number) : '1' });
    setRackImageFile(null);
    setRackImagePreview(null);
    setRackError('');
    setShowRackDialog(true);
  };
  const openEditRack = (rack: Rack) => {
    setEditRack(rack);
    setRackForm({
      name: rack.name,
      description: rack.description || '',
      shelf_number: String(rack.shelf_number),
      shelf_count: String(rack.shelf_count || 1),
      slots_per_shelf: String(rack.slots_per_shelf || rack.slot_count || rack.columns || 5),
    });
    setRackImageFile(null);
    setRackImagePreview(rack.image_url || null);
    setRackError('');
    setShowRackDialog(true);
  };
  const closeRackDialog = () => {
    setShowRackDialog(false);
    setEditRack(null);
    setRackForm(emptyRackForm);
    setRackImageFile(null);
    setRackImagePreview(null);
    setRackError('');
  };
  const openEditZone = (zone: FreezerZone) => {
    setEditZone(zone);
    setZoneNameDraft(zone.name);
    setShowZoneDialog(true);
  };
  const closeZoneDialog = () => {
    setShowZoneDialog(false);
    setEditZone(null);
    setZoneNameDraft('');
  };
  const saveZoneFromDialog = () => {
    if (!editZone || !zoneNameDraft.trim()) return;
    if (zoneNameDraft.trim() !== editZone.name) {
      renameFreezerZoneMutation.mutate({ zoneId: editZone.id, name: zoneNameDraft.trim() });
    }
    closeZoneDialog();
  };
  const handleRackImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRackImageFile(file);
    setRackImagePreview(URL.createObjectURL(file));
  };
  const toggleZone = (zoneId: string) => setCollapsedZones((p) => ({ ...p, [zoneId]: !p[zoneId] }));
  const handleUnassign = (boxId: string) => moveBoxMutation.mutate({ boxId, shelfNumber: null, rackId: null, rackShelfNumber: null });

  const sortedFreezerZones = [...freezerZones].sort((a, b) => a.sort_order - b.sort_order);
  const zoneCount = sortedFreezerZones.length || freezer?.shelf_count || 3;
  const zoneNumbersInUi = new Set(sortedFreezerZones.map((z) => z.zone_number));
  const racksWithoutZoneUi =
    sortedFreezerZones.length === 0
      ? racks
      : racks.filter((r) => r.shelf_number == null || !zoneNumbersInUi.has(r.shelf_number));
  const unassigned = boxes.filter((b) => !b.shelf_number);
  const getRacksForZone = (zoneNumber: number) => racks.filter((r) => r.shelf_number === zoneNumber);
  const getBoxesForZoneDirect = (zoneNumber: number) => boxes.filter((b) => b.shelf_number === zoneNumber && !b.rack_id);
  const getAllBoxesForRack = (rackId: string) => boxes.filter((b) => b.rack_id === rackId);
  const getBoxesForRackZone = (rackId: string, zoneNumber: number) => boxes.filter((b) => b.rack_id === rackId && b.rack_shelf_number === zoneNumber);
  const getRackZonesForRack = useCallback((rackId: string) =>
    rackZones.filter((z) => z.rack_id === rackId).sort((a, b) => a.sort_order - b.sort_order),
  [rackZones]);
  const racksForSelectedZone = form.shelf_number ? racks.filter((r) => r.shelf_number === parseInt(form.shelf_number)) : [];
  const selectedRackForBox = form.rack_id ? racks.find((r) => r.id === form.rack_id) : null;
  const selectedRackZones = selectedRackForBox ? getRackZonesForRack(selectedRackForBox.id) : [];

  const handleDragStart = (e: DragStartEvent) => {
    const type = e.active.data.current?.type as string | undefined;
    if (type === 'box') {
      const box = boxes.find((b) => b.id === String(e.active.id));
      setActiveDrag({ type: 'box', label: box?.name || 'Caja' });
    } else if (type === 'freezerZone') {
      const zone = freezerZones.find((z) => z.id === e.active.data.current?.zoneId);
      setActiveDrag({ type: 'freezerZone', label: zone?.name || 'Zona' });
    } else if (type === 'rackZone') {
      const zone = rackZones.find((z) => z.id === e.active.data.current?.zoneId);
      setActiveDrag({ type: 'rackZone', label: zone?.name || 'Zona' });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type as string | undefined;
    const overType = over.data.current?.type as string | undefined;

    if (activeType === 'box') {
      const boxId = String(active.data.current?.boxId || active.id);
      const target = over.data.current as BoxDropTargetData | undefined;
      if (!target || !['shelf', 'rack', 'rackShelf', 'unassigned'].includes(target.type)) return;
      moveBoxMutation.mutate({
        boxId,
        shelfNumber: target.shelfNumber,
        rackId: target.rackId,
        rackShelfNumber: target.rackShelfNumber,
      });
      return;
    }

    if (activeType === 'freezerZone' && overType === 'freezerZone') {
      const activeId = String(active.data.current?.zoneId);
      const overId = String(over.data.current?.zoneId);
      if (activeId && overId) reorderFreezerZonesMutation.mutate({ activeId, overId });
      return;
    }

    if (activeType === 'rackZone' && overType === 'rackZone') {
      const activeId = String(active.data.current?.zoneId);
      const overId = String(over.data.current?.zoneId);
      const rackId = String(active.data.current?.rackId);
      if (active.data.current?.rackId !== over.data.current?.rackId) return;
      if (activeId && overId) reorderRackZonesMutation.mutate({ activeId, overId, rackId });
    }
  };

  const renderBoxGrid = (boxList: BoxType[]) => (
    <div className={BOX_GRID}>
      {boxList.map((box) => (
        <DraggableBoxCard key={box.id} box={box} freezerId={id!} onEdit={openEdit} onUnassign={handleUnassign} />
      ))}
    </div>
  );

  const countBoxesInFreezerZone = (zoneNumber: number) => {
    const zoneRacks = racks.filter((r) => r.shelf_number === zoneNumber);
    const rackIds = new Set(zoneRacks.map((r) => r.id));
    return boxes.filter(
      (b) => (b.shelf_number === zoneNumber && !b.rack_id) || (b.rack_id != null && rackIds.has(b.rack_id)),
    ).length;
  };

  const handleDeleteFreezerZone = (zone: FreezerZone) => {
    if (sortedFreezerZones.length <= 1) {
      alert('Debe quedar al menos una zona en el congelador.');
      return;
    }
    const zoneRacks = racks.filter((r) => r.shelf_number === zone.zone_number);
    const boxCount = countBoxesInFreezerZone(zone.zone_number);
    const rackPart = zoneRacks.length > 0 ? ` y se eliminarán ${zoneRacks.length} rack(s)` : '';
    if (!confirm(
      `Se quitarán ${boxCount} caja(s) de su zona (irán a Sin zona asignada)${rackPart}. ¿Continuar?`,
    )) return;
    deleteFreezerZoneMutation.mutate({ zoneId: zone.id, zoneNumber: zone.zone_number });
  };

  const handleDeleteRack = (rack: Rack) => {
    const boxCount = boxes.filter((b) => b.rack_id === rack.id).length;
    if (!confirm(
      `Se quitarán ${boxCount} caja(s) de este rack (irán a Sin zona asignada) y se eliminará el rack «${rack.name}». ¿Continuar?`,
    )) return;
    deleteRackMutation.mutate(rack.id);
  };

  const deleteZoneFromDialog = () => {
    if (!editZone) return;
    const zone = editZone;
    closeZoneDialog();
    handleDeleteFreezerZone(zone);
  };

  const deleteRackFromDialog = () => {
    if (!editRack) return;
    const rack = editRack;
    closeRackDialog();
    handleDeleteRack(rack);
  };

  const renderRack = (rack: Rack, zoneNumber: number) => {
    const zones = getRackZonesForRack(rack.id);
    const slotsPerShelf = rack.slots_per_shelf || rack.slot_count || rack.columns || 5;
    const rackBoxes = getAllBoxesForRack(rack.id);
    const hasMultipleZones = zones.length > 1;

    return (
      <div key={rack.id} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {rack.image_url ? (
              <img src={rack.image_url} alt={rack.name} className="w-6 h-6 rounded object-cover border border-gray-200" />
            ) : (
              <Package className="w-3.5 h-3.5 text-gray-400" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-600 truncate">{rack.name}</span>
                <span className="text-[10px] text-gray-400">({zones.length} zona{zones.length !== 1 ? 's' : ''}, {slotsPerShelf} slots/zona)</span>
              </div>
              {rack.description && <p className="text-[10px] text-gray-400 truncate">{rack.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {canManageLayout && (
              <button
                type="button"
                onClick={() => openEditRack(rack)}
                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                title="Editar rack"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {!hasMultipleZones ? (
          <DroppableZone
            droppableId={`rack_${rack.id}`}
            data={{ type: 'rack', shelfNumber: zoneNumber, rackId: rack.id, rackShelfNumber: null }}
            className="ml-4 min-h-[2.5rem]"
          >
            {rackBoxes.length === 0 ? (
              <div className="h-10 border border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
                Arrastra una caja aquí
              </div>
            ) : renderBoxGrid(rackBoxes)}
          </DroppableZone>
        ) : (
          <div className="ml-4 space-y-2">
            {zones.map((rz) => {
              const rzBoxes = getBoxesForRackZone(rack.id, rz.zone_number);
              return (
                <RackZoneBlock
                  key={rz.id}
                  zone={rz}
                  rackId={rack.id}
                  boxCount={rzBoxes.length}
                  slotsPerShelf={slotsPerShelf}
                  onRename={(name) => renameRackZoneMutation.mutate({ zoneId: rz.id, name })}
                >
                  <DroppableZone
                    droppableId={`rack_${rack.id}_zone_${rz.zone_number}`}
                    data={{ type: 'rackShelf', shelfNumber: zoneNumber, rackId: rack.id, rackShelfNumber: rz.zone_number }}
                  >
                    {rzBoxes.length === 0 ? (
                      <div className="h-10 border border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
                        Arrastra una caja aquí
                      </div>
                    ) : renderBoxGrid(rzBoxes)}
                  </DroppableZone>
                </RackZoneBlock>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 lg:px-8 py-5">
          <Link to="/freezers" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm mb-4 w-fit">
            <ChevronLeft className="w-4 h-4" /> Congeladores
          </Link>
          {freezer ? (
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                {freezer.image_url ? (
                  <img src={freezer.image_url} alt={freezer.name} className="w-14 h-14 rounded-xl object-cover border border-gray-200" />
                ) : (
                  <div className="p-3 bg-blue-50 rounded-xl"><Snowflake className="w-7 h-7 text-blue-600" /></div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{freezer.name}</h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-blue-700 font-mono flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      <Thermometer className="w-3 h-3" /> {getTempLabel(freezer.temperature)}
                    </span>
                    {freezer.location && <span className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {freezer.location}</span>}
                    <span className="text-sm text-gray-400 flex items-center gap-1"><Layers className="w-3 h-3" /> {zoneCount} zonas</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canManageLayout && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => addFreezerZoneMutation.mutate()}
                      disabled={addFreezerZoneMutation.isPending || zonesFetching || zoneCount >= 20}
                      className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-4 h-4" /> {sortedFreezerZones.length === 0 ? 'Crear zonas' : 'Añadir zona'}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  onClick={openCreateRack}
                  disabled={!canManageLayout || sortedFreezerZones.length === 0}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Package className="w-4 h-4" /> Añadir rack
                </Button>
                <Button onClick={openCreate} className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                  <Plus className="w-4 h-4" /> Nueva caja
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          )}
        </div>

        <div className="px-4 lg:px-8 py-6">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />)}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              {(moveError || zonesLoadHelpMessage) && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {moveError || zonesLoadHelpMessage}
                </div>
              )}
              {!canManageLayout && (
                <div className="mb-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Tu rol es solo lectura: puedes ver el congelador pero no crear, eliminar zonas ni racks.
                </div>
              )}
              {canManageLayout && racks.length > 0 && sortedFreezerZones.length === 0 && (
                <div className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Hay {racks.length} rack{racks.length !== 1 ? 's' : ''} en este congelador pero las zonas no cargaron.
                  Edita cada rack con el lápiz para eliminarlo.
                  Si no ves zonas, pulsa «Crear zonas por defecto» o aplica las migraciones 013 y 014 en Supabase.
                </div>
              )}
              {canManageLayout && (sortedFreezerZones.length > 0 || racks.length > 0) && (
                <p className="mb-3 text-xs text-gray-500">
                  Para editar o eliminar una zona o rack, pulsa el icono del lápiz en su cabecera.
                </p>
              )}
              <div className="space-y-3">
                {sortedFreezerZones.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <p className="text-sm text-amber-900">
                      {zonesLoadHelpMessage
                        ? zonesLoadHelpMessage
                        : zonesError
                          ? 'No se pudieron cargar las zonas de este congelador. Aplica las migraciones 013 y 014 en Supabase.'
                          : 'Este congelador no tiene zonas. Crea zonas para asignar racks y cajas.'}
                    </p>
                    {canManageLayout && (
                      <Button
                        variant="outline"
                        onClick={() => backfillZonesMutation.mutate()}
                        disabled={backfillZonesMutation.isPending || zonesFetching}
                        className="border-amber-300 text-amber-900 hover:bg-amber-100 shrink-0"
                      >
                        {backfillZonesMutation.isPending || zonesFetching ? 'Creando...' : 'Crear zonas por defecto'}
                      </Button>
                    )}
                  </div>
                )}
                {sortedFreezerZones.map((zone) => {
                  const zoneNumber = zone.zone_number;
                  const zoneRacks = getRacksForZone(zoneNumber);
                  const directBoxes = getBoxesForZoneDirect(zoneNumber);
                  const totalOnZone = directBoxes.length + zoneRacks.reduce((sum, r) => sum + getAllBoxesForRack(r.id).length, 0);

                  return (
                    <FreezerZoneSection
                      key={zone.id}
                      zone={zone}
                      boxCount={totalOnZone}
                      isCollapsed={!!collapsedZones[zone.id]}
                      onToggle={() => toggleZone(zone.id)}
                      canEdit={canManageLayout}
                      onEdit={() => openEditZone(zone)}
                    >
                      {zoneRacks.map((rack) => renderRack(rack, zoneNumber))}
                      <div className="space-y-1">
                        {zoneRacks.length > 0 && <span className="text-[10px] text-gray-400 font-medium">Directamente en la zona</span>}
                        <DroppableZone
                          droppableId={`zone_${zoneNumber}`}
                          data={{ type: 'shelf', shelfNumber: zoneNumber, rackId: null, rackShelfNumber: null }}
                          className="min-h-[2rem]"
                        >
                          {directBoxes.length === 0 ? (
                            <div className="h-10 border border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
                              {zoneRacks.length === 0 ? 'Sin cajas — arrastra aquí' : 'Sin cajas directas'}
                            </div>
                          ) : renderBoxGrid(directBoxes)}
                        </DroppableZone>
                      </div>
                    </FreezerZoneSection>
                  );
                })}

                {racksWithoutZoneUi.length > 0 && (
                  <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="text-sm font-medium text-amber-900">
                          Racks {sortedFreezerZones.length === 0 ? '(zonas no cargadas)' : '(sin zona en pantalla)'}
                        </span>
                        <p className="text-xs text-amber-800 mt-0.5">
                          {sortedFreezerZones.length === 0
                            ? 'Las zonas no están disponibles; edita cada rack con el lápiz para eliminarlo.'
                            : 'Estos racks no coinciden con ninguna zona visible.'}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {racksWithoutZoneUi.map((rack) =>
                        renderRack(rack, rack.shelf_number ?? 1),
                      )}
                    </div>
                  </div>
                )}

                <DroppableZone
                  droppableId="unassigned"
                  data={{ type: 'unassigned', shelfNumber: null, rackId: null, rackShelfNumber: null }}
                >
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-500">Sin zona asignada</span>
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">{unassigned.length}</span>
                    </div>
                    {unassigned.length === 0 ? (
                      <div className="p-3">
                        <div className="h-10 border border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
                          Arrastra una caja aquí para quitarla de su zona
                        </div>
                      </div>
                    ) : (
                      <div className="p-3">{renderBoxGrid(unassigned)}</div>
                    )}
                  </div>
                </DroppableZone>

                {boxes.length === 0 && (
                  <div className="text-center py-16 text-gray-400">
                    <Package className="w-14 h-14 mx-auto mb-3 opacity-25" />
                    <p className="text-lg font-medium mb-1">Sin cajas</p>
                    <p className="text-sm mb-5">Añade cajas a las zonas de este congelador.</p>
                    <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="w-4 h-4" /> Añadir caja</Button>
                  </div>
                )}
              </div>

              <DragOverlay dropAnimation={null}>
                {activeDrag && (
                  <div className="bg-white border-2 border-blue-400 rounded-lg px-3 py-2 shadow-xl rotate-1">
                    <p className="font-medium text-xs text-gray-900">{activeDrag.label}</p>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Box Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editBox ? 'Editar caja' : 'Nueva caja'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{formError}</p>}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Caja A1 — Sueros" className="border-gray-300" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Proyecto X..." className="border-gray-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Zona</label>
                <select value={form.shelf_number} onChange={(e) => setForm({ ...form, shelf_number: e.target.value, rack_id: '', rack_shelf_number: '' })} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sin asignar</option>
                  {sortedFreezerZones.map((z) => <option key={z.id} value={z.zone_number}>{z.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Rack</label>
                <select value={form.rack_id} onChange={(e) => setForm({ ...form, rack_id: e.target.value, rack_shelf_number: '' })} disabled={!form.shelf_number || racksForSelectedZone.length === 0} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40">
                  <option value="">En la zona</option>
                  {racksForSelectedZone.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            {selectedRackForBox && selectedRackZones.length > 1 && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Zona interna del rack</label>
                <select value={form.rack_shelf_number} onChange={(e) => setForm({ ...form, rack_shelf_number: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sin zona interna</option>
                  {selectedRackZones.map((z) => (
                    <option key={z.id} value={z.zone_number}>{z.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Filas</label>
                <Input type="number" value={form.rows} onChange={(e) => setForm({ ...form, rows: e.target.value })} min={1} max={20} className="border-gray-300" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Columnas</label>
                <Input type="number" value={form.columns} onChange={(e) => setForm({ ...form, columns: e.target.value })} min={1} max={20} className="border-gray-300" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Foto (opcional)</label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              <div className="flex items-center gap-3">
                {imagePreview && (
                  <div className="relative flex-shrink-0">
                    <img src={imagePreview} alt="preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
                  </div>
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> {imagePreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
            </div>
            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
              {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Opciones avanzadas
            </button>
            {showAdvanced && (
              <div className="space-y-1 pl-3 border-l border-gray-200">
                <label className="text-sm font-medium text-gray-700">Tipo de caja</label>
                <select value={form.box_type} onChange={(e) => setForm({ ...form, box_type: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {settingsOptions.boxTypes.map((type) => (
                    <option key={type} value={type}>{labelOption(type, BOX_TYPE_LABEL)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white">
                {saveMutation.isPending ? 'Guardando...' : editBox ? 'Guardar' : 'Crear caja'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rack Dialog */}
      <Dialog open={showRackDialog} onOpenChange={setShowRackDialog}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editRack ? 'Editar rack' : 'Añadir rack'}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            {rackError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{rackError}</p>}
            {sortedFreezerZones.length === 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                Crea al menos una zona en el congelador antes de añadir un rack.
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre *</label>
              <Input value={rackForm.name} onChange={(e) => setRackForm({ ...rackForm, name: e.target.value })} placeholder="Rack R1" className="border-gray-300" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <Input value={rackForm.description} onChange={(e) => setRackForm({ ...rackForm, description: e.target.value })} placeholder="Rack de criocajas..." className="border-gray-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Zona</label>
                <select value={rackForm.shelf_number} onChange={(e) => setRackForm({ ...rackForm, shelf_number: e.target.value })} className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-900 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {sortedFreezerZones.map((z) => <option key={z.id} value={z.zone_number}>{z.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Zonas internas</label>
                <Input type="number" min={1} max={20} value={rackForm.shelf_count} onChange={(e) => setRackForm({ ...rackForm, shelf_count: e.target.value })} className="border-gray-300" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Slots por zona interna</label>
              <Input type="number" min={1} max={50} value={rackForm.slots_per_shelf} onChange={(e) => setRackForm({ ...rackForm, slots_per_shelf: e.target.value })} className="border-gray-300" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Foto (opcional)</label>
              <input ref={rackFileInputRef} type="file" accept="image/*" onChange={handleRackImageChange} className="hidden" />
              <div className="flex items-center gap-3">
                {rackImagePreview && (
                  <div className="relative flex-shrink-0">
                    <img src={rackImagePreview} alt="preview rack" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                    <button type="button" onClick={() => { setRackImageFile(null); setRackImagePreview(null); }} className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"><X className="w-3 h-3 text-white" /></button>
                  </div>
                )}
                <button type="button" onClick={() => rackFileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors">
                  <Upload className="w-3.5 h-3.5" /> {rackImagePreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
              </div>
            </div>
            {editRack && (
              <div className="pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={deleteRackFromDialog}
                  disabled={deleteRackMutation.isPending}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteRackMutation.isPending ? 'Eliminando...' : 'Eliminar rack'}
                </Button>
                <p className="text-xs text-gray-500 mt-1.5">Las cajas pasarán a «Sin zona asignada».</p>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={closeRackDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button
                disabled={saveRackMutation.isPending || !canManageLayout || !rackForm.name.trim() || sortedFreezerZones.length === 0}
                onClick={() => { if (!rackForm.name.trim()) return setRackError('El nombre es obligatorio'); saveRackMutation.mutate(); }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {saveRackMutation.isPending ? 'Guardando...' : editRack ? 'Guardar' : 'Añadir rack'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showZoneDialog} onOpenChange={(open) => { if (!open) closeZoneDialog(); }}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar zona</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Nombre</label>
              <Input
                value={zoneNameDraft}
                onChange={(e) => setZoneNameDraft(e.target.value)}
                className="border-gray-300"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={closeZoneDialog} className="flex-1 border-gray-300">
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={saveZoneFromDialog}
                disabled={!zoneNameDraft.trim() || renameFreezerZoneMutation.isPending}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                Guardar
              </Button>
            </div>
            {sortedFreezerZones.length > 1 ? (
              <div className="pt-3 border-t border-gray-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={deleteZoneFromDialog}
                  disabled={deleteFreezerZoneMutation.isPending}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleteFreezerZoneMutation.isPending ? 'Eliminando...' : 'Eliminar zona'}
                </Button>
                <p className="text-xs text-gray-500 mt-1.5">
                  Las cajas irán a «Sin zona asignada» y se borrarán los racks de esta zona.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-500">No se puede eliminar la única zona del congelador.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
