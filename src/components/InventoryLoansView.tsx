import React, { useState } from 'react';
import { Laptop, Minus, Package, Plus } from 'lucide-react';
import type { Branch, CatalogItem, LoanAsset, RoleType, Tenant } from '../types/erp';
import { formatCurrency, getRolePermissions } from '../utils/erpLogic';

interface InventoryLoansViewProps {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
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
  const tenantBranches = branches.filter((b) => b.tenant_id === tenant.id);
  const defaultBranchId =
    activeBranchId !== 'ALL'
      ? activeBranchId
      : tenantBranches.find((b) => b.is_hq)?.id ?? tenantBranches[0]?.id ?? '';

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

  const scopedCatalog = catalogItems.filter(
    (c) => c.tenant_id === tenant.id && (activeBranchId === 'ALL' || c.branch_id === activeBranchId)
  );
  const scopedLoans = loanAssets.filter(
    (l) => l.tenant_id === tenant.id && (activeBranchId === 'ALL' || l.branch_id === activeBranchId)
  );
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAddCatalogItem({
      id: `cat-${Date.now()}`,
      tenant_id: tenant.id,
      branch_id: itemBranch || defaultBranchId,
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
    if (!loanName.trim() || !loanCode.trim()) return;
    onAddLoanAsset({
      id: `loan-${Date.now()}`,
      tenant_id: tenant.id,
      branch_id: loanBranch || defaultBranchId,
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">
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
                  : 'text-slate-600 hover:text-slate-900'
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
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Laptop className="h-3.5 w-3.5" />
              <span>Equipos Préstamo ({scopedLoans.length})</span>
            </button>
          </div>

          {perms.canManageStock && tab === 'catalog' && (
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
          {showNewItem && (
            <form
              onSubmit={handleCreateItem}
              className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-6 space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-900">
                Agregar Repuesto o Servicio al Catálogo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <select
                  value={itemBranch}
                  onChange={(e) => setItemBranch(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  {tenantBranches.map((b) => (
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nombre repuesto o servicio *"
                  className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'part' | 'service')}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
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
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                )}
                <input
                  type="number"
                  min={0}
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="Precio Venta *"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="Stock"
                    className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
                  />
                  <input
                    type="number"
                    min={0}
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="Mínimo"
                    className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewItem(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white"
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
                  <tr className="bg-[#F4F6FB]/80 border-b border-[#D8E4EC] text-[11px] font-semibold text-slate-600">
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
                <tbody className="divide-y divide-slate-100">
                  {scopedCatalog.map((item) => {
                    const isLow = item.stock_qty <= item.min_stock;
                    const b = branchMap.get(item.branch_id);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">
                          {item.sku}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {item.name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {item.category === 'part' ? 'Repuesto' : 'Servicio'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 font-mono">
                          {b?.code ?? 'HQ'}
                        </td>
                        {perms.canManageInventoryCosts && (
                          <td className="py-2.5 px-4 text-right font-mono text-slate-500 tabular-nums">
                            {formatCurrency(item.cost_price, tenant.currency)}
                          </td>
                        )}
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatCurrency(item.sale_price, tenant.currency)}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            {perms.canManageStock && (
                              <button
                                type="button"
                                onClick={() => onAdjustStock(item.id, -1)}
                                aria-label={`Disminuir stock de ${item.name}`}
                                className="rounded border border-slate-300 p-1 hover:bg-slate-100"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                            )}
                            <span
                              className={`font-mono font-bold w-10 text-center tabular-nums ${
                                isLow ? 'text-red-600' : 'text-slate-900'
                              }`}
                            >
                              {item.stock_qty}
                            </span>
                            {perms.canManageStock && (
                              <button
                                type="button"
                                onClick={() => onAdjustStock(item.id, 1)}
                                aria-label={`Aumentar stock de ${item.name}`}
                                className="rounded border border-slate-300 p-1 hover:bg-slate-100"
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
          {showNewLoan && (
            <form
              onSubmit={handleCreateLoan}
              className="rounded-xl bg-white border border-slate-200 p-5 space-y-3"
            >
              <h2 className="text-sm font-bold text-slate-900">
                Registrar Nuevo Equipo para Préstamo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={loanBranch}
                  onChange={(e) => setLoanBranch(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  {tenantBranches.map((b) => (
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
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  required
                  value={loanName}
                  onChange={(e) => setLoanName(e.target.value)}
                  placeholder="Nombre descriptivo *"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={loanModel}
                  onChange={(e) => setLoanModel(e.target.value)}
                  placeholder="Marca / Especificación"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={loanSerial}
                  onChange={(e) => setLoanSerial(e.target.value)}
                  placeholder="N° Serie"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  value={loanNotes}
                  onChange={(e) => setLoanNotes(e.target.value)}
                  placeholder="Accesorios / Condición"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewLoan(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white"
                >
                  Guardar Equipo Préstamo
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {scopedLoans.map((loan) => {
              const b = branchMap.get(loan.branch_id);
              return (
                <div
                  key={loan.id}
                  className="rounded-2xl bg-white border border-[#D8E4EC]/70 shadow-sm p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs font-bold text-blue-700">
                        {loan.code} · {b?.code ?? 'HQ'}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {loan.name}
                      </h3>
                    </div>
                    <span
                      className={`text-[11px] font-bold ${
                        loan.status === 'available'
                          ? 'text-emerald-700'
                          : loan.status === 'loaned'
                          ? 'text-amber-700'
                          : 'text-red-700'
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
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Estado operativo:</span>
                      <select
                        value={loan.status}
                        onChange={(e) =>
                          onUpdateLoanStatus(
                            loan.id,
                            e.target.value as LoanAsset['status']
                          )
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
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
