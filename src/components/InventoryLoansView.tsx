import React, { useEffect, useMemo, useState } from 'react';
import { Laptop, Minus, Package, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Branch, CatalogItem, LoanAsset, RoleType, Tenant } from '../types/erp';
import { formatCurrency, getRolePermissions } from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';
import { AlertBanner } from './ui/AlertBanner';

interface InventoryLoansViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  lockedBranchId?: string | null;
  activeRole: RoleType;
  catalogItems: CatalogItem[];
  loanAssets: LoanAsset[];
  onAddCatalogItem: (item: CatalogItem) => Promise<{ ok: boolean; error?: string }> | void;
  onUpdateCatalogItem: (item: CatalogItem) => Promise<{ ok: boolean; error?: string }>;
  onDeleteCatalogItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
  onAdjustStock: (itemId: string, delta: number) => Promise<{ ok: boolean; error?: string }>;
  onAddLoanAsset: (loan: LoanAsset) => Promise<{ ok: boolean; error?: string }> | void;
  onUpdateLoanAsset: (loan: LoanAsset) => Promise<{ ok: boolean; error?: string }>;
  onDeleteLoanAsset: (loanId: string) => Promise<{ ok: boolean; error?: string }>;
  onUpdateLoanStatus: (loanId: string, status: LoanAsset['status']) => void;
}

export const InventoryLoansView: React.FC<InventoryLoansViewProps> = ({
  tenant,
  branches,
  activeBranchId,
  lockedBranchId,
  activeRole,
  catalogItems,
  loanAssets,
  onAddCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  onAdjustStock,
  onAddLoanAsset,
  onUpdateLoanAsset,
  onDeleteLoanAsset,
  onUpdateLoanStatus,
}) => {
  const [tab, setTab] = useState<'catalog' | 'loans'>('catalog');
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewLoan, setShowNewLoan] = useState(false);
  const [invError, setInvError] = useState<string | null>(null);
  const [invSuccess, setInvSuccess] = useState<string | null>(null);
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);

  const perms = getRolePermissions(activeRole);
  const tenantBranches = useMemo(
    () => branches.filter((b) => b.tenant_id === tenant.id),
    [branches, tenant.id]
  );
  const visibleBranches = useMemo(
    () =>
      lockedBranchId
        ? tenantBranches.filter((b) => b.id === lockedBranchId)
        : tenantBranches,
    [lockedBranchId, tenantBranches]
  );
  const effectiveDefaultBranches =
    visibleBranches.length > 0 ? visibleBranches : tenantBranches;
  const defaultBranchId =
    lockedBranchId ||
    (activeBranchId !== 'ALL' && tenantBranches.some((b) => b.id === activeBranchId)
      ? activeBranchId
      : effectiveDefaultBranches.find((b) => b.is_hq)?.id ??
        effectiveDefaultBranches[0]?.id ??
        '');

  // New Catalog Item state
  const [itemBranch, setItemBranch] = useState(defaultBranchId);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'part' | 'service'>('part');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [stockQty, setStockQty] = useState('5');
  const [minStock, setMinStock] = useState('2');

  // Edit / Delete Catalog Item state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemDraft, setEditItemDraft] = useState({
    sku: '',
    name: '',
    category: 'part' as 'part' | 'service',
    costPrice: '0',
    salePrice: '0',
    stockQty: '0',
    minStock: '0',
  });
  const [savingItemEdit, setSavingItemEdit] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // New Loan Asset state
  const [loanBranch, setLoanBranch] = useState(defaultBranchId);
  const [loanCode, setLoanCode] = useState('');
  const [loanName, setLoanName] = useState('');
  const [loanModel, setLoanModel] = useState('');
  const [loanSerial, setLoanSerial] = useState('');
  const [loanNotes, setLoanNotes] = useState('');

  // Edit / Delete Loan Asset state
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editLoanDraft, setEditLoanDraft] = useState({
    code: '',
    name: '',
    brand_model: '',
    serial_number: '',
    condition_notes: '',
  });
  const [savingLoanEdit, setSavingLoanEdit] = useState(false);
  const [confirmDeleteLoanId, setConfirmDeleteLoanId] = useState<string | null>(null);
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);

  useEffect(() => {
    setItemBranch(defaultBranchId);
    setLoanBranch(defaultBranchId);
  }, [tenant.id, defaultBranchId]);

  useEffect(() => {
    setShowNewItem(false);
    setShowNewLoan(false);
    setEditingItemId(null);
    setEditingLoanId(null);
    setConfirmDeleteItemId(null);
    setConfirmDeleteLoanId(null);
  }, [activeRole, tenant.id]);

  const scopedCatalog = useMemo(
    () =>
      catalogItems.filter(
        (c) => c.tenant_id === tenant.id && (activeBranchId === 'ALL' || c.branch_id === activeBranchId)
      ),
    [catalogItems, tenant.id, activeBranchId]
  );
  const scopedLoans = useMemo(
    () =>
      loanAssets.filter(
        (l) => l.tenant_id === tenant.id && (activeBranchId === 'ALL' || l.branch_id === activeBranchId)
      ),
    [loanAssets, tenant.id, activeBranchId]
  );
  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const resolveValidBranch = (candidate: string) =>
    effectiveDefaultBranches.some((b) => b.id === candidate) ? candidate : defaultBranchId;

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !perms.canManageStock || !perms.canManageCatalogPrices) return;
    setInvError(null);
    setInvSuccess(null);
    const parsedMinStock =
      minStock.trim() === '' ? 1 : Math.max(0, Number(minStock) || 0);
    const res = await onAddCatalogItem({
      id: generateUUID(),
      tenant_id: tenant.id,
      branch_id: resolveValidBranch(itemBranch),
      sku: sku.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name.trim(),
      category,
      cost_price: Math.max(0, Number(costPrice) || 0),
      sale_price: Math.max(0, Number(salePrice) || 0),
      stock_qty: Math.max(0, Number(stockQty) || 0),
      min_stock: parsedMinStock,
    });
    if (res && !res.ok) {
      setInvError(res.error ?? 'No se pudo guardar el ítem en Supabase.');
      return;
    }
    setSku('');
    setName('');
    setCostPrice('');
    setSalePrice('');
    setShowNewItem(false);
    setInvSuccess('Ítem agregado al catálogo.');
  };

  const openEditItem = (item: CatalogItem) => {
    setInvError(null);
    setInvSuccess(null);
    setConfirmDeleteItemId(null);
    setShowNewItem(false);
    setEditingItemId(item.id);
    setEditItemDraft({
      sku: item.sku,
      name: item.name,
      category: item.category,
      costPrice: String(item.cost_price),
      salePrice: String(item.sale_price),
      stockQty: String(item.stock_qty),
      minStock: String(item.min_stock),
    });
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId || !perms.canManageStock || !perms.canManageCatalogPrices) return;
    const existing = catalogItems.find((c) => c.id === editingItemId);
    if (!existing) {
      setEditingItemId(null);
      return;
    }
    if (!editItemDraft.name.trim()) {
      setInvError('El nombre del ítem es obligatorio.');
      return;
    }
    setInvError(null);
    setInvSuccess(null);
    setSavingItemEdit(true);
    const res = await onUpdateCatalogItem({
      ...existing,
      sku: editItemDraft.sku.trim() || existing.sku,
      name: editItemDraft.name.trim(),
      category: editItemDraft.category,
      cost_price: perms.canManageInventoryCosts
        ? Math.max(0, Number(editItemDraft.costPrice) || 0)
        : existing.cost_price,
      sale_price: Math.max(0, Number(editItemDraft.salePrice) || 0),
      stock_qty: Math.max(0, Number(editItemDraft.stockQty) || 0),
      min_stock:
        editItemDraft.minStock.trim() === ''
          ? 0
          : Math.max(0, Number(editItemDraft.minStock) || 0),
    });
    setSavingItemEdit(false);
    if (!res.ok) {
      setInvError(res.error ?? 'No se pudo actualizar el ítem.');
      return;
    }
    setEditingItemId(null);
    setInvSuccess(`Ítem "${editItemDraft.name.trim()}" actualizado.`);
  };

  const handleConfirmDeleteItem = async (item: CatalogItem) => {
    setInvError(null);
    setInvSuccess(null);
    setDeletingItemId(item.id);
    const res = await onDeleteCatalogItem(item.id);
    setDeletingItemId(null);
    setConfirmDeleteItemId(null);
    if (!res.ok) {
      setInvError(res.error ?? 'No se pudo eliminar el ítem del catálogo.');
      return;
    }
    if (editingItemId === item.id) setEditingItemId(null);
    setInvSuccess(`Ítem "${item.name}" eliminado.`);
  };

  const handleAdjust = async (itemId: string, delta: number) => {
    setInvError(null);
    setInvSuccess(null);
    setAdjustingItemId(itemId);
    const res = await onAdjustStock(itemId, delta);
    setAdjustingItemId(null);
    if (!res.ok) {
      setInvError(res.error ?? 'No se pudo ajustar el stock.');
    }
  };

  const handleCreateLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanName.trim() || !loanCode.trim() || !perms.canManageStock) return;
    setInvError(null);
    setInvSuccess(null);
    const res = await onAddLoanAsset({
      id: generateUUID(),
      tenant_id: tenant.id,
      branch_id: resolveValidBranch(loanBranch),
      code: loanCode.trim().toUpperCase(),
      name: loanName.trim(),
      brand_model: loanModel.trim() || 'Estándar taller',
      serial_number: loanSerial.trim() || 'S/N',
      status: 'available',
      condition_notes: loanNotes.trim() || 'Operativo para préstamo',
    });
    if (res && !res.ok) {
      setInvError(res.error ?? 'No se pudo crear el equipo de préstamo.');
      return;
    }
    setLoanCode('');
    setLoanName('');
    setLoanModel('');
    setLoanSerial('');
    setLoanNotes('');
    setShowNewLoan(false);
    setInvSuccess('Equipo de préstamo registrado.');
  };

  const openEditLoan = (loan: LoanAsset) => {
    setInvError(null);
    setInvSuccess(null);
    setConfirmDeleteLoanId(null);
    setShowNewLoan(false);
    setEditingLoanId(loan.id);
    setEditLoanDraft({
      code: loan.code,
      name: loan.name,
      brand_model: loan.brand_model,
      serial_number: loan.serial_number,
      condition_notes: loan.condition_notes,
    });
  };

  const handleSaveEditLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoanId || !perms.canManageStock) return;
    const existing = loanAssets.find((l) => l.id === editingLoanId);
    if (!existing) {
      setEditingLoanId(null);
      return;
    }
    if (!editLoanDraft.code.trim() || !editLoanDraft.name.trim()) {
      setInvError('Código y nombre del equipo de préstamo son obligatorios.');
      return;
    }
    setInvError(null);
    setInvSuccess(null);
    setSavingLoanEdit(true);
    const res = await onUpdateLoanAsset({
      ...existing,
      code: editLoanDraft.code.trim().toUpperCase(),
      name: editLoanDraft.name.trim(),
      brand_model: editLoanDraft.brand_model.trim() || existing.brand_model,
      serial_number: editLoanDraft.serial_number.trim() || existing.serial_number,
      condition_notes: editLoanDraft.condition_notes.trim(),
    });
    setSavingLoanEdit(false);
    if (!res.ok) {
      setInvError(res.error ?? 'No se pudo actualizar el equipo de préstamo.');
      return;
    }
    setEditingLoanId(null);
    setInvSuccess(`Equipo de préstamo "${editLoanDraft.code.trim().toUpperCase()}" actualizado.`);
  };

  const handleConfirmDeleteLoan = async (loan: LoanAsset) => {
    setInvError(null);
    setInvSuccess(null);
    setDeletingLoanId(loan.id);
    const res = await onDeleteLoanAsset(loan.id);
    setDeletingLoanId(null);
    setConfirmDeleteLoanId(null);
    if (!res.ok) {
      setInvError(res.error ?? 'No se pudo eliminar el equipo de préstamo.');
      return;
    }
    if (editingLoanId === loan.id) setEditingLoanId(null);
    setInvSuccess(`Equipo "${loan.name}" eliminado.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900">
            Stock Básico y Equipos de Préstamo
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de repuestos, servicios y flota de respaldo por sucursal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-[#D8E4EC] p-1 rounded-xl shadow-sm">
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                tab === 'catalog'
                  ? 'bg-[#0A2463] text-white'
                  : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>Catálogo Stock ({scopedCatalog.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('loans')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                tab === 'loans'
                  ? 'bg-[#0A2463] text-white'
                  : 'text-slate-600 hover:bg-[#F4F6FB] hover:text-slate-900'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Equipos Préstamo ({scopedLoans.length})</span>
            </button>
          </div>

          {perms.canManageStock && perms.canManageCatalogPrices && tab === 'catalog' && (
            <button
              type="button"
              onClick={() => {
                setEditingItemId(null);
                setShowNewItem((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Ítem Stock</span>
            </button>
          )}
          {perms.canManageStock && tab === 'loans' && (
            <button
              type="button"
              onClick={() => {
                setEditingLoanId(null);
                setShowNewLoan((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Equipo Préstamo</span>
            </button>
          )}
        </div>
      </div>

      {invError && (
        <AlertBanner
          variant="error"
          message={invError}
          onDismiss={() => setInvError(null)}
        />
      )}

      {invSuccess && (
        <AlertBanner
          variant="success"
          message={invSuccess}
          onDismiss={() => setInvSuccess(null)}
        />
      )}

      {tab === 'catalog' && (
        <div className="space-y-4">
          {showNewItem && perms.canManageStock && perms.canManageCatalogPrices && (
            <form
              onSubmit={handleCreateItem}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4"
            >
              <h2 className="text-sm font-semibold text-slate-900">
                Agregar Repuesto o Servicio al Catálogo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={itemBranch}
                  disabled={Boolean(lockedBranchId)}
                  onChange={(e) => setItemBranch(e.target.value)}
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors disabled:opacity-75"
                >
                  {effectiveDefaultBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="SKU (Ej: SSD-NVME-1TB)"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre repuesto o servicio *"
                  className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'part' | 'service')}
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                >
                  <option value="part">Repuesto Físico</option>
                  <option value="service">Servicio / Mano de Obra</option>
                </select>
                {perms.canManageInventoryCosts && (
                  <input
                    type="number"
                    min={0}
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="Precio Costo"
                    className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                )}
                <input
                  type="number"
                  min={0}
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="Precio Venta *"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="Stock"
                    className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-2.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                  <input
                    type="number"
                    min={0}
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="Mínimo"
                    className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-2.5 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#D8E4EC]/60">
                <button
                  type="button"
                  onClick={() => setShowNewItem(false)}
                  className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  Guardar Ítem
                </button>
              </div>
            </form>
          )}

          {editingItemId && perms.canManageStock && perms.canManageCatalogPrices && (
            <form
              onSubmit={handleSaveEditItem}
              className="rounded-2xl bg-[#F4F6FB] border border-[#3E92CC]/40 shadow-sm p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#0A2463]">
                  Editar Ítem de Catálogo
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingItemId(null)}
                  aria-label="Cerrar edición de ítem"
                  className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={editItemDraft.sku}
                  onChange={(e) => setEditItemDraft((d) => ({ ...d, sku: e.target.value }))}
                  placeholder="SKU"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={editItemDraft.name}
                  onChange={(e) => setEditItemDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Nombre *"
                  className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <select
                  value={editItemDraft.category}
                  onChange={(e) =>
                    setEditItemDraft((d) => ({
                      ...d,
                      category: e.target.value as 'part' | 'service',
                    }))
                  }
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                >
                  <option value="part">Repuesto Físico</option>
                  <option value="service">Servicio / Mano de Obra</option>
                </select>
                {perms.canManageInventoryCosts && (
                  <input
                    type="number"
                    min={0}
                    value={editItemDraft.costPrice}
                    onChange={(e) =>
                      setEditItemDraft((d) => ({ ...d, costPrice: e.target.value }))
                    }
                    placeholder="Costo"
                    className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                  />
                )}
                <input
                  type="number"
                  min={0}
                  required
                  value={editItemDraft.salePrice}
                  onChange={(e) =>
                    setEditItemDraft((d) => ({ ...d, salePrice: e.target.value }))
                  }
                  placeholder="Venta *"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  value={editItemDraft.stockQty}
                  onChange={(e) =>
                    setEditItemDraft((d) => ({ ...d, stockQty: e.target.value }))
                  }
                  placeholder="Stock"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  value={editItemDraft.minStock}
                  onChange={(e) =>
                    setEditItemDraft((d) => ({ ...d, minStock: e.target.value }))
                  }
                  placeholder="Mínimo"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItemId(null)}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingItemEdit}
                  className="rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {savingItemEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F6FB]/70 border-b border-[#D8E4EC]/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Descripción</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Sucursal</th>
                    {perms.canManageInventoryCosts && (
                      <th className="py-3 px-4 text-right">Costo</th>
                    )}
                    <th className="py-3 px-4 text-right">Venta</th>
                    <th className="py-3 px-4 text-center">Stock</th>
                    {perms.canManageStock && perms.canManageCatalogPrices && (
                      <th className="py-3 px-4 text-right">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E4EC]/50">
                  {scopedCatalog.map((item) => {
                    const isLow = item.category === 'part' && item.stock_qty <= item.min_stock;
                    const b = branchMap.get(item.branch_id);
                    const isAdjusting = adjustingItemId === item.id;
                    return (
                      <tr key={item.id} className="hover:bg-[#F4F6FB]/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-[#0A2463]">
                          {item.sku}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              item.category === 'part'
                                ? 'bg-[#EBF4FA] text-[#3E92CC] border border-[#3E92CC]/25'
                                : 'bg-[#F4F6FB] text-slate-600 border border-[#D8E4EC]'
                            }`}
                          >
                            {item.category === 'part' ? 'Repuesto' : 'Servicio'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          {b?.code ?? 'HQ'}
                        </td>
                        {perms.canManageInventoryCosts && (
                          <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                            {formatCurrency(item.cost_price, tenant.currency)}
                          </td>
                        )}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(item.sale_price, tenant.currency)}
                        </td>
                        <td className="py-3 px-4">
                          {item.category === 'service' ? (
                            <div className="text-center text-[11px] font-medium text-slate-400">
                              N/A
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {perms.canManageStock && (
                                <button
                                  type="button"
                                  disabled={isAdjusting}
                                  onClick={() => void handleAdjust(item.id, -1)}
                                  aria-label={`Disminuir stock de ${item.name}`}
                                  className="rounded-lg border border-[#D8E4EC] bg-white p-1 text-slate-700 hover:bg-[#F4F6FB] disabled:opacity-50 transition-colors"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                              )}
                              <span
                                className={`font-mono font-bold w-10 text-center tabular-nums ${
                                  isLow ? 'text-[#D64545]' : 'text-slate-900'
                                }`}
                              >
                                {item.stock_qty}
                              </span>
                              {perms.canManageStock && (
                                <button
                                  type="button"
                                  disabled={isAdjusting}
                                  onClick={() => void handleAdjust(item.id, 1)}
                                  aria-label={`Aumentar stock de ${item.name}`}
                                  className="rounded-lg border border-[#D8E4EC] bg-white p-1 text-slate-700 hover:bg-[#F4F6FB] disabled:opacity-50 transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        {perms.canManageStock && perms.canManageCatalogPrices && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {confirmDeleteItemId === item.id ? (
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={deletingItemId === item.id}
                                  onClick={() => setConfirmDeleteItemId(null)}
                                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingItemId === item.id}
                                  onClick={() => void handleConfirmDeleteItem(item)}
                                  className="rounded-lg bg-[#D64545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {deletingItemId === item.id ? 'Eliminando...' : 'Confirmar'}
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2.5">
                                <button
                                  type="button"
                                  aria-label={`Editar ítem ${item.name}`}
                                  onClick={() => openEditItem(item)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3E92CC] hover:text-[#0A2463]"
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>Editar</span>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Eliminar ítem ${item.name}`}
                                  onClick={() => {
                                    setInvError(null);
                                    setInvSuccess(null);
                                    setConfirmDeleteItemId(item.id);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] hover:underline"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Eliminar</span>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'loans' && (
        <div className="space-y-4">
          {showNewLoan && perms.canManageStock && (
            <form
              onSubmit={handleCreateLoan}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-4"
            >
              <h2 className="text-sm font-semibold text-slate-900">
                Registrar Nuevo Equipo para Préstamo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={loanBranch}
                  disabled={Boolean(lockedBranchId)}
                  onChange={(e) => setLoanBranch(e.target.value)}
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors disabled:opacity-75"
                >
                  {effectiveDefaultBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={loanCode}
                  onChange={(e) => setLoanCode(e.target.value)}
                  placeholder="Código interno (Ej: PREST-04) *"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  required
                  value={loanName}
                  onChange={(e) => setLoanName(e.target.value)}
                  placeholder="Nombre descriptivo *"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={loanModel}
                  onChange={(e) => setLoanModel(e.target.value)}
                  placeholder="Marca / Especificación"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={loanSerial}
                  onChange={(e) => setLoanSerial(e.target.value)}
                  placeholder="N° Serie"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
                <input
                  type="text"
                  value={loanNotes}
                  onChange={(e) => setLoanNotes(e.target.value)}
                  placeholder="Accesorios / Condición"
                  className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#D8E4EC]/60">
                <button
                  type="button"
                  onClick={() => setShowNewLoan(false)}
                  className="rounded-xl border border-[#D8E4EC] bg-white hover:bg-[#F4F6FB] px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  Guardar Equipo Préstamo
                </button>
              </div>
            </form>
          )}

          {editingLoanId && perms.canManageStock && (
            <form
              onSubmit={handleSaveEditLoan}
              className="rounded-2xl bg-[#F4F6FB] border border-[#3E92CC]/40 shadow-sm p-5 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[#0A2463]">
                  Editar Equipo de Préstamo
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingLoanId(null)}
                  aria-label="Cerrar edición de equipo de préstamo"
                  className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={editLoanDraft.code}
                  onChange={(e) => setEditLoanDraft((d) => ({ ...d, code: e.target.value }))}
                  placeholder="Código *"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={editLoanDraft.name}
                  onChange={(e) => setEditLoanDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Nombre descriptivo *"
                  className="sm:col-span-2 rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="text"
                  value={editLoanDraft.brand_model}
                  onChange={(e) =>
                    setEditLoanDraft((d) => ({ ...d, brand_model: e.target.value }))
                  }
                  placeholder="Marca / Especificación"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="text"
                  value={editLoanDraft.serial_number}
                  onChange={(e) =>
                    setEditLoanDraft((d) => ({ ...d, serial_number: e.target.value }))
                  }
                  placeholder="N° Serie"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
                <input
                  type="text"
                  value={editLoanDraft.condition_notes}
                  onChange={(e) =>
                    setEditLoanDraft((d) => ({ ...d, condition_notes: e.target.value }))
                  }
                  placeholder="Accesorios / Condición"
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3E92CC] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLoanId(null)}
                  className="rounded-xl border border-[#D8E4EC] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLoanEdit}
                  className="rounded-xl bg-[#1B998B] hover:bg-[#157A6E] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
                >
                  {savingLoanEdit ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {scopedLoans.map((loan) => {
              const b = branchMap.get(loan.branch_id);
              return (
                <div
                  key={loan.id}
                  className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-[#0A2463]">
                        {loan.code} · {b?.code ?? 'HQ'}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                        {loan.name}
                      </h3>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        loan.status === 'available'
                          ? 'bg-[#EBF8F6] text-[#1B998B] border-[#1B998B]/25'
                          : loan.status === 'loaned'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-[#D64545] border-red-200'
                      }`}
                    >
                      {loan.status === 'available'
                        ? 'Disponible'
                        : loan.status === 'loaned'
                        ? 'En Préstamo'
                        : 'Mantención'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    <div>{loan.brand_model}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      S/N: {loan.serial_number}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {loan.condition_notes}
                    </div>
                  </div>
                  {perms.canManageStock && loan.status !== 'loaned' && (
                    <div className="pt-3 border-t border-[#D8E4EC]/60 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Estado operativo:</span>
                        <select
                          aria-label={`Estado operativo de ${loan.name}`}
                          value={loan.status}
                          onChange={(e) =>
                            onUpdateLoanStatus(
                              loan.id,
                              e.target.value as LoanAsset['status']
                            )
                          }
                          className="rounded-xl border border-[#D8E4EC] bg-[#F4F6FB]/60 px-2.5 py-1 text-xs font-medium text-slate-800 focus:bg-white focus:border-[#3E92CC] focus:outline-none transition-colors"
                        >
                          <option value="available">Disponible</option>
                          <option value="maintenance">En Mantención</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-end gap-3">
                        {confirmDeleteLoanId === loan.id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={deletingLoanId === loan.id}
                              onClick={() => setConfirmDeleteLoanId(null)}
                              className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={deletingLoanId === loan.id}
                              onClick={() => void handleConfirmDeleteLoan(loan)}
                              className="rounded-lg bg-[#D64545] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletingLoanId === loan.id ? 'Eliminando...' : 'Confirmar'}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={`Editar equipo préstamo ${loan.name}`}
                              onClick={() => openEditLoan(loan)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#3E92CC] hover:text-[#0A2463]"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar equipo préstamo ${loan.name}`}
                              onClick={() => {
                                setInvError(null);
                                setInvSuccess(null);
                                setConfirmDeleteLoanId(loan.id);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D64545] hover:underline"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Eliminar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
