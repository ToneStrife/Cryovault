import { supabase } from '@/lib/supabase';

export type LabDataOperation = 'lab_export' | 'lab_import' | 'box_import' | 'box_export';

export async function logDataOperation(
  userId: string,
  entityType: 'settings' | 'box',
  entityId: string,
  operation: LabDataOperation,
  details: Record<string, unknown>,
) {
  const { error } = await (supabase.from('audit_logs') as any).insert([
    {
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action: 'update',
      old_values: null,
      new_values: { operation, ...details, at: new Date().toISOString() },
    },
  ]);
  if (error) console.warn('[labAudit] Failed to write audit log:', error.message);
}

/** @deprecated use logDataOperation */
export const logLabDataOperation = (
  userId: string,
  settingsEntityId: string,
  operation: LabDataOperation,
  details: Record<string, unknown>,
) => logDataOperation(userId, 'settings', settingsEntityId, operation, details);
