import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  CloudUpload,
  Copy,
  Database,
  RefreshCw,
  Rocket,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import type { ErpState, SupabaseConfig } from '../types/erp';
import {
  SUPABASE_SCHEMA_SQL,
  type ProductionHealthReport,
  type SupabaseTestResult,
  pullSupabaseErpState,
  runProductionHealthCheck,
  seedDemoDataToSupabase,
  testSupabaseConnection,
} from '../services/supabaseService';
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
  const [tab, setTab] = useState<'connection' | 'vercel'>('connection');
  const [url, setUrl] = useState(config.url);
  const [anonKey, setAnonKey] = useState(config.anonKey);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [result, setResult] = useState<SupabaseTestResult | null>(null);
  const [healthReport, setHealthReport] = useState<ProductionHealthReport | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

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
    const res = await pullSupabaseErpState(url, anonKey);
    setSyncing(false);
    if (res.ok && res.data) {
      onSyncFromSupabase(res.data);
      setSyncMessage('Datos sincronizados en vivo desde Supabase al estado activo.');
    } else {
      setSyncMessage(res.error ?? 'No se pudo sincronizar.');
    }
  };

  const handleSeedDb = async () => {
    setSeeding(true);
    setSyncMessage(null);
    const res = await seedDemoDataToSupabase(url, anonKey);
    if (res.ok) {
      const pullRes = await pullSupabaseErpState(url, anonKey);
      if (pullRes.ok && pullRes.data) {
        onSyncFromSupabase(pullRes.data);
      }
    }
    setSeeding(false);
    setSyncMessage(res.message);
  };

  const handleRunHealthCheck = async () => {
    setCheckingHealth(true);
    const report = await runProductionHealthCheck(url, anonKey);
    setHealthReport(report);
    setCheckingHealth(false);
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

  const vercelEnvContent = `VITE_SUPABASE_URL=${url.trim() || 'https://tu-proyecto.supabase.co'}\nVITE_SUPABASE_ANON_KEY=${anonKey.trim() || 'tu-supabase-anon-key'}`;

  const handleCopyEnv = async () => {
    try {
      await navigator.clipboard.writeText(vercelEnvContent);
      setCopiedEnv(true);
      setTimeout(() => setCopiedEnv(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const sourceBadge =
    config.source === 'env'
      ? 'Variables .env Vercel'
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
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A2463] text-white">
          <div className="flex items-center gap-2.5">
            <Database className="h-5 w-5 text-[#3E92CC]" />
            <div>
              <div className="flex items-center gap-2">
                <h2 id="supabase-modal-title" className="text-sm font-semibold">
                  Conexión BD Supabase y Producción
                </h2>
                <span className="rounded-full bg-[#1E3A8A] border border-white/15 px-2.5 py-0.5 font-mono text-[10px] text-[#D8E4EC]">
                  {sourceBadge}
                </span>
              </div>
              <p className="text-[11px] text-[#D8E4EC]/80">
                Lee automáticamente VITE_SUPABASE_* en Vercel o usa credenciales guardadas / Modo Demo Local.
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

        {/* Modal Tabs */}
        <div className="grid grid-cols-2 border-b border-[#D8E4EC] bg-[#F4F6FB]">
          <button
            type="button"
            onClick={() => setTab('connection')}
            className={`py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === 'connection'
                ? 'border-[#3E92CC] text-[#0A2463] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Conexión BD &amp; Seed</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('vercel')}
            className={`py-2.5 px-4 text-xs font-semibold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              tab === 'vercel'
                ? 'border-[#3E92CC] text-[#0A2463] bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Rocket className="h-3.5 w-3.5" />
            <span>Despliegue Vercel &amp; Health Check</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {tab === 'connection' ? (
            <>
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
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                      >
                        <span>{syncing ? 'Sincronizando...' : 'Sincronizar Tablas'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSeedDb}
                        disabled={seeding}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
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
                  variant="info"
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
                    setSyncMessage('Datos Demo Local restablecidos a su estado inicial.');
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
            </>
          ) : (
            <div className="space-y-4">
              {/* Live Health Check */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-blue-600" />
                      <span>Verificación de Producción (Health Check)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Valida tablas críticas, RPC público get_public_order_status y bucket order-photos.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunHealthCheck}
                    disabled={checkingHealth}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
                    <span>{checkingHealth ? 'Verificando...' : 'Ejecutar Health Check'}</span>
                  </button>
                </div>

                {healthReport && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {healthReport.items.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          item.ok
                            ? 'bg-white border-emerald-200'
                            : 'bg-red-50/70 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                          <span className="truncate">{item.label}</span>
                          {item.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 truncate">
                          {item.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* .env Vercel block */}
              <div className="rounded-lg bg-slate-900 text-slate-100 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-400">
                    Variables de Entorno para Vercel (.env.production)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyEnv}
                    className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{copiedEnv ? 'Copiado .env' : 'Copiar .env'}</span>
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto leading-relaxed">
                  {vercelEnvContent}
                </pre>
              </div>

              {/* Checklist */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-xs text-slate-700">
                <div className="font-bold text-slate-900">
                  Lista de verificación para despliegue en Vercel:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px]">
                  <li>
                    Archivo <span className="font-mono font-semibold">vercel.json</span> configurado con rewrite SPA para rutas directas <span className="font-mono">/track</span> y <span className="font-mono">/?track=CODIGO</span>.
                  </li>
                  <li>
                    Configura <span className="font-mono font-semibold">VITE_SUPABASE_URL</span> y <span className="font-mono font-semibold">VITE_SUPABASE_ANON_KEY</span> en Vercel Project Settings &rarr; Environment Variables.
                  </li>
                  <li>
                    Ejecuta el SQL Maestro Fase 3 en Supabase SQL Editor para habilitar las 13 tablas, el bucket público <span className="font-mono">order-photos</span> y los RPCs <span className="font-mono">register_new_tenant</span> + <span className="font-mono">get_public_order_status</span>.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
