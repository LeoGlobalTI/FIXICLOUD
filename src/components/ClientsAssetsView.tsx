import React, { useMemo, useState } from 'react';
import { Laptop, Plus, Search, User, Wrench } from 'lucide-react';
import type { Client, CustomerAsset, Tenant, WorkOrder } from '../types/erp';
import { ORDER_STATUS_META } from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';

interface ClientsAssetsViewProps {
  tenant: Tenant;
  clients: Client[];
  assets: CustomerAsset[];
  orders: WorkOrder[];
  onAddClient: (client: Client) => void;
  onOpenOrder: (orderId: string) => void;
}

export const ClientsAssetsView: React.FC<ClientsAssetsViewProps> = ({
  tenant,
  clients,
  assets,
  orders,
  onAddClient,
  onOpenOrder,
}) => {
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');

  const tenantClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.tenant_id !== tenant.id) return false;
      if (!q) return true;
      const clientAssets = assets.filter((a) => a.client_id === c.id);
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
  }, [clients, assets, tenant.id, query]);

  const activeClient =
    tenantClients.find((c) => c.id === selectedClientId) ?? tenantClients[0] ?? null;

  const activeClientAssets = activeClient
    ? assets.filter((a) => a.client_id === activeClient.id)
    : [];

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
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
    onAddClient(newClient);
    setSelectedClientId(newClient.id);
    setName('');
    setRut('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCity('');
    setShowCreate(false);
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
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {showCreate && (
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
                const countAssets = assets.filter((a) => a.client_id === client.id).length;
                const countOrders = orders.filter((o) => o.client_id === client.id).length;
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
              <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6">
                <div className="flex items-start gap-3">
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
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 px-1">
                  Parque de Equipos e Historial por N° de Serie ({activeClientAssets.length})
                </h3>
                {activeClientAssets.length === 0 ? (
                  <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 text-center text-xs text-slate-500">
                    Este cliente aún no tiene equipos registrados.
                  </div>
                ) : (
                  activeClientAssets.map((asset) => {
                    const assetOrders = orders.filter((o) => o.asset_id === asset.id);
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
                          <span className="font-mono text-xs font-semibold text-[#0A2463] bg-[#EBF4FA] border border-[#3E92CC]/30 px-2.5 py-0.5 rounded-lg">
                            S/N: {asset.serial_imei}
                          </span>
                        </div>

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
