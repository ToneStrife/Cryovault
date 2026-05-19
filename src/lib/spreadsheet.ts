import * as XLSX from 'xlsx';

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Read first sheet of xlsx/xls/csv into row objects with lowercase keys. */
export function parseFileToRows(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        const normalized = raw.map((r) => {
          const out: Record<string, string> = {};
          Object.keys(r).forEach((k) => {
            out[k.trim().toLowerCase()] = String(r[k] ?? '');
          });
          return out;
        });
        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Read a named sheet from workbook file; falls back to first sheet. */
export function parseFileSheetRows(file: File, sheetName: string): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const name =
          wb.SheetNames.find((n) => n.toLowerCase() === sheetName.toLowerCase()) ?? wb.SheetNames[0];
        const ws = wb.Sheets[name];
        if (!ws) {
          resolve([]);
          return;
        }
        const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
        const normalized = raw.map((r) => {
          const out: Record<string, string> = {};
          Object.keys(r).forEach((k) => {
            out[k.trim().toLowerCase()] = String(r[k] ?? '');
          });
          return out;
        });
        resolve(normalized);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function buildWorkbookBuffer(sheets: { name: string; rows: Record<string, unknown>[] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function downloadWorkbook(
  sheets: { name: string; rows: Record<string, unknown>[] }[],
  filename: string,
) {
  const buf = buildWorkbookBuffer(sheets);
  triggerBlobDownload(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}
