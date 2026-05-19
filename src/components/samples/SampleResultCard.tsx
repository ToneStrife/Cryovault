import type { ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { SAMPLE_STATUS_LABEL, SAMPLE_TYPE_LABEL, labelOption } from '@/lib/settingsOptions';
import type { Sample } from '@/types';

export interface SampleCardMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface SampleResultCardProps {
  sample: Sample & { deleted_at?: string | null };
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  statusColorClass?: string;
  /** e.g. "Lab A · Caja 1" */
  secondaryLine?: string;
  /** Hide type row (box list compact) */
  compact?: boolean;
  menuItems: SampleCardMenuItem[];
  showCheckbox?: boolean;
}

const DEFAULT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  in_use: 'bg-amber-100 text-amber-800',
  used: 'bg-yellow-100 text-yellow-700',
  discarded: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-500',
  contaminated: 'bg-red-900/10 text-red-800',
};

export function SampleResultCard({
  sample,
  selected = false,
  onToggleSelect,
  onOpen,
  statusColorClass,
  secondaryLine,
  compact = false,
  menuItems,
  showCheckbox = true,
}: SampleResultCardProps) {
  const isDeleted = !!(sample as { deleted_at?: string | null }).deleted_at;
  const statusClass = statusColorClass || DEFAULT_STATUS_COLORS[sample.status] || 'bg-gray-100 text-gray-500';

  const handleCardClick = () => {
    if (!isDeleted && onOpen) onOpen();
  };

  return (
    <div
      role={onOpen && !isDeleted ? 'button' : undefined}
      tabIndex={onOpen && !isDeleted ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && onOpen && !isDeleted) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`bg-white border border-gray-200 rounded-xl p-3 flex gap-3 items-start transition-colors ${
        isDeleted ? 'opacity-50' : onOpen ? 'hover:bg-blue-50/30 cursor-pointer active:bg-blue-50/50' : ''
      }`}
    >
      {showCheckbox && onToggleSelect && (
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-gray-900 truncate">{sample.sample_code}</p>
            {sample.patient_code && (
              <p className="text-xs text-gray-400 truncate">P: {sample.patient_code}</p>
            )}
            {isDeleted && <p className="text-red-400 text-[10px] font-medium">Eliminada</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusClass}`}>
            {labelOption(sample.status, SAMPLE_STATUS_LABEL)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
          {!compact && (
            <span>{labelOption(sample.sample_type, SAMPLE_TYPE_LABEL)}</span>
          )}
          {compact && (
            <span>{labelOption(sample.sample_type, SAMPLE_TYPE_LABEL)}</span>
          )}
          {sample.position_label ? (
            <span className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{sample.position_label}</span>
          ) : sample.status === 'in_use' && sample.box_id ? (
            <span className="text-amber-600 italic">En uso</span>
          ) : null}
          {!compact && sample.thaw_count != null && sample.max_thaws != null && (
            <span className={`font-mono ${sample.thaw_count >= sample.max_thaws ? 'text-red-500 font-semibold' : ''}`}>
              {sample.thaw_count}/{sample.max_thaws} descong.
            </span>
          )}
        </div>
        {secondaryLine && (
          <p className="mt-1 text-xs text-gray-400 truncate">{secondaryLine}</p>
        )}
      </div>
      {menuItems.length > 0 && (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-500">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white">
              {menuItems.map((item, i) => (
                <span key={item.id}>
                  {i > 0 && item.destructive && menuItems[i - 1] && !menuItems[i - 1].destructive && (
                    <DropdownMenuSeparator />
                  )}
                  <DropdownMenuItem
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={item.destructive ? 'text-red-600 focus:text-red-600' : ''}
                  >
                    {item.icon}
                    {item.label}
                  </DropdownMenuItem>
                </span>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
