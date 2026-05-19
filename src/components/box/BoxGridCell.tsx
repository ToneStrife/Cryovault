import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { Sample } from '@/types';
import { cellDroppableId, type BoxCellDropData, type BoxSampleDragData } from '@/lib/boxGridDnd';

const EMPTY_CELL_CLASS =
  'bg-white hover:bg-gray-50 border-gray-200';

interface BoxGridCellProps {
  row: number;
  col: number;
  sample: Sample | undefined;
  positionLabelText: string;
  disabled?: boolean;
  interactionLocked?: boolean;
  getSampleCellClass: (sample: Sample) => string;
  onCellClick: (row: number, col: number) => void;
}

export function BoxGridCell({
  row,
  col,
  sample,
  positionLabelText,
  disabled = false,
  interactionLocked = false,
  getSampleCellClass,
  onCellClick,
}: BoxGridCellProps) {
  const canDrag = !disabled && !!sample && sample.status === 'active';
  const isEmpty = !sample;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: sample?.id ?? `empty-${row}-${col}`,
    disabled: !canDrag,
    data: sample
      ? ({ type: 'sample', sampleId: sample.id, row, col } satisfies BoxSampleDragData)
      : undefined,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: cellDroppableId(row, col),
    disabled: disabled || !isEmpty,
    data: { type: 'cell', row, col } satisfies BoxCellDropData,
  });

  const setNodeRef = (node: HTMLButtonElement | null) => {
    setDragRef(node);
    if (isEmpty) setDropRef(node);
  };

  const title = sample
    ? `${sample.sample_code} | ${sample.sample_type} | ${sample.status}`
    : `${positionLabelText} — vacío`;

  const cellClass = sample
    ? getSampleCellClass(sample)
    : EMPTY_CELL_CLASS;

  const handleClick = () => {
    if (interactionLocked || isDragging) return;
    onCellClick(row, col);
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      onClick={handleClick}
      title={title}
      className={`w-16 h-16 rounded border font-mono transition-all flex flex-col items-center justify-center gap-0.5 overflow-hidden touch-none ${cellClass} ${
        isDragging ? 'opacity-40' : ''
      } ${isEmpty && isOver ? 'ring-2 ring-blue-500 ring-offset-1 border-blue-400 bg-blue-50' : ''} ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      {sample ? (
        <span className="text-[11px] font-bold leading-tight px-1 text-center break-all pointer-events-none">
          {sample.sample_code}
        </span>
      ) : (
        <Plus className="w-4 h-4 text-gray-200 pointer-events-none" />
      )}
    </button>
  );
}

/** Plain cell without DnD (e.g. box in use). */
export function BoxGridCellStatic({
  row,
  col,
  sample,
  positionLabelText,
  getSampleCellClass,
  onCellClick,
}: Omit<BoxGridCellProps, 'disabled' | 'interactionLocked'>) {
  const title = sample
    ? `${sample.sample_code} | ${sample.sample_type} | ${sample.status}`
    : `${positionLabelText} — vacío`;

  const cellClass = sample ? getSampleCellClass(sample) : EMPTY_CELL_CLASS;

  return (
    <button
      type="button"
      onClick={() => onCellClick(row, col)}
      title={title}
      className={`w-16 h-16 rounded border font-mono transition-all flex flex-col items-center justify-center gap-0.5 overflow-hidden ${cellClass}`}
    >
      {sample ? (
        <span className="text-[11px] font-bold leading-tight px-1 text-center break-all">
          {sample.sample_code}
        </span>
      ) : (
        <Plus className="w-4 h-4 text-gray-200" />
      )}
    </button>
  );
}
