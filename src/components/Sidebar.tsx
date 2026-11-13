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
import { getRolePermissions } from '../utils/erpLogic';

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

const DEMO_USER_BY_ROLE: Record<RoleType, { name: string; email: string }> = {
  superadmin: { name: 'Sofía Mendoza', email: 'superadmin@fixicloud.cl' },
  admin: { name: 'Rodrigo Fuentes', email: 'admin@globaltech.cl' },
  receptionist: { name: 'Camila Herrera', email: 'recepcion@globaltech.cl' },
  technician: { name: 'Diego Torres', email: 'diego.torres@globaltech.cl' },
};

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
  const perms = getRolePermissions(activeRole);
  const tenantBranches = branches.filter((b) => b.tenant_id === activeTenant.id);

  const displayUser = authSession
    ? { name: authSession.full_name, email: authSession.email }
    : DEMO_USER_BY_ROLE[activeRole];

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
        className={`fixed inset-y-0 left-0 z-50 w-64 flex-col bg-[#0A2463] text-white border-r border-[#1E3A8A]/60 lg:static ${
          mobileOpen ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Header with Geometric White Logo */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 text-white">
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
            <div className="min-w-0">
              <div className="font-display text-base font-bold tracking-tight text-white truncate">
                FIXICLOUD
              </div>
              <div className="text-[11px] text-[#D8E4EC]/75 truncate">
                Service &amp; Repair ERP
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú lateral"
            className="rounded-lg p-1.5 text-white/70 hover:bg-[#1E3A8A] hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Compact Tenant & Branch Selector */}
        <div className="px-4 pb-4 border-b border-white/10 space-y-2">
          <div className="rounded-xl bg-[#1E3A8A]/60 border border-white/10 px-2.5 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#D8E4EC]/70">
                Empresa Activa
              </span>
              {perms.canCreateTenant && (
                <button
                  type="button"
                  onClick={onOpenNewTenant}
                  title="Crear nueva empresa (Tenant)"
                  aria-label="Crear nueva empresa"
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-[#3E92CC] bg-white/10 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Nueva</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-[#3E92CC] shrink-0" />
              <label htmlFor="tenant-selector" className="sr-only">
                Empresa activa
              </label>
              <select
                id="tenant-selector"
                value={activeTenant.id}
                onChange={(e) => onSelectTenant(e.target.value)}
                className="w-full bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer truncate"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#0A2463] text-white">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
              <MapPin className="h-3 w-3 text-[#1B998B] shrink-0" />
              <span className="text-[11px] text-[#D8E4EC]/85 truncate">
                {activeBranchId === 'ALL'
                  ? `Consolidado (${tenantBranches.length} sedes)`
                  : tenantBranches.find((b) => b.id === activeBranchId)?.name ?? 'Sucursal'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav
          aria-label="Navegación principal"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => handleNav(item.id, item.disabled)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1E3A8A] text-white shadow-sm'
                    : item.disabled
                    ? 'text-white/30 cursor-not-allowed'
                    : 'text-[#D8E4EC]/85 hover:bg-[#1E3A8A]/50 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-[#D8E4EC]/75'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${
                      item.badge.endsWith('!')
                        ? 'bg-[#D64545]/25 text-red-200'
                        : isActive
                        ? 'bg-[#3E92CC] text-white'
                        : 'bg-white/10 text-[#D8E4EC]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer: Avatar + User + Role Badge + Dropdown */}
        <div className="border-t border-white/10 p-3.5 space-y-2.5">
          {showUserMenu && (
            <div className="rounded-xl bg-[#1E3A8A] border border-white/15 p-3 space-y-2.5">
              <div>
                <label
                  htmlFor="role-selector"
                  className="block text-[10px] font-medium uppercase tracking-wider text-[#D8E4EC]/75 mb-1"
                >
                  Cambiar Rol Operativo
                </label>
                <select
                  id="role-selector"
                  value={activeRole}
                  onChange={(e) => onSelectRole(e.target.value as RoleType)}
                  className="w-full rounded-lg bg-[#0A2463] border border-white/15 px-2.5 py-1.5 text-xs font-medium text-white focus:border-[#3E92CC] focus:outline-none"
                >
                  <option value="superadmin">SuperAdmin Global</option>
                  <option value="admin">Admin de Taller</option>
                  <option value="receptionist">Recepcionista</option>
                  <option value="technician">Técnico</option>
                </select>
              </div>
              <div className="text-[11px] leading-snug text-[#D8E4EC]/80">
                {perms.description}
              </div>
              <div className="pt-1 border-t border-white/10 flex items-center justify-between">
                {authSession ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSignOut();
                      setShowUserMenu(false);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Cerrar Sesión SaaS</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenAuthModal();
                      setShowUserMenu(false);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3E92CC] hover:bg-[#3178A8] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Acceso / Registro SaaS</span>
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-expanded={showUserMenu}
            className="w-full flex items-center justify-between gap-2.5 rounded-xl bg-white/5 hover:bg-[#1E3A8A]/70 border border-white/10 px-2.5 py-2 text-left transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3E92CC] text-xs font-bold text-white">
                {getInitials(displayUser.name)}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {displayUser.name}
                </div>
                <div className="text-[11px] text-[#D8E4EC]/75 truncate">
                  {displayUser.email}
                </div>
                <div className="mt-1 inline-flex items-center rounded-full bg-[#1B998B]/25 border border-[#1B998B]/50 px-2 py-0.5 text-[10px] font-semibold text-[#6EE7D8]">
                  {perms.label}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-[#D8E4EC]/70 shrink-0 transition-transform ${
                showUserMenu ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </aside>
    </>
  );
};
