import React, { useState } from 'react';
import { Building2, X } from 'lucide-react';
import type { IndustrySector } from '../types/erp';
import { SECTOR_LABELS } from '../utils/erpLogic';

interface NewTenantModalProps {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    tax_id: string;
    sector: IndustrySector;
    city: string;
    adminUsername: string;
    adminPassword: string;
    adminFullName: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export const NewTenantModal: React.FC<NewTenantModalProps> = ({
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sector, setSector] = useState<IndustrySector>('mobile');
  const [city, setCity] = useState('Santiago');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const cleanName = name.trim();
    const cleanUsername = adminUsername.trim().replace(/^@+/, '');
    const cleanPassword = adminPassword.trim();

    if (!cleanName) {
      setFormError('Ingresa el nombre o razón social de la empresa.');
      return;
    }
    if (cleanUsername.length < 3) {
      setFormError('El usuario administrador debe tener al menos 3 caracteres.');
      return;
    }
    if (cleanPassword.length < 6) {
      setFormError('La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await onCreate({
        name: cleanName,
        tax_id: taxId.trim() || '76.000.000-0',
        sector,
        city: city.trim() || 'Santiago',
        adminUsername: cleanUsername,
        adminPassword: cleanPassword,
        adminFullName: adminFullName.trim() || `Administrador ${cleanName}`,
      });
      if (!res.ok) {
        setFormError(
          res.error ?? 'No se pudo registrar la empresa en Supabase.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-tenant-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D8E4EC]/70 p-6 shadow-2xl my-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#D8E4EC]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
              <Building2 className="h-4 w-4" />
            </div>
            <h2 id="new-tenant-title" className="text-base font-semibold text-slate-900">
              Nueva Empresa (Tenant)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de nueva empresa"
            className="rounded-lg p-1 text-slate-400 hover:bg-[#F4F6FB] hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {formError && (
            <div
              role="alert"
              className="rounded-xl bg-[#FDEDED] border border-[#D64545]/30 px-3 py-2 text-xs font-semibold text-[#D64545]"
            >
              {formError}
            </div>
          )}

          <div>
            <label
              htmlFor="new-tenant-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Nombre o Razón Social *
            </label>
            <input
              id="new-tenant-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: TecnoMóvil Express SpA"
              className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm focus:border-[#3E92CC] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-tenant-taxid"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                RUT / ID Tributario
              </label>
              <input
                id="new-tenant-taxid"
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="77.123.456-K"
                className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm font-mono focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-tenant-city"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Ciudad Casa Matriz
              </label>
              <input
                id="new-tenant-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Santiago"
                className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-tenant-sector"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Rubro Principal (Campos Dinámicos)
            </label>
            <select
              id="new-tenant-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value as IndustrySector)}
              className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm focus:border-[#3E92CC] focus:outline-none"
            >
              {(Object.keys(SECTOR_LABELS) as IndustrySector[]).map((sec) => (
                <option key={sec} value={sec}>
                  {SECTOR_LABELS[sec]}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl bg-[#F4F6FB] border border-[#D8E4EC] p-3.5 space-y-3">
            <div className="text-xs font-semibold text-[#0A2463]">
              Cuenta Inicial de Administrador de Empresa *
            </div>
            <div>
              <label
                htmlFor="new-tenant-admin-fullname"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Nombre completo (opcional)
              </label>
              <input
                id="new-tenant-admin-fullname"
                type="text"
                value={adminFullName}
                onChange={(e) => setAdminFullName(e.target.value)}
                placeholder="Ej: Carolina Mendoza"
                className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-1.5 text-xs focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="new-tenant-admin-user"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Usuario (mín. 3) *
                </label>
                <input
                  id="new-tenant-admin-user"
                  type="text"
                  required
                  minLength={3}
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin_empresa"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-1.5 text-xs font-mono focus:border-[#3E92CC] focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="new-tenant-admin-pass"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Contraseña (mín. 6) *
                </label>
                <input
                  id="new-tenant-admin-pass"
                  type="password"
                  required
                  minLength={6}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-1.5 text-xs font-mono focus:border-[#3E92CC] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-xl border border-[#D8E4EC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
            >
              {submitting ? 'Registrando en Supabase...' : 'Crear Empresa + Casa Matriz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
