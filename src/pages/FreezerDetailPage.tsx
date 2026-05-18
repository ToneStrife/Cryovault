"use client";

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { supabase } from '@/lib/supabase';
import { AppLayout } from '@/components/AppLayout';
import { Package2, Layers, Grid3x3 } from 'lucide-react';
import type { Box as BoxType, Rack } from '@/types';

function BoxCard({ box }: { box: BoxType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: box.id });
  return (
    <div 
      ref={setNodeRef} {...listeners} {...attributes}
      className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-grab hover:shadow-md transition-all ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-3">
        <Package2 className="w-5 h-5 text-blue-500" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{box.name}</p>
          <p className="text-xs text-gray-500">{box.rows}x{box.columns} celdas</p>
        </div>
      </div>
    </div>
  );
}

function DropArea({ id, title, icon: Icon, children }: { id: string, title: string, icon: any, children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`p-5 rounded-2xl border-2 transition-colors ${isOver ? 'border-blue-400 bg-blue-50' : 'border-dashed border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-4 text-gray-600">
        <Icon className="w-4 h-4" />
        <h3 className="font-medium text-sm uppercase tracking-wider">{title}</h3>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 min-h-[100px]">
        {children}
      </div>
    </div>
  );
}

export function FreezerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: boxes = [] } = useQuery({ queryKey: ['boxes', id], queryFn: async () => { const { data } = await supabase.from('boxes').select('*').eq('freezer_id', id!); return (data || []) as BoxType[]; }, enabled: !!id });
  const { data: racks = [] } = useQuery({ queryKey: ['racks', id], queryFn: async () => { const { data } = await (supabase.from('racks') as any).select('*').eq('freezer_id', id!); return (data || []) as Rack[]; }, enabled: !!id });

  const moveMutation = useMutation({
    mutationFn: async ({ boxId, shelfNumber, rackId }: { boxId: string; shelfNumber: number | null; rackId: string | null }) => {
      await (supabase.from('boxes') as any).update({ shelf_number: shelfNumber, rack_id: rackId }).eq('id', boxId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boxes', id] }),
  });

  const handleDragEnd = (e: any) => {
    const { active, over } = e;
    if (!over) return;
    const boxId = String(active.id);
    const target = String(over.id);
    if (target.startsWith('shelf_')) {
      moveMutation.mutate({ boxId, shelfNumber: parseInt(target.replace('shelf_', '')), rackId: null });
    } else if (target.startsWith('rack_')) {
      moveMutation.mutate({ boxId, shelfNumber: null, rackId: target.replace('rack_', '') });
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">Organización del Congelador</h1>
        <DndContext onDragEnd={handleDragEnd}>
          <div className="space-y-8">
            {[1, 2, 3].map(s => (
              <DropArea key={s} id={`shelf_${s}`} title={`Balda ${s}`} icon={Layers}>
                {boxes.filter(b => b.shelf_number === s && !b.rack_id).map(b => <BoxCard key={b.id} box={b} />)}
                {racks.filter(r => r.shelf_number === s).map(rack => (
                   <DropArea key={rack.id} id={`rack_${rack.id}`} title={rack.name} icon={Grid3x3}>
                     {boxes.filter(b => b.rack_id === rack.id).map(b => <BoxCard key={b.id} box={b} />)}
                   </DropArea>
                ))}
              </DropArea>
            ))}
          </div>
        </DndContext>
      </div>
    </AppLayout>
  );
}