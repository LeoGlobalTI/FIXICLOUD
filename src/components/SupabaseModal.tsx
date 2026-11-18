import React, { useState } from 'react';
import {
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  RefreshCw,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import type { ErpState, SupabaseConfig } from '../types/erp';
import {
  ANDESFLEET_TENANT_ID,
  SUPABASE_SCHEMA_SQL,
  type SupabaseTestResult,
  pullSupabaseErpState,
  seedAndesFleetToSupabase,
  seedDemoDataToSupabase,
  seedMissingSeedTenantsToSupabase,
  testSupabaseConnection,
} from '../services/supabaseService';
import {
  clearLegacyNonUuidStorage,
  getSyncedSeedTenantsForUrl,
  markSeedTenantsSyncedForUrl,
} from '../services/storageService';
import { SEED_ERP_STATE } from '../data/seedData';
import { AlertBanner } from './ui/AlertBanner';

interface SupabaseModalProps {
  config: SupabaseConfig;
  onSaveConfig: (cfg: SupabaseConfig) => void;
  onSyncFromSupabase: (partial: Partial<ErpState>) => void;
  onResetDemoData: () => void;
  onClose: () => void;
}

export const SupabaseModal: React.FC<SupabaseModalProps> = ({
  config,
  onSaveConfig,
  onSyncFromSupabase,
  onResetDemoData,
  onClose,
}) => {
  const [url, setUrl] = useState(config.url);
  const [anonKey, setAnonKey] = useState(config.anonKey);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<SupabaseTestResult | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncVariant, setSyncVariant] = useState<'info' | 'success' | 'error'>('info');
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setSyncMessage(null);
    const res = await testSupabaseConnection(url, anonKey);
    setResult(res);
    setTesting(false);
    onSaveConfig({
      url: url.trim(),
      anonKey: anonKey.trim(),
      connected: res.success,
      demoMode: !res.success,
      source: config.source === 'env' && url.trim() === config.url ? 'env' : 'local',
      lastCheckedAt: new Date().toISOString(),
      lastError: res.success ? undefined : res.message,
    });
  };

  const handlePull = async () => {
    setSyncing(true);
    setSyncMessage(null);
    clearLegacyNonUuidStorage();
    const res = await pullSupabaseErpState(url, anonKey);
    if (res.ok && res.data) {
      const existingIds = (res.data.tenants ?? []).map((t) => t.id);
      const alreadySynced = getSyncedSeedTenantsForUrl(url);
      const seedRes = await seedMissingSeedTenantsToSupabase(
        url,
        anonKey,
        existingIds,
        { skipIds: alreadySynced }
      );
      if (seedRes.ok && seedRes.addedTenantIds.length > 0) {
        markSeedTenantsSyncedForUrl(url, seedRes.addedTenantIds);
        const refreshed = await pullSupabaseErpState(url, anonKey);
        setSyncing(false);
        if (refreshed.ok && refreshed.data) {
          onSyncFromSupabase(refreshed.data);
          setSyncVariant('success');
          setSyncMessage(
            `Sincronizado en vivo con Supabase (se cargó AndesFleet Rent a Car SpA y su flota).`
          );
          return;
        }
      }
      setSyncing(false);
      onSyncFromSupabase(res.data);
      setSyncVariant('success');
      setSyncMessage('Datos sincronizados en vivo desde Supabase al estado activo.');
    } else {
      setSyncing(false);
      setSyncVariant('error');
      setSyncMessage(res.error ?? 'No se pudo sincronizar.');
    }
  };

  const handleSeedAndesFleet = async () => {
    setSeeding(true);
    setSyncMessage(null);
    clearLegacyNonUuidStorage();
    const res = await seedAndesFleetToSupabase(url, anonKey);
    if (res.ok) {
      markSeedTenantsSyncedForUrl(url, [ANDESFLEET_TENANT_ID]);
      const pullRes = await pullSupabaseErpState(url, anonKey);
      if (pullRes.ok && pullRes.data) {
        onSyncFromSupabase(pullRes.data);
      }
      setSyncVariant('success');
      setSyncMessage(
        `AndesFleet Rent a Car SpA y su flota de ejemplo cargados en Supabase. ${res.message}`
      );
    } else {
      setSyncVariant('error');
      setSyncMessage(res.message);
    }
    setSeeding(false);
  };

  const handleSeedDb = async () => {
    setSeeding(true);
    setSyncMessage(null);
    const hadLegacy = clearLegacyNonUuidStorage();
    if (hadLegacy) {
      onResetDemoData();
    }
    const res = await seedDemoDataToSupabase(url, anonKey);
    if (res.ok) {
      markSeedTenantsSyncedForUrl(
        url,
        SEED_ERP_STATE.tenants.map((t) => t.id)
      );
      const pullRes = await pullSupabaseErpState(url, anonKey);
      if (pullRes.ok && pullRes.data) {
        onSyncFromSupabase(pullRes.data);
      }
      setSyncVariant('success');
    } else {
      setSyncVariant('error');
    }
    setSeeding(false);
    setSyncMessage(
      hadLegacy && res.ok
        ? `${res.message} (Se limpió caché local antigua sin UUID).`
        : res.message
    );
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Ignore clipboard errors in restricted frames
    }
  };

  const sourceBadge =
    config.source === 'env'
      ? 'Variables de Entorno'
      : config.connected && !config.demoMode
      ? 'Credenciales Locales (Conectado)'
      : 'Modo Demo Local';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supabase-modal-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A2463] text-white">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#3E92CC]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 id="supabase-modal-title" className="text-sm font-semibold">
                  Configuración de Conexión Base de Datos Supabase
                </h2>
                <span className="rounded-full bg-[#1E3A8A] border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-[#D8E4EC]">
                  {sourceBadge}
                </span>
              </div>
              <p className="text-[11px] text-[#D8E4EC]/80">
                Conecta FIXICLOUD a tu instancia PostgreSQL en Supabase.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal Supabase"
            className="rounded-lg p-1.5 text-white/70 hover:bg-[#1E3A8A] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={handleTest} className="space-y-4">
            <div>
              <label
                htmlFor="supabase-url"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                VITE_SUPABASE_URL
              </label>
              <input
                id="supabase-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://tu-proyecto.supabase.co"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="supabase-anon-key"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                VITE_SUPABASE_ANON_KEY
              </label>
              <input
                id="supabase-anon-key"
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold transition-colors"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Probando 13 tablas...' : 'Probar Conexión en Vivo'}</span>
              </button>

              {config.connected && !config.demoMode && (
                <>
                  <button
                    type="button"
                    onClick={handlePull}
                    disabled={syncing || seeding}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                  >
                    <span>{syncing ? 'Sincronizando...' : 'Sincronizar Tablas'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSeedAndesFleet}
                    disabled={seeding || syncing}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1A4B7C] hover:bg-[#0A2463] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                  >
                    <CloudUpload className="h-3.5 w-3.5 text-[#3E92CC]" />
                    <span>
                      {seeding
                        ? 'Cargando en Supabase...'
                        : 'Cargar Flota AndesFleet en Supabase'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSeedDb}
                    disabled={seeding || syncing}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                  >
                    <CloudUpload className="h-3.5 w-3.5 text-[#3E92CC]" />
                    <span>
                      {seeding
                        ? 'Sembrando DB...'
                        : 'Sembrar Datos Demo en mi Supabase (Seed DB)'}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  onSaveConfig({
                    url: url.trim(),
                    anonKey: anonKey.trim(),
                    connected: false,
                    demoMode: true,
                    source: config.source,
                  });
                  setResult(null);
                  setSyncVariant('info');
                  setSyncMessage('Cambiado a Modo Demo Local (persistencia en navegador).');
                }}
                className="rounded-xl border border-[#D8E4EC] px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
              >
                Usar Modo Demo Local
              </button>
            </div>
          </form>

          {result && (
            <div
              className={`rounded-lg border p-4 space-y-3 ${
                result.success
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="text-xs font-bold text-slate-900">{result.message}</div>
              {result.tables.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.tables.map((t) => (
                    <div
                      key={t.table}
                      className="flex items-center justify-between rounded bg-white border border-slate-200 px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-mono font-semibold text-slate-800">
                        {t.table}
                      </span>
                      {t.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-mono">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t.count}
                        </span>
                      ) : (
                        <span
                          title={t.error}
                          className="inline-flex items-center gap-1 text-red-600 font-medium"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Error
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {syncMessage && (
            <AlertBanner
              variant={syncVariant}
              message={syncMessage}
              onDismiss={() => setSyncMessage(null)}
            />
          )}

          {/* SQL Schema & Demo Reset */}
          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowSql((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {showSql
                ? 'Ocultar SQL Maestro Fase 3'
                : 'Ver SQL Maestro Fase 3 (13 tablas + Storage + RPC)'}
            </button>

            <button
              type="button"
              onClick={() => {
                onResetDemoData();
                setSyncVariant('info');
                setSyncMessage('Datos Demo Local restablecidos con UUIDs válidos.');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restablecer Datos Demo Local</span>
            </button>
          </div>

          {showSql && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-cyan-400">
                  Schema SQL Fase 3 (13 tablas + order-photos + RPCs)
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedSql ? 'Copiado' : 'Copiar SQL'}</span>
                </button>
              </div>
              <pre className="max-h-48 overflow-auto text-[11px] font-mono leading-relaxed text-slate-300">
                {SUPABASE_SCHEMA_SQL}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
