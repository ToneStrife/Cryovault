import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Package2,
  ChevronRight,
  Grid3x3 as Grid3X3,
  List,
  Search,
  Layers,
  Package,
  Pencil,
  Check,
  X,
  Upload,
} from 'lucide-react';
import type { Box, Freezer, Rack } from '@/types';

export function FreezersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const { data: freezers = [], isLoading } = useQuery({
    queryKey: ['freezers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freezers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Freezer[];
    },
    enabled: !!user,
  });

  return (
    <AppLayout>
      <div className="min-h-full bg-gray-50 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Congeladores</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {freezers.map((freezer) => (
            <div key={freezer.id} className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
              <h2 className="font-semibold text-lg mb-2">{freezer.name}</h2>
              <p className="text-sm text-gray-500 mb-4">{freezer.location}</p>
              <Button onClick={() => navigate(`/freezers/${freezer.id}`)} className="w-full rounded-lg">Ver detalles</Button>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}