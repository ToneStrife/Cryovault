import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Sample } from '@/types';
import { useAuth } from '@/context/AuthContext';

export function useSamples(boxId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const samplesQuery = useQuery({
    queryKey: ['samples', boxId],
    queryFn: async () => {
      let query = supabase.from('samples').select('*');

      if (boxId) {
        query = query.eq('box_id', boxId);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Sample[];
    },
    enabled: !!user,
  });

  const createSample = useMutation({
    mutationFn: async (sample: Omit<Sample, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('samples')
        .insert([sample] as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    },
  });

  const updateSample = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Sample> & { id: string }) => {
      const { data, error } = await (supabase.from('samples') as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] });
    },
  });

  return {
    samples: samplesQuery.data || [],
    isLoading: samplesQuery.isLoading,
    error: samplesQuery.error,
    createSample,
    updateSample,
  };
}
