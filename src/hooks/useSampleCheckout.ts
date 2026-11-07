import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Sample } from '@/types';

/**
 * Operaciones de sacar, devolver, colocar, mover y quitar muestras.
 *
 * Cada operación es una función RPC de Supabase (migración 021) que se ejecuta
 * en una sola transacción: actualiza la muestra, la caja y el registro de
 * movimientos, o no hace nada si algo falla. La comprobación de celda libre
 * se hace dentro de la transacción con la caja bloqueada, así que dos usuarios
 * no pueden ocupar la misma celda a la vez.
 */

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

type CheckoutSamplesResult = {
  checked_out: number;
  skipped: number;
  max_thaw_hits: number;
  new_thaws: number;
  max_thaws: number;
};

type CheckoutBoxResult = {
  sample_count: number;
  warned: { new_thaws: number; max_thaws: number } | null;
};

function warnMaxThaws(newThaws: number, maxThaws: number) {
  if (newThaws >= maxThaws) {
    setTimeout(
      () => alert(`Advertencia: esta muestra ha alcanzado el máximo de descongelaciones (${maxThaws}).`),
      100,
    );
  }
}

async function rpcVoid(
  fn: 'return_box' | 'return_sample' | 'place_sample' | 'move_sample' | 'remove_sample_from_box',
  args: Record<string, string | number | null>,
) {
  // Los argumentos los valida la propia función en base de datos.
  const { error } = await supabase.rpc(fn, args as never);
  if (error) throw error;
}

/** Quita una muestra de su caja (la deja sin posición). También la usan otras pantallas. */
export async function performRemoveFromBox(sample: Sample) {
  await rpcVoid('remove_sample_from_box', { p_sample_id: sample.id });
}

export function useSampleCheckout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    CHECKOUT_QUERY_KEYS.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
  };

  const requireUser = () => {
    if (!user) throw new Error('No autenticado');
  };

  const checkoutSampleMutation = useMutation({
    mutationFn: async (s: Sample) => {
      requireUser();
      const { data, error } = await supabase.rpc('checkout_samples', { p_sample_ids: [s.id] });
      if (error) throw error;
      const result = data as unknown as CheckoutSamplesResult;
      return { newThaws: result.new_thaws, maxThaws: result.max_thaws };
    },
    onSuccess: (result) => {
      invalidateAll();
      warnMaxThaws(result.newThaws, result.maxThaws);
    },
  });

  const checkoutSamplesMutation = useMutation({
    mutationFn: async (samples: Sample[]) => {
      requireUser();
      const { data, error } = await supabase.rpc('checkout_samples', {
        p_sample_ids: samples.map((s) => s.id),
      });
      if (error) throw error;
      const result = data as unknown as CheckoutSamplesResult;
      return { checkedOut: result.checked_out, skipped: result.skipped, maxThawHits: result.max_thaw_hits };
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
    mutationFn: async ({ sample, row, col }: { sample: Sample; row: number; col: number }) => {
      requireUser();
      if (!sample.box_id) throw new Error('La muestra no está asociada a una caja');
      await rpcVoid('return_sample', { p_sample_id: sample.id, p_row: row, p_col: col });
    },
    onSuccess: () => invalidateAll(),
  });

  const placeSampleMutation = useMutation({
    mutationFn: async ({ sample, boxId, row, col }: { sample: Sample; boxId: string; row: number; col: number }) => {
      requireUser();
      await rpcVoid('place_sample', {
        p_sample_id: sample.id,
        p_box_id: boxId,
        p_row: row,
        p_col: col,
        p_reason: 'place_sample',
      });
    },
    onSuccess: () => invalidateAll(),
  });

  const transferSampleMutation = useMutation({
    mutationFn: async ({ sample, boxId, row, col }: { sample: Sample; boxId: string; row: number; col: number }) => {
      requireUser();
      await rpcVoid('place_sample', {
        p_sample_id: sample.id,
        p_box_id: boxId,
        p_row: row,
        p_col: col,
        p_reason: 'transfer',
      });
    },
    onSuccess: () => invalidateAll(),
  });

  const removeFromBoxMutation = useMutation({
    mutationFn: async (sample: Sample) => {
      requireUser();
      await performRemoveFromBox(sample);
    },
    onSuccess: () => invalidateAll(),
  });

  const checkoutBoxMutation = useMutation({
    mutationFn: async (boxId: string) => {
      requireUser();
      const { data, error } = await supabase.rpc('checkout_box', { p_box_id: boxId });
      if (error) throw error;
      const result = data as unknown as CheckoutBoxResult;
      return {
        sampleCount: result.sample_count,
        warned: result.warned ? { newThaws: result.warned.new_thaws, maxThaws: result.warned.max_thaws } : null,
      };
    },
    onSuccess: (result) => {
      invalidateAll();
      if (result.warned) {
        warnMaxThaws(result.warned.newThaws, result.warned.maxThaws);
      }
    },
  });

  const moveSampleMutation = useMutation({
    mutationFn: async ({ sample, row, col }: { sample: Sample; row: number; col: number }) => {
      requireUser();
      await rpcVoid('move_sample', { p_sample_id: sample.id, p_row: row, p_col: col });
    },
    onSuccess: () => invalidateAll(),
  });

  const returnBoxMutation = useMutation({
    mutationFn: async (boxId: string) => {
      requireUser();
      await rpcVoid('return_box', { p_box_id: boxId });
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
    transferSample: transferSampleMutation.mutate,
    transferSampleAsync: transferSampleMutation.mutateAsync,
    isTransferringSample: transferSampleMutation.isPending,
    removeFromBox: removeFromBoxMutation.mutate,
    removeFromBoxAsync: removeFromBoxMutation.mutateAsync,
    isRemovingFromBox: removeFromBoxMutation.isPending,
    checkoutBox: checkoutBoxMutation.mutate,
    isCheckingOutBox: checkoutBoxMutation.isPending,
    returnBox: returnBoxMutation.mutate,
    isReturningBox: returnBoxMutation.isPending,
    moveSample: moveSampleMutation.mutate,
    moveSampleAsync: moveSampleMutation.mutateAsync,
    isMovingSample: moveSampleMutation.isPending,
  };
}
