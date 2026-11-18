import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  ChevronDown,
  ClipboardList,
  DatabaseZap,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Users,
  X,
} from 'lucide-react';
import type {
  AuthSessionUser,
  Branch,
  NavSection,
  RoleType,
  Tenant,
} from '../types/erp';
import {
  canViewGlobalScope,
  getRolePermissions,
  getVisibleTenantsForScope,
} from '../utils/erpLogic';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenReports: () => void;
  activeRole: RoleType;
  onSelectRole: (role: RoleType) => void;
  tenants: Tenant[];
  activeTenant: Tenant;
  onSelectTenant: (tenantId: string) => void;
  onOpenNewTenant: () => void;
  branches: Branch[];
  activeBranchId: string;
  onSelectBranch: (branchId: string) => void;
  authSession: AuthSessionUser | null;
  onOpenAuthModal: () => void;
  onSignOut: () => void;
  openOrdersCount: number;
  todayAppointmentsCount: number;
  lowStockCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  onOpenReports,
  activeRole,
  onSelectRole,
  tenants,
  activeTenant,
  onSelectTenant,
  onOpenNewTenant,
  branches,
  activeBranchId,
  onSelectBranch,
  authSession,
  onOpenAuthModal,
  onSignOut,
  openOrdersCount,
  todayAppointmentsCount,
  lowStockCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const compact = isCollapsed && !mobileOpen;
  const perms = getRolePermissions(activeRole);
  const tenantBranches = branches.filter((b) => b.tenant_id === activeTenant.id);
  const allowGlobalScope = canViewGlobalScope(activeRole, authSession?.role);
  const isTenantLockedBySession = !allowGlobalScope;
  const isRoleLockedBySession = Boolean(
    authSession && authSession.role !== 'superadmin'
  );
  const selectableTenants = getVisibleTenantsForScope(
    tenants,
    activeRole,
    authSession,
    activeTenant.id
  );

  const displayUser = {
    name: authSession?.full_name ?? 'Usuario',
    username: authSession ? `@${authSession.username}` : '',
  };

  const navItems: Array<{
    id: NavSection | 'reports';
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    disabled?: boolean;
  }> = [
    {
      id: 'dashboard',
      label: 'Resumen (Overview)',
      icon: LayoutDashboard,
    },
    {
      id: 'console',
      label: 'Órdenes de Taller',
      icon: ClipboardList,
      badge: openOrdersCount > 0 ? String(openOrdersCount) : undefined,
    },
    {
      id: 'appointments',
      label: 'Agenda & Domicilios',
      icon: Calendar,
      badge: todayAppointmentsCount > 0 ? String(todayAppointmentsCount) : undefined,
    },
    {
      id: 'reports',
      label: 'Reportes (.rpt)',
      icon: FileText,
    },
    {
      id: 'inventory',
      label: 'Stock & Préstamos',
      icon: Package,
      badge: lowStockCount > 0 ? `${lowStockCount}!` : undefined,
    },
    {
      id: 'clients',
      label: 'Clientes y Equipos',
      icon: Users,
    },
    {
      id: 'settings',
      label: 'Configuración',
      icon: Building2,
      disabled: !perms.canEditSettings && activeRole !== 'superadmin',
    },
    {
      id: 'migration',
      label: 'Migrador .mdb',
      icon: DatabaseZap,
      disabled: !perms.canEditSettings && activeRole !== 'superadmin',
    },
    {
      id: 'track',
      label: 'Portal Público (/track)',
      icon: ExternalLink,
    },
  ];

  const handleNav = (id: NavSection | 'reports', disabled?: boolean) => {
    if (disabled) return;
    if (id === 'reports') {
      onOpenReports();
      onCloseMobile();
      return;
    }
    onSelectSection(id);
    onCloseMobile();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0A2463]/60 backdrop-blur-[1px] lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex-col bg-[#0A2463] text-white border-r border-[#1E3A8A]/70 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 transition-[width] duration-200 ${
          compact ? 'w-64 lg:w-[76px]' : 'w-64'
        } ${mobileOpen ? 'flex' : 'hidden lg:flex'}`}
      >
        {/* Header with Geometric White Logo */}
        <div
          className={`flex items-center ${
            compact ? 'flex-col gap-2 px-2 pt-4 pb-3' : 'justify-between px-4 pt-5 pb-4'
          }`}
        >
          <div className={`flex items-center gap-3 min-w-0 ${compact ? 'justify-center' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 text-white shadow-sm">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path
                  d="M4 7.5L12 3L20 7.5V16.5L12 21L4 16.5V7.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12L11.2 14.2L15.5 9.8"
                  stroke="#1B998B"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            {!compact && (
              <div className="min-w-0">
                <div className="font-display text-base font-bold tracking-tight text-white truncate">
                  FixiCloud
                </div>
                <div className="text-[11px] text-[#D8E4EC]/70 truncate">
                  Service &amp; Repair FixiCloud
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              title={compact ? 'Expandir menú lateral' : 'Minimizar menú lateral'}
              aria-label={compact ? 'Expandir menú lateral' : 'Minimizar menú lateral'}
              className="hidden lg:inline-flex rounded-lg p-1.5 text-[#D8E4EC]/70 hover:bg-[#1E3A8A] hover:text-white transition-colors"
            >
              {compact ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Cerrar menú lateral"
              className="rounded-xl p-1.5 text-white/70 hover:bg-[#1E3A8A] hover:text-white lg:hidden transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Compact Tenant & Branch Selector */}
        <div className={`${compact ? 'px-2.5 pb-3' : 'px-4 pb-4'} border-b border-white/10`}>
          {compact ? (
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              title={`Empresa activa: ${activeTenant.name}`}
              aria-label={`Empresa activa: ${activeTenant.name}`}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E3A8A]/55 hover:bg-[#1E3A8A] border border-white/10 text-[#3E92CC] hover:text-white transition-colors"
            >
              <Building2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="rounded-xl bg-[#1E3A8A]/55 border border-white/10 px-3 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#D8E4EC]/70">
                  Empresa Activa
                </span>
                {allowGlobalScope && perms.canCreateTenant && (
                  <button
                    type="button"
                    onClick={onOpenNewTenant}
                    title="Crear nueva empresa (Tenant)"
                    aria-label="Crear nueva empresa"
                    className="inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-[10px] font-semibold text-[#EBF4FA] bg-white/10 hover:bg-[#3E92CC] hover:text-white transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Nueva</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-[#3E92CC] shrink-0" />
                <label htmlFor="tenant-selector" className="sr-only">
                  Empresa activa
                </label>
                <select
                  id="tenant-selector"
                  value={activeTenant.id}
                  disabled={isTenantLockedBySession}
                  onChange={(e) => onSelectTenant(e.target.value)}
                  className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer disabled:cursor-default truncate"
                >
                  {selectableTenants.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[#0A2463] text-white">
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <MapPin className="h-3.5 w-3.5 text-[#1B998B] shrink-0" />
                <span className="text-[11px] text-[#D8E4EC]/85 truncate">
                  {activeBranchId === 'ALL'
                    ? `Consolidado (${tenantBranches.length} sedes)`
                    : tenantBranches.find((b) => b.id === activeBranchId)?.name ?? 'Sucursal'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav
          aria-label="Navegación principal"
          className={`flex-1 overflow-y-auto py-4 space-y-1 ${compact ? 'px-2.5' : 'px-3'}`}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <React.Fragment key={item.id}>
                {item.id === 'settings' && (
                  <div className="my-2.5 border-t border-white/10" aria-hidden="true" />
                )}
                <button
                  type="button"
                  disabled={item.disabled}
                  title={compact ? item.label : undefined}
                  aria-label={item.label}
                  onClick={() => handleNav(item.id, item.disabled)}
                  className={`relative w-full flex items-center ${
                    compact ? 'justify-center px-2 py-2.5' : 'justify-between gap-2.5 px-3 py-2.5'
                  } rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1E3A8A] text-white shadow-sm ring-1 ring-white/10'
                      : item.disabled
                      ? 'text-white/30 cursor-not-allowed'
                      : 'text-[#D8E4EC]/80 hover:bg-[#1E3A8A]/50 hover:text-white'
                  }`}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-[#3E92CC]"
                      aria-hidden="true"
                    />
                  )}
                  <span className={`flex items-center min-w-0 ${compact ? 'justify-center' : 'gap-2.5'}`}>
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#6EC1F8]' : 'text-[#D8E4EC]/70'
                      }`}
                    />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </span>
                  {!compact && item.badge && (
                    <span
                      className={`font-mono tabular-nums text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
                        item.badge.endsWith('!')
                          ? 'bg-[#D64545]/25 text-red-200 border border-[#D64545]/40'
                          : isActive
                          ? 'bg-[#3E92CC] text-white'
                          : 'bg-white/10 text-[#D8E4EC]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {compact && item.badge && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full ${
                        item.badge.endsWith('!') ? 'bg-[#D64545]' : 'bg-[#3E92CC]'
                      }`}
                    />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Sidebar Footer: Avatar + User + Role Label + Dropdown */}
        <div className={`border-t border-white/10 space-y-2.5 ${compact ? 'p-2.5' : 'p-3.5'}`}>
          {!compact && showUserMenu && (
            <div className="rounded-xl bg-[#1E3A8A] border border-white/15 p-3 space-y-2.5 shadow-lg">
              <div>
                <label
                  htmlFor="role-selector"
                  className="block text-[10px] font-semibold uppercase tracking-wider text-[#D8E4EC]/75 mb-1"
                >
                  {isRoleLockedBySession ? 'Rol de Sesión Activa' : 'Cambiar Rol Operativo'}
                </label>
                <select
                  id="role-selector"
                  value={activeRole}
                  disabled={isRoleLockedBySession}
                  onChange={(e) => onSelectRole(e.target.value as RoleType)}
                  className="w-full rounded-xl bg-[#0A2463] border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-75 focus:border-[#3E92CC] focus:outline-none"
                >
                  {(!authSession || authSession.role === 'superadmin') && (
                    <option value="superadmin">SuperAdmin Global</option>
                  )}
                  <option value="admin">Admin de Taller</option>
                  <option value="receptionist">Recepcionista</option>
                  <option value="technician">Técnico</option>
                </select>
              </div>
              <div className="text-[11px] leading-snug text-[#D8E4EC]/80">
                {perms.description}
              </div>
              <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenAuthModal();
                    setShowUserMenu(false);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-2.5 py-2 text-xs font-semibold text-white transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Cambiar de Usuario</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSignOut();
                    setShowUserMenu(false);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-2.5 py-2 text-xs font-semibold text-white transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Cerrar Sesión</span>
                </button>
              </div>
            </div>
          )}

          {!compact && (
            <div className="pt-1 text-[10px] text-[#D8E4EC]/65 text-center">
              Desarrollado por{' '}
              <a
                href="https://www.gtitech.cl"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#6EE7D8] hover:underline"
              >
                Global TI SPA
              </a>
            </div>
          )}

          {compact ? (
            <button
              type="button"
              onClick={() => {
                setIsCollapsed(false);
                setShowUserMenu(true);
              }}
              title={`${displayUser.name} (${displayUser.username}) · ${perms.label}`}
              aria-label={`Usuario ${displayUser.name}`}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-xs font-bold text-white shadow-sm transition-colors"
            >
              {getInitials(displayUser.name)}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              aria-expanded={showUserMenu}
              className="w-full flex items-center justify-between gap-2.5 rounded-xl bg-[#1E3A8A]/45 hover:bg-[#1E3A8A]/80 border border-white/10 px-3 py-2.5 text-left transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3E92CC] text-xs font-bold text-white shadow-sm">
                  {getInitials(displayUser.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {displayUser.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] min-w-0">
                    <span className="font-mono text-[#D8E4EC]/75 shrink-0">
                      {displayUser.username}
                    </span>
                    <span className="text-white/30" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-semibold text-[#6EE7D8] truncate">
                      {perms.label}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-[#D8E4EC]/70 shrink-0 transition-transform ${
                  showUserMenu ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
