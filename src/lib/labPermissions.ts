import type { UserRole } from '@/types';

const LAYOUT_MANAGER_ROLES: UserRole[] = ['admin', 'researcher', 'technician'];

export function canManageFreezerLayout(role: string | undefined): boolean {
  return !!role && LAYOUT_MANAGER_ROLES.includes(role as UserRole);
}

export function canManageBoxes(role: string | undefined): boolean {
  return !!role && LAYOUT_MANAGER_ROLES.includes(role as UserRole);
}
