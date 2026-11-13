import React, { useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  DatabaseZap,
  FileText,
  FolderKanban,
  Laptop,
  MessageCircle,
  MoreVertical,
  Plus,
  Printer,
  Settings,
  Smartphone,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import type {
  Appointment,
  AuthSessionUser,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  IndustrySector,
  LoanAsset,
  OrderStatus,
  RoleType,
  Tenant,
  WorkOrder,
} from '../types/erp';
import { calculateOrderFinancials, formatCurrency } from '../utils/erpLogic';

interface DashboardViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  activeRole: RoleType;
  authSession: AuthSessionUser | null;
  orders: WorkOrder[];
  clients: Client[];
  assets: CustomerAsset[];
  catalogItems: CatalogItem[];
  loanAssets: LoanAsset[];
  appointments: Appointment[];
  onOpenOrder: (orderId: string) => void;
  onOpenPrintOrder: (orderId: string) => void;
  onNewOrder: () => void;
  onGoToConsole: () => void;
  onGoToAppointments: () => void;
  onGoToSettings: (tab: 'company' | 'users') => void;
  onGoToMigration: () => void;
  onToggleWhatsApp: () => void;
  onOpenSupabaseModal: () => void;
}

const STAGE_PROGRESS: Record<OrderStatus, number> = {
  received: 20,
  diagnosing: 40,
  waiting_approval: 55,
  in_repair: 75,
  ready: 90,
  delivered: 100,
};

const STATUS_PILL_MAP: Record<
  OrderStatus,
  { label: string; classes: string }
> = {
  received: {
    label: 'Recibido',
    classes: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
  },
  diagnosing: {
    label: 'Diagnóstico',
    classes: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
  },
  waiting_approval: {
    label: 'Esperando Aprobación',
    classes: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  in_repair: {
    label: 'En Proceso',
    classes: 'bg-[#EBF4FA] text-[#3E92CC] border border-[#3E92CC]/25',
  },
  ready: {
    label: 'Listo / Revisión',
    classes: 'bg-[#EBF8F6] text-[#1B998B] border border-[#1B998B]/25',
  },
  delivered: {
    label: 'Entregado',
    classes: 'bg-[#EBF8F6] text-[#157A6E] border border-[#1B998B]/30',
  },
};

function getSectorIconMeta(sector: IndustrySector) {
  switch (sector) {
    case 'mobile':
      return {
        bg: 'bg-violet-50 text-violet-600 border-violet-200/70',
        Icon: Smartphone,
      };
    case 'machinery':
      return {
        bg: 'bg-[#EBF8F6] text-[#1B998B] border-[#1B998B]/25',
        Icon: Wrench,
      };
    case 'appliances':
      return {
        bg: 'bg-amber-50 text-amber-600 border-amber-200/70',
        Icon: Cpu,
      };
    default:
      return {
        bg: 'bg-[#EBF4FA] text-[#3E92CC] border-[#3E92CC]/25',
        Icon: Laptop,
      };
  }
}

const DEMO_GREETING_NAME: Record<RoleType, string> = {
  superadmin: 'Sofía',
  admin: 'Rodrigo',
  receptionist: 'Camila',
  technician: 'Diego',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  tenant,
  branches,
  activeBranchId,
  activeRole,
  authSession,
  orders,
  clients,
  assets,
  catalogItems,
  appointments,
  onOpenOrder,
  onOpenPrintOrder,
  onNewOrder,
  onGoToConsole,
  onGoToAppointments,
  onGoToSettings,
  onGoToMigration,
  onToggleWhatsApp,
  onOpenSupabaseModal,
}) => {
  const [showSplitMenu, setShowSplitMenu] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  const scopedOrders = orders.filter(
    (o) =>
      o.tenant_id === tenant.id &&
      (activeBranchId === 'ALL' || o.branch_id === activeBranchId)
  );
  const scopedAppointments = appointments.filter(
    (a) =>
      a.tenant_id === tenant.id &&
      (activeBranchId === 'ALL' || a.branch_id === activeBranchId) &&
      a.status === 'scheduled'
  );
  const scopedCatalog = catalogItems.filter(
    (c) =>
      c.tenant_id === tenant.id &&
      (activeBranchId === 'ALL' || c.branch_id === activeBranchId)
  );

  const activeInWorkshop = scopedOrders.filter((o) => o.status !== 'delivered');
  const completedOrReady = scopedOrders.filter(
    (o) => o.status === 'ready' || o.status === 'delivered'
  );
  const readyForPickup = scopedOrders.filter((o) => o.status === 'ready');
  const lowStockCount = scopedCatalog.filter((c) => c.stock_qty <= c.min_stock).length;

  const successRate =
    scopedOrders.length > 0
      ? Math.round((completedOrReady.length / scopedOrders.length) * 100)
      : 84;

  const uniqueTechs = new Set(
    activeInWorkshop.map((o) => o.assigned_technician).filter(Boolean)
  ).size;
  const workshopCapacityPct =
    scopedOrders.length > 0
      ? Math.min(96, Math.max(24, Math.round((activeInWorkshop.length / Math.max(1, uniqueTechs * 3)) * 100)))
      : 62;

  const upcomingDeliveriesCount = readyForPickup.length + scopedAppointments.length;

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  const firstName = authSession
    ? authSession.full_name.trim().split(/\s+/)[0]
    : DEMO_GREETING_NAME[activeRole];

  const sectorMeta = getSectorIconMeta(tenant.sector);
  const SectorIcon = sectorMeta.Icon;

  return (
    <div className="space-y-6">
      {/* Welcome Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[32px] sm:leading-[40px] font-semibold text-slate-900">
            Buenos días, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-600">
            Esto es lo que está pasando en{' '}
            <span className="font-medium text-slate-800">
              {activeBranchId === 'ALL'
                ? tenant.name
                : `${activeBranch?.name ?? 'tu taller'}`}
            </span>{' '}
            hoy.
          </p>
        </div>

        {/* Split Blue Primary CTA */}
        <div className="relative inline-flex items-stretch rounded-xl shadow-sm shrink-0">
          <button
            type="button"
            onClick={onNewOrder}
            className="inline-flex items-center gap-2 rounded-l-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva Orden</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSplitMenu((v) => !v)}
            aria-label="Más acciones rápidas"
            aria-expanded={showSplitMenu}
            className="inline-flex items-center justify-center rounded-r-xl bg-[#3E92CC] hover:bg-[#3178A8] border-l border-white/25 text-white px-2.5 py-2.5 transition-colors"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {showSplitMenu && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowSplitMenu(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white border border-[#D8E4EC] shadow-xl py-1.5 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowSplitMenu(false);
                    onNewOrder();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                >
                  <Plus className="h-3.5 w-3.5 text-[#3E92CC]" />
                  <span>Nueva Orden de Trabajo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSplitMenu(false);
                    onGoToAppointments();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                >
                  <CalendarClock className="h-3.5 w-3.5 text-[#1B998B]" />
                  <span>Agendar Cita / Visita</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSplitMenu(false);
                    onGoToConsole();
                  }}
                  className="w-full px-4 py-2 text-left text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-[#0A2463]" />
                  <span>Ir a Consola 3 Zonas</span>
                </button>
                {scopedOrders[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSplitMenu(false);
                      onOpenPrintOrder(scopedOrders[0].id);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-600" />
                    <span>Emitir Reporte .rpt ({scopedOrders[0].folio})</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Card 1: Órdenes Activas */}
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Órdenes Activas
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                {activeInWorkshop.length}
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
              <FolderKanban className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-0.5 font-semibold text-[#1B998B]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              12%
            </span>
            <span className="text-slate-500">
              vs mes anterior ({scopedOrders.length} totales)
            </span>
          </div>
        </div>

        {/* Card 2: Equipos Entregados / Tasa Éxito */}
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Tasa de Resolución / Listos
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                {successRate}%
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF8F6] text-[#1B998B]">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-0.5 font-semibold text-[#1B998B]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              +6%
            </span>
            <span className="text-slate-500">
              {completedOrReady.length} equipos listos o entregados
            </span>
          </div>
        </div>

        {/* Card 3: Capacidad de Taller / Técnicos */}
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Capacidad de Taller
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                {workshopCapacityPct}%
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
            <span className="font-semibold text-[#3E92CC] whitespace-nowrap">
              {uniqueTechs || 1} técnico(s)
            </span>
            <span className="text-slate-500">en banco activo</span>
          </div>
        </div>

        {/* Card 4: Entregas / Citas Próximas */}
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Entregas y Citas Próximas
              </div>
              <div className="mt-2 font-display text-3xl font-bold text-slate-900 tabular-nums">
                {upcomingDeliveriesCount}
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDEDED] text-[#D64545]">
              <CalendarClock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-[#D64545]">
              {readyForPickup.length} retiro(s)
            </span>
            <span className="text-slate-500">
              · {scopedAppointments.length} cita(s) programadas
            </span>
          </div>
        </div>
      </div>

      {/* Bottom 2-Column Split: 2/3 Recent Orders + 1/3 Quick Settings */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: Órdenes Recientes */}
        <div className="xl:col-span-2 rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 border-b border-[#D8E4EC]/70 rounded-t-2xl">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Órdenes Recientes
              </h2>
              <p className="text-xs text-slate-500">
                Seguimiento rápido de avance técnico y fechas de entrega
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToConsole}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#3E92CC] hover:text-[#0A2463] transition-colors"
            >
              <span>Ver todas en Consola 3 Zonas</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {scopedOrders.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Wrench className="h-9 w-9 text-slate-300 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                No hay órdenes registradas en esta sede
              </div>
              <button
                type="button"
                onClick={onNewOrder}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ingresar Primera Orden</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto xl:overflow-visible">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#D8E4EC]/70 bg-[#F4F6FB]/70 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-5 pr-2">Orden / Equipo</th>
                    <th className="py-3 px-2.5">Avance</th>
                    <th className="py-3 px-2.5">Estado</th>
                    <th className="py-3 px-2.5">Fecha / Saldo</th>
                    <th className="py-3 pl-2 pr-5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E4EC]/50 text-sm">
                  {scopedOrders.slice(0, 6).map((order) => {
                    const client = clientMap.get(order.client_id);
                    const asset = assetMap.get(order.asset_id);
                    const branch = branchMap.get(order.branch_id);
                    const progress = STAGE_PROGRESS[order.status];
                    const pill = STATUS_PILL_MAP[order.status];
                    const fin = calculateOrderFinancials(
                      order.items,
                      order.discount_amount,
                      order.apply_iva,
                      tenant.iva_rate,
                      order.payments
                    );
                    const dateDisplay = order.visit_scheduled_at
                      ? new Date(order.visit_scheduled_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        })
                      : new Date(order.created_at).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                        });

                    return (
                      <tr
                        key={order.id}
                        className="hover:bg-[#F4F6FB]/60 transition-colors"
                      >
                        <td className="py-3.5 pl-5 pr-2">
                          <button
                            type="button"
                            onClick={() => onOpenOrder(order.id)}
                            className="flex items-center gap-2.5 text-left group max-w-[205px] 2xl:max-w-[260px]"
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${sectorMeta.bg}`}
                            >
                              <SectorIcon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-xs font-bold text-[#0A2463] group-hover:text-[#3E92CC] whitespace-nowrap shrink-0">
                                  {order.folio}
                                </span>
                                <span className="text-xs font-semibold text-slate-800 truncate">
                                  {asset ? `${asset.brand} ${asset.model}` : 'Equipo'}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {client?.name ?? 'Cliente'} · {branch?.code ?? 'HQ'}
                              </div>
                            </div>
                          </button>
                        </td>

                        <td className="py-3.5 px-2.5 w-[118px]">
                          <div className="flex items-center gap-2">
                            <div className="w-14 h-2 rounded-full bg-[#F4F6FB] border border-[#D8E4EC]/60 overflow-hidden shrink-0">
                              <div
                                className="h-full rounded-full bg-[#3E92CC] transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums w-8 text-right shrink-0">
                              {progress}%
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${pill.classes}`}
                          >
                            {pill.label}
                          </span>
                        </td>

                        <td className="py-3.5 px-2.5 whitespace-nowrap">
                          <div className="text-xs font-medium text-slate-800 tabular-nums">
                            {dateDisplay}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                            Saldo: {formatCurrency(fin.balanceDue, tenant.currency)}
                          </div>
                        </td>

                        <td className="py-3.5 pl-2 pr-5 text-right relative">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenRowMenuId((cur) =>
                                cur === order.id ? null : order.id
                              )
                            }
                            aria-label={`Acciones para ${order.folio}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-[#F4F6FB] hover:text-slate-700"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {openRowMenuId === order.id && (
                            <>
                              <div
                                className="fixed inset-0 z-20"
                                onClick={() => setOpenRowMenuId(null)}
                                aria-hidden="true"
                              />
                              <div className="absolute right-4 top-12 w-48 rounded-xl bg-white border border-[#D8E4EC] shadow-lg py-1.5 z-30 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRowMenuId(null);
                                    onOpenOrder(order.id);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                                >
                                  <Wrench className="h-3.5 w-3.5 text-[#3E92CC]" />
                                  <span>Abrir en 3 Zonas</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenRowMenuId(null);
                                    onOpenPrintOrder(order.id);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-[#F4F6FB] flex items-center gap-2"
                                >
                                  <Printer className="h-3.5 w-3.5 text-[#0A2463]" />
                                  <span>Imprimir / Emitir .rpt</span>
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Ajustes Rápidos de Sucursal / Taller */}
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[#D8E4EC]/70">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Ajustes Rápidos
            </h2>
            <p className="text-xs text-slate-500">
              Sucursal, equipo, WhatsApp y base de datos
            </p>
          </div>

          <div className="divide-y divide-[#D8E4EC]/60">
            <button
              type="button"
              onClick={() => onGoToSettings('company')}
              className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F4F6FB]/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
                  <Settings className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    General
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Casa Matriz, sucursales, IVA ({tenant.iva_rate}%) y moneda ({tenant.currency})
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onGoToSettings('users')}
              className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F4F6FB]/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#0A2463]">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    Equipo y Roles
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Usuarios, técnicos y permisos de sede
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            <div className="px-6 py-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onGoToSettings('company')}
                className="flex items-center gap-3 min-w-0 text-left group"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EBF8F6] text-[#1B998B]">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 group-hover:text-[#0A2463]">
                    Notificaciones WhatsApp
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {tenant.whatsapp_enabled
                      ? 'Envíos y plantillas activas'
                      : 'Desactivado para esta empresa'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                role="switch"
                aria-checked={tenant.whatsapp_enabled}
                aria-label="Activar o desactivar notificaciones WhatsApp"
                onClick={onToggleWhatsApp}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  tenant.whatsapp_enabled ? 'bg-[#1B998B]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    tenant.whatsapp_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenSupabaseModal}
              className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F4F6FB]/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F4F6FB] text-[#0A2463] border border-[#D8E4EC]">
                  <Database className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    Avanzado &amp; BD Supabase
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Credenciales, Seed DB y Health Check
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={onGoToMigration}
              className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#F4F6FB]/70 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F4F6FB] text-[#3E92CC] border border-[#D8E4EC]">
                  <DatabaseZap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">
                    Migrador Legacy .mdb
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    Importar CPRepair.mdb / CSV · {lowStockCount} alertas stock
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
