import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { Package, Layers, Package2, Grid3x3 as Grid3X3 } from 'lucide-react';
import type { Box, Freezer, Rack } from '@/types';

interface BoxWithContext extends Box {
  freezerName: string;
  freezerId: string;
  rackName?: string;
}

export function BoxesPage() {
  const { user } = useAuth();

  const { data: freezers = [] } = useQuery({
    queryKey: ['freezers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freezers').select('*');
      if (error) throw error;
      return data as Freezer[];
    },
    enabled: !!user,
  });

  const { data: racks = [] } = useQuery({
    queryKey: ['all-racks'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('racks') as any).select('*');
      if (error) throw error;
      return data as Rack[];
    },
    enabled: !!user,
  });

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['all-boxes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('boxes')
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Box[];
    },
    enabled: !!user,
  });

  const freezerMap = Object.fromEntries(freezers.map((f) => [f.id, f]));
  const rackMap = Object.fromEntries(racks.map((r) => [r.id, r]));

  const enriched: BoxWithContext[] = boxes.map((b) => ({
    ...b,
    freezerName: freezerMap[b.freezer_id]?.name ?? '—',
    freezerId: b.freezer_id,
    rackName: b.rack_id ? rackMap[b.rack_id]?.name : undefined,
  }));

  const getOccupancyColor = (box: Box) => {
    const pct = (box.occupancy / (box.rows * box.columns)) * 100;
    if (pct >= 90) return { bar: 'bg-red-500', text: 'text-red-400' };
    if (pct >= 60) return { bar: 'bg-orange-500', text: 'text-orange-400' };
    if (pct >= 30) return { bar: 'bg-yellow-500', text: 'text-yellow-400' };
    return { bar: 'bg-green-500', text: 'text-green-400' };
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <p className="text-slate-400 text-sm">
            {boxes.length} caja{boxes.length !== 1 ? 's' : ''} en el laboratorio
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-40 bg-slate-800/50 animate-pulse rounded-xl border border-slate-700" />
            ))}
          </div>
        ) : boxes.length === 0 ? (
          <div className="text-center py-24 text-slate-500">
            <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl font-medium mb-2">Sin cajas</p>
            <p className="text-sm">Las cajas se crean desde el detalle de cada congelador.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {enriched.map((box) => {
              const totalPositions = box.rows * box.columns;
              const pct = Math.round((box.occupancy / totalPositions) * 100);
              const colors = getOccupancyColor(box);
              return (
                <div
                  key={box.id}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 hover:bg-slate-800/80 transition-all flex flex-col gap-3"
                >
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    {box.image_url ? (
                      <img
                        src={box.image_url}
                        alt={box.name}
                        className="w-10 h-10 rounded-lg object-cover border border-slate-600 flex-shrink-0"
                      />
                    ) : (
                      <div className="p-2 bg-slate-700/60 rounded-lg flex-shrink-0">
                        <Package2 className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{box.name}</p>
                      <p className="text-slate-400 text-xs truncate">{box.freezerName}</p>
                    </div>
                  </div>

                  {/* Location tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {box.shelf_number && (
                      <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-700/50 px-2 py-0.5 rounded-full">
                        <Layers className="w-3 h-3" /> Balda {box.shelf_number}
                      </span>
                    )}
                    {box.rackName && (
                      <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-700/50 px-2 py-0.5 rounded-full">
                        <Package className="w-3 h-3" /> {box.rackName}
                      </span>
                    )}
                  </div>

                  {/* Occupancy bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{box.rows}×{box.columns} posiciones</span>
                      <span className={`text-xs font-medium ${colors.text}`}>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-600">{box.occupancy} / {totalPositions} ocupadas</p>
                  </div>

                  <Link
                    to={`/freezers/${box.freezerId}/box/${box.id}`}
                    className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium mt-auto"
                  >
                    Abrir caja <Grid3X3 className="w-3.5 h-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
