export type BoxCellDropData = {
  type: 'cell';
  row: number;
  col: number;
};

export type BoxSampleDragData = {
  type: 'sample';
  sampleId: string;
  row: number;
  col: number;
};

export function cellDroppableId(row: number, col: number) {
  return `cell-${row}-${col}`;
}
