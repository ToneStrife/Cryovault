import type { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface MobileBulkAction {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
  className?: string;
}

interface MobileBulkBarProps {
  selectedCount: number;
  onClear: () => void;
  /** Shown as primary buttons (max 2 recommended). */
  primaryActions?: MobileBulkAction[];
  /** Extra actions in overflow menu. */
  overflowActions?: MobileBulkAction[];
}

export function MobileBulkBar({
  selectedCount,
  onClear,
  primaryActions = [],
  overflowActions = [],
}: MobileBulkBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className="fixed left-0 right-0 z-40 md:hidden px-3 pb-2"
      style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-700 truncate">
            {selectedCount} seleccionada{selectedCount !== 1 ? 's' : ''}
          </p>
          <button type="button" onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600">
            Limpiar
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {primaryActions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.variant === 'outline' ? 'outline' : action.variant === 'destructive' ? 'destructive' : 'default'}
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.className}
            >
              {action.icon}
              <span className="sr-only sm:not-sr-only sm:ml-1 max-w-[4rem] truncate inline-block">{action.label}</span>
            </Button>
          ))}
          {overflowActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="px-2 border-gray-200">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-white">
                {overflowActions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={action.className}
                  >
                    {action.icon}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
