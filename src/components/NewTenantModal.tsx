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
  }) => void;
}

export const NewTenantModal: React.FC<NewTenantModalProps> = ({
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [sector, setSector] = useState<IndustrySector>('mobile');
  const [city, setCity] = useState('Santiago');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      tax_id: taxId.trim() || '76.000.000-0',
      sector,
      city: city.trim() || 'Santiago',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-tenant-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-[#D8E4EC]/70 p-6 shadow-2xl">
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nombre o Razón Social *
            </label>
            <input
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                RUT / ID Tributario
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="77.123.456-K"
                className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm font-mono focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ciudad Casa Matriz
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Santiago"
                className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm focus:border-[#3E92CC] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rubro Principal (Campos Dinámicos)
            </label>
            <select
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

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#D8E4EC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white transition-colors"
            >
              Crear Empresa + Casa Matriz
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
