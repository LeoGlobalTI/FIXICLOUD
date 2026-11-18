import React, { useEffect, useMemo, useState } from 'react';
import { Laptop, Minus, Package, Plus } from 'lucide-react';
import type { Branch, CatalogItem, LoanAsset, RoleType, Tenant } from '../types/erp';
import { formatCurrency, getRolePermissions } from '../utils/erpLogic';
import { generateUUID } from '../utils/uuid';

interface InventoryLoansViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  lockedBranchId?: string | null;
  activeRole: RoleType;
  catalogItems: CatalogItem[];
  loanAssets: LoanAsset[];
  onAddCatalogItem: (item: CatalogItem) => void;
  onAdjustStock: (itemId: string, delta: number) => void;
  onAddLoanAsset: (loan: LoanAsset) => void;
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
  onAdjustStock,
  onAddLoanAsset,
  onUpdateLoanStatus,
}) => {
  const [tab, setTab] = useState<'catalog' | 'loans'>('catalog');
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewLoan, setShowNewLoan] = useState(false);

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

  // New Loan Asset state
  const [loanBranch, setLoanBranch] = useState(defaultBranchId);
  const [loanCode, setLoanCode] = useState('');
  const [loanName, setLoanName] = useState('');
  const [loanModel, setLoanModel] = useState('');
  const [loanSerial, setLoanSerial] = useState('');
  const [loanNotes, setLoanNotes] = useState('');

  useEffect(() => {
    setItemBranch(defaultBranchId);
    setLoanBranch(defaultBranchId);
  }, [tenant.id, defaultBranchId]);

  useEffect(() => {
    setShowNewItem(false);
    setShowNewLoan(false);
  }, [activeRole]);

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

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !perms.canManageStock || !perms.canManageCatalogPrices) return;
    onAddCatalogItem({
      id: generateUUID(),
      tenant_id: tenant.id,
      branch_id: resolveValidBranch(itemBranch),
      sku: sku.trim() || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: name.trim(),
      category,
      cost_price: Number(costPrice) || 0,
      sale_price: Number(salePrice) || 0,
      stock_qty: Number(stockQty) || 0,
      min_stock: Number(minStock) || 1,
    });
    setSku('');
    setName('');
    setCostPrice('');
    setSalePrice('');
    setShowNewItem(false);
  };

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanName.trim() || !loanCode.trim() || !perms.canManageStock) return;
    onAddLoanAsset({
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
    setLoanCode('');
    setLoanName('');
    setLoanModel('');
    setLoanSerial('');
    setLoanNotes('');
    setShowNewLoan(false);
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
              onClick={() => setShowNewItem((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Ítem Stock</span>
            </button>
          )}
          {perms.canManageStock && tab === 'loans' && (
            <button
              type="button"
              onClick={() => setShowNewLoan((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Equipo Préstamo</span>
            </button>
          )}
        </div>
      </div>

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8E4EC]/50">
                  {scopedCatalog.map((item) => {
                    const isLow = item.stock_qty <= item.min_stock;
                    const b = branchMap.get(item.branch_id);
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
                          <div className="flex items-center justify-center gap-2">
                            {perms.canManageStock && (
                              <button
                                type="button"
                                onClick={() => onAdjustStock(item.id, -1)}
                                aria-label={`Disminuir stock de ${item.name}`}
                                className="rounded-lg border border-[#D8E4EC] bg-white p-1 text-slate-700 hover:bg-[#F4F6FB] transition-colors"
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
                                onClick={() => onAdjustStock(item.id, 1)}
                                aria-label={`Aumentar stock de ${item.name}`}
                                className="rounded-lg border border-[#D8E4EC] bg-white p-1 text-slate-700 hover:bg-[#F4F6FB] transition-colors"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </td>
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
                    <div className="pt-3 border-t border-[#D8E4EC]/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Estado operativo:</span>
                      <select
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
