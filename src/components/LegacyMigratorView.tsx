import React, { useMemo, useState } from 'react';
import {
  Database,
  FileSpreadsheet,
  FolderUp,
  ImagePlus,
  Play,
  UploadCloud,
} from 'lucide-react';
import type {
  Branch,
  ErpState,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { formatCurrency } from '../utils/erpLogic';
import {
  type LegacyMdbRecord,
  type LegacyPhotoUpload,
  SIMULATED_MDB_RECORDS,
  buildMigrationPreview,
  executeLegacyMigration,
  parseLegacyCsv,
  scanMdbBinaryStrings,
} from '../utils/legacyMigration';
import { upsertMigratedDataToSupabase } from '../services/supabaseService';
import { AlertBanner } from './ui/AlertBanner';

interface LegacyMigratorViewProps {
  erpState: ErpState;
  activeTenant: Tenant;
  branches: Branch[];
  supabaseConfig: SupabaseConfig;
  onApplyMigratedState: (nextState: ErpState) => void;
  onGoToConsole: () => void;
}

export const LegacyMigratorView: React.FC<LegacyMigratorViewProps> = ({
  erpState,
  activeTenant,
  branches,
  supabaseConfig,
  onApplyMigratedState,
  onGoToConsole,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetTenantId, setTargetTenantId] = useState(activeTenant.id);
  const tenantBranches = branches.filter((b) => b.tenant_id === targetTenantId);
  const [targetBranchId, setTargetBranchId] = useState(
    tenantBranches.find((b) => b.is_hq)?.id ?? tenantBranches[0]?.id ?? ''
  );

  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [rawRecords, setRawRecords] = useState<LegacyMdbRecord[]>([]);
  const [detectedTables, setDetectedTables] = useState<string[]>([]);
  const [binarySample, setBinarySample] = useState<string[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<LegacyPhotoUpload[]>([]);

  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [migrationReport, setMigrationReport] = useState<{
    importedOrders: number;
    createdClients: number;
    skippedDuplicates: number;
    attachedPhotos: number;
    supabaseStatus?: string;
  } | null>(null);

  const targetTenant =
    erpState.tenants.find((t) => t.id === targetTenantId) ?? activeTenant;

  const previewRows = useMemo(
    () => buildMigrationPreview(erpState, rawRecords, targetTenantId, uploadedPhotos),
    [erpState, rawRecords, targetTenantId, uploadedPhotos]
  );

  const handleTenantChange = (id: string) => {
    setTargetTenantId(id);
    const list = branches.filter((b) => b.tenant_id === id);
    setTargetBranchId(list.find((b) => b.is_hq)?.id ?? list[0]?.id ?? '');
  };

  const handleFileInput = async (file: File) => {
    const ext = file.name.toLowerCase();
    setMigrationReport(null);
    setSourceLabel(file.name);

    if (ext.endsWith('.csv')) {
      const text = await file.text();
      const parsed = parseLegacyCsv(text);
      setRawRecords(parsed);
      setDetectedTables(['CSV Export']);
      setBinarySample([]);
      setStep(2);
    } else if (ext.endsWith('.json')) {
      const text = await file.text();
      try {
        const json = JSON.parse(text) as LegacyMdbRecord[];
        setRawRecords(Array.isArray(json) ? json : []);
        setDetectedTables(['JSON Export']);
        setBinarySample([]);
        setStep(2);
      } catch {
        setRawRecords([]);
      }
    } else {
      // Binary .mdb scan
      const buffer = await file.arrayBuffer();
      const scan = scanMdbBinaryStrings(buffer);
      setDetectedTables(scan.detectedTables);
      setBinarySample(scan.extractedStringsSample);
      setRawRecords(scan.records);
      setStep(2);
    }
  };

  const handleLoadSimulation = () => {
    setMigrationReport(null);
    setSourceLabel('CPRepair.mdb (Dataset Simulación Legacy)');
    setDetectedTables(['Reparaciones', 'Clientes', 'Agenda']);
    setBinarySample(['Standard Jet DB', 'Reparaciones', 'Clientes', 'IdOrden', 'Sintomas']);
    setRawRecords(SIMULATED_MDB_RECORDS);
    setStep(2);
  };

  const handleLegacyPhotosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setUploadedPhotos((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleExecuteMigration = async () => {
    if (previewRows.length === 0) return;
    setMigrating(true);
    setProgress(25);

    const branchToUse =
      targetBranchId ||
      tenantBranches.find((b) => b.is_hq)?.id ||
      tenantBranches[0]?.id ||
      '';

    const result = executeLegacyMigration(erpState, previewRows, {
      tenantId: targetTenantId,
      branchId: branchToUse,
    });

    setProgress(65);

    let supabaseStatus = 'Modo Demo Local (guardado en navegador)';
    if (supabaseConfig.connected && supabaseConfig.url && supabaseConfig.anonKey) {
      const importedOrderIds = new Set(
        result.nextState.workOrders
          .slice(0, result.importedOrders)
          .map((o) => o.id)
      );
      const newOrders = result.nextState.workOrders.filter((o) =>
        importedOrderIds.has(o.id)
      );
      const up = await upsertMigratedDataToSupabase(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
          clients: result.nextState.clients.slice(0, result.createdClients),
          assets: result.nextState.assets.slice(0, result.importedOrders),
          workOrders: newOrders,
        }
      );
      supabaseStatus = up.ok
        ? 'Sincronizado vía UPSERT (legacy_mdb_id) en Supabase'
        : `Guardado local · Supabase aviso: ${up.error}`;
    }

    setProgress(100);
    onApplyMigratedState(result.nextState);
    setMigrationReport({
      importedOrders: result.importedOrders,
      createdClients: result.createdClients,
      skippedDuplicates: result.skippedDuplicates,
      attachedPhotos: result.attachedPhotos,
      supabaseStatus,
    });
    setMigrating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Migrador Legacy CP Reparaciones (.mdb / .csv / /Imagenes/)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Asistente en 3 pasos para importar historial de clientes, equipos, órdenes y fotos desde MS Access CPRepair.mdb hacia FIXICLOUD.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { num: 1, title: '1. Destino y Archivo .mdb / .csv' },
          { num: 2, title: '2. Mapeo y Deduplicación' },
          { num: 3, title: '3. Fotos /Imagenes/ y Ejecución' },
        ].map((item) => (
          <button
            key={item.num}
            type="button"
            disabled={item.num > 1 && rawRecords.length === 0}
            onClick={() => setStep(item.num as 1 | 2 | 3)}
            className={`rounded-2xl border px-4 py-3.5 text-left transition-colors shadow-sm ${
              step === item.num
                ? 'bg-[#0A2463] border-[#0A2463] text-white'
                : 'bg-white border-[#D8E4EC]/70 text-slate-700 hover:bg-[#F4F6FB] disabled:opacity-50'
            }`}
          >
            <div className="text-xs font-semibold">{item.title}</div>
          </button>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Empresa Destino (Tenant)
              </label>
              <select
                value={targetTenantId}
                onChange={(e) => handleTenantChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {erpState.tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sucursal Destino
              </label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {tenantBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.is_hq ? `${b.name} [HQ]` : b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFileInput(f);
            }}
            className="rounded-2xl border-2 border-dashed border-[#D8E4EC] bg-[#F4F6FB] p-8 text-center space-y-3"
          >
            <UploadCloud className="h-10 w-10 text-[#3E92CC] mx-auto" />
            <div className="text-sm font-semibold text-slate-900">
              Arrastra tu archivo CPRepair.mdb, .csv o .json aquí
            </div>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Acepta bases Microsoft Access (.mdb) con escáner de tablas en navegador o exportaciones CSV/JSON de las tablas Reparaciones, Clientes y Agenda.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors">
                <FileSpreadsheet className="h-4 w-4" />
                <span>Seleccionar .mdb / .csv / .json</span>
                <input
                  type="file"
                  accept=".mdb,.csv,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileInput(f);
                  }}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleLoadSimulation}
                className="inline-flex items-center gap-2 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2.5 text-xs font-semibold transition-colors"
              >
                <Database className="h-4 w-4" />
                <span>Cargar Dataset de Simulación CPRepair.mdb Legacy</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <section className="rounded-xl bg-white border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Mapeo Inteligente y Deduplicación — {sourceLabel}
              </h2>
              <div className="mt-0.5 text-xs text-slate-500">
                Tablas detectadas:{' '}
                <span className="font-mono text-cyan-700 font-semibold">
                  {detectedTables.join(', ')}
                </span>{' '}
                · {previewRows.length} registros listos para revisar
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold"
            >
              Continuar a Paso 3: /Imagenes/ y Migración
            </button>
          </div>

          {binarySample.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] font-mono text-slate-600">
              Cadenas detectadas en cabecera binaria: {binarySample.slice(0, 8).join(' · ')}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-3">legacy_mdb_id</th>
                  <th className="py-2.5 px-3">Cliente (Deduplicación)</th>
                  <th className="py-2.5 px-3">Equipo / Serie</th>
                  <th className="py-2.5 px-3">Síntomas &amp; Diagnóstico</th>
                  <th className="py-2.5 px-3 text-right">Importe / Abono</th>
                  <th className="py-2.5 px-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((row) => (
                  <tr key={row.record.legacyId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                      {row.record.legacyId}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">
                        {row.record.clientName}
                      </div>
                      <div className="text-[11px]">
                        <span
                          className={
                            row.clientStatus === 'existing'
                              ? 'text-cyan-700 font-semibold'
                              : 'text-emerald-700 font-semibold'
                          }
                        >
                          {row.clientStatus === 'existing'
                            ? 'Cliente existente (se vincula sin duplicar)'
                            : 'Cliente nuevo'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">
                        {row.record.category} {row.record.brand} {row.record.model}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        S/N: {row.record.serialImei}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-xs">
                      <div className="text-slate-800 truncate">
                        {row.record.symptoms}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {row.record.diagnosis}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-900">
                        {formatCurrency(row.record.totalAmount, targetTenant.currency)}
                      </div>
                      <div className="text-[11px] text-emerald-700">
                        Abono: {formatCurrency(row.record.paidAmount, targetTenant.currency)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[11px]">
                      {row.orderStatus === 'duplicate_skip' ? (
                        <span className="text-amber-700">Ya migrada (Omitir)</span>
                      ) : (
                        <span className="text-emerald-700">Importar OT</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <section className="rounded-xl bg-white border border-slate-200 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Emparejamiento de Carpeta /Imagenes/ y Ejecución Final
              </h2>
              <p className="text-xs text-slate-500">
                Sube imágenes cuyos nombres incluyan el ID antiguo (ej. CP-4013_fusor.jpg) para asociarlas automáticamente a la orden migrada.
              </p>
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-semibold cursor-pointer">
              <ImagePlus className="h-4 w-4" />
              <span>Seleccionar Fotos /Imagenes/</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleLegacyPhotosUpload}
                className="hidden"
              />
            </label>
          </div>

          {uploadedPhotos.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
              <div className="font-semibold text-slate-800">
                {uploadedPhotos.length} imagen(es) cargada(s) para emparejar:
              </div>
              <div className="flex flex-wrap gap-2 font-mono text-[11px] text-cyan-800">
                {uploadedPhotos.map((p, idx) => (
                  <span key={`${p.name}-${idx}`}>{p.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-slate-500">Órdenes a Importar</div>
              <div className="font-mono text-lg font-bold text-slate-900">
                {previewRows.filter((r) => r.orderStatus === 'import').length}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-slate-500">Clientes Nuevos</div>
              <div className="font-mono text-lg font-bold text-emerald-700">
                {previewRows.filter((r) => r.clientStatus === 'new').length}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-slate-500">Duplicados Omitidos</div>
              <div className="font-mono text-lg font-bold text-amber-700">
                {previewRows.filter((r) => r.orderStatus === 'duplicate_skip').length}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
              <div className="text-slate-500">Fotos Emparejadas</div>
              <div className="font-mono text-lg font-bold text-blue-700">
                {previewRows.reduce((acc, r) => acc + r.matchedPhotos.length, 0)}
              </div>
            </div>
          </div>

          {migrating || progress > 0 ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Progreso de Migración</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Volver al Mapeo
            </button>

            <button
              type="button"
              disabled={migrating}
              onClick={handleExecuteMigration}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 text-white px-5 py-2.5 text-xs font-semibold transition-colors"
            >
              <Play className="h-4 w-4" />
              <span>Ejecutar Migración a FIXICLOUD (Local + Supabase)</span>
            </button>
          </div>

          {migrationReport && (
            <AlertBanner
              variant="success"
              title="Migración Completada Exitosamente"
              message={`Órdenes importadas: ${migrationReport.importedOrders} · Clientes nuevos: ${migrationReport.createdClients} · Duplicados omitidos: ${migrationReport.skippedDuplicates} · Fotos asociadas: ${migrationReport.attachedPhotos}. Destino: ${migrationReport.supabaseStatus}`}
              action={
                <button
                  type="button"
                  onClick={onGoToConsole}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  <FolderUp className="h-3.5 w-3.5" />
                  <span>Ver Órdenes</span>
                </button>
              }
            />
          )}
        </section>
      )}
    </div>
  );
};
