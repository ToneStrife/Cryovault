import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { positionLabel } from '@/lib/positionUtils';
import type { Sample } from '@/types';

export const CHECKOUT_QUERY_KEYS = [
  'samples',
  'samples-search',
  'box-samples',
  'box',
  'boxes',
  'all-boxes',
  'freezers-search',
  'boxes-search',
] as const;

async function logMovement(params: {
  sampleId: string;
  fromBoxId: string | null;
  toBoxId: string | null;
  fromPosition: string | null;
  toPosition: string | null;
  movedBy: string;
  notes?: string;
}) {
  const { error } = await (supabase.from('sample_movements') as any).insert([{
    sample_id: params.sampleId,
    from_box_id: params.fromBoxId,
    to_box_id: params.toBoxId,
    from_position: params.fromPosition,
    to_position: params.toPosition,
    moved_by: params.movedBy,
    notes: params.notes || null,
  }]);
  if (error) console.warn('sample_movements insert failed:', error.message);
}

function warnMaxThaws(newThaws: number, maxThaws: number) {
  if (newThaws >= maxThaws) {
    setTimeout(
      () => alert(`Advertencia: esta muestra ha alcanzado el máximo de descongelaciones (${maxThaws}).`),
      100,
    );
  }
}

async function performCheckoutSample(s: Sample, userId: string) {
  const newThaws = s.thaw_count + 1;
  const { error } = await (supabase.from('samples') as any)
    .update({
      status: 'in_use',
      thaw_count: newThaws,
      position_row: null,
      position_column: null,
      position_label: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', s.id);
  if (error) throw error;
  await logMovement({
    sampleId: s.id,
    fromBoxId: s.box_id,
    toBoxId: s.box_id,
    fromPosition: s.position_label,
    toPosition: null,
    movedBy: userId,
    notes: 'checkout_sample',
  });
  return { newThaws, maxThaws: s.max_thaws };
}

export function useSampleCheckout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    CHECKOUT_QUERY_KEYS.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  };

  const checkoutSampleMutation = useMutation({
    mutationFn: async (s: Sample) => {
      if (!user) throw new Error('No autenticado');
      return performCheckoutSample(s, user.id);
    },
    onSuccess: (result) => {
      invalidateAll();
      warnMaxThaws(result.newThaws, result.maxThaws);
    },
  });

  const checkoutSamplesMutation = useMutation({
    mutationFn: async (samples: Sample[]) => {
      if (!user) throw new Error('No autenticado');
      const eligible = samples.filter((s) => s.status !== 'in_use');
      if (eligible.length === 0) {
        throw new Error('Ninguna muestra seleccionada puede sacarse (ya están en uso).');
      }
      let maxThawHits = 0;
      for (const s of eligible) {
        const result = await performCheckoutSample(s, user.id);
        if (result.newThaws >= result.maxThaws) maxThawHits += 1;
      }
      return { checkedOut: eligible.length, skipped: samples.length - eligible.length, maxThawHits };
    },
    onSuccess: (result) => {
      invalidateAll();
      if (result.maxThawHits > 0) {
        setTimeout(
          () => alert(
            `Advertencia: ${result.maxThawHits} muestra${result.maxThawHits !== 1 ? 's' : ''} ha${result.maxThawHits !== 1 ? 'n' : ''} alcanzado el máximo de descongelaciones.`,
          ),
          100,
        );
      }
      if (result.skipped > 0) {
        setTimeout(
          () => alert(`${result.skipped} muestra${result.skipped !== 1 ? 's' : ''} ya estaba${result.skipped !== 1 ? 'n' : ''} en uso y no se modificó${result.skipped !== 1 ? 'ron' : ''}.`),
          150,
        );
      }
    },
  });

  const returnSampleMutation = useMutation({
    mutationFn: async ({
      sample,
      row,
      col,
    }: {
      sample: Sample;
      row: number;
      col: number;
    }) => {
      if (!user) throw new Error('No autenticado');
      if (!sample.box_id) throw new Error('La muestra no está asociada a una caja');
      const label = positionLabel(row, col);
      const { error } = await (supabase.from('samples') as any)
        .update({
          status: 'active',
          position_row: row,
          position_column: col,
          position_label: label,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sample.id);
      if (error) throw error;
      await logMovement({
        sampleId: sample.id,
        fromBoxId: sample.box_id,
        toBoxId: sample.box_id,
        fromPosition: null,
        toPosition: label,
        movedBy: user.id,
        notes: 'return_sample',
      });
    },
    onSuccess: () => invalidateAll(),
  });

  const placeSampleMutation = useMutation({
    mutationFn: async ({
      sample,
      boxId,
      row,
      col,
    }: {
      sample: Sample;
      boxId: string;
      row: number;
      col: number;
    }) => {
      if (!user) throw new Error('No autenticado');
      const label = positionLabel(row, col);
      const { error } = await (supabase.from('samples') as any)
        .update({
          box_id: boxId,
          position_row: row,
          position_column: col,
          position_label: label,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sample.id);
      if (error) throw error;
      await logMovement({
        sampleId: sample.id,
        fromBoxId: sample.box_id,
        toBoxId: boxId,
        fromPosition: sample.position_label,
        toPosition: label,
        movedBy: user.id,
        notes: 'place_sample',
      });
    },
    onSuccess: () => invalidateAll(),
  });

  const checkoutBoxMutation = useMutation({
    mutationFn: async (boxId: string) => {
      if (!user) throw new Error('No autenticado');
      const { data: samples, error: fetchErr } = await (supabase.from('samples') as any)
        .select('id, thaw_count, max_thaws, position_label')
        .eq('box_id', boxId)
        .is('deleted_at', null);
      if (fetchErr) throw fetchErr;
      const list = (samples || []) as Pick<Sample, 'id' | 'thaw_count' | 'max_thaws' | 'position_label'>[];

      const { error: boxErr } = await (supabase.from('boxes') as any)
        .update({ status: 'in_use', updated_at: new Date().toISOString() })
        .eq('id', boxId);
      if (boxErr) throw boxErr;

      let maxWarning: { newThaws: number; maxThaws: number } | null = null;
      for (const s of list) {
        const newThaws = s.thaw_count + 1;
        const { error } = await (supabase.from('samples') as any)
          .update({
            status: 'in_use',
            thaw_count: newThaws,
            updated_at: new Date().toISOString(),
          })
          .eq('id', s.id);
        if (error) throw error;
        if (newThaws >= s.max_thaws) {
          maxWarning = { newThaws, maxThaws: s.max_thaws };
        }
      }
      return { warned: maxWarning, sampleCount: list.length };
    },
    onSuccess: (result) => {
      invalidateAll();
      if (result.warned) {
        warnMaxThaws(result.warned.newThaws, result.warned.maxThaws);
      }
    },
  });

  const returnBoxMutation = useMutation({
    mutationFn: async (boxId: string) => {
      if (!user) throw new Error('No autenticado');
      const { error: samplesErr } = await (supabase.from('samples') as any)
        .update({
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('box_id', boxId)
        .eq('status', 'in_use');
      if (samplesErr) throw samplesErr;

      const { error: boxErr } = await (supabase.from('boxes') as any)
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', boxId);
      if (boxErr) throw boxErr;
    },
    onSuccess: () => invalidateAll(),
  });

  return {
    checkoutSample: checkoutSampleMutation.mutate,
    checkoutSampleAsync: checkoutSampleMutation.mutateAsync,
    isCheckingOutSample: checkoutSampleMutation.isPending,
    checkoutSamples: checkoutSamplesMutation.mutate,
    checkoutSamplesAsync: checkoutSamplesMutation.mutateAsync,
    isCheckingOutSamples: checkoutSamplesMutation.isPending,
    returnSample: returnSampleMutation.mutate,
    returnSampleAsync: returnSampleMutation.mutateAsync,
    isReturningSample: returnSampleMutation.isPending,
    placeSample: placeSampleMutation.mutate,
    placeSampleAsync: placeSampleMutation.mutateAsync,
    isPlacingSample: placeSampleMutation.isPending,
    checkoutBox: checkoutBoxMutation.mutate,
    isCheckingOutBox: checkoutBoxMutation.isPending,
    returnBox: returnBoxMutation.mutate,
    isReturningBox: returnBoxMutation.isPending,
  };
}
