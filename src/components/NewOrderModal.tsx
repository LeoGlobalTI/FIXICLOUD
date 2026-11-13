import React, { useState } from 'react';
import { X } from 'lucide-react';
import type {
  Branch,
  Client,
  CustomerAsset,
  ServiceModality,
  Tenant,
  WorkOrder,
} from '../types/erp';
import {
  generateNextFolio,
  generateTrackingCode,
  getSectorCustomFields,
} from '../utils/erpLogic';

export interface NewOrderPrefill {
  clientId?: string;
  branchId?: string;
  modality?: ServiceModality;
  visitAddress?: string;
  visitScheduledAt?: string;
  technician?: string;
  symptoms?: string;
  sourceAppointmentId?: string;
}

interface NewOrderModalProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  clients: Client[];
  assets: CustomerAsset[];
  existingOrders: WorkOrder[];
  initialPrefill?: NewOrderPrefill | null;
  onClose: () => void;
  onCreate: (payload: {
    newClient?: Client;
    newAsset?: CustomerAsset;
    order: WorkOrder;
    sourceAppointmentId?: string;
  }) => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  tenant,
  branches,
  activeBranchId,
  clients,
  assets,
  existingOrders,
  initialPrefill,
  onClose,
  onCreate,
}) => {
  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const defaultBranch =
    initialPrefill?.branchId ??
    (activeBranchId !== 'ALL'
      ? activeBranchId
      : tenantBranches.find((b) => b.is_hq)?.id ?? tenantBranches[0]?.id ?? '');

  const tenantClients = clients.filter((c) => c.tenant_id === tenant.id);

  const [branchId, setBranchId] = useState(defaultBranch);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    initialPrefill?.clientId || tenantClients.length > 0 ? 'existing' : 'new'
  );
  const [selectedClientId, setSelectedClientId] = useState(
    initialPrefill?.clientId ?? tenantClients[0]?.id ?? ''
  );

  // New client fields
  const [clientName, setClientName] = useState('');
  const [clientRut, setClientRut] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAddress, setClientAddress] = useState('');

  // Asset fields
  const [category, setCategory] = useState(
    tenant.sector === 'machinery'
      ? 'Generador Eléctrico'
      : tenant.sector === 'mobile'
      ? 'Smartphone'
      : 'Notebook'
  );
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialImei, setSerialImei] = useState('');
  const [passwordPattern, setPasswordPattern] = useState('');
  const [customAttrs, setCustomAttrs] = useState<Record<string, string>>({});

  // Order details
  const [modality, setModality] = useState<ServiceModality>(
    initialPrefill?.modality ?? 'workshop'
  );
  const [visitAddress, setVisitAddress] = useState(initialPrefill?.visitAddress ?? '');
  const [visitScheduledAt, setVisitScheduledAt] = useState(
    initialPrefill?.visitScheduledAt ?? ''
  );
  const [accessories, setAccessories] = useState('');
  const [entryCondition, setEntryCondition] = useState('');
  const [symptoms, setSymptoms] = useState(initialPrefill?.symptoms ?? '');
  const [technician, setTechnician] = useState(initialPrefill?.technician ?? 'Diego Torres');

  const sectorFields = getSectorCustomFields(tenant.sector);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim() || !model.trim() || !symptoms.trim()) return;
    if (clientMode === 'new' && !clientName.trim()) return;

    const now = new Date().toISOString();
    let finalClientId = selectedClientId;
    let newClientObj: Client | undefined;

    if (clientMode === 'new') {
      finalClientId = `cli-${Date.now()}`;
      newClientObj = {
        id: finalClientId,
        tenant_id: tenant.id,
        name: clientName.trim(),
        rut: clientRut.trim() || 'S/R',
        phone: clientPhone.trim() || '+56 9 0000 0000',
        email: clientEmail.trim(),
        address: clientAddress.trim(),
        city: tenantBranches.find((b) => b.id === branchId)?.city ?? 'Santiago',
      };
    }

    const assetId = `ast-${Date.now()}`;
    const newAssetObj: CustomerAsset = {
      id: assetId,
      tenant_id: tenant.id,
      client_id: finalClientId,
      category: category.trim() || 'Equipo',
      brand: brand.trim(),
      model: model.trim(),
      serial_imei: serialImei.trim() || 'S/N-PENDIENTE',
      password_pattern: passwordPattern.trim() || undefined,
      custom_attributes: customAttrs,
    };

    const folio = generateNextFolio(tenant.folio_prefix, existingOrders, tenant.id);
    const order: WorkOrder = {
      id: `wo-${Date.now()}`,
      tenant_id: tenant.id,
      branch_id: branchId,
      folio,
      tracking_code: generateTrackingCode(),
      client_id: finalClientId,
      asset_id: assetId,
      status: 'received',
      modality,
      visit_address: modality === 'home_service' ? visitAddress.trim() : undefined,
      visit_scheduled_at: modality === 'home_service' ? visitScheduledAt : undefined,
      accessories_received: accessories.trim() || 'Sin accesorios adicionales',
      entry_condition: entryCondition.trim() || 'Ingreso estándar sin observaciones críticas',
      reported_symptoms: symptoms.trim(),
      technical_diagnosis: '',
      work_performed: '',
      parts_and_observations: '',
      assigned_technician: technician.trim() || 'Por asignar',
      apply_iva: true,
      discount_amount: 0,
      items: [],
      payments: [],
      photos: [],
      warranty_days: tenant.warranty_days ?? 90,
      created_at: now,
      updated_at: now,
    };

    onCreate({
      newClient: newClientObj,
      newAsset: newAssetObj,
      order,
      sourceAppointmentId: initialPrefill?.sourceAppointmentId,
    });
  };

  const existingClientAssets = assets.filter((a) => a.client_id === selectedClientId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-order-title"
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-2xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D8E4EC]">
          <div>
            <h2 id="new-order-title" className="text-base font-bold text-slate-900">
              {initialPrefill?.sourceAppointmentId
                ? `Convertir Cita en Orden de Trabajo — ${tenant.name}`
                : `Ingreso Rápido de Orden de Trabajo — ${tenant.name}`}
            </h2>
            <p className="text-xs text-slate-500">
              Se generará Folio automático ({tenant.folio_prefix}) y Código de Seguimiento Público
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de nueva orden"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Branch & Modality */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sucursal de Ingreso
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              >
                {tenantBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.is_hq ? `${b.name} [HQ]` : b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Modalidad del Servicio
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setModality('workshop')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    modality === 'workshop'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En Taller / Mostrador
                </button>
                <button
                  type="button"
                  onClick={() => setModality('home_service')}
                  className={`py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    modality === 'home_service'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Domicilio / Terreno
                </button>
              </div>
            </div>
          </div>

          {modality === 'home_service' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg bg-cyan-50/60 border border-cyan-200 p-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dirección de Visita en Terreno
                </label>
                <input
                  type="text"
                  value={visitAddress}
                  onChange={(e) => setVisitAddress(e.target.value)}
                  placeholder="Ej: Av. Alemania 540, Oficina 3"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fecha y Hora Programada
                </label>
                <input
                  type="datetime-local"
                  value={visitScheduledAt}
                  onChange={(e) => setVisitScheduledAt(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Client Section */}
          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-900">1. Datos del Cliente</h3>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setClientMode('existing')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                    clientMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Cliente Existente
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode('new')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                    clientMode === 'new'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  + Nuevo Cliente
                </button>
              </div>
            </div>

            {clientMode === 'existing' ? (
              <div className="space-y-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                >
                  {tenantClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.rut}) — {c.phone}
                    </option>
                  ))}
                </select>
                {existingClientAssets.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Equipos previos del cliente:</span>
                    {existingClientAssets.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setCategory(a.category);
                          setBrand(a.brand);
                          setModel(a.model);
                          setSerialImei(a.serial_imei);
                          setPasswordPattern(a.password_pattern ?? '');
                          setCustomAttrs(a.custom_attributes);
                        }}
                        className="rounded border border-slate-300 bg-slate-50 px-2 py-0.5 font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Usar {a.brand} {a.model} ({a.serial_imei})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nombre completo / Razón social *"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="text"
                  value={clientRut}
                  onChange={(e) => setClientRut(e.target.value)}
                  placeholder="RUT / ID Tributario"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Teléfono WhatsApp (Ej: +56 9 8765 4321)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="Correo electrónico"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Dirección"
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Equipment + Dynamic Sector Attributes */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-900">
              2. Equipo / Activo ({tenant.sector})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Categoría (Notebook, Smartphone...)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Marca *"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Modelo *"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={serialImei}
                onChange={(e) => setSerialImei(e.target.value)}
                placeholder="N° de Serie / IMEI"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={passwordPattern}
                onChange={(e) => setPasswordPattern(e.target.value)}
                placeholder="Clave / Patrón desbloqueo"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Técnico asignado"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
              {sectorFields.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    {field.label}
                  </label>
                  <input
                    type="text"
                    value={customAttrs[field.key] ?? ''}
                    onChange={(e) =>
                      setCustomAttrs((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Symptoms & Accessories */}
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-900">
              3. Recepción y Síntomas Reportados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                placeholder="Accesorios recibidos (cargador, funda, cables...)"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
              <input
                type="text"
                value={entryCondition}
                onChange={(e) => setEntryCondition(e.target.value)}
                placeholder="Estado físico / estético de entrada"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Síntomas reportados por el cliente *
              </label>
              <textarea
                required
                rows={3}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Describe detalladamente la falla que reporta el cliente..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E4EC]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#D8E4EC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-5 py-2 text-xs font-semibold text-white transition-colors"
            >
              Crear Orden e Ir a Consola
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
