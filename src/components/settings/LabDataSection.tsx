import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { useSettingsOptions } from '@/lib/settingsOptions';
import { exportLaboratoryExcel, downloadLabImportTemplate } from '@/lib/labExport';
import { parseLabImportRows, runLabImport, type LabImportResult } from '@/lib/labImport';
import { logDataOperation } from '@/lib/labAudit';

interface LabDataSectionProps {
  settingsId: string | undefined;
}

export function LabDataSection({ settingsId }: LabDataSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { options } = useSettingsOptions(user?.laboratory);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<LabImportResult | null>(null);
  const [error, setError] = useState('');

  const handleExport = async () => {
    if (!user?.laboratory) return;
    setError('');
    setExporting(true);
    try {
      const counts = await exportLaboratoryExcel(user.laboratory);
      if (settingsId && user.id) {
        await logDataOperation(user.id, 'settings', settingsId, 'lab_export', counts);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File | null) => {
    setImportFile(file);
    setResult(null);
    setError('');
    if (!file) {
      setPreviewRows([]);
      return;
    }
    try {
      const rows = await parseLabImportRows(file);
      setPreviewRows(rows.slice(0, 5));
    } catch {
      setError('No se pudo leer el archivo. Usa la hoja «Muestras» en .xlsx');
      setPreviewRows([]);
    }
  };

  const buildCtx = () => ({
    laboratory: user!.laboratory,
    userId: user!.id,
    sampleTypes: options.sampleTypes,
    statuses: options.sampleStatuses,
    units: options.unitTypes,
    defaultSampleType: options.defaultSampleType,
    defaultStatus: options.defaultSampleStatus,
    defaultUnits: options.defaultUnits,
    defaultMaxThaws: options.defaultMaxThaws,
  });

  const handleDryRun = async () => {
    if (!importFile || !user) return;
    setError('');
    setDryRunning(true);
    try {
      const rows = await parseLabImportRows(importFile);
      const res = await runLabImport(rows, buildCtx(), { dryRun: true });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error en validación');
    } finally {
      setDryRunning(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !user) return;
    setError('');
    setImporting(true);
    try {
      const rows = await parseLabImportRows(importFile);
      const res = await runLabImport(rows, buildCtx(), { dryRun: false });
      setResult(res);
      if (settingsId) {
        await logDataOperation(user.id, 'settings', settingsId, 'lab_import', {
          imported: res.imported,
          skipped: res.skipped,
          error_count: res.errors.length,
        });
      }
      if (res.imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['samples-search'] });
        queryClient.invalidateQueries({ queryKey: ['all-boxes'] });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-gray-900 font-semibold mb-1">Datos del laboratorio</h2>
      <p className="text-sm text-gray-500 mb-4">
        Exporta o importa muestras en cajas existentes. Para backup completo de la base de datos, consulta{' '}
        <a
          href="https://github.com/ToneStrife/Cryovault/blob/main/docs/BACKUP.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          docs/BACKUP.md
        </a>
        .
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="border-gray-200"
        >
          <Download className="w-4 h-4 mr-2" />
          {exporting ? 'Exportando...' : 'Exportar laboratorio (.xlsx)'}
        </Button>
        <Button type="button" variant="outline" onClick={() => downloadLabImportTemplate()} className="border-gray-200">
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Plantilla importación
        </Button>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Importar muestras</h3>
        <p className="text-xs text-gray-500">
          Solo añade muestras nuevas en cajas que ya existen. No recrea congeladores ni cajas.
        </p>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-sm file:font-medium file:bg-gray-50 hover:file:bg-gray-100"
        />
        {previewRows.length > 0 && (
          <p className="text-xs text-gray-500">
            Vista previa: {previewRows.length} fila(s) mostradas (de {importFile ? 'archivo cargado' : '—'})
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDryRun}
            disabled={!importFile || dryRunning || importing}
            className="border-gray-200"
          >
            {dryRunning ? 'Validando...' : 'Validar sin guardar'}
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!importFile || importing || dryRunning}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Importando...' : 'Importar'}
          </Button>
        </div>
      </div>

      {result && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            {result.imported} importada(s), {result.skipped} omitida(s), {result.errors.length} error(es)
          </p>
          {result.errors.length > 0 && (
            <ul className="text-xs text-red-600 max-h-40 overflow-y-auto space-y-1">
              {result.errors.slice(0, 20).map((err, i) => (
                <li key={i}>
                  Fila {err.row}: {err.message}
                </li>
              ))}
              {result.errors.length > 20 && <li>… y {result.errors.length - 20} más</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
