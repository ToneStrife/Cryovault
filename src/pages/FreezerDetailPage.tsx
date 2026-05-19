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
  Pencil, Layers, Package, Upload, X, ChevronDown, ChevronRight, LogOut, GripVertical,
} from 'lucide-react';
import { BOX_TYPE_LABEL, labelOption, useSettingsOptions } from '@/lib/settingsOptions';
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
  const pct = Math.round((box.occupancy / total) * 100);

  return (
    <div
      ref={setNodeRef}
      className={`group bg-white border border-gray-200 rounded-lg px-2 py-1.5 flex items-center gap-1.5 transition-all
        ${isDragging ? 'opacity-40 shadow-none' : 'hover:border-gray-300 hover:shadow-sm'}`}
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
          {box.rows}×{box.columns} · <span className={`font-medium ${getOccupancyColor(pct)}`}>{pct}%</span>
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
  zone, boxCount, isCollapsed, onToggle, onRename, children,
}: {
  zone: FreezerZone;
  boxCount: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(zone.name);
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: `fz_${zone.id}`,
    data: { type: 'freezerZone', zoneId: zone.id },
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `fz_drop_${zone.id}`,
    data: { type: 'freezerZone', zoneId: zone.id },
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
      className={`bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm transition-all
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
          {editing ? (
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setNameDraft(zone.name); setEditing(false); } }}
              className="h-7 text-sm border-gray-300 max-w-[200px]"
              autoFocus
            />
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-semibold text-gray-800 truncate hover:text-blue-600 text-left">
              {zone.name}
            </button>
          )}
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">{boxCount} caja{boxCount !== 1 ? 's' : ''}</span>
        </div>
        <button type="button" onClick={onToggle} className="p-1 flex-shrink-0">
          {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
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

  const { data: freezerZones = [] } = useQuery({
    queryKey: ['freezer-zones', id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('freezer_zones') as any)
        .select('*')
        .eq('freezer_id', id!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as FreezerZone[];
    },
    enabled: !!id && !!user,
  });

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

  async function syncRackZones(rackId: string, shelfCount: number) {
    const { data: existing } = await (supabase.from('rack_zones') as any).select('*').eq('rack_id', rackId);
    const existingNums = new Set((existing || []).map((z: RackZone) => z.zone_number));
    for (let n = 1; n <= shelfCount; n++) {
      if (!existingNums.has(n)) {
        const { error } = await (supabase.from('rack_zones') as any).insert([{
          rack_id: rackId, zone_number: n, name: `Zona ${n}`, sort_order: n,
        }]);
        if (error) throw error;
      }
    }
    const { error: deleteError } = await (supabase.from('rack_zones') as any)
      .delete()
      .eq('rack_id', rackId)
      .gt('zone_number', shelfCount);
    if (deleteError) throw deleteError;
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
          <button
            type="button"
            onClick={() => openEditRack(rack)}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            title="Editar rack"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        {!hasMultipleZones ? (
          <DroppableZone
            droppableId={`rack_${rack.id}`}
            data={{ type: 'rack', shelfNumber: zoneNumber, rackId: rack.id, rackShelfNumber: null }}
            className="ml-4 min-h-[2.5rem]"
          >
            {rackBoxes.length === 0 ? (
              <div className="h-10 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
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
                      <div className="h-10 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
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
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={openCreateRack} className="border-gray-300 text-gray-700 hover:bg-gray-50">
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
              {moveError && (
                <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {moveError}
                </div>
              )}
              <div className="space-y-3">
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
                      onRename={(name) => renameFreezerZoneMutation.mutate({ zoneId: zone.id, name })}
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
                            <div className="h-10 border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
                              {zoneRacks.length === 0 ? 'Sin cajas — arrastra aquí' : 'Sin cajas directas'}
                            </div>
                          ) : renderBoxGrid(directBoxes)}
                        </DroppableZone>
                      </div>
                    </FreezerZoneSection>
                  );
                })}

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
                        <div className="h-10 border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-300">
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
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={closeRackDialog} className="flex-1 border-gray-300 text-gray-700">Cancelar</Button>
              <Button
                disabled={saveRackMutation.isPending || !rackForm.name.trim()}
                onClick={() => { if (!rackForm.name.trim()) return setRackError('El nombre es obligatorio'); saveRackMutation.mutate(); }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white"
              >
                {saveRackMutation.isPending ? 'Guardando...' : editRack ? 'Guardar' : 'Añadir rack'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
