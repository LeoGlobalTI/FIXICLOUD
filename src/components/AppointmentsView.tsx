import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Home,
  MessageCircle,
  Plus,
  Store,
  Wrench,
  X,
} from 'lucide-react';
import type {
  Appointment,
  AppointmentStatus,
  Branch,
  Client,
  ServiceModality,
  Tenant,
  WorkOrder,
} from '../types/erp';
import { buildWhatsAppUrl } from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';

interface AppointmentsViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  clients: Client[];
  orders: WorkOrder[];
  appointments: Appointment[];
  onAddAppointment: (apt: Appointment) => void;
  onUpdateAppointment: (apt: Appointment) => void;
  onConvertToOrder: (apt: Appointment) => void;
  onOpenOrder: (orderId: string) => void;
}

const STATUS_LABEL: Record<AppointmentStatus, { label: string; color: string }> = {
  scheduled: { label: 'Programada', color: 'text-[#3E92CC] bg-[#EBF4FA] border-[#3E92CC]/30' },
  completed: { label: 'Completada', color: 'text-[#1B998B] bg-[#EBF8F6] border-[#1B998B]/30' },
  cancelled: { label: 'Cancelada', color: 'text-slate-600 bg-[#F4F6FB] border-[#D8E4EC]' },
};

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  tenant,
  branches,
  activeBranchId,
  clients,
  orders,
  appointments,
  onAddAppointment,
  onUpdateAppointment,
  onConvertToOrder,
  onOpenOrder,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'weekly'>('list');
  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [showModal, setShowModal] = useState(false);

  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const tenantClients = clients.filter((c) => c.tenant_id === tenant.id);
  const defaultBranchId =
    activeBranchId !== 'ALL'
      ? activeBranchId
      : tenantBranches.find((b) => b.is_hq)?.id ?? tenantBranches[0]?.id ?? '';

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [clientId, setClientId] = useState(tenantClients[0]?.id ?? '');
  const [modality, setModality] = useState<ServiceModality>('home_service');
  const [visitAddress, setVisitAddress] = useState('');
  const [technician, setTechnician] = useState('Camila Herrera');
  const [date, setDate] = useState('2026-11-13');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:30');
  const [notes, setNotes] = useState('');

  const scopedAppointments = useMemo(() => {
    return appointments
      .filter((a) => {
        if (a.tenant_id !== tenant.id) return false;
        if (activeBranchId !== 'ALL' && a.branch_id !== activeBranchId) return false;
        if (techFilter !== 'ALL' && a.technician !== techFilter) return false;
        return true;
      })
      .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));
  }, [appointments, tenant.id, activeBranchId, techFilter]);

  const technicians = useMemo(() => {
    const set = new Set(
      appointments.filter((a) => a.tenant_id === tenant.id).map((a) => a.technician)
    );
    return Array.from(set);
  }, [appointments, tenant.id]);

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const branchMap = new Map(branches.map((b) => [b.id, b]));
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  const openCreateModal = () => {
    setEditingId(null);
    setSubject('');
    setBranchId(defaultBranchId);
    setClientId(tenantClients[0]?.id ?? '');
    setModality('home_service');
    setVisitAddress(tenantClients[0]?.address ?? '');
    setTechnician('Diego Torres');
    setDate('2026-11-13');
    setStartTime('10:00');
    setEndTime('11:30');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (apt: Appointment) => {
    setEditingId(apt.id);
    setSubject(apt.subject);
    setBranchId(apt.branch_id);
    setClientId(apt.client_id);
    setModality(apt.modality);
    setVisitAddress(apt.visit_address ?? '');
    setTechnician(apt.technician);
    setDate(apt.date);
    setStartTime(apt.start_time);
    setEndTime(apt.end_time);
    setNotes(apt.notes ?? '');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !clientId) return;

    if (editingId) {
      const existing = appointments.find((a) => a.id === editingId);
      if (!existing) return;
      onUpdateAppointment({
        ...existing,
        subject: subject.trim(),
        branch_id: branchId,
        client_id: clientId,
        modality,
        visit_address: modality === 'home_service' ? visitAddress.trim() : undefined,
        technician: technician.trim() || 'Por asignar',
        date,
        start_time: startTime,
        end_time: endTime,
        notes: notes.trim() || undefined,
      });
    } else {
      onAddAppointment({
        id: generateUUID(),
        tenant_id: tenant.id,
        branch_id: branchId,
        subject: subject.trim(),
        client_id: clientId,
        modality,
        visit_address: modality === 'home_service' ? visitAddress.trim() : undefined,
        technician: technician.trim() || 'Por asignar',
        date,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        notes: notes.trim() || undefined,
        created_at: new Date().toISOString(),
      });
    }
    setShowModal(false);
  };

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Appointment[]>();
    for (const apt of scopedAppointments) {
      const list = groups.get(apt.date) ?? [];
      list.push(apt);
      groups.set(apt.date, list);
    }
    return Array.from(groups.entries());
  }, [scopedAppointments]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
            Agenda y Visitas Técnicas — {tenant.name}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {scopedAppointments.length}
            </span>{' '}
            cita(s) programada(s) en domicilio o mostrador con conversión directa a Orden de Trabajo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por técnico"
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#3E92CC] focus:outline-none transition-colors"
          >
            <option value="ALL">Todos los técnicos</option>
            {technicians.map((tech) => (
              <option key={tech} value={tech}>
                Técnico: {tech}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 bg-white border border-[#D8E4EC] p-1 rounded-xl shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-[#0A2463] text-white' : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
              }`}
            >
              Cronológica
            </button>
            <button
              type="button"
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                viewMode === 'weekly'
                  ? 'bg-[#0A2463] text-white'
                  : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
              }`}
            >
              Por Día / Semana
            </button>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Agendar Cita</span>
          </button>
        </div>
      </div>

      {/* Appointments Content */}
      {scopedAppointments.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-10 text-center space-y-3">
          <Calendar className="h-9 w-9 text-[#3E92CC]/60 mx-auto" />
          <div className="text-sm font-semibold text-slate-800">
            No hay citas programadas en esta vista
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Programar Primera Cita</span>
          </button>
        </div>
      ) : viewMode === 'weekly' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {groupedByDate.map(([day, items]) => (
            <div
              key={day}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm overflow-hidden"
            >
              <div className="bg-[#0A2463] text-white px-4 py-3 flex items-center justify-between">
                <span className="font-mono text-xs font-bold">{day}</span>
                <span className="text-[11px] font-mono text-[#6EC1F8] font-semibold">
                  {items.length} cita(s)
                </span>
              </div>
              <div className="divide-y divide-[#D8E4EC]/50">
                {items.map((apt) => {
                  const client = clientMap.get(apt.client_id);
                  const linkedOrder = apt.work_order_id
                    ? orderMap.get(apt.work_order_id)
                    : undefined;
                  const st = STATUS_LABEL[apt.status];
                  return (
                    <div key={apt.id} className="p-4 space-y-2.5 hover:bg-[#F4F6FB]/50 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#0A2463] tabular-nums">
                          {apt.start_time} – {apt.end_time}
                        </span>
                        <span
                          className={`border rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.color}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900">
                        {apt.subject}
                      </div>
                      <div className="text-xs text-slate-600">
                        {client?.name} · Técnico: <strong className="text-slate-800">{apt.technician}</strong>
                      </div>
                      {apt.visit_address && (
                        <div className="text-[11px] text-[#0A2463] bg-[#EBF4FA] border border-[#3E92CC]/25 rounded-xl px-2.5 py-1.5">
                          Domicilio: {apt.visit_address}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {linkedOrder ? (
                          <button
                            type="button"
                            onClick={() => onOpenOrder(linkedOrder.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-2.5 py-1.5 text-[11px] font-mono font-semibold transition-colors"
                          >
                            <Wrench className="h-3 w-3 text-[#3E92CC]" />
                            <span>Abrir {linkedOrder.folio}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onConvertToOrder(apt)}
                            className="inline-flex items-center gap-1 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Convertir en OT</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(apt)}
                          className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-[#F4F6FB] transition-colors"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm divide-y divide-[#D8E4EC]/50 overflow-hidden">
          {scopedAppointments.map((apt) => {
            const client = clientMap.get(apt.client_id);
            const branch = branchMap.get(apt.branch_id);
            const linkedOrder = apt.work_order_id
              ? orderMap.get(apt.work_order_id)
              : undefined;
            const st = STATUS_LABEL[apt.status];
            const waText = `Hola ${client?.name ?? 'Cliente'}, te recordamos tu cita "${apt.subject}" el ${apt.date} a las ${apt.start_time} hrs (${
              apt.modality === 'home_service'
                ? `Visita en ${apt.visit_address}`
                : branch?.name ?? 'Taller'
            }).`;

            return (
              <div
                key={apt.id}
                className="p-4 lg:p-5 flex flex-wrap items-start justify-between gap-4 hover:bg-[#F4F6FB]/70 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[#0A2463] tabular-nums">
                      <Clock className="h-3.5 w-3.5 text-[#3E92CC]" />
                      {apt.date} · {apt.start_time} - {apt.end_time}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      {apt.modality === 'home_service' ? (
                        <>
                          <Home className="h-3.5 w-3.5 text-[#3E92CC]" />
                          <span>Visita a Domicilio</span>
                        </>
                      ) : (
                        <>
                          <Store className="h-3.5 w-3.5 text-slate-500" />
                          <span>Atención en Taller</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {branch?.code ?? 'HQ'}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900">{apt.subject}</h3>

                  <div className="text-xs text-slate-600">
                    Cliente: <strong className="text-slate-800">{client?.name}</strong>{' '}
                    <span className="font-mono">({client?.phone})</span> · Técnico:{' '}
                    <strong className="text-slate-800">{apt.technician}</strong>
                  </div>

                  {apt.visit_address && (
                    <div className="text-xs text-[#3E92CC] font-medium">
                      Dirección visita: {apt.visit_address}
                    </div>
                  )}
                  {apt.notes && (
                    <div className="text-xs text-slate-500">Notas: {apt.notes}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label={`Estado cita ${apt.subject}`}
                    value={apt.status}
                    onChange={(e) =>
                      onUpdateAppointment({
                        ...apt,
                        status: e.target.value as AppointmentStatus,
                      })
                    }
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold focus:outline-none ${st.color}`}
                  >
                    <option value="scheduled">Programada</option>
                    <option value="completed">Completada</option>
                    <option value="cancelled">Cancelada</option>
                  </select>

                  {linkedOrder ? (
                    <button
                      type="button"
                      onClick={() => onOpenOrder(linkedOrder.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#3E92CC]" />
                      <span>Ver {linkedOrder.folio}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConvertToOrder(apt)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Convertir Cita en OT</span>
                    </button>
                  )}

                  {tenant.whatsapp_enabled && client?.phone ? (
                    <a
                      href={buildWhatsAppUrl(client.phone, waText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>Recordatorio</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      title="WhatsApp desactivado por configuración de empresa"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] text-slate-400 px-3 py-1.5 text-xs font-medium cursor-not-allowed"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>WhatsApp OFF</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openEditModal(apt)}
                    className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors"
                  >
                    Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Appointment Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apt-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D8E4EC]/70 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E4EC]">
              <h2 id="apt-modal-title" className="text-base font-semibold text-slate-900">
                {editingId ? 'Editar Cita / Visita Técnica' : 'Agendar Nueva Cita / Visita'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Cerrar modal cita"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-[#F4F6FB] hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Asunto / Motivo de la Cita *
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej: Revisión impresora láser en oficina cliente"
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cliente
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setClientId(nextId);
                      const c = tenantClients.find((item) => item.id === nextId);
                      if (c && !visitAddress) setVisitAddress(c.address);
                    }}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  >
                    {tenantClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sucursal
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  >
                    {tenantBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Modalidad
                  </label>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value as ServiceModality)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  >
                    <option value="home_service">Visita a Domicilio</option>
                    <option value="workshop">En Taller / Mostrador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Técnico Asignado
                  </label>
                  <input
                    type="text"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {modality === 'home_service' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dirección de Visita
                  </label>
                  <input
                    type="text"
                    value={visitAddress}
                    onChange={(e) => setVisitAddress(e.target.value)}
                    placeholder="Dirección exacta de atención en terreno"
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-2.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-2.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hora Fin
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-2.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notas Operativas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#D8E4EC]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-4 py-2 text-xs font-semibold text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {editingId ? 'Guardar Cambios' : 'Guardar Cita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
