import React, { useEffect, useMemo, useState } from 'react';
import { Check, Laptop, Pencil, Plus, Search, Trash2, User, Wrench, X } from 'lucide-react';
import type { Client, CustomerAsset, RoleType, Tenant, WorkOrder } from '../types/erp';
import {
  getDefaultAssetCategoryForSector,
  getRolePermissions,
  ORDER_STATUS_META,
} from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';
import { AlertBanner } from './ui/AlertBanner';

interface ClientsAssetsViewProps {
  tenant: Tenant;
  activeRole: RoleType;
  clients: Client[];
  assets: CustomerAsset[];
  orders: WorkOrder[];
  onAddClient: (client: Client) => Promise<{ ok: boolean; error?: string }> | void;
  onUpdateClient: (client: Client) => Promise<{ ok: boolean; error?: string }> | void;
  onDeleteClient: (clientId: string) => Promise<{ ok: boolean; error?: string }>;
  onAddAsset: (asset: CustomerAsset) => Promise<{ ok: boolean; error?: string }> | void;
  onUpdateAsset: (asset: CustomerAsset) => Promise<{ ok: boolean; error?: string }>;
  onDeleteAsset: (assetId: string) => Promise<{ ok: boolean; error?: string }>;
  onOpenOrder: (orderId: string) => void;
}

export const ClientsAssetsView: React.FC<ClientsAssetsViewProps> = ({
  tenant,
  activeRole,
  clients,
  assets,
  orders,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onOpenOrder,
}) => {
  const perms = getRolePermissions(activeRole);
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  // Edit active client draft
  const [editingClient, setEditingClient] = useState(false);
  const [editDraft, setEditDraft] = useState({
    name: '',
    rut: '',
    phone: '',
    email: '',
    address: '',
    city: '',
  });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [confirmDeleteClientId, setConfirmDeleteClientId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  // Asset add/edit/delete state
  const [showNewAsset, setShowNewAsset] = useState(false);
  const [newAssetDraft, setNewAssetDraft] = useState({
    category: getDefaultAssetCategoryForSector(tenant.sector),
    brand: '',
    model: '',
    serial_imei: '',
    password_pattern: '',
  });
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [editAssetDraft, setEditAssetDraft] = useState({
    category: '',
    brand: '',
    model: '',
    serial_imei: '',
    password_pattern: '',
  });
  const [savingAsset, setSavingAsset] = useState(false);
  const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  const assetsByClient = useMemo(() => {
    const map = new Map<string, CustomerAsset[]>();
    for (const a of assets) {
      if (a.tenant_id !== tenant.id) continue;
      const list = map.get(a.client_id) ?? [];
      list.push(a);
      map.set(a.client_id, list);
    }
    return map;
  }, [assets, tenant.id]);

  const ordersByClient = useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const o of orders) {
      if (o.tenant_id !== tenant.id) continue;
      const list = map.get(o.client_id) ?? [];
      list.push(o);
      map.set(o.client_id, list);
    }
    return map;
  }, [orders, tenant.id]);

  const ordersByAsset = useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const o of orders) {
      if (o.tenant_id !== tenant.id) continue;
      const list = map.get(o.asset_id) ?? [];
      list.push(o);
      map.set(o.asset_id, list);
    }
    return map;
  }, [orders, tenant.id]);

  const tenantClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.tenant_id !== tenant.id) return false;
      if (!q) return true;
      const clientAssets = assetsByClient.get(c.id) ?? [];
      return (
        c.name.toLowerCase().includes(q) ||
        c.rut.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        clientAssets.some(
          (a) =>
            a.serial_imei.toLowerCase().includes(q) ||
            a.brand.toLowerCase().includes(q) ||
            a.model.toLowerCase().includes(q)
        )
      );
    });
  }, [clients, assetsByClient, tenant.id, query]);

  const activeClient =
    tenantClients.find((c) => c.id === selectedClientId) ?? tenantClients[0] ?? null;

  useEffect(() => {
    setEditingClient(false);
    setConfirmDeleteClientId(null);
    setShowNewAsset(false);
    setEditingAssetId(null);
    setConfirmDeleteAssetId(null);
    setSavedNotice(null);
    setErrorNotice(null);
    if (activeClient) {
      setEditDraft({
        name: activeClient.name,
        rut: activeClient.rut,
        phone: activeClient.phone,
        email: activeClient.email,
        address: activeClient.address,
        city: activeClient.city,
      });
    }
  }, [activeClient?.id]);

  useEffect(() => {
    setNewAssetDraft({
      category: getDefaultAssetCategoryForSector(tenant.sector),
      brand: '',
      model: '',
      serial_imei: '',
      password_pattern: '',
    });
  }, [tenant.id, tenant.sector]);

  const activeClientAssets = activeClient
    ? assetsByClient.get(activeClient.id) ?? []
    : [];

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.canManageClients || !name.trim()) return;
    setErrorNotice(null);
    setSavedNotice(null);
    const newClient: Client = {
      id: generateUUID(),
      tenant_id: tenant.id,
      name: name.trim(),
      rut: rut.trim() || 'S/R',
      phone: phone.trim() || '+56 9 0000 0000',
      email: email.trim(),
      address: address.trim(),
      city: city.trim() || 'Santiago',
    };
    const res = await onAddClient(newClient);
    if (res && !res.ok) {
      setErrorNotice(res.error ?? 'No se pudo registrar el cliente.');
      return;
    }
    setSelectedClientId(newClient.id);
    setName('');
    setRut('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setShowCreate(false);
    setSavedNotice(`Cliente "${newClient.name}" registrado.`);
  };

  const handleSaveClientEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.canManageClients || !activeClient || !editDraft.name.trim()) return;
    setErrorNotice(null);
    setSavedNotice(null);
    const res = await onUpdateClient({
      ...activeClient,
      name: editDraft.name.trim(),
      rut: editDraft.rut.trim() || 'S/R',
      phone: editDraft.phone.trim() || '+56 9 0000 0000',
      email: editDraft.email.trim(),
      address: editDraft.address.trim(),
      city: editDraft.city.trim(),
    });
    if (res && !res.ok) {
      setErrorNotice(res.error ?? 'No se pudo actualizar el cliente.');
      return;
    }
    setEditingClient(false);
    setSavedNotice('Datos del cliente actualizados.');
  };

  const handleConfirmDeleteClient = async (client: Client) => {
    setErrorNotice(null);
    setSavedNotice(null);
    setDeletingClientId(client.id);
    const res = await onDeleteClient(client.id);
    setDeletingClientId(null);
    setConfirmDeleteClientId(null);
    if (!res.ok) {
      setErrorNotice(res.error ?? 'No se pudo eliminar el cliente.');
      return;
    }
    if (selectedClientId === client.id) setSelectedClientId(null);
    setSavedNotice(`Cliente "${client.name}" eliminado.`);
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perms.canManageClients || !activeClient) return;
    if (!newAssetDraft.brand.trim() || !newAssetDraft.model.trim()) {
      setErrorNotice('Marca y modelo son obligatorios para registrar un equipo.');
      return;
    }
    setErrorNotice(null);
    setSavedNotice(null);
    setSavingAsset(true);
    const res = await onAddAsset({
      id: generateUUID(),
      tenant_id: tenant.id,
      client_id: activeClient.id,
      category:
        newAssetDraft.category.trim() || getDefaultAssetCategoryForSector(tenant.sector),
      brand: newAssetDraft.brand.trim(),
      model: newAssetDraft.model.trim(),
      serial_imei: newAssetDraft.serial_imei.trim() || 'S/N-PENDIENTE',
      password_pattern: newAssetDraft.password_pattern.trim() || undefined,
      custom_attributes: {},
    });
    setSavingAsset(false);
    if (res && !res.ok) {
      setErrorNotice(res.error ?? 'No se pudo registrar el equipo.');
      return;
    }
    setNewAssetDraft({
      category: getDefaultAssetCategoryForSector(tenant.sector),
      brand: '',
      model: '',
      serial_imei: '',
      password_pattern: '',
    });
    setShowNewAsset(false);
    setSavedNotice('Equipo agregado al parque del cliente.');
  };

  const openEditAsset = (asset: CustomerAsset) => {
    setErrorNotice(null);
    setSavedNotice(null);
    setConfirmDeleteAssetId(null);
    setEditingAssetId(asset.id);
    setEditAssetDraft({
      category: asset.category,
      brand: asset.brand,
      model: asset.model,
      serial_imei: asset.serial_imei,
      password_pattern: asset.password_pattern ?? '',
    });
  };

  const handleSaveAssetEdit = async (e: React.FormEvent, asset: CustomerAsset) => {
    e.preventDefault();
    if (!perms.canManageClients) return;
    if (!editAssetDraft.brand.trim() || !editAssetDraft.model.trim()) {
      setErrorNotice('Marca y modelo son obligatorios.');
      return;
    }
    setErrorNotice(null);
    setSavedNotice(null);
    setSavingAsset(true);
    const res = await onUpdateAsset({
      ...asset,
      category: editAssetDraft.category.trim() || asset.category,
      brand: editAssetDraft.brand.trim(),
      model: editAssetDraft.model.trim(),
      serial_imei: editAssetDraft.serial_imei.trim() || 'S/N-PENDIENTE',
      password_pattern: editAssetDraft.password_pattern.trim() || undefined,
    });
    setSavingAsset(false);
    if (!res.ok) {
      setErrorNotice(res.error ?? 'No se pudo actualizar el equipo.');
      return;
    }
    setEditingAssetId(null);
    setSavedNotice('Datos del equipo actualizados.');
  };

  const handleConfirmDeleteAsset = async (asset: CustomerAsset) => {
    setErrorNotice(null);
    setSavedNotice(null);
    setDeletingAssetId(asset.id);
    const res = await onDeleteAsset(asset.id);
    setDeletingAssetId(null);
    setConfirmDeleteAssetId(null);
    if (!res.ok) {
      setErrorNotice(res.error ?? 'No se pudo eliminar el equipo.');
      return;
    }
    if (editingAssetId === asset.id) setEditingAssetId(null);
    setSavedNotice(`Equipo ${asset.brand} ${asset.model} eliminado.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
            Clientes y Parque de Equipos — {tenant.name}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {tenantClients.length}
            </span>{' '}
            cliente(s) registrados con historial técnico por número de serie o IMEI.
          </p>
        </div>
        {perms.canManageClients && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Cliente</span>
          </button>
        )}
      </div>

      {errorNotice && (
        <AlertBanner
          variant="error"
          message={errorNotice}
          onDismiss={() => setErrorNotice(null)}
        />
      )}

      {savedNotice && (
        <AlertBanner
          variant="success"
          message={savedNotice}
          onDismiss={() => setSavedNotice(null)}
        />
      )}

      {perms.canManageClients && showCreate && (
        <form
          onSubmit={handleCreateClient}
          className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-900">Registrar Cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo / Razón Social *"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
              placeholder="RUT / ID Tributario"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono WhatsApp"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ciudad"
              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#D8E4EC]/60">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
            >
              Guardar Cliente
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Clients List */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-[#D8E4EC]">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente, RUT, teléfono o N° Serie..."
                className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="divide-y divide-[#D8E4EC]/50 max-h-[600px] overflow-y-auto">
            {tenantClients.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No hay clientes que coincidan con la búsqueda.
              </div>
            ) : (
              tenantClients.map((client) => {
                const countAssets = (assetsByClient.get(client.id) ?? []).length;
                const countOrders = (ordersByClient.get(client.id) ?? []).length;
                const isSelected = activeClient?.id === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                      isSelected
                        ? 'border-l-[#3E92CC] bg-[#EBF4FA]/75'
                        : 'border-l-transparent hover:bg-[#F4F6FB]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {client.name}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-[#0A2463] shrink-0">
                        {client.rut}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600 font-mono">
                      {client.phone} · {client.city}
                    </div>
                    <div className="mt-1 text-[11px] text-[#3E92CC] font-semibold">
                      {countAssets} equipo(s) · {countOrders} orden(es)
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Client Equipment Fleet & Serial History */}
        <div className="lg:col-span-7 space-y-4">
          {!activeClient ? (
            <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-8 text-center text-xs text-slate-500">
              Selecciona un cliente para ver su parque de equipos e historial de reparaciones.
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-11 w-11 rounded-xl bg-[#0A2463] text-white flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-[#6EC1F8]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-slate-900">
                        {activeClient.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span className="font-mono text-[#0A2463] font-medium">
                          RUT: {activeClient.rut}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono">{activeClient.phone}</span>
                        {activeClient.email && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span>{activeClient.email}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {activeClient.address}
                        {activeClient.city ? `, ${activeClient.city}` : ''}
                      </div>
                    </div>
                  </div>
                  {perms.canManageClients && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSavedNotice(null);
                          setErrorNotice(null);
                          setEditingClient((v) => !v);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3 py-1.5 text-xs font-semibold text-[#0A2463] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 text-[#3E92CC]" />
                        <span>{editingClient ? 'Cancelar' : 'Editar Cliente'}</span>
                      </button>

                      {confirmDeleteClientId === activeClient.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingClientId === activeClient.id}
                            onClick={() => setConfirmDeleteClientId(null)}
                            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 px-1.5"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={deletingClientId === activeClient.id}
                            onClick={() => void handleConfirmDeleteClient(activeClient)}
                            className="rounded-xl bg-[#D64545] hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                          >
                            {deletingClientId === activeClient.id ? 'Eliminando...' : 'Confirmar'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorNotice(null);
                            setSavedNotice(null);
                            setConfirmDeleteClientId(activeClient.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-semibold text-[#D64545] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {perms.canManageClients && editingClient && (
                  <form
                    onSubmit={handleSaveClientEdit}
                    className="pt-3 border-t border-[#D8E4EC]/70 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        placeholder="Nombre completo *"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.rut}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, rut: e.target.value }))
                        }
                        placeholder="RUT / ID"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.phone}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, phone: e.target.value }))
                        }
                        placeholder="Teléfono"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="email"
                        value={editDraft.email}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, email: e.target.value }))
                        }
                        placeholder="Email"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.address}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, address: e.target.value }))
                        }
                        placeholder="Dirección"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editDraft.city}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, city: e.target.value }))
                        }
                        placeholder="Ciudad"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] px-4 py-2 text-xs font-semibold text-white transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Guardar Cambios</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <h3 className="text-xs font-semibold text-slate-700">
                    Parque de Equipos e Historial por N° de Serie ({activeClientAssets.length})
                  </h3>
                  {perms.canManageClients && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorNotice(null);
                        setSavedNotice(null);
                        setShowNewAsset((v) => !v);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3 py-1.5 text-[11px] font-semibold text-[#0A2463] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#3E92CC]" />
                      <span>Agregar Equipo</span>
                    </button>
                  )}
                </div>

                {perms.canManageClients && showNewAsset && (
                  <form
                    onSubmit={handleCreateAsset}
                    className="rounded-2xl bg-white border border-[#3E92CC]/40 shadow-sm p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#0A2463]">
                        Nuevo Equipo para {activeClient.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNewAsset(false)}
                        aria-label="Cerrar formulario nuevo equipo"
                        className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={newAssetDraft.category}
                        onChange={(e) =>
                          setNewAssetDraft((d) => ({ ...d, category: e.target.value }))
                        }
                        placeholder="Categoría"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        required
                        value={newAssetDraft.brand}
                        onChange={(e) =>
                          setNewAssetDraft((d) => ({ ...d, brand: e.target.value }))
                        }
                        placeholder="Marca *"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        required
                        value={newAssetDraft.model}
                        onChange={(e) =>
                          setNewAssetDraft((d) => ({ ...d, model: e.target.value }))
                        }
                        placeholder="Modelo *"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newAssetDraft.serial_imei}
                        onChange={(e) =>
                          setNewAssetDraft((d) => ({ ...d, serial_imei: e.target.value }))
                        }
                        placeholder="N° de Serie / IMEI"
                        className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={newAssetDraft.password_pattern}
                        onChange={(e) =>
                          setNewAssetDraft((d) => ({
                            ...d,
                            password_pattern: e.target.value,
                          }))
                        }
                        placeholder="Clave / Patrón (opcional)"
                        className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowNewAsset(false)}
                        className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingAsset}
                        className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white"
                      >
                        {savingAsset ? 'Guardando...' : 'Guardar Equipo'}
                      </button>
                    </div>
                  </form>
                )}

                {activeClientAssets.length === 0 ? (
                  <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 text-center text-xs text-slate-500">
                    Este cliente aún no tiene equipos registrados.
                  </div>
                ) : (
                  activeClientAssets.map((asset) => {
                    const assetOrders = ordersByAsset.get(asset.id) ?? [];
                    const isEditingAsset = editingAssetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#D8E4EC]/60">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-[#EBF4FA] border border-[#3E92CC]/25 text-[#3E92CC] flex items-center justify-center shrink-0">
                              <Laptop className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-semibold text-slate-900">
                              {asset.category} {asset.brand} {asset.model}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-[#0A2463] bg-[#EBF4FA] border border-[#3E92CC]/30 px-2.5 py-0.5 rounded-lg">
                              S/N: {asset.serial_imei}
                            </span>
                            {perms.canManageClients && (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Editar equipo ${asset.brand} ${asset.model}`}
                                  onClick={() => openEditAsset(asset)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3E92CC] hover:text-[#0A2463]"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>Editar</span>
                                </button>
                                {confirmDeleteAssetId === asset.id ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={deletingAssetId === asset.id}
                                      onClick={() => setConfirmDeleteAssetId(null)}
                                      className="text-[11px] font-semibold text-slate-600"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deletingAssetId === asset.id}
                                      onClick={() => void handleConfirmDeleteAsset(asset)}
                                      className="rounded-lg bg-[#D64545] px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                      {deletingAssetId === asset.id ? '...' : 'Confirmar'}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    aria-label={`Eliminar equipo ${asset.brand} ${asset.model}`}
                                    onClick={() => {
                                      setErrorNotice(null);
                                      setSavedNotice(null);
                                      setConfirmDeleteAssetId(asset.id);
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] hover:underline"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                    <span>Eliminar</span>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {isEditingAsset && perms.canManageClients && (
                          <form
                            onSubmit={(e) => void handleSaveAssetEdit(e, asset)}
                            className="rounded-xl bg-[#F4F6FB] border border-[#D8E4EC] p-3 space-y-2.5"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={editAssetDraft.category}
                                onChange={(e) =>
                                  setEditAssetDraft((d) => ({ ...d, category: e.target.value }))
                                }
                                placeholder="Categoría"
                                className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                              />
                              <input
                                type="text"
                                required
                                value={editAssetDraft.brand}
                                onChange={(e) =>
                                  setEditAssetDraft((d) => ({ ...d, brand: e.target.value }))
                                }
                                placeholder="Marca *"
                                className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                              />
                              <input
                                type="text"
                                required
                                value={editAssetDraft.model}
                                onChange={(e) =>
                                  setEditAssetDraft((d) => ({ ...d, model: e.target.value }))
                                }
                                placeholder="Modelo *"
                                className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                              />
                              <input
                                type="text"
                                value={editAssetDraft.serial_imei}
                                onChange={(e) =>
                                  setEditAssetDraft((d) => ({ ...d, serial_imei: e.target.value }))
                                }
                                placeholder="N° Serie / IMEI"
                                className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                              />
                              <input
                                type="text"
                                value={editAssetDraft.password_pattern}
                                onChange={(e) =>
                                  setEditAssetDraft((d) => ({
                                    ...d,
                                    password_pattern: e.target.value,
                                  }))
                                }
                                placeholder="Clave / Patrón"
                                className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingAssetId(null)}
                                className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                Cancelar
                              </button>
                              <button
                                type="submit"
                                disabled={savingAsset}
                                className="rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 px-3 py-1 text-[11px] font-semibold text-white"
                              >
                                {savingAsset ? 'Guardando...' : 'Guardar Equipo'}
                              </button>
                            </div>
                          </form>
                        )}

                        {Object.keys(asset.custom_attributes).length > 0 && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                            {Object.entries(asset.custom_attributes).map(([k, v]) =>
                              v ? (
                                <span key={k}>
                                  <strong className="text-slate-700">{k}:</strong> {v}
                                </span>
                              ) : null
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="text-[11px] font-semibold text-slate-500">
                            Historial de Órdenes ({assetOrders.length})
                          </div>
                          {assetOrders.map((ord) => {
                            const meta = ORDER_STATUS_META[ord.status];
                            return (
                              <div
                                key={ord.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F4F6FB]/75 border border-[#D8E4EC]/70 px-3.5 py-2.5 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Wrench className="h-3.5 w-3.5 text-[#3E92CC]" />
                                    <span className="font-mono font-bold text-[#0A2463]">
                                      {ord.folio}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className={`font-semibold ${meta.textColor}`}>
                                      {meta.label}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                                      {new Date(ord.created_at).toLocaleDateString('es-CL')}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-600 truncate">
                                    {ord.reported_symptoms}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onOpenOrder(ord.id)}
                                  className="rounded-xl bg-white border border-[#D8E4EC] px-3 py-1.5 text-[11px] font-semibold text-[#0A2463] hover:bg-[#EBF4FA] hover:border-[#3E92CC] shrink-0 transition-colors"
                                >
                                  Abrir en Consola
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
