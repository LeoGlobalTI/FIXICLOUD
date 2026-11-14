import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  MapPin,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import type {
  Branch,
  Client,
  CustomerAsset,
  OrderStatus,
  SupabaseConfig,
  Tenant,
  WorkOrder,
  WorkOrderPhoto,
} from '../types/erp';
import {
  ORDER_STATUS_META,
  calculateOrderFinancials,
  formatCurrency,
} from '../utils/erpLogic';
import {
  type PublicOrderRpcPayload,
  fetchPublicOrderStatusViaRpc,
  isSupabaseLive,
} from '../services/supabaseService';

interface PublicTrackPortalProps {
  tenants: Tenant[];
  branches: Branch[];
  clients: Client[];
  assets: CustomerAsset[];
  orders: WorkOrder[];
  supabaseConfig: SupabaseConfig;
  initialCode?: string;
  onBackToErp: () => void;
}

const PROGRESS_STEPS: OrderStatus[] = [
  'received',
  'diagnosing',
  'waiting_approval',
  'in_repair',
  'ready',
  'delivered',
];

export const PublicTrackPortal: React.FC<PublicTrackPortalProps> = ({
  tenants,
  branches,
  clients,
  assets,
  orders,
  supabaseConfig,
  initialCode = '8F92A1C4',
  onBackToErp,
}) => {
  const [inputCode, setInputCode] = useState(initialCode);
  const [searchedCode, setSearchedCode] = useState(initialCode);
  const [lightboxPhoto, setLightboxPhoto] = useState<WorkOrderPhoto | null>(null);
  const [rpcPayload, setRpcPayload] = useState<PublicOrderRpcPayload | null>(null);
  const [rpcLoading, setRpcLoading] = useState(false);

  const liveMode = isSupabaseLive(supabaseConfig);

  useEffect(() => {
    setInputCode(initialCode);
    setSearchedCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    let cancelled = false;
    if (!liveMode || !searchedCode.trim()) {
      setRpcPayload(null);
      return;
    }
    setRpcLoading(true);
    fetchPublicOrderStatusViaRpc(supabaseConfig, searchedCode)
      .then((res) => {
        if (cancelled) return;
        setRpcPayload(res.ok && res.data ? res.data : null);
      })
      .finally(() => {
        if (!cancelled) setRpcLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [liveMode, searchedCode, supabaseConfig]);

  const normalized = searchedCode.trim().toUpperCase();
  const localMatchedOrder = orders.find(
    (o) =>
      o.tracking_code.toUpperCase() === normalized ||
      o.folio.toUpperCase() === normalized
  );

  const matchedOrder = rpcPayload?.order ?? localMatchedOrder;
  const tenant =
    rpcPayload?.tenant ??
    (matchedOrder ? tenants.find((t) => t.id === matchedOrder.tenant_id) : undefined);
  const branch =
    rpcPayload?.branch ??
    (matchedOrder ? branches.find((b) => b.id === matchedOrder.branch_id) : undefined);
  const client =
    rpcPayload?.client ??
    (matchedOrder ? clients.find((c) => c.id === matchedOrder.client_id) : undefined);
  const asset =
    rpcPayload?.asset ??
    (matchedOrder ? assets.find((a) => a.id === matchedOrder.asset_id) : undefined);

  const financials =
    matchedOrder && tenant
      ? calculateOrderFinancials(
          matchedOrder.items,
          matchedOrder.discount_amount,
          matchedOrder.apply_iva,
          tenant.iva_rate,
          matchedOrder.payments
        )
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchedCode(inputCode);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FB] text-slate-900">
      {/* Clean Top Bar */}
      <header className="bg-[#0A2463] text-white border-b border-[#1E3A8A] px-4 lg:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center">
              <Wrench className="h-4 w-4 text-[#3E92CC]" />
            </div>
            <div>
              <div className="font-display text-sm font-bold tracking-tight">
                FIXICLOUD — Portal de Seguimiento
              </div>
              <div className="text-[11px] text-[#D8E4EC]/80">
                Consulta en línea para clientes
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToErp}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#1E3A8A] hover:bg-[#3E92CC] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver al ERP Taller</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 lg:px-8 py-6 space-y-5">
        {/* Search Card */}
        <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-900">
              Consulta el estado de tu equipo en tiempo real
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Ingresa tu Código de Seguimiento de 8 caracteres (ej. 8F92A1C4) o tu Número de Folio (ej. OT-000105).
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-wrap gap-2.5">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Código o Folio (Ej: 8F92A1C4)"
                aria-label="Código de seguimiento o folio"
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] pl-9 pr-3 py-2.5 text-sm font-mono uppercase focus:bg-white focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap"
            >
              Consultar Estado
            </button>
          </form>

            {/* Demo Quick Test Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-slate-500 font-medium">Códigos de prueba rápida:</span>
            {orders.slice(0, 5).map((ord) => (
              <button
                key={ord.id}
                type="button"
                onClick={() => {
                  setInputCode(ord.tracking_code);
                  setSearchedCode(ord.tracking_code);
                }}
                className={`rounded-xl border px-3 py-1.5 font-mono text-xs transition-colors ${
                  normalized === ord.tracking_code.toUpperCase()
                    ? 'bg-[#EBF4FA] border-[#3E92CC]/40 text-[#0A2463] font-bold'
                    : 'bg-[#F4F6FB] border-[#D8E4EC] text-slate-700 hover:bg-white hover:border-[#3E92CC]/40'
                }`}
              >
                {ord.tracking_code} ({ord.folio})
              </button>
            ))}
          </div>
        </section>

        {rpcLoading ? (
          <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-10 text-center text-xs font-medium text-slate-600">
            Consultando estado en vivo vía Supabase RPC...
          </div>
        ) : !matchedOrder || !tenant || !financials ? (
          <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-10 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No encontramos una orden con el código &ldquo;{searchedCode}&rdquo;
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Verifica el código impreso en tu comprobante de ingreso o prueba uno de los códigos demo arriba.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Order Summary & Progress Stepper */}
            <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-[#3E92CC]">
                    {tenant.name} · {branch?.name ?? 'Casa Matriz'}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">
                    Orden <span className="font-mono font-bold text-[#0A2463]">{matchedOrder.folio}</span> —{' '}
                    {asset ? `${asset.category} ${asset.brand} ${asset.model}` : 'Equipo'}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Cliente: {client?.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">S/N: {asset?.serial_imei}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">Código: {matchedOrder.tracking_code}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Estado Actual</div>
                  <div
                    className={`mt-0.5 text-base font-bold ${
                      ORDER_STATUS_META[matchedOrder.status].textColor
                    }`}
                  >
                    {ORDER_STATUS_META[matchedOrder.status].label}
                  </div>
                </div>
              </div>

              {/* 6-Step Progress Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {PROGRESS_STEPS.map((st, idx) => {
                  const currentIdx = ORDER_STATUS_META[matchedOrder.status].stepIndex;
                  const done = idx <= currentIdx;
                  const isCurrent = idx === currentIdx;
                  return (
                    <div
                      key={st}
                      className={`rounded-xl border p-3.5 ${
                        isCurrent
                          ? 'bg-[#EBF4FA] border-[#3E92CC]'
                          : done
                          ? 'bg-[#EBF8F6] border-[#1B998B]/30'
                          : 'bg-[#F4F6FB] border-[#D8E4EC] opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          0{idx + 1}
                        </span>
                        {done && (
                          <CheckCircle2
                            className={`h-4 w-4 ${
                              isCurrent ? 'text-[#3E92CC]' : 'text-[#1B998B]'
                            }`}
                          />
                        )}
                      </div>
                      <div className="mt-1.5 text-xs font-semibold text-slate-900">
                        {ORDER_STATUS_META[st].label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Technical Report & Financial Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-[#D8E4EC]/70">
                  Informe Técnico y Diagnóstico
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-500">Falla Reportada</div>
                    <p className="mt-0.5 text-slate-800 leading-relaxed">
                      {matchedOrder.reported_symptoms}
                    </p>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-500">Diagnóstico Técnico</div>
                    <p className="mt-0.5 text-slate-800 leading-relaxed">
                      {matchedOrder.technical_diagnosis ||
                        'Equipo en evaluación por nuestro equipo técnico.'}
                    </p>
                  </div>
                  {matchedOrder.work_performed && (
                    <div>
                      <div className="font-semibold text-slate-500">Trabajo Realizado</div>
                      <p className="mt-0.5 text-slate-800 leading-relaxed">
                        {matchedOrder.work_performed}
                      </p>
                    </div>
                  )}
                  {matchedOrder.parts_and_observations && (
                    <div>
                      <div className="font-semibold text-slate-500">
                        Observaciones y Garantía
                      </div>
                      <p className="mt-0.5 text-slate-800 leading-relaxed">
                        {matchedOrder.parts_and_observations}
                      </p>
                    </div>
                  )}
                </div>

                {branch && (
                  <div className="pt-3 border-t border-[#D8E4EC]/70 flex items-start gap-2 text-xs text-slate-600">
                    <MapPin className="h-4 w-4 text-[#3E92CC] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-800">
                        {branch.name} — {branch.address}, {branch.city}
                      </div>
                      <div>
                        Horario: {branch.business_hours} · Tel: {branch.phone}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 pb-2 border-b border-[#D8E4EC]/70">
                  Detalle de Presupuesto y Saldo
                </h3>

                <div className="divide-y divide-[#D8E4EC]/50 text-xs">
                  {matchedOrder.items.length === 0 ? (
                    <p className="py-3 text-slate-500">
                      Presupuesto aún en elaboración técnica.
                    </p>
                  ) : (
                    matchedOrder.items.map((item) => (
                      <div
                        key={item.id}
                        className="py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="text-slate-800">
                          <span className="font-mono text-[#0A2463] font-semibold">{item.qty}x</span>{' '}
                          {item.description}
                        </div>
                        <div className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                          {formatCurrency(item.qty * item.unit_price, tenant.currency)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-[#D8E4EC]/70 pt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(financials.subtotal, tenant.currency)}
                    </span>
                  </div>
                  {financials.discount > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Descuento</span>
                      <span className="font-mono tabular-nums">
                        - {formatCurrency(financials.discount, tenant.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>
                      IVA ({matchedOrder.apply_iva ? `${tenant.iva_rate}%` : 'No aplica'})
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(financials.ivaAmount, tenant.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-[#0A2463] pt-2 border-t border-[#D8E4EC]/70">
                    <span>Total</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(financials.totalAmount, tenant.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#1B998B] font-semibold">
                    <span>Abonado</span>
                    <span className="font-mono tabular-nums">
                      - {formatCurrency(financials.paidAmount, tenant.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-[#D8E4EC]/70">
                    <span>Saldo Pendiente</span>
                    <span
                      className={`font-mono tabular-nums ${
                        financials.balanceDue > 0 ? 'text-amber-700' : 'text-[#1B998B]'
                      }`}
                    >
                      {formatCurrency(financials.balanceDue, tenant.currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Evidence Gallery */}
            {matchedOrder.photos.length > 0 && (
              <section className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#D8E4EC]/70">
                  <Camera className="h-4 w-4 text-[#3E92CC]" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Evidencia Fotográfica del Taller ({matchedOrder.photos.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedOrder.photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="rounded-2xl border border-[#D8E4EC]/70 overflow-hidden bg-[#F4F6FB]/60"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxPhoto(photo)}
                        className="block w-full aspect-video bg-slate-200 overflow-hidden"
                      >
                        <img
                          src={photo.url}
                          alt={photo.caption}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </button>
                      <div className="p-3.5">
                        <div className="text-[11px] font-bold text-[#0A2463]">
                          {photo.stage === 'reception'
                            ? 'Recepción'
                            : photo.stage === 'diagnosis'
                            ? 'Diagnóstico'
                            : 'Entrega'}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-700">{photo.caption}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/80 backdrop-blur-[2px] p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl bg-white border border-[#D8E4EC] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#D8E4EC]">
              <span className="text-xs font-semibold text-slate-800">
                {lightboxPhoto.caption}
              </span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Cerrar foto"
                className="p-1.5 text-slate-500 hover:bg-[#F4F6FB] rounded-xl"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-slate-900 flex justify-center">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
