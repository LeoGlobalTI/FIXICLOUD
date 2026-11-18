import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type {
  AppUser,
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
  getDefaultAssetCategoryForSector,
  getDefaultTenantTechnicianName,
  getSectorCustomFields,
} from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';
import { AlertBanner } from './ui/AlertBanner';

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
  appUsers: AppUser[];
  activeBranchId: string;
  lockedBranchId?: string | null;
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
  appUsers,
  activeBranchId,
  lockedBranchId,
  clients,
  assets,
  existingOrders,
  initialPrefill,
  onClose,
  onCreate,
}) => {
  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const selectableBranches = lockedBranchId
    ? tenantBranches.filter((b) => b.id === lockedBranchId)
    : tenantBranches;
  const effectiveBranches =
    selectableBranches.length > 0 ? selectableBranches : tenantBranches;

  const defaultBranch =
    lockedBranchId ||
    initialPrefill?.branchId ||
    (activeBranchId !== 'ALL' && tenantBranches.some((b) => b.id === activeBranchId)
      ? activeBranchId
      : effectiveBranches.find((b) => b.is_hq)?.id ?? effectiveBranches[0]?.id ?? '');

  const tenantClients = clients.filter((c) => c.tenant_id === tenant.id);
  const [branchId, setBranchId] = useState(defaultBranch);

  const tenantTechSuggestions = useMemo(() => {
    const activeTechs = appUsers.filter(
      (u) =>
        u.is_active &&
        u.tenant_id === tenant.id &&
        (u.role === 'technician' || u.role === 'admin')
    );
    const sameBranch = activeTechs
      .filter((u) => u.branch_id === branchId)
      .map((u) => u.full_name);
    const otherBranch = activeTechs
      .filter((u) => u.branch_id !== branchId)
      .map((u) => u.full_name);
    return Array.from(new Set([...sameBranch, ...otherBranch]));
  }, [appUsers, tenant.id, branchId]);
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

  // Asset fields (supports reusing an existing asset without duplication)
  const [selectedExistingAssetId, setSelectedExistingAssetId] = useState<string | null>(null);
  const [category, setCategory] = useState(getDefaultAssetCategoryForSector(tenant.sector));
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
  const [technician, setTechnician] = useState(
    initialPrefill?.technician ??
      getDefaultTenantTechnicianName(appUsers, tenant.id, defaultBranch)
  );

  const [formError, setFormError] = useState<string | null>(null);

  const sectorFields = getSectorCustomFields(tenant.sector);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (clientMode === 'new' && !clientName.trim()) {
      setFormError('Ingresa el nombre o razón social del nuevo cliente.');
      return;
    }
    if (clientMode === 'existing' && (!selectedClientId || !tenantClients.some((c) => c.id === selectedClientId))) {
      setFormError('Selecciona un cliente válido o crea uno nuevo.');
      return;
    }
    if (modality === 'home_service' && !visitAddress.trim()) {
      setFormError('Ingresa la dirección de visita a domicilio.');
      return;
    }
    if (!brand.trim() || !model.trim() || !symptoms.trim()) {
      setFormError('Completa marca, modelo y síntomas reportados antes de crear la orden.');
      return;
    }

    const now = new Date().toISOString();
    let finalClientId = selectedClientId;
    let newClientObj: Client | undefined;

    if (clientMode === 'new') {
      finalClientId = generateUUID();
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

    const reusedAsset =
      clientMode === 'existing' && selectedExistingAssetId
        ? assets.find(
            (a) =>
              a.id === selectedExistingAssetId &&
              a.tenant_id === tenant.id &&
              a.client_id === finalClientId
          )
        : undefined;

    const assetId = reusedAsset ? reusedAsset.id : generateUUID();
    const newAssetObj: CustomerAsset | undefined = reusedAsset
      ? undefined
      : {
          id: assetId,
          tenant_id: tenant.id,
          client_id: finalClientId,
          category: category.trim() || getDefaultAssetCategoryForSector(tenant.sector),
          brand: brand.trim(),
          model: model.trim(),
          serial_imei: serialImei.trim() || 'S/N-PENDIENTE',
          password_pattern: passwordPattern.trim() || undefined,
          custom_attributes: customAttrs,
        };

    const folio = generateNextFolio(tenant.folio_prefix, existingOrders, tenant.id);
    const safeBranchId = effectiveBranches.some((b) => b.id === branchId)
      ? branchId
      : defaultBranch;
    const order: WorkOrder = {
      id: generateUUID(),
      tenant_id: tenant.id,
      branch_id: safeBranchId,
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

  const existingClientAssets = assets.filter(
    (a) => a.tenant_id === tenant.id && a.client_id === selectedClientId
  );

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
            <h2 id="new-order-title" className="text-base font-semibold text-slate-900">
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
            className="rounded-xl p-1.5 text-slate-400 hover:bg-[#F4F6FB] hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {formError && (
            <AlertBanner
              variant="error"
              message={formError}
              onDismiss={() => setFormError(null)}
            />
          )}
          {/* Branch & Modality */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sucursal de Ingreso
              </label>
              <select
                value={branchId}
                disabled={Boolean(lockedBranchId)}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors disabled:opacity-75"
              >
                {effectiveBranches.map((b) => (
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
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F4F6FB] border border-[#D8E4EC]/70 rounded-xl">
                <button
                  type="button"
                  onClick={() => setModality('workshop')}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    modality === 'workshop'
                      ? 'bg-[#0A2463] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  En Taller / Mostrador
                </button>
                <button
                  type="button"
                  onClick={() => setModality('home_service')}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    modality === 'home_service'
                      ? 'bg-[#0A2463] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Domicilio / Terreno
                </button>
              </div>
            </div>
          </div>

          {modality === 'home_service' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl bg-[#EBF4FA]/70 border border-[#3E92CC]/30 p-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dirección de Visita en Terreno
                </label>
                <input
                  type="text"
                  value={visitAddress}
                  onChange={(e) => setVisitAddress(e.target.value)}
                  placeholder="Ej: Av. Alemania 540, Oficina 3"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
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
                  className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            </div>
          )}

          {/* Client Section */}
          <div className="border-t border-[#D8E4EC]/70 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-900">1. Datos del Cliente</h3>
              <div className="flex items-center gap-1 bg-[#F4F6FB] border border-[#D8E4EC]/70 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setClientMode('existing')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    clientMode === 'existing'
                      ? 'bg-[#0A2463] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cliente Existente
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode('new')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    clientMode === 'new'
                      ? 'bg-[#0A2463] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
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
                  onChange={(e) => {
                    setSelectedClientId(e.target.value);
                    setSelectedExistingAssetId(null);
                  }}
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
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
                          setSelectedExistingAssetId(a.id);
                          setCategory(a.category);
                          setBrand(a.brand);
                          setModel(a.model);
                          setSerialImei(a.serial_imei);
                          setPasswordPattern(a.password_pattern ?? '');
                          setCustomAttrs(a.custom_attributes);
                        }}
                        className={`rounded-lg border px-2.5 py-1 font-medium transition-colors ${
                          selectedExistingAssetId === a.id
                            ? 'border-[#1B998B] bg-[#EBF8F6] text-[#157A6E]'
                            : 'border-[#3E92CC]/30 bg-[#EBF4FA] text-[#0A2463] hover:bg-[#3E92CC]/15'
                        }`}
                      >
                        Usar {a.brand} {a.model} ({a.serial_imei})
                      </button>
                    ))}
                    {selectedExistingAssetId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExistingAssetId(null);
                          setCategory(getDefaultAssetCategoryForSector(tenant.sector));
                          setBrand('');
                          setModel('');
                          setSerialImei('');
                          setPasswordPattern('');
                          setCustomAttrs({});
                        }}
                        className="rounded-lg border border-[#D8E4EC] bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-[#F4F6FB]"
                      >
                        Registrar como equipo nuevo
                      </button>
                    )}
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
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={clientRut}
                  onChange={(e) => setClientRut(e.target.value)}
                  placeholder="RUT / ID Tributario"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Teléfono WhatsApp (Ej: +56 9 8765 4321)"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="Correo electrónico"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Dirección"
                  className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
            )}
          </div>

          {/* Equipment + Dynamic Sector Attributes */}
          <div className="border-t border-[#D8E4EC]/70 pt-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">
              2. Equipo / Activo ({tenant.sector})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Categoría (Notebook, Smartphone...)"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Marca *"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                required
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Modelo *"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                value={serialImei}
                onChange={(e) => setSerialImei(e.target.value)}
                placeholder="N° de Serie / IMEI"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                value={passwordPattern}
                onChange={(e) => setPasswordPattern(e.target.value)}
                placeholder="Clave / Patrón desbloqueo"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                list="new-order-tech-list"
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Técnico asignado"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <datalist id="new-order-tech-list">
                {tenantTechSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 p-3.5">
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
                    className="w-full rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Symptoms & Accessories */}
          <div className="border-t border-[#D8E4EC]/70 pt-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900">
              3. Recepción y Síntomas Reportados
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={accessories}
                onChange={(e) => setAccessories(e.target.value)}
                placeholder="Accesorios recibidos (cargador, funda, cables...)"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
              <input
                type="text"
                value={entryCondition}
                onChange={(e) => setEntryCondition(e.target.value)}
                placeholder="Estado físico / estético de entrada"
                className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
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
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
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
