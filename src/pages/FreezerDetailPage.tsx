"use client";

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, Plus, Snowflake, Thermometer, Pencil, Layers, Package, LogOut, Grid3x3 } from 'lucide-react';
import type { Freezer, Box as BoxType, Rack } from '@/types';

// Componente para cajas arrastrables
function DraggableBoxCard({ box, freezerId, onEdit, onUnassign }: { box: BoxType; freezerId: string; onEdit: (b: BoxType) => void; onUnassign: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: box.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`p-3 bg-white border border-gray-200 rounded-lg cursor-grab ${isDragging ? 'opacity-50' : ''}`}>
      <p className="text-sm font-medium">{box.name}</p>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{box.rows}x{box.columns}</span>
        <button onClick={(e) => { e.stopPropagation(); onUnassign(box.id); }} className="text-red-500">Sacar</button>
      </div>
    </div>
  );
}

// Zona de caída para baldas y racks
function DroppableZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`p-4 rounded-xl transition-colors ${isOver ? 'bg-blue-100' : 'bg-gray-50'}`}>
      {children}
    </div>
  );
}

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);

  const { data: boxes = [] } = useQuery({ queryKey: ['boxes', id], queryFn: async () => { const { data } = await supabase.from('boxes').select('*').eq('freezer_id', id!); return (data || []) as BoxType[]; }, enabled: !!id });
  const { data: racks = [] } = useQuery({ queryKey: ['racks', id], queryFn: async () => { const { data } = await (supabase.from('racks') as any).select('*').eq('freezer_id', id!); return (data || []) as Rack[]; }, enabled: !!id });

  const moveMutation = useMutation({
    mutationFn: async ({ boxId, shelfNumber, rackId }: { boxId: string; shelfNumber: number | null; rackId: string | null }) => {
      await (supabase.from('boxes') as any).update({ shelf_number: shelfNumber, rack_id: rackId }).eq('id', boxId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boxes', id] }),
  });

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const boxId = String(active.id);
    const target = String(over.id);
    
    if (target.startsWith('shelf_')) {
      moveMutation.mutate({ boxId, shelfNumber: parseInt(target.replace('shelf_', '')), rackId: null });
    } else if (target.startsWith('rack_')) {
      const rack = racks.find(r => r.id === target.replace('rack_', ''));
      if (rack) moveMutation.mutate({ boxId, shelfNumber: rack.shelf_number, rackId: rack.id });
    }
  };

  return (
    <AppLayout>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="p-8">
          {[1, 2, 3].map(shelf => (
            <DroppableZone key={shelf} id={`shelf_${shelf}`}>
              <h3 className="font-bold mb-2">Balda {shelf}</h3>
              <div className="grid grid-cols-4 gap-4">
                {boxes.filter(b => b.shelf_number === shelf && !b.rack_id).map(b => (
                  <DraggableBoxCard key={b.id} box={b} freezerId={id!} onEdit={() => {}} onUnassign={() => moveMutation.mutate({ boxId: b.id, shelfNumber: null, rackId: null })} />
                ))}
              </div>
            </DroppableZone>
          ))}
        </div>
      </DndContext>
    </AppLayout>
  );
}