import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  LogIn,
  MapPin,
  Menu,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  Appointment,
  AuthSessionUser,
  Branch,
  CatalogItem,
  NavSection,
  WorkOrder,
} from '../types/erp';

interface ContextHeaderProps {
  activeSection: NavSection;
  branches: Branch[];
  activeTenantId: string;
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  globalSearch: string;
  onGlobalSearchChange: (q: string) => void;
  onSubmitGlobalSearch: (q: string) => void;
  authSession: AuthSessionUser | null;
  onOpenAuthModal: () => void;
  lowStockItems: CatalogItem[];
  readyOrders: WorkOrder[];
  scheduledAppointments: Appointment[];
  onNavigateAlert: (target: { section: NavSection; orderId?: string }) => void;
  onOpenMobileMenu: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Overview',
  console: 'Órdenes de Taller (3 Zonas)',
  appointments: 'Agenda & Domicilios',
  clients: 'Clientes y Parque de Equipos',
  inventory: 'Stock & Préstamos',
  settings: 'Configuración y Usuarios',
  migration: 'Migrador Legacy .mdb',
  track: 'Portal Público (/track)',
};

export const ContextHeader: React.FC<ContextHeaderProps> = ({
  activeSection,
  branches,
  activeTenantId,
  activeBranchId,
  onSelectBranch,
  globalSearch,
  onGlobalSearchChange,
  onSubmitGlobalSearch,
  authSession,
  onOpenAuthModal,
  lowStockItems,
  readyOrders,
  scheduledAppointments,
  onNavigateAlert,
  onOpenMobileMenu,
}) => {
  const [showAlerts, setShowAlerts] = useState(false);

  const tenantBranches = branches.filter((b) => b.tenant_id === activeTenantId);
  const isBranchLockedBySession = Boolean(
    authSession && authSession.role !== 'superadmin' && authSession.branch_id
  );
  const visibleBranches = isBranchLockedBySession
    ? tenantBranches.filter((b) => b.id === authSession?.branch_id)
    : tenantBranches;
  const totalAlerts =
    lowStockItems.length + readyOrders.length + scheduledAppointments.length;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitGlobalSearch(globalSearch);
  };

  return (
    <header className="bg-white border-b border-[#D8E4EC] px-4 lg:px-6 py-3 sticky top-0 z-30">
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        {/* Left: Mobile Trigger + Dynamic Page Title + Branch Quick Switcher */}
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menú lateral"
            className="rounded-xl border border-[#D8E4EC] p-2 text-slate-700 hover:bg-[#F4F6FB] lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <h2 className="font-display text-lg lg:text-xl font-semibold text-slate-900 truncate">
            {SECTION_TITLES[activeSection]}
          </h2>

          <div className="hidden sm:flex items-center gap-1.5 rounded-xl bg-[#F4F6FB] border border-[#D8E4EC] px-2.5 py-1.5">
            <MapPin className="h-3.5 w-3.5 text-[#3E92CC] shrink-0" />
            <label htmlFor="branch-selector" className="sr-only">
              Sucursal o Casa Matriz
            </label>
            <select
              id="branch-selector"
              value={activeBranchId}
              disabled={isBranchLockedBySession}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none max-w-[180px] truncate cursor-pointer disabled:cursor-default"
            >
              {!isBranchLockedBySession && (
                <option value="ALL">Casa Matriz — Todas</option>
              )}
              {visibleBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.is_hq ? `${b.name} [HQ]` : b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Global Search + Notification Bell + Supabase/Demo Status */}
        <div className="flex items-center gap-2 w-full lg:w-auto justify-end min-w-0">
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-1 min-w-0 sm:flex-initial sm:w-64 lg:w-72"
          >
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => onGlobalSearchChange(e.target.value)}
              placeholder="Buscar folio, serie, cliente..."
              aria-label="Búsqueda rápida de órdenes"
              className="w-full rounded-full bg-[#F4F6FB] border border-[#D8E4EC] pl-9 pr-8 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => onGlobalSearchChange('')}
                aria-label="Limpiar búsqueda rápida"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>

          {/* Notification Bell with Live Alert Popover */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAlerts((v) => !v)}
              aria-label="Notificaciones del taller"
              aria-expanded={showAlerts}
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#D8E4EC] bg-[#F4F6FB] text-slate-600 hover:bg-white hover:border-[#3E92CC] hover:text-[#0A2463] transition-colors"
            >
              <Bell className="h-4 w-4" />
              {totalAlerts > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#3E92CC] ring-2 ring-white" />
              )}
            </button>

            {showAlerts && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowAlerts(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-white border border-[#D8E4EC] shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#D8E4EC] flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Alertas Operativas ({totalAlerts})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAlerts(false)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Cerrar alertas"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#D8E4EC]/50">
                    {totalAlerts === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500">
                        Sin alertas pendientes en esta sucursal.
                      </div>
                    ) : (
                      <>
                        {readyOrders.slice(0, 3).map((ord) => (
                          <button
                            key={ord.id}
                            type="button"
                            onClick={() => {
                              setShowAlerts(false);
                              onNavigateAlert({ section: 'console', orderId: ord.id });
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-[#F4F6FB] flex items-start gap-2.5"
                          >
                            <CheckCircle2 className="h-4 w-4 text-[#1B998B] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                Lista para retiro: {ord.folio}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                Código {ord.tracking_code} · Notificar entrega
                              </div>
                            </div>
                          </button>
                        ))}
                        {scheduledAppointments.slice(0, 3).map((apt) => (
                          <button
                            key={apt.id}
                            type="button"
                            onClick={() => {
                              setShowAlerts(false);
                              onNavigateAlert({ section: 'appointments' });
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-[#F4F6FB] flex items-start gap-2.5"
                          >
                            <Calendar className="h-4 w-4 text-[#3E92CC] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                Cita: {apt.subject}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {apt.date} · {apt.start_time} · {apt.technician}
                              </div>
                            </div>
                          </button>
                        ))}
                        {lowStockItems.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setShowAlerts(false);
                              onNavigateAlert({ section: 'inventory' });
                            }}
                            className="w-full px-4 py-2.5 text-left hover:bg-[#F4F6FB] flex items-start gap-2.5"
                          >
                            <AlertTriangle className="h-4 w-4 text-[#D64545] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                Stock bajo: {item.name}
                              </div>
                              <div className="text-[11px] font-mono text-[#D64545]">
                                Quedan {item.stock_qty} u. (mín. {item.min_stock})
                              </div>
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Auth Session Pill */}
          <button
            type="button"
            onClick={onOpenAuthModal}
            aria-label={authSession ? `Usuario activo @${authSession.username}` : 'Iniciar Sesión'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 sm:px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              authSession
                ? 'bg-[#0A2463] border-[#0A2463] text-white hover:bg-[#1E3A8A]'
                : 'bg-white border-[#D8E4EC] text-[#0A2463] hover:bg-[#F4F6FB]'
            }`}
          >
            {authSession ? (
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#6EE7D8]" />
            ) : (
              <LogIn className="h-3.5 w-3.5 shrink-0 text-[#3E92CC]" />
            )}
            <span className="hidden sm:inline font-mono">
              {authSession ? `@${authSession.username}` : 'Iniciar Sesión'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
