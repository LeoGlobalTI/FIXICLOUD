import React, { useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Cpu,
  CreditCard,
  Home,
  Laptop,
  MessageCircle,
  PackagePlus,
  Plus,
  Printer,
  Search,
  Smartphone,
  Store,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AuthSessionUser,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  IndustrySector,
  LoanAsset,
  OrderStatus,
  PaymentMethod,
  PhotoStage,
  RoleType,
  ServiceModality,
  SupabaseConfig,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderPayment,
  WorkOrderPhoto,
} from '../types/erp';
import {
  ORDER_STATUS_META,
  calculateOrderFinancials,
  filterWorkOrders,
  formatCurrency,
  getRolePermissions,
  getSectorCustomFields,
} from '../utils/erpLogic';
import { compressImageToWebP } from '../utils/imageCompression';
import {
  isSupabaseLive,
  uploadOrderPhotoToStorage,
} from '../services/supabaseService';
import { generateUUID } from '../utils/uuid';
import { WhatsAppModal } from './WhatsAppModal';

const STAGE_PROGRESS: Record<OrderStatus, number> = {
  received: 20,
  diagnosing: 40,
  waiting_approval: 55,
  in_repair: 75,
  ready: 90,
  delivered: 100,
};

const STATUS_PILL_MAP: Record<
  OrderStatus,
  { label: string; shortLabel: string; classes: string }
> = {
  received: {
    label: 'Recibido',
    shortLabel: 'Recibido',
    classes: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
  },
  diagnosing: {
    label: 'Diagnóstico',
    shortLabel: 'Diagnóstico',
    classes: 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]',
  },
  waiting_approval: {
    label: 'Esperando Aprobación',
    shortLabel: 'Por Aprobar',
    classes: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  in_repair: {
    label: 'En Proceso',
    shortLabel: 'En Proceso',
    classes: 'bg-[#EBF4FA] text-[#3E92CC] border border-[#3E92CC]/25',
  },
  ready: {
    label: 'Listo / Revisión',
    shortLabel: 'Listo',
    classes: 'bg-[#EBF8F6] text-[#1B998B] border border-[#1B998B]/25',
  },
  delivered: {
    label: 'Entregado',
    shortLabel: 'Entregado',
    classes: 'bg-[#EBF8F6] text-[#157A6E] border border-[#1B998B]/30',
  },
};

function getSectorIconMeta(sector: IndustrySector) {
  switch (sector) {
    case 'mobile':
      return {
        bg: 'bg-violet-50 text-violet-600 border-violet-200/70',
        Icon: Smartphone,
      };
    case 'machinery':
      return {
        bg: 'bg-[#EBF8F6] text-[#1B998B] border-[#1B998B]/25',
        Icon: Wrench,
      };
    case 'appliances':
      return {
        bg: 'bg-amber-50 text-amber-600 border-amber-200/70',
        Icon: Cpu,
      };
    default:
      return {
        bg: 'bg-[#EBF4FA] text-[#3E92CC] border-[#3E92CC]/25',
        Icon: Laptop,
      };
  }
}

const INPUT_CLASS =
  'w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors';


interface OrderConsoleViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  activeRole: RoleType;
  supabaseConfig: SupabaseConfig;
  activeUser?: AuthSessionUser | null;
  orders: WorkOrder[];
  clients: Client[];
  assets: CustomerAsset[];
  catalogItems: CatalogItem[];
  loanAssets: LoanAsset[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  onUpdateOrder: (order: WorkOrder) => void;
  onUpdateClient: (client: Client) => void;
  onUpdateAsset: (asset: CustomerAsset) => void;
  onAdjustCatalogStock: (catalogItemId: string, delta: number) => void;
  onAssignLoanAsset: (orderId: string, loanAssetId: string, notes: string) => void;
  onReturnLoanAsset: (orderId: string) => void;
  onDeleteOrderItem?: (itemId: string) => void;
  onDeleteOrderPhoto?: (photoId: string) => void;
  onOpenNewOrder: () => void;
  onOpenPublicTrackWithCode: (code: string) => void;
  onOpenPrintCenter: (orderId: string) => void;
  externalSearchQuery?: string;
  onExternalSearchChange?: (q: string) => void;
}

type ZoneTab = 'zone1' | 'zone2' | 'zone3' | 'all';

export const OrderConsoleView: React.FC<OrderConsoleViewProps> = ({
  tenant,
  branches,
  activeBranchId,
  activeRole,
  supabaseConfig,
  activeUser,
  orders,
  clients,
  assets,
  catalogItems,
  loanAssets,
  selectedOrderId,
  onSelectOrder,
  onUpdateOrder,
  onUpdateClient,
  onUpdateAsset,
  onAdjustCatalogStock,
  onAssignLoanAsset,
  onReturnLoanAsset,
  onDeleteOrderItem,
  onDeleteOrderPhoto,
  onOpenNewOrder,
  onOpenPublicTrackWithCode,
  onOpenPrintCenter,
  externalSearchQuery,
  onExternalSearchChange,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const searchQuery = externalSearchQuery ?? localSearch;
  const setSearchQuery = (q: string) => {
    setLocalSearch(q);
    onExternalSearchChange?.(q);
  };
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [modalityFilter, setModalityFilter] = useState<ServiceModality | 'ALL'>('ALL');
  const [onlyMyOrders, setOnlyMyOrders] = useState(false);
  const [activeZone, setActiveZone] = useState<ZoneTab>('all');

  // Zone 2 local inputs
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [catalogQty, setCatalogQty] = useState(1);
  const [freeDesc, setFreeDesc] = useState('');
  const [freeQty, setFreeQty] = useState(1);
  const [freePrice, setFreePrice] = useState('');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payRef, setPayRef] = useState('');

  // Zone 3 local inputs
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [photoStage, setPhotoStage] = useState<PhotoStage>('diagnosis');
  const [photoCaption, setPhotoCaption] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStatusMsg, setPhotoStatusMsg] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<WorkOrderPhoto | null>(null);

  const [loanAssetToAssign, setLoanAssetToAssign] = useState('');
  const [loanNotes, setLoanNotes] = useState('');

  // WhatsApp modal
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  const perms = getRolePermissions(activeRole);
  const techNameMatch = activeUser?.full_name?.trim() || 'Diego Torres';

  const filteredOrders = useMemo(() => {
    const base = filterWorkOrders(orders, clients, assets, {
      tenantId: tenant.id,
      branchId: activeBranchId,
      query: searchQuery,
      status: statusFilter,
      modality: modalityFilter,
    });
    if (activeRole === 'technician' && onlyMyOrders) {
      return base.filter(
        (o) =>
          o.assigned_technician.toLowerCase().includes(techNameMatch.toLowerCase())
      );
    }
    return base;
  }, [
    orders,
    clients,
    assets,
    tenant.id,
    activeBranchId,
    searchQuery,
    statusFilter,
    modalityFilter,
    activeRole,
    onlyMyOrders,
    techNameMatch,
  ]);

  const activeOrder =
    filteredOrders.find((o) => o.id === selectedOrderId) ??
    filteredOrders[0] ??
    null;

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const activeClient = activeOrder ? clientMap.get(activeOrder.client_id) : undefined;
  const activeAsset = activeOrder ? assetMap.get(activeOrder.asset_id) : undefined;
  const activeBranch = activeOrder ? branchMap.get(activeOrder.branch_id) : undefined;

  const branchCatalog = useMemo(() => {
    if (!activeOrder) return [];
    return catalogItems.filter(
      (c) =>
        c.tenant_id === tenant.id &&
        (c.branch_id === activeOrder.branch_id || activeBranchId === 'ALL')
    );
  }, [catalogItems, tenant.id, activeOrder, activeBranchId]);

  const availableLoans = useMemo(() => {
    if (!activeOrder) return [];
    return loanAssets.filter(
      (l) =>
        l.tenant_id === tenant.id &&
        l.status === 'available' &&
        (l.branch_id === activeOrder.branch_id || activeBranchId === 'ALL')
    );
  }, [loanAssets, tenant.id, activeOrder, activeBranchId]);

  const financials = activeOrder
    ? calculateOrderFinancials(
        activeOrder.items,
        activeOrder.discount_amount,
        activeOrder.apply_iva,
        tenant.iva_rate,
        activeOrder.payments
      )
    : null;

  const sectorFields = getSectorCustomFields(tenant.sector);

  const patchOrder = (patch: Partial<WorkOrder>) => {
    if (!activeOrder) return;
    onUpdateOrder({
      ...activeOrder,
      ...patch,
      updated_at: new Date().toISOString(),
    });
  };

  const handleAddCatalogItem = () => {
    if (!activeOrder) return;
    const itemId = selectedCatalogId || branchCatalog[0]?.id;
    const cat = branchCatalog.find((c) => c.id === itemId);
    if (!cat) return;
    const qty = Math.max(1, catalogQty);
    const newItem: WorkOrderItem = {
      id: generateUUID(),
      source: 'catalog',
      catalog_item_id: cat.id,
      sku: cat.sku,
      description: cat.name,
      qty,
      unit_price: cat.sale_price,
    };
    onAdjustCatalogStock(cat.id, -qty);
    patchOrder({ items: [...activeOrder.items, newItem] });
    setCatalogQty(1);
  };

  const handleAddFreeItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !freeDesc.trim()) return;
    const price = Number(freePrice) || 0;
    const qty = Math.max(1, freeQty);
    const newItem: WorkOrderItem = {
      id: generateUUID(),
      source: 'free',
      description: freeDesc.trim(),
      qty,
      unit_price: price,
    };
    patchOrder({ items: [...activeOrder.items, newItem] });
    setFreeDesc('');
    setFreeQty(1);
    setFreePrice('');
  };

  const handleRemoveOrderItem = (item: WorkOrderItem) => {
    if (!activeOrder) return;
    if (item.source === 'catalog' && item.catalog_item_id) {
      onAdjustCatalogStock(item.catalog_item_id, item.qty);
    }
    onDeleteOrderItem?.(item.id);
    patchOrder({ items: activeOrder.items.filter((i) => i.id !== item.id) });
  };

  const handleAddPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    const payment: WorkOrderPayment = {
      id: generateUUID(),
      date: new Date().toISOString().slice(0, 10),
      amount: amt,
      method: payMethod,
      reference: payRef.trim() || undefined,
    };
    patchOrder({ payments: [...activeOrder.payments, payment] });
    setPayAmount('');
    setPayRef('');
  };

  const handleAddPhotoUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !photoUrlInput.trim()) return;
    const photo: WorkOrderPhoto = {
      id: generateUUID(),
      url: photoUrlInput.trim(),
      stage: photoStage,
      caption: photoCaption.trim() || 'Evidencia técnica adjunta',
      created_at: new Date().toISOString(),
    };
    patchOrder({ photos: [...activeOrder.photos, photo] });
    setPhotoUrlInput('');
    setPhotoCaption('');
  };

  const handlePhotoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeOrder || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingPhoto(true);
    setPhotoStatusMsg('Comprimiendo imagen a WebP (máx. 1280px)...');

    try {
      const compressed = await compressImageToWebP(file, 1280, 0.8);
      let finalUrl = compressed.dataUrl;
      const caption = photoCaption.trim() || file.name;

      if (isSupabaseLive(supabaseConfig)) {
        setPhotoStatusMsg(`Subiendo WebP (${compressed.sizeKb} KB) a Supabase Storage...`);
        const uploadRes = await uploadOrderPhotoToStorage(supabaseConfig, {
          tenantId: tenant.id,
          workOrderId: activeOrder.id,
          blob: compressed.blob,
          stage: photoStage,
          caption,
        });
        if (uploadRes.ok && uploadRes.publicUrl) {
          finalUrl = uploadRes.publicUrl;
          setPhotoStatusMsg(`Foto WebP subida a Storage (${compressed.sizeKb} KB).`);
        } else {
          setPhotoStatusMsg(
            `Guardada en local WebP (${compressed.sizeKb} KB). Storage: ${uploadRes.error ?? 'sin bucket'}`
          );
        }
      } else {
        setPhotoStatusMsg(`Foto comprimida a WebP (${compressed.sizeKb} KB).`);
      }

      const photo: WorkOrderPhoto = {
        id: generateUUID(),
        url: finalUrl,
        stage: photoStage,
        caption,
        created_at: new Date().toISOString(),
      };
      patchOrder({ photos: [...activeOrder.photos, photo] });
      setPhotoCaption('');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    if (!activeOrder) return;
    onDeleteOrderPhoto?.(photoId);
    patchOrder({ photos: activeOrder.photos.filter((p) => p.id !== photoId) });
  };

  const showZ1 = activeZone === 'all' || activeZone === 'zone1';
  const showZ2 = activeZone === 'all' || activeZone === 'zone2';
  const showZ3 = activeZone === 'all' || activeZone === 'zone3';

  const sectorMeta = getSectorIconMeta(tenant.sector);
  const SectorIcon = sectorMeta.Icon;
  const currentScopeLabel =
    activeBranchId === 'ALL'
      ? `Todas las sucursales · ${tenant.name}`
      : branchMap.get(activeBranchId)?.name ?? tenant.name;

  const activeProgress = activeOrder ? STAGE_PROGRESS[activeOrder.status] : 0;
  const activePill = activeOrder ? STATUS_PILL_MAP[activeOrder.status] : null;

  return (
    <div className="space-y-5">
      {/* Page Header Row (Aligned with Overview) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] sm:leading-[36px] font-semibold text-slate-900">
            Órdenes de Trabajo
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono font-semibold text-[#0A2463] tabular-nums">
              {filteredOrders.length}
            </span>{' '}
            orden(es) en vista ·{' '}
            <span className="font-medium text-slate-800">{currentScopeLabel}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewOrder}
          disabled={!perms.canCreateOrder}
          className="inline-flex items-center gap-2 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Nueva Orden</span>
        </button>
      </div>

      {/* Omnichannel Search + Quick Filters */}
      <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Folio (OT-000105), Código, Cliente, RUT, Teléfono, Serie/IMEI o Síntoma..."
              aria-label="Buscador omnicanal de órdenes"
              className="w-full rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/70 pl-10 pr-9 py-2 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-[#F4F6FB] border border-[#D8E4EC] p-1 rounded-xl">
              {(['ALL', 'workshop', 'home_service'] as const).map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModalityFilter(mod)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    modalityFilter === mod
                      ? 'bg-white text-[#0A2463] shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mod === 'ALL' ? 'Todas' : mod === 'workshop' ? 'Taller' : 'Domicilio'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Status Filter Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#D8E4EC]/50">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-[#0A2463] text-white'
                : 'bg-[#F4F6FB] text-slate-600 hover:bg-[#D8E4EC]/60 hover:text-slate-900'
            }`}
          >
            Todos
          </button>
          {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((st) => {
            const meta = ORDER_STATUS_META[st];
            const active = statusFilter === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#3E92CC] text-white'
                    : 'bg-[#F4F6FB] text-slate-600 hover:bg-[#D8E4EC]/60 hover:text-slate-900'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
          {activeRole === 'technician' && (
            <button
              type="button"
              onClick={() => setOnlyMyOrders((v) => !v)}
              className={`ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                onlyMyOrders
                  ? 'bg-[#EBF4FA] border-[#3E92CC] text-[#0A2463]'
                  : 'bg-white border-[#D8E4EC] text-slate-700 hover:bg-[#F4F6FB]'
              }`}
            >
              {onlyMyOrders ? `Mis Órdenes (${techNameMatch})` : 'Filtrar: Mis Órdenes'}
            </button>
          )}
        </div>
      </div>

      {/* Master-Detail 2-Column Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Master List */}
        <div className="min-w-0 lg:col-span-5 xl:col-span-4 rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#D8E4EC]/70 bg-[#F4F6FB]/70 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Listado de Órdenes ({filteredOrders.length})
              </h2>
            </div>
            <span className="font-mono text-[11px] font-medium text-slate-500">
              {activeBranchId === 'ALL' ? 'Consolidado' : branchMap.get(activeBranchId)?.code}
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <Wrench className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-xs font-medium text-slate-600">
                No se encontraron órdenes con esos criterios.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setModalityFilter('ALL');
                }}
                className="inline-flex items-center rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] hover:bg-[#EBF4FA] px-3 py-1.5 text-xs font-semibold text-[#3E92CC] transition-colors"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#D8E4EC]/50 max-h-[calc(100vh-270px)] overflow-y-auto">
              {filteredOrders.map((order) => {
                const client = clientMap.get(order.client_id);
                const asset = assetMap.get(order.asset_id);
                const branch = branchMap.get(order.branch_id);
                const pill = STATUS_PILL_MAP[order.status];
                const isSelected = activeOrder?.id === order.id;
                const fin = calculateOrderFinancials(
                  order.items,
                  order.discount_amount,
                  order.apply_iva,
                  tenant.iva_rate,
                  order.payments
                );

                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelectOrder(order.id)}
                    className={`w-full text-left px-4 py-3.5 transition-colors block border-l-4 ${
                      isSelected
                        ? 'bg-[#EBF4FA]/75 border-l-[#3E92CC]'
                        : 'border-l-transparent hover:bg-[#F4F6FB]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#0A2463] whitespace-nowrap">
                        {order.folio}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${pill.classes}`}
                      >
                        {pill.shortLabel}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs font-semibold text-slate-900 truncate">
                      {client?.name ?? 'Cliente'}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 truncate">
                      {asset ? `${asset.brand} ${asset.model}` : 'Equipo'}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-mono truncate">
                        {branch?.code ?? 'HQ'} ·{' '}
                        {order.modality === 'home_service' ? 'Domicilio' : 'Taller'}
                      </span>
                      <span
                        className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
                          fin.balanceDue > 0 ? 'text-amber-700' : 'text-[#1B998B]'
                        }`}
                      >
                        {fin.balanceDue > 0
                          ? `Saldo ${formatCurrency(fin.balanceDue, tenant.currency)}`
                          : 'Pagado'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 3-Zone Editor */}
        <div className="min-w-0 lg:col-span-7 xl:col-span-8 space-y-4">
          {!activeOrder || !financials ? (
            <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EBF4FA] text-[#3E92CC]">
                <Wrench className="h-6 w-6" />
              </div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Selecciona una orden o crea una nueva
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                La consola operativa de 3 Zonas permite editar cliente, diagnóstico, repuestos, pagos y evidencias en tiempo real.
              </p>
              <button
                type="button"
                onClick={onOpenNewOrder}
                disabled={!perms.canCreateOrder}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nueva Orden</span>
              </button>
            </div>
          ) : (
            <>
              {/* Active Order Header Card */}
              <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${sectorMeta.bg}`}
                    >
                      <SectorIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h2 className="font-mono text-xl font-bold text-[#0A2463] tracking-tight">
                            {activeOrder.folio}
                          </h2>
                          {activePill && (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${activePill.classes}`}
                            >
                              {activePill.label}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onOpenPublicTrackWithCode(activeOrder.tracking_code)
                            }
                            title="Abrir en Portal Público /track"
                            className="font-mono text-xs font-semibold text-[#3E92CC] hover:text-[#0A2463] hover:underline whitespace-nowrap"
                          >
                            Código: {activeOrder.tracking_code}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 min-w-0 w-full sm:w-auto">
                          <div>
                            <label htmlFor="order-status-select" className="sr-only">
                              Estado de la orden
                            </label>
                            <select
                              id="order-status-select"
                              value={activeOrder.status}
                              onChange={(e) =>
                                patchOrder({ status: e.target.value as OrderStatus })
                              }
                              className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] px-3 py-1.5 text-xs font-semibold text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                            >
                              {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map(
                                (st) => (
                                  <option key={st} value={st}>
                                    {ORDER_STATUS_META[st].label}
                                  </option>
                                )
                              )}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => onOpenPrintCenter(activeOrder.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                          >
                            <Printer className="h-3.5 w-3.5 text-[#3E92CC]" />
                            <span>Imprimir .rpt</span>
                          </button>

                          {tenant.whatsapp_enabled ? (
                            <button
                              type="button"
                              onClick={() => setShowWhatsAppModal(true)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>WhatsApp</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="WhatsApp desactivado por configuración de empresa"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB] text-slate-500 px-3 py-1.5 text-xs font-medium cursor-not-allowed whitespace-nowrap shrink-0"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              <span>WhatsApp desactivado</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-1.5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {activeClient?.name}
                        </span>{' '}
                        · {activeAsset?.category} {activeAsset?.brand}{' '}
                        {activeAsset?.model}{' '}
                        <span className="text-slate-400">(S/N:</span>{' '}
                        <span className="font-mono text-slate-700">
                          {activeAsset?.serial_imei}
                        </span>
                        <span className="text-slate-400">)</span> ·{' '}
                        <span>{activeBranch?.name ?? 'Sucursal'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress & Financial Summary Strip (Matches Overview Table) */}
                <div className="pt-3 border-t border-[#D8E4EC]/60 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-500">
                      Avance de etapa
                    </span>
                    <div className="w-28 h-2 rounded-full bg-[#F4F6FB] border border-[#D8E4EC]/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#3E92CC] transition-all duration-300"
                        style={{ width: `${activeProgress}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-700 tabular-nums">
                      {activeProgress}%
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="text-slate-600">
                      Total:{' '}
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {formatCurrency(financials.totalAmount, tenant.currency)}
                      </span>
                    </div>
                    <div className="text-slate-600">
                      Saldo pendiente:{' '}
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          financials.balanceDue > 0
                            ? 'text-amber-700'
                            : 'text-[#1B998B]'
                        }`}
                      >
                        {formatCurrency(financials.balanceDue, tenant.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Zone Switcher Tabs (All 3 Simultaneous vs Focus Tab) */}
              <div className="bg-white border border-[#D8E4EC]/70 shadow-sm rounded-2xl p-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveZone('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                      activeZone === 'all'
                        ? 'bg-[#0A2463] text-white'
                        : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
                    }`}
                  >
                    Vista Completa
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZone('zone1')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                      activeZone === 'zone1'
                        ? 'bg-[#3E92CC] text-white'
                        : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
                    }`}
                  >
                    1 · Cliente y Equipo
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZone('zone2')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                      activeZone === 'zone2'
                        ? 'bg-[#3E92CC] text-white'
                        : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
                    }`}
                  >
                    2 · Diagnóstico e IVA
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveZone('zone3')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap ${
                      activeZone === 'zone3'
                        ? 'bg-[#3E92CC] text-white'
                        : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
                    }`}
                  >
                    3 · Fotos ({activeOrder.photos.length}) y Préstamo
                  </button>
                </div>
              </div>

              {/* ZONA 1: CLIENTE, MODALIDAD Y EQUIPO MULTIRUBRO */}
              {showZ1 && activeClient && activeAsset && (
                <section
                  aria-label="Zona 1: Identificación del Cliente y Equipo"
                  className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 sm:p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#D8E4EC]/70">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
                        <User className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold text-slate-900">
                          Zona 1 — Cliente, Modalidad y Equipo ({tenant.sector})
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 bg-[#F4F6FB] border border-[#D8E4EC] p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => patchOrder({ modality: 'workshop' })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          activeOrder.modality === 'workshop'
                            ? 'bg-white text-[#0A2463] shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Store className="h-3.5 w-3.5" />
                        <span>Mostrador</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => patchOrder({ modality: 'home_service' })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          activeOrder.modality === 'home_service'
                            ? 'bg-white text-[#0A2463] shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Home className="h-3.5 w-3.5" />
                        <span>Domicilio / Terreno</span>
                      </button>
                    </div>
                  </div>

                  {activeOrder.modality === 'home_service' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 rounded-xl bg-[#EBF4FA]/60 border border-[#3E92CC]/25 p-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0A2463] mb-1">
                          Dirección de Visita a Domicilio
                        </label>
                        <input
                          type="text"
                          value={activeOrder.visit_address ?? ''}
                          onChange={(e) =>
                            patchOrder({ visit_address: e.target.value })
                          }
                          placeholder="Dirección exacta de atención"
                          className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#0A2463] mb-1">
                          Fecha y Hora Programada
                        </label>
                        <input
                          type="datetime-local"
                          value={activeOrder.visit_scheduled_at ?? ''}
                          onChange={(e) =>
                            patchOrder({ visit_scheduled_at: e.target.value })
                          }
                          className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Client Inputs */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-800">
                        Datos del Cliente
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Nombre / Razón Social
                          </label>
                          <input
                            type="text"
                            value={activeClient.name}
                            onChange={(e) =>
                              onUpdateClient({ ...activeClient, name: e.target.value })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            RUT / ID Tributario
                          </label>
                          <input
                            type="text"
                            value={activeClient.rut}
                            onChange={(e) =>
                              onUpdateClient({ ...activeClient, rut: e.target.value })
                            }
                            className={`${INPUT_CLASS} font-mono`}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Teléfono WhatsApp
                          </label>
                          <input
                            type="text"
                            value={activeClient.phone}
                            onChange={(e) =>
                              onUpdateClient({ ...activeClient, phone: e.target.value })
                            }
                            className={`${INPUT_CLASS} font-mono`}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Email
                          </label>
                          <input
                            type="email"
                            value={activeClient.email}
                            onChange={(e) =>
                              onUpdateClient({ ...activeClient, email: e.target.value })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Dirección / Ciudad
                          </label>
                          <input
                            type="text"
                            value={`${activeClient.address}${
                              activeClient.city ? `, ${activeClient.city}` : ''
                            }`}
                            onChange={(e) =>
                              onUpdateClient({
                                ...activeClient,
                                address: e.target.value,
                                city: '',
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Equipment Inputs */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-slate-800">
                        Identificación del Equipo
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Categoría
                          </label>
                          <input
                            type="text"
                            value={activeAsset.category}
                            onChange={(e) =>
                              onUpdateAsset({
                                ...activeAsset,
                                category: e.target.value,
                              })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Marca / Modelo
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={activeAsset.brand}
                              onChange={(e) =>
                                onUpdateAsset({
                                  ...activeAsset,
                                  brand: e.target.value,
                                })
                              }
                              placeholder="Marca"
                              className={INPUT_CLASS}
                            />
                            <input
                              type="text"
                              value={activeAsset.model}
                              onChange={(e) =>
                                onUpdateAsset({
                                  ...activeAsset,
                                  model: e.target.value,
                                })
                              }
                              placeholder="Modelo"
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            N° Serie / IMEI
                          </label>
                          <input
                            type="text"
                            value={activeAsset.serial_imei}
                            onChange={(e) =>
                              onUpdateAsset({
                                ...activeAsset,
                                serial_imei: e.target.value,
                              })
                            }
                            className={`${INPUT_CLASS} font-mono`}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Clave / Patrón + Técnico
                          </label>
                          <div className="grid grid-cols-5 gap-2">
                            <input
                              type="text"
                              value={activeAsset.password_pattern ?? ''}
                              onChange={(e) =>
                                onUpdateAsset({
                                  ...activeAsset,
                                  password_pattern: e.target.value,
                                })
                              }
                              placeholder="Clave"
                              className={`${INPUT_CLASS} col-span-2 font-mono`}
                            />
                            <input
                              type="text"
                              value={activeOrder.assigned_technician}
                              onChange={(e) =>
                                patchOrder({ assigned_technician: e.target.value })
                              }
                              placeholder="Técnico"
                              className={`${INPUT_CLASS} col-span-3`}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Accesorios Recibidos
                          </label>
                          <input
                            type="text"
                            value={activeOrder.accessories_received}
                            onChange={(e) =>
                              patchOrder({ accessories_received: e.target.value })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            Estado Físico / Estético Entrada
                          </label>
                          <input
                            type="text"
                            value={activeOrder.entry_condition}
                            onChange={(e) =>
                              patchOrder({ entry_condition: e.target.value })
                            }
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Sector Attributes */}
                  <div className="rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-4">
                    <div className="text-xs font-semibold text-slate-700 mb-2.5">
                      Atributos Dinámicos del Rubro ({tenant.sector})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {sectorFields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                            {field.label}
                          </label>
                          <input
                            type="text"
                            value={activeAsset.custom_attributes[field.key] ?? ''}
                            onChange={(e) =>
                              onUpdateAsset({
                                ...activeAsset,
                                custom_attributes: {
                                  ...activeAsset.custom_attributes,
                                  [field.key]: e.target.value,
                                },
                              })
                            }
                            placeholder={field.placeholder}
                            className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#3E92CC] focus:outline-none transition-colors"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* ZONA 2: DIAGNÓSTICO, REPUESTOS HÍBRIDOS Y LIQUIDACIÓN IVA */}
              {showZ2 && (
                <section
                  aria-label="Zona 2: Diagnóstico, Repuestos Híbridos y Liquidación"
                  className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 sm:p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#D8E4EC]/70">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <h3 className="font-display text-sm font-semibold text-slate-900">
                        Zona 2 — Diagnóstico Técnico, Repuestos Híbridos y Liquidación
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <span className="font-medium">Garantía (días):</span>
                        <input
                          type="number"
                          min={0}
                          max={730}
                          value={activeOrder.warranty_days ?? tenant.warranty_days ?? 90}
                          onChange={(e) =>
                            patchOrder({
                              warranty_days: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/70 px-2.5 py-1.5 text-right font-mono text-xs tabular-nums focus:bg-white focus:border-[#3E92CC] focus:outline-none"
                        />
                      </label>
                      <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
                        Guardado automático
                      </span>
                    </div>
                  </div>

                  {/* 4 Classic CP Reparaciones Textareas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Síntomas Reportados (Cliente)
                      </label>
                      <textarea
                        rows={3}
                        value={activeOrder.reported_symptoms}
                        onChange={(e) =>
                          patchOrder({ reported_symptoms: e.target.value })
                        }
                        className={`${INPUT_CLASS} leading-relaxed`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Diagnóstico Técnico
                      </label>
                      <textarea
                        rows={3}
                        disabled={!perms.canEditDiagnosis}
                        value={activeOrder.technical_diagnosis}
                        onChange={(e) =>
                          patchOrder({ technical_diagnosis: e.target.value })
                        }
                        placeholder="Evaluación técnica de la falla..."
                        className={`${INPUT_CLASS} leading-relaxed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Informe de Trabajo Realizado
                      </label>
                      <textarea
                        rows={2}
                        disabled={!perms.canEditDiagnosis}
                        value={activeOrder.work_performed}
                        onChange={(e) =>
                          patchOrder({ work_performed: e.target.value })
                        }
                        placeholder="Detalle de reparación ejecutada..."
                        className={`${INPUT_CLASS} leading-relaxed disabled:opacity-60`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Repuestos y Observaciones Impresas (Garantía)
                      </label>
                      <textarea
                        rows={2}
                        value={activeOrder.parts_and_observations}
                        onChange={(e) =>
                          patchOrder({ parts_and_observations: e.target.value })
                        }
                        placeholder="Observaciones visibles en comprobante de salida..."
                        className={`${INPUT_CLASS} leading-relaxed`}
                      />
                    </div>
                  </div>

                  {/* Hybrid Parts & Labor System */}
                  <div className="border-t border-[#D8E4EC]/70 pt-5 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-display text-xs font-semibold text-slate-900">
                        Detalle Híbrido de Repuestos y Mano de Obra
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Stock de sucursal se descuenta automáticamente
                      </span>
                    </div>

                    {/* Add from Stock vs Free Item */}
                    {perms.canEditFinancials && (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5">
                        {/* From Stock */}
                        <div className="rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-3.5 space-y-2.5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <PackagePlus className="h-3.5 w-3.5 text-[#3E92CC]" />
                            <span>1. Agregar desde Stock de Sucursal</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={selectedCatalogId || branchCatalog[0]?.id || ''}
                              onChange={(e) => setSelectedCatalogId(e.target.value)}
                              className="flex-1 min-w-[180px] rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                            >
                              {branchCatalog.map((item) => (
                                <option key={item.id} value={item.id}>
                                  [{item.sku}] {item.name} — Stock: {item.stock_qty} (
                                  {formatCurrency(item.sale_price, tenant.currency)})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={catalogQty}
                              onChange={(e) =>
                                setCatalogQty(
                                  Math.max(1, Number(e.target.value) || 1)
                                )
                              }
                              aria-label="Cantidad desde stock"
                              className="w-16 rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-2 text-xs font-mono text-center focus:border-[#3E92CC] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleAddCatalogItem}
                              disabled={branchCatalog.length === 0}
                              className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                            >
                              + Agregar Stock
                            </button>
                          </div>
                        </div>

                        {/* Free Item */}
                        <form
                          onSubmit={handleAddFreeItem}
                          className="rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                            <Plus className="h-3.5 w-3.5 text-[#0A2463]" />
                            <span>2. Agregar Ítem Libre (Fuera de Stock)</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={freeDesc}
                              onChange={(e) => setFreeDesc(e.target.value)}
                              placeholder="Descripción repuesto externo o servicio..."
                              className="flex-1 min-w-[160px] rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                            />
                            <input
                              type="number"
                              min={1}
                              value={freeQty}
                              onChange={(e) =>
                                setFreeQty(Math.max(1, Number(e.target.value) || 1))
                              }
                              aria-label="Cantidad ítem libre"
                              className="w-14 rounded-xl border border-[#D8E4EC] bg-white px-2 py-2 text-xs font-mono text-center focus:border-[#3E92CC] focus:outline-none"
                            />
                            <input
                              type="number"
                              min={0}
                              value={freePrice}
                              onChange={(e) => setFreePrice(e.target.value)}
                              placeholder="Precio unit."
                              className="w-24 rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-2 text-xs font-mono focus:border-[#3E92CC] focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                            >
                              + Ítem Libre
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Items Table (Aligned with Overview Table) */}
                    <div className="overflow-x-auto rounded-xl border border-[#D8E4EC]/80">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#F4F6FB]/70 border-b border-[#D8E4EC]/70 text-xs font-medium text-slate-500">
                            <th className="py-2.5 px-3.5">Origen</th>
                            <th className="py-2.5 px-3.5">Descripción</th>
                            <th className="py-2.5 px-3.5 text-right">Cant.</th>
                            <th className="py-2.5 px-3.5 text-right">P. Unitario</th>
                            <th className="py-2.5 px-3.5 text-right">Subtotal</th>
                            <th className="py-2.5 px-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#D8E4EC]/50">
                          {activeOrder.items.length === 0 ? (
                            <tr>
                              <td
                                colSpan={6}
                                className="py-5 px-3.5 text-center text-slate-500"
                              >
                                Aún no se han cargado repuestos o mano de obra en esta orden.
                              </td>
                            </tr>
                          ) : (
                            activeOrder.items.map((item) => (
                              <tr
                                key={item.id}
                                className="hover:bg-[#F4F6FB]/60 transition-colors"
                              >
                                <td className="py-2.5 px-3.5 font-mono text-[11px] whitespace-nowrap">
                                  <span
                                    className={
                                      item.source === 'catalog'
                                        ? 'text-[#3E92CC] font-semibold'
                                        : 'text-slate-500 font-medium'
                                    }
                                  >
                                    {item.source === 'catalog'
                                      ? item.sku ?? 'STOCK'
                                      : 'LIBRE'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3.5 font-medium text-slate-800">
                                  {item.description}
                                </td>
                                <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-700">
                                  {item.qty}
                                </td>
                                <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-700">
                                  {formatCurrency(item.unit_price, tenant.currency)}
                                </td>
                                <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                                  {formatCurrency(
                                    item.qty * item.unit_price,
                                    tenant.currency
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {perms.canEditFinancials && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveOrderItem(item)}
                                      aria-label={`Eliminar ${item.description}`}
                                      className="p-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Financial Liquidation + Payments */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 border-t border-[#D8E4EC]/70 pt-5">
                    {/* Payments Registration */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-[#3E92CC]" />
                          <span>Abonos y Pagos Registrados</span>
                        </h4>
                      </div>

                      {perms.canReceivePayments && (
                        <form
                          onSubmit={handleAddPayment}
                          className="flex flex-wrap items-center gap-2 rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-3"
                        >
                          <input
                            type="number"
                            min={1}
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            placeholder="Monto abono"
                            className="w-28 rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono focus:border-[#3E92CC] focus:outline-none"
                          />
                          <select
                            value={payMethod}
                            onChange={(e) =>
                              setPayMethod(e.target.value as PaymentMethod)
                            }
                            className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-2 text-xs focus:border-[#3E92CC] focus:outline-none"
                          >
                            <option value="transfer">Transferencia</option>
                            <option value="cash">Efectivo</option>
                            <option value="card">Tarjeta POS</option>
                          </select>
                          <input
                            type="text"
                            value={payRef}
                            onChange={(e) => setPayRef(e.target.value)}
                            placeholder="Ref. / Comprobante"
                            className="flex-1 min-w-[100px] rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono focus:border-[#3E92CC] focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            Registrar Abono
                          </button>
                        </form>
                      )}

                      {activeOrder.payments.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Sin abonos registrados todavía.
                        </p>
                      ) : (
                        <div className="divide-y divide-[#D8E4EC]/50 rounded-xl border border-[#D8E4EC]/80 bg-white">
                          {activeOrder.payments.map((p) => (
                            <div
                              key={p.id}
                              className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-mono text-slate-500">
                                  {p.date}
                                </span>{' '}
                                <span className="font-medium text-slate-800">
                                  ·{' '}
                                  {p.method === 'transfer'
                                    ? 'Transferencia'
                                    : p.method === 'cash'
                                    ? 'Efectivo'
                                    : 'Tarjeta'}
                                </span>
                                {p.reference && (
                                  <span className="font-mono text-slate-500">
                                    {' '}
                                    ({p.reference})
                                  </span>
                                )}
                              </div>
                              <span className="font-mono font-bold text-[#1B998B] tabular-nums whitespace-nowrap">
                                {formatCurrency(p.amount, tenant.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Totals Summary & IVA Toggle */}
                    <div className="rounded-2xl bg-[#F4F6FB]/80 border border-[#D8E4EC] p-5 space-y-2.5">
                      <div className="flex items-center justify-between pb-2.5 border-b border-[#D8E4EC]">
                        <label
                          htmlFor="iva-toggle"
                          className="text-xs font-semibold text-slate-800 cursor-pointer select-none"
                        >
                          Aplicar / Desglosar IVA ({tenant.iva_rate}%)
                        </label>
                        <button
                          id="iva-toggle"
                          type="button"
                          role="switch"
                          aria-checked={activeOrder.apply_iva}
                          onClick={() =>
                            patchOrder({ apply_iva: !activeOrder.apply_iva })
                          }
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            activeOrder.apply_iva ? 'bg-[#1B998B]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              activeOrder.apply_iva ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Subtotal Neto</span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(financials.subtotal, tenant.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <label htmlFor="discount-input">Descuento</label>
                        <input
                          id="discount-input"
                          type="number"
                          min={0}
                          disabled={!perms.canEditFinancials}
                          value={activeOrder.discount_amount}
                          onChange={(e) =>
                            patchOrder({
                              discount_amount: Math.max(
                                0,
                                Number(e.target.value) || 0
                              ),
                            })
                          }
                          className="w-28 rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1.5 text-right font-mono text-xs tabular-nums focus:border-[#3E92CC] focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>
                          IVA (
                          {activeOrder.apply_iva
                            ? `${tenant.iva_rate}%`
                            : 'Exento / Sin desglose'}
                          )
                        </span>
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(financials.ivaAmount, tenant.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-[#D8E4EC] text-sm font-bold text-[#0A2463]">
                        <span>Total Orden</span>
                        <span className="font-mono tabular-nums">
                          {formatCurrency(financials.totalAmount, tenant.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-[#1B998B] font-semibold">
                        <span>Abonos Pagados</span>
                        <span className="font-mono tabular-nums">
                          - {formatCurrency(financials.paidAmount, tenant.currency)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-[#D8E4EC] text-sm font-bold">
                        <span className="text-slate-800">Saldo Pendiente</span>
                        <span
                          className={`font-mono tabular-nums ${
                            financials.balanceDue > 0
                              ? 'text-amber-700'
                              : 'text-[#1B998B]'
                          }`}
                        >
                          {formatCurrency(financials.balanceDue, tenant.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ZONA 3: EVIDENCIA FOTOGRÁFICA Y EQUIPOS EN PRÉSTAMO */}
              {showZ3 && (
                <section
                  aria-label="Zona 3: Evidencia Fotográfica y Equipos en Préstamo"
                  className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 sm:p-6 space-y-5"
                >
                  <div className="flex items-center gap-2.5 pb-3.5 border-b border-[#D8E4EC]/70">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EBF4FA] text-[#3E92CC]">
                      <Camera className="h-4 w-4" />
                    </div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Zona 3 — Evidencia Fotográfica y Control de Equipo en Préstamo
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Photos Column (2/3) */}
                    <div className="xl:col-span-2 space-y-3.5">
                      <div className="font-display text-xs font-semibold text-slate-800">
                        Registro Fotográfico por Etapa ({activeOrder.photos.length})
                      </div>

                      <form
                        onSubmit={handleAddPhotoUrl}
                        className="rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-3.5 space-y-2.5"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <select
                            value={photoStage}
                            onChange={(e) =>
                              setPhotoStage(e.target.value as PhotoStage)
                            }
                            aria-label="Etapa de la fotografía"
                            className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                          >
                            <option value="reception">Etapa: Recepción</option>
                            <option value="diagnosis">Etapa: Diagnóstico</option>
                            <option value="delivery">Etapa: Entrega</option>
                          </select>
                          <input
                            type="text"
                            value={photoCaption}
                            onChange={(e) => setPhotoCaption(e.target.value)}
                            placeholder="Descripción de evidencia (ej. Bisagra quebrada)"
                            className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="url"
                            value={photoUrlInput}
                            onChange={(e) => setPhotoUrlInput(e.target.value)}
                            placeholder="Pegar URL de imagen o subir archivo local..."
                            className="flex-1 min-w-[180px] rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                          />
                          <button
                            type="submit"
                            className="rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            + Agregar URL
                          </button>
                          <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] text-white px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap">
                            <Camera className="h-3.5 w-3.5" />
                            <span>Tomar Foto</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              disabled={uploadingPhoto}
                              onChange={handlePhotoFileUpload}
                              className="hidden"
                            />
                          </label>
                          <label className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-3.5 py-2 text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap">
                            <Upload className="h-3.5 w-3.5" />
                            <span>
                              {uploadingPhoto ? 'Procesando WebP...' : 'Subir Foto WebP'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingPhoto}
                              onChange={handlePhotoFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {photoStatusMsg && (
                          <div className="text-[11px] font-medium text-[#3E92CC]">
                            {photoStatusMsg}
                          </div>
                        )}
                      </form>

                      {activeOrder.photos.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-[#D8E4EC] bg-[#F4F6FB]/40 p-6 text-center text-xs text-slate-500">
                          No hay fotografías adjuntas en esta orden. Sube evidencia de recepción, diagnóstico o entrega.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {activeOrder.photos.map((photo) => (
                            <div
                              key={photo.id}
                              className="rounded-xl border border-[#D8E4EC]/80 overflow-hidden bg-white shadow-sm"
                            >
                              <button
                                type="button"
                                onClick={() => setLightboxPhoto(photo)}
                                className="block w-full aspect-video bg-[#F4F6FB] overflow-hidden"
                              >
                                <img
                                  src={photo.url}
                                  alt={photo.caption}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover hover:scale-105 transition-transform duration-200"
                                />
                              </button>
                              <div className="p-3 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="inline-flex items-center rounded-full bg-[#EBF4FA] px-2 py-0.5 text-[10px] font-semibold text-[#3E92CC]">
                                    {photo.stage === 'reception'
                                      ? 'Recepción'
                                      : photo.stage === 'diagnosis'
                                      ? 'Diagnóstico'
                                      : 'Entrega'}
                                  </span>
                                  <p className="mt-1 text-xs text-slate-700 line-clamp-2">
                                    {photo.caption}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePhoto(photo.id)}
                                  aria-label={`Eliminar foto ${photo.caption}`}
                                  className="p-1 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 shrink-0 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Loan Equipment Column (1/3) */}
                    <div className="space-y-3.5">
                      <div className="font-display text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                        <Laptop className="h-4 w-4 text-[#3E92CC]" />
                        <span>Equipo en Préstamo (Respaldo)</span>
                      </div>

                      {activeOrder.loan && !activeOrder.loan.returned_at ? (
                        <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 space-y-3">
                          <div>
                            <div className="font-mono text-xs font-bold text-amber-900">
                              {activeOrder.loan.asset_code}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                              {activeOrder.loan.asset_name}
                            </div>
                            <div className="mt-1 text-xs text-slate-600">
                              Prestado el{' '}
                              {new Date(
                                activeOrder.loan.loaned_at
                              ).toLocaleDateString('es-CL')}
                            </div>
                            {activeOrder.loan.delivery_notes && (
                              <div className="mt-1.5 text-xs text-slate-700">
                                Nota: {activeOrder.loan.delivery_notes}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onReturnLoanAsset(activeOrder.id)}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0A2463] hover:bg-[#1E3A8A] text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Registrar Devolución del Equipo</span>
                          </button>
                        </div>
                      ) : activeOrder.loan?.returned_at ? (
                        <div className="rounded-xl bg-[#EBF8F6] border border-[#1B998B]/30 p-4 space-y-1">
                          <div className="text-xs font-bold text-[#157A6E]">
                            Préstamo Devuelto Conforme
                          </div>
                          <div className="text-xs text-slate-700">
                            {activeOrder.loan.asset_code} —{' '}
                            {activeOrder.loan.asset_name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Devuelto:{' '}
                            {new Date(
                              activeOrder.loan.returned_at
                            ).toLocaleDateString('es-CL')}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-[#F4F6FB]/70 border border-[#D8E4EC]/80 p-4 space-y-3">
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Asigna un equipo de respaldo disponible mientras se repara el equipo del cliente.
                          </p>
                          <select
                            value={loanAssetToAssign || availableLoans[0]?.id || ''}
                            onChange={(e) => setLoanAssetToAssign(e.target.value)}
                            className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                          >
                            {availableLoans.length === 0 ? (
                              <option value="">No hay equipos disponibles</option>
                            ) : (
                              availableLoans.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.code}: {l.name}
                                </option>
                              ))
                            )}
                          </select>
                          <input
                            type="text"
                            value={loanNotes}
                            onChange={(e) => setLoanNotes(e.target.value)}
                            placeholder="Accesorios entregados en préstamo..."
                            className="w-full rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#3E92CC] focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={availableLoans.length === 0}
                            onClick={() => {
                              const targetId =
                                loanAssetToAssign || availableLoans[0]?.id;
                              if (!targetId) return;
                              onAssignLoanAsset(
                                activeOrder.id,
                                targetId,
                                loanNotes.trim() || 'Entregado en préstamo operativo'
                              );
                              setLoanNotes('');
                            }}
                            className="w-full rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] disabled:opacity-50 text-white px-3.5 py-2 text-xs font-semibold transition-colors"
                          >
                            Asignar Equipo en Préstamo
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/80 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-3xl w-full rounded-2xl bg-white border border-[#D8E4EC] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#D8E4EC]/70">
              <div className="text-xs font-semibold text-slate-800">
                {lightboxPhoto.caption}
              </div>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                aria-label="Cerrar vista ampliada"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-[#F4F6FB] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-slate-900 flex items-center justify-center max-h-[75vh]">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Preview Modal */}
      {showWhatsAppModal && activeOrder && (
        <WhatsAppModal
          order={activeOrder}
          client={activeClient}
          asset={activeAsset}
          branch={activeBranch}
          tenant={tenant}
          onClose={() => setShowWhatsAppModal(false)}
        />
      )}
    </div>
  );
};
