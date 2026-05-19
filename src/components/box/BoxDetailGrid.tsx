import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback } from 'react';
import { BoxGridCell, BoxGridCellStatic } from '@/components/box/BoxGridCell';
import { BOX_GRID_COL_HEADER_CLASS, BOX_GRID_ROW_LABEL_CLASS } from '@/lib/boxGridLayout';
import { positionLabel } from '@/lib/positionUtils';
import type { Sample } from '@/types';

interface BoxDetailGridProps {
  rows: number;
  cols: number;
  sampleMap: Record<string, Sample>;
  useDnD: boolean;
  interactionLocked: boolean;
  activeDragSample: Sample | null;
  getSampleCellClass: (sample: Sample) => string;
  onCellClick: (row: number, col: number) => void;
  onDragStart: (e: DragStartEvent) => void;
  onDragEnd: (e: DragEndEvent) => void;
}

export function BoxDetailGrid({
  rows,
  cols,
  sampleMap,
  useDnD,
  interactionLocked,
  activeDragSample,
  getSampleCellClass,
  onCellClick,
  onDragStart,
  onDragEnd,
}: BoxDetailGridProps) {
  const gridSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const gridCollisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
  }, []);

  const gridBody = (
    <div className="overflow-auto overscroll-contain -mx-1 px-1">
      <div className="inline-block min-w-0">
        <div className="flex items-center gap-1 mb-1 pl-9 sm:pl-10">
          {Array.from({ length: cols }, (_, c) => (
            <div key={c} className={BOX_GRID_COL_HEADER_CLASS}>
              {c + 1}
            </div>
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex items-center gap-1 mb-1">
            <div className={BOX_GRID_ROW_LABEL_CLASS}>{String.fromCharCode(65 + r)}</div>
            {Array.from({ length: cols }, (_, c) => {
              const rowNum = r + 1;
              const colNum = c + 1;
              const cellSample = sampleMap[`${rowNum}_${colNum}`];
              if (useDnD) {
                return (
                  <BoxGridCell
                    key={c}
                    row={rowNum}
                    col={colNum}
                    sample={cellSample}
                    positionLabelText={positionLabel(rowNum, colNum)}
                    interactionLocked={interactionLocked}
                    getSampleCellClass={getSampleCellClass}
                    onCellClick={onCellClick}
                  />
                );
              }
              return (
                <BoxGridCellStatic
                  key={c}
                  row={rowNum}
                  col={colNum}
                  sample={cellSample}
                  positionLabelText={positionLabel(rowNum, colNum)}
                  getSampleCellClass={getSampleCellClass}
                  onCellClick={onCellClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  if (!useDnD) return gridBody;

  return (
    <DndContext
      sensors={gridSensors}
      collisionDetection={gridCollisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {gridBody}
      <DragOverlay dropAnimation={null}>
        {activeDragSample ? (
          <div className="w-11 h-11 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded border border-blue-500 bg-blue-600 text-white font-mono text-[10px] font-bold flex items-center justify-center shadow-lg px-1 text-center">
            {activeDragSample.sample_code}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
