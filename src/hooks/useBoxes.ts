import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Box } from '@/types';
import { useAuth } from '@/context/AuthContext';

export function useBoxes(freezerId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const boxesQuery = useQuery({
    queryKey: ['boxes', freezerId],
    queryFn: async () => {
      let query = supabase.from('boxes').select('*');

      if (freezerId) {
        query = query.eq('freezer_id', freezerId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Box[];
    },
    enabled: !!user,
  });

  const createBox = useMutation({
    mutationFn: async (box: Omit<Box, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('boxes')
        .insert([box] as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
    },
  });

  const updateBox = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Box> & { id: string }) => {
      const { data, error } = await (supabase.from('boxes') as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] });
    },
  });

  return {
    boxes: boxesQuery.data || [],
    isLoading: boxesQuery.isLoading,
    error: boxesQuery.error,
    createBox,
    updateBox,
  };
}
