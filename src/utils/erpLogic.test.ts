import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicTrackUrl,
  calculateOrderFinancials,
  filterWorkOrders,
  generateNextFolio,
  getRolePermissions,
  interpolateWhatsAppTemplate,
  mapDbRoleToRoleType,
  mapRoleTypeToDbRole,
  normalizePhoneForWhatsApp,
} from './erpLogic';
import type { Branch, Client, CustomerAsset, Tenant, WorkOrder } from '../types/erp';

const mockTenant: Tenant = {
  id: 't1',
  name: 'GlobalTech Service SPA',
  tax_id: '76.543.210-K',
  sector: 'computing',
  currency: 'CLP',
  iva_rate: 19,
  folio_prefix: 'OT',
  whatsapp_enabled: true,
  whatsapp_templates: {
    intake: 'Hola {cliente}, orden {folio} ({equipo}) codigo {codigo}.',
    quote_ready: 'Hola {cliente}, diagnostico: {diagnostico}. Total: {total}.',
    ready_for_pickup: 'Hola {cliente}, tu {equipo} esta listo en {sucursal}. Saldo: {saldo}.',
  },
  phone: '+56911112222',
  email: 'contacto@globaltech.cl',
  created_at: '2026-01-01',
};

const mockBranch: Branch = {
  id: 'b1',
  tenant_id: 't1',
  name: 'Casa Matriz Rancagua',
  code: 'HQ-RCG',
  is_hq: true,
  address: 'Av. Bernardo OHiggins 450',
  city: 'Rancagua',
  phone: '+56722223333',
  business_hours: 'Lun-Vie 09:00-18:30',
};

const mockClient: Client = {
  id: 'c1',
  tenant_id: 't1',
  name: 'Carlos Mendoza',
  rut: '16.432.111-5',
  phone: '+56 9 8765 4321',
  email: 'carlos@correo.cl',
  address: 'Los Robles 123',
  city: 'Rancagua',
};

const mockAsset: CustomerAsset = {
  id: 'a1',
  tenant_id: 't1',
  client_id: 'c1',
  category: 'Notebook',
  brand: 'Lenovo',
  model: 'ThinkPad T14',
  serial_imei: 'PF3X9981',
  custom_attributes: { bios_password: 'No', cpu_ram: 'i7 / 16GB' },
};

const mockOrder: WorkOrder = {
  id: 'wo1',
  tenant_id: 't1',
  branch_id: 'b1',
  folio: 'OT-000105',
  tracking_code: '8F92A1C4',
  client_id: 'c1',
  asset_id: 'a1',
  status: 'in_repair',
  modality: 'workshop',
  accessories_received: 'Cargador USB-C',
  entry_condition: 'Bisagra izquierda fisurada',
  reported_symptoms: 'No enciende y se calienta al cargar',
  technical_diagnosis: 'Falla en modulo termico y SSD degradado',
  work_performed: 'Limpieza y reemplazo SSD',
  parts_and_observations: 'Garantia 90 dias',
  assigned_technician: 'Diego Torres',
  apply_iva: true,
  discount_amount: 5000,
  items: [
    { id: 'i1', source: 'catalog', description: 'SSD Kingston 480GB', qty: 1, unit_price: 45000 },
    { id: 'i2', source: 'free', description: 'Mano de obra diagnostico', qty: 1, unit_price: 20000 },
  ],
  payments: [{ id: 'p1', date: '2026-11-10', amount: 30000, method: 'transfer' }],
  photos: [],
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T12:00:00Z',
};

test('calculateOrderFinancials computes subtotal, discount, 19% IVA, paid, and balance due', () => {
  const res = calculateOrderFinancials(
    mockOrder.items,
    mockOrder.discount_amount,
    true,
    19,
    mockOrder.payments
  );
  assert.equal(res.subtotal, 65000);
  assert.equal(res.discount, 5000);
  assert.equal(res.netAfterDiscount, 60000);
  assert.equal(res.ivaAmount, 11400);
  assert.equal(res.totalAmount, 71400);
  assert.equal(res.paidAmount, 30000);
  assert.equal(res.balanceDue, 41400);
});

test('calculateOrderFinancials excludes IVA when applyIva is false', () => {
  const res = calculateOrderFinancials(mockOrder.items, 0, false, 19, []);
  assert.equal(res.subtotal, 65000);
  assert.equal(res.ivaAmount, 0);
  assert.equal(res.totalAmount, 65000);
  assert.equal(res.balanceDue, 65000);
});

test('filterWorkOrders searches across folio, tracking_code, serial_imei, and reported_symptoms', () => {
  const bySerial = filterWorkOrders([mockOrder], [mockClient], [mockAsset], {
    tenantId: 't1',
    branchId: 'ALL',
    query: 'PF3X9981',
    status: 'ALL',
    modality: 'ALL',
  });
  assert.equal(bySerial.length, 1);

  const bySymptom = filterWorkOrders([mockOrder], [mockClient], [mockAsset], {
    tenantId: 't1',
    branchId: 'ALL',
    query: 'calienta',
    status: 'ALL',
    modality: 'ALL',
  });
  assert.equal(bySymptom.length, 1);

  const byWrongBranch = filterWorkOrders([mockOrder], [mockClient], [mockAsset], {
    tenantId: 't1',
    branchId: 'b2',
    query: '',
    status: 'ALL',
    modality: 'ALL',
  });
  assert.equal(byWrongBranch.length, 0);
});

test('generateNextFolio increments highest folio number for tenant', () => {
  assert.equal(generateNextFolio('OT', [mockOrder], 't1'), 'OT-000106');
  assert.equal(generateNextFolio('MQ', [mockOrder], 't2'), 'MQ-000101');
});

test('interpolateWhatsAppTemplate substitutes tokens and normalizes phone', () => {
  const msg = interpolateWhatsAppTemplate(mockTenant.whatsapp_templates.ready_for_pickup, {
    order: mockOrder,
    client: mockClient,
    asset: mockAsset,
    branch: mockBranch,
    tenant: mockTenant,
  });
  assert.match(msg, /Carlos Mendoza/);
  assert.match(msg, /Notebook Lenovo ThinkPad T14/);
  assert.match(msg, /Casa Matriz Rancagua/);
  assert.match(msg, /\$41\.400/);
  assert.equal(normalizePhoneForWhatsApp('+56 9 8765 4321'), '56987654321');
});

test('buildPublicTrackUrl and {url_seguimiento} produce valid tracking URL', () => {
  const url = buildPublicTrackUrl('8F92A1C4', 'https://taller.vercel.app/');
  assert.equal(url, 'https://taller.vercel.app/?track=8F92A1C4');

  const msg = interpolateWhatsAppTemplate(
    'Sigue tu orden {folio} en {url_seguimiento}',
    {
      order: mockOrder,
      client: mockClient,
      asset: mockAsset,
      branch: mockBranch,
      tenant: mockTenant,
      baseOrigin: 'https://taller.vercel.app',
    }
  );
  assert.equal(
    msg,
    'Sigue tu orden OT-000105 en https://taller.vercel.app/?track=8F92A1C4'
  );
});

test('DB role mapping and Phase 3 RBAC permissions enforce cost & branch restrictions', () => {
  assert.equal(mapDbRoleToRoleType('company_admin'), 'admin');
  assert.equal(mapDbRoleToRoleType('technician'), 'technician');
  assert.equal(mapRoleTypeToDbRole('admin'), 'company_admin');
  assert.equal(mapRoleTypeToDbRole('receptionist'), 'receptionist');

  const adminPerms = getRolePermissions('admin');
  assert.equal(adminPerms.canDeleteBranch, true);
  assert.equal(adminPerms.canManageUsers, true);
  assert.equal(adminPerms.canManageInventoryCosts, true);

  const recPerms = getRolePermissions('receptionist');
  assert.equal(recPerms.canDeleteBranch, false);
  assert.equal(recPerms.canManageUsers, false);
  assert.equal(recPerms.canManageInventoryCosts, false);
  assert.equal(recPerms.canReceivePayments, true);

  const techPerms = getRolePermissions('technician');
  assert.equal(techPerms.canEditSettings, false);
  assert.equal(techPerms.canDeleteBranch, false);
  assert.equal(techPerms.canManageInventoryCosts, false);
  assert.equal(techPerms.canEditDiagnosis, true);
});
