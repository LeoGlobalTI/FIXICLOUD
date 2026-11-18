import React, { useEffect, useMemo, useState } from 'react';
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
import { compressImageToWebP } from '../utils/imageCompression';
import {
  type LegacyMdbRecord,
  type LegacyPhotoUpload,
  SIMULATED_MDB_RECORDS,
  buildMigrationPreview,
  executeLegacyMigration,
  parseLegacyCsv,
  scanMdbBinaryStrings,
} from '../utils/legacyMigration';
import {
  isSupabaseLive,
  uploadOrderPhotoToStorage,
  upsertMigratedDataToSupabase,
} from '../services/supabaseService';
import { AlertBanner } from './ui/AlertBanner';

interface LegacyMigratorViewProps {
  erpState: ErpState;
  activeTenant: Tenant;
  branches: Branch[];
  supabaseConfig: SupabaseConfig;
  allowGlobalView?: boolean;
  onApplyMigratedState: (nextState: ErpState) => void;
  onGoToConsole: () => void;
}

export const LegacyMigratorView: React.FC<LegacyMigratorViewProps> = ({
  erpState,
  activeTenant,
  branches,
  supabaseConfig,
  allowGlobalView = false,
  onApplyMigratedState,
  onGoToConsole,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [targetTenantId, setTargetTenantId] = useState(activeTenant.id);
  const visibleTenants = useMemo(
    () => (allowGlobalView ? erpState.tenants : [activeTenant]),
    [allowGlobalView, erpState.tenants, activeTenant]
  );
  const tenantBranches = useMemo(
    () => branches.filter((b) => b.tenant_id === targetTenantId),
    [branches, targetTenantId]
  );
  const [targetBranchId, setTargetBranchId] = useState(
    tenantBranches.find((b) => b.is_hq)?.id ?? tenantBranches[0]?.id ?? ''
  );

  useEffect(() => {
    setTargetTenantId(activeTenant.id);
    const list = branches.filter((b) => b.tenant_id === activeTenant.id);
    setTargetBranchId(list.find((b) => b.is_hq)?.id ?? list[0]?.id ?? '');
  }, [activeTenant.id, allowGlobalView, branches]);

  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [rawRecords, setRawRecords] = useState<LegacyMdbRecord[]>([]);
  const [detectedTables, setDetectedTables] = useState<string[]>([]);
  const [binarySample, setBinarySample] = useState<string[]>([]);
  const [isBinaryScan, setIsBinaryScan] = useState(false);
  const [importSourceType, setImportSourceType] = useState<
    'csv' | 'json' | 'mdb_scan' | 'simulation' | null
  >(null);
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
      setIsBinaryScan(false);
      setImportSourceType('csv');
      setStep(2);
    } else if (ext.endsWith('.json')) {
      const text = await file.text();
      try {
        const json = JSON.parse(text) as LegacyMdbRecord[];
        setRawRecords(Array.isArray(json) ? json : []);
        setDetectedTables(['JSON Export']);
        setBinarySample([]);
        setIsBinaryScan(false);
        setImportSourceType('json');
        setStep(2);
      } catch {
        setRawRecords([]);
        setImportSourceType('json');
      }
    } else {
      // Binary .mdb scan
      const buffer = await file.arrayBuffer();
      const scan = scanMdbBinaryStrings(buffer);
      setDetectedTables(scan.detectedTables);
      setBinarySample(scan.extractedStringsSample);
      setRawRecords(scan.records);
      setIsBinaryScan(true);
      setImportSourceType('mdb_scan');
      setStep(2);
    }
  };

  const handleLoadSimulation = () => {
    setMigrationReport(null);
    setSourceLabel('TallerLegacy.mdb (Dataset Simulación Legacy)');
    setDetectedTables(['Reparaciones', 'Clientes', 'Agenda']);
    setBinarySample(['Standard Jet DB', 'Reparaciones', 'Clientes', 'IdOrden', 'Sintomas']);
    setRawRecords(SIMULATED_MDB_RECORDS);
    setIsBinaryScan(true);
    setImportSourceType('simulation');
    setStep(2);
  };

  const handleLegacyPhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const list = Array.from(files);
    e.target.value = '';
    for (const file of list) {
      try {
        const compressed = await compressImageToWebP(file, 1280, 0.8);
        setUploadedPhotos((prev) => [
          ...prev,
          { name: file.name, dataUrl: compressed.dataUrl },
        ]);
      } catch {
        const fallbackUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        });
        if (fallbackUrl) {
          setUploadedPhotos((prev) => [
            ...prev,
            { name: file.name, dataUrl: fallbackUrl },
          ]);
        }
      }
    }
  };

  const handleExecuteMigration = async () => {
    if (previewRows.length === 0) return;
    setMigrating(true);
    setProgress(25);

    const safeTenantId = allowGlobalView ? targetTenantId : activeTenant.id;
    const validBranches = branches.filter((b) => b.tenant_id === safeTenantId);
    const branchToUse =
      (validBranches.some((b) => b.id === targetBranchId) ? targetBranchId : '') ||
      validBranches.find((b) => b.is_hq)?.id ||
      validBranches[0]?.id ||
      '';

    const result = executeLegacyMigration(erpState, previewRows, {
      tenantId: safeTenantId,
      branchId: branchToUse,
    });
    const targetTenantObj =
      erpState.tenants.find((t) => t.id === safeTenantId) ?? activeTenant;

    setProgress(55);

    let supabaseStatus = 'Modo Demo Local (guardado en navegador)';
    if (isSupabaseLive(supabaseConfig)) {
      const storageErrors: string[] = [];
      for (const order of result.createdOrdersList) {
        for (const photo of order.photos) {
          if (photo.url.startsWith('data:image/')) {
            try {
              const blob = await (await fetch(photo.url)).blob();
              const upPhoto = await uploadOrderPhotoToStorage(supabaseConfig, {
                tenantId: safeTenantId,
                workOrderId: order.id,
                blob,
                stage: photo.stage,
                caption: photo.caption,
              });
              if (upPhoto.ok && upPhoto.publicUrl) {
                photo.url = upPhoto.publicUrl;
              } else if (upPhoto.error) {
                storageErrors.push(upPhoto.error);
              }
            } catch {
              storageErrors.push('No se pudo convertir imagen legacy para Storage');
            }
          }
        }
      }

      setProgress(75);

      const workOrdersForSupabase = result.createdOrdersList.map((o) => ({
        ...o,
        photos: o.photos.filter((ph) => !ph.url.startsWith('data:image/')),
      }));

      const up = await upsertMigratedDataToSupabase(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
          clients: result.createdClientsList,
          assets: result.createdAssetsList,
          workOrders: workOrdersForSupabase,
          catalogItems: erpState.catalogItems,
          ivaRate: targetTenantObj.iva_rate,
        }
      );
      if (up.ok) {
        supabaseStatus =
          storageErrors.length > 0
            ? `Sincronizado en Supabase (algunas fotos locales no subieron a Storage: ${storageErrors[0]})`
            : 'Sincronizado vía UPSERT (legacy_mdb_id) y Storage en Supabase';
      } else {
        supabaseStatus = `Guardado local · Supabase aviso: ${up.error}`;
      }
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
            Migrador Legacy FIXICLOUD (.mdb / .csv / /Imagenes/)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Asistente en 3 pasos para importar historial de clientes, equipos, órdenes y fotos desde MS Access (.mdb) hacia FIXICLOUD.
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
                disabled={!allowGlobalView}
                onChange={(e) => handleTenantChange(e.target.value)}
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {visibleTenants.map((t) => (
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
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
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
              Arrastra tu archivo .mdb, .csv o .json aquí
            </div>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              Acepta bases Microsoft Access (.mdb) con escáner de tablas en navegador o exportaciones CSV/JSON de las tablas Reparaciones, Clientes y Agenda.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <label className="inline-flex items-center gap-2 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors">
                <FileSpreadsheet className="h-4 w-4 text-[#6EC1F8]" />
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
                <span>Cargar Dataset de Simulación Legacy (.mdb)</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]/70">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Mapeo Inteligente y Deduplicación — {sourceLabel}
              </h2>
              <div className="mt-0.5 text-xs text-slate-500">
                Tablas detectadas:{' '}
                <span className="font-mono text-[#3E92CC] font-semibold">
                  {detectedTables.join(', ')}
                </span>{' '}
                · {previewRows.length} registros listos para revisar
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold transition-colors"
            >
              Continuar a Paso 3: /Imagenes/ y Migración
            </button>
          </div>

          {(importSourceType === 'simulation' ||
            (importSourceType === 'mdb_scan' && isBinaryScan)) && (
            <AlertBanner
              variant="warning"
              title={
                importSourceType === 'simulation'
                  ? 'Dataset de Simulación Legacy Activo'
                  : 'Escáner binario .mdb en navegador (vista previa / respaldo)'
              }
              message={
                importSourceType === 'simulation'
                  ? 'Estás previsualizando registros simulados de demostración. Para migrar datos reales de producción desde MS Access, exporta tus tablas a .csv o .json e impórtalas en el Paso 1.'
                  : 'El escáner en navegador inspecciona cabeceras Jet y cadenas .mdb y usa registros de respaldo si Access está cifrado o comprimido. Para migrar el 100% de registros reales desde MS Access, exporta las tablas a .csv o .json.'
              }
            />
          )}

          {binarySample.length > 0 && (
            <div className="rounded-xl bg-[#F4F6FB] border border-[#D8E4EC]/70 p-3 text-[11px] font-mono text-slate-600">
              Cadenas detectadas en cabecera binaria: {binarySample.slice(0, 8).join(' · ')}
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-[#D8E4EC]/70">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FB]/70 border-b border-[#D8E4EC]/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-3.5">legacy_mdb_id</th>
                  <th className="py-3 px-3.5">Cliente (Deduplicación)</th>
                  <th className="py-3 px-3.5">Equipo / Serie</th>
                  <th className="py-3 px-3.5">Síntomas &amp; Diagnóstico</th>
                  <th className="py-3 px-3.5 text-right">Importe / Abono</th>
                  <th className="py-3 px-3.5">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D8E4EC]/50">
                {previewRows.map((row) => (
                  <tr key={row.record.legacyId} className="hover:bg-[#F4F6FB]/70 transition-colors">
                    <td className="py-3 px-3.5 font-mono font-bold text-[#0A2463]">
                      {row.record.legacyId}
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900">
                        {row.record.clientName}
                      </div>
                      <div className="text-[11px]">
                        <span
                          className={
                            row.clientStatus === 'existing'
                              ? 'text-[#3E92CC] font-semibold'
                              : 'text-[#1B998B] font-semibold'
                          }
                        >
                          {row.clientStatus === 'existing'
                            ? 'Cliente existente (se vincula sin duplicar)'
                            : 'Cliente nuevo'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3.5">
                      <div className="font-medium text-slate-800">
                        {row.record.category} {row.record.brand} {row.record.model}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        S/N: {row.record.serialImei}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 max-w-xs">
                      <div className="text-slate-800 truncate">
                        {row.record.symptoms}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {row.record.diagnosis}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-900">
                        {formatCurrency(row.record.totalAmount, targetTenant.currency)}
                      </div>
                      <div className="text-[11px] text-[#1B998B]">
                        Abono: {formatCurrency(row.record.paidAmount, targetTenant.currency)}
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-semibold text-[11px]">
                      {row.orderStatus === 'duplicate_skip' ? (
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-amber-700">
                          Ya migrada (Omitir)
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[#EBF8F6] border border-[#1B998B]/25 px-2.5 py-0.5 text-[#1B998B]">
                          Importar OT
                        </span>
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
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D8E4EC]/70">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Emparejamiento de Carpeta /Imagenes/ y Ejecución Final
              </h2>
              <p className="text-xs text-slate-500">
                Sube imágenes cuyos nombres incluyan el ID antiguo (ej. FX-4013_fusor.jpg) para asociarlas automáticamente a la orden migrada.
              </p>
            </div>

            <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-4 py-2 text-xs font-semibold cursor-pointer transition-colors">
              <ImagePlus className="h-4 w-4 text-[#6EC1F8]" />
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
            <div className="rounded-xl bg-[#F4F6FB] border border-[#D8E4EC]/70 p-3.5 text-xs space-y-1">
              <div className="font-semibold text-slate-800">
                {uploadedPhotos.length} imagen(es) cargada(s) para emparejar:
              </div>
              <div className="flex flex-wrap gap-2 font-mono text-[11px] text-[#3E92CC]">
                {uploadedPhotos.map((p, idx) => (
                  <span key={`${p.name}-${idx}`}>{p.name}</span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="rounded-2xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 p-4">
              <div className="text-slate-500 font-medium">Órdenes a Importar</div>
              <div className="font-mono text-xl font-bold text-[#0A2463] mt-1 tabular-nums">
                {previewRows.filter((r) => r.orderStatus === 'import').length}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 p-4">
              <div className="text-slate-500 font-medium">Clientes Nuevos</div>
              <div className="font-mono text-xl font-bold text-[#1B998B] mt-1 tabular-nums">
                {previewRows.filter((r) => r.clientStatus === 'new').length}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 p-4">
              <div className="text-slate-500 font-medium">Duplicados Omitidos</div>
              <div className="font-mono text-xl font-bold text-amber-700 mt-1 tabular-nums">
                {previewRows.filter((r) => r.orderStatus === 'duplicate_skip').length}
              </div>
            </div>
            <div className="rounded-2xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 p-4">
              <div className="text-slate-500 font-medium">Fotos Emparejadas</div>
              <div className="font-mono text-xl font-bold text-[#3E92CC] mt-1 tabular-nums">
                {previewRows.reduce((acc, r) => acc + r.matchedPhotos.length, 0)}
              </div>
            </div>
          </div>

          {migrating || progress > 0 ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Progreso de Migración</span>
                <span className="font-mono tabular-nums">{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#F4F6FB] border border-[#D8E4EC]/70 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3E92CC] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#D8E4EC]/60">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-4 py-2 text-xs font-semibold text-slate-700 transition-colors"
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
                >
                  <FolderUp className="h-3.5 w-3.5 text-[#6EC1F8]" />
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
