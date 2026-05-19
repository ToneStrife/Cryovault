/** Grid position label, e.g. row 1 col 3 → "A3" */
export function positionLabel(row: number, col: number): string {
  return `${String.fromCharCode(64 + row)}${col}`;
}
