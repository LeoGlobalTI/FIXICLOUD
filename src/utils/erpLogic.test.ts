import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicTrackUrl,
  calculateOrderFinancials,
  canDeductCatalogStock,
  canDeleteBranchSafely,
  canViewGlobalScope,
  filterErpStateForTenants,
  filterVisibleAppUsers,
  filterWorkOrders,
  generateNextFolio,
  generateUniqueUsername,
  getDefaultAssetCategoryForSector,
  getDefaultTenantTechnicianName,
  getRolePermissions,
  getVisibleTenantsForScope,
  interpolateWhatsAppTemplate,
  mapDbRoleToRoleType,
  mapRoleTypeToDbRole,
  mergeMissingSeedTenants,
  normalizePhoneForWhatsApp,
  prepareAppUserUpdate,
  sanitizeOrderUpdateForRole,
  searchFilterAppUsers,
} from './erpLogic';
import type { AppUser, Branch, Client, CustomerAsset, ErpState, Tenant, WorkOrder } from '../types/erp';

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
  assert.equal(techPerms.canEditFinancials, false);
  assert.equal(techPerms.canReceivePayments, false);
  assert.equal(techPerms.canEditDiagnosis, true);
});

test('Tenant isolation restricts admin, receptionist, and technician to their tenant and grants global scope only to superadmin', () => {
  const secondTenant: Tenant = { ...mockTenant, id: 't2', name: 'Sur Maquinarias' };
  const allTenants = [mockTenant, secondTenant];

  const users: AppUser[] = [
    {
      id: 'u-sa',
      tenant_id: null,
      branch_id: null,
      username: 'admin',
      pin_or_password: 'secret',
      full_name: 'SuperAdmin',
      role: 'superadmin',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-t1-adm',
      tenant_id: 't1',
      branch_id: null,
      username: 'carolina',
      pin_or_password: 'secret',
      full_name: 'Carolina',
      role: 'admin',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-t1-rec',
      tenant_id: 't1',
      branch_id: 'b1',
      username: 'valentina',
      pin_or_password: 'secret',
      full_name: 'Valentina',
      role: 'receptionist',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-t2-adm',
      tenant_id: 't2',
      branch_id: null,
      username: 'rodrigo',
      pin_or_password: 'secret',
      full_name: 'Rodrigo',
      role: 'admin',
      is_active: true,
      created_at: '2026-01-01',
    },
  ];

  // Global view allowed ONLY when both activeRole and sessionRole are superadmin
  assert.equal(canViewGlobalScope('superadmin', 'superadmin'), true);
  assert.equal(canViewGlobalScope('admin', 'superadmin'), false);
  assert.equal(canViewGlobalScope('admin', 'admin'), false);
  assert.equal(canViewGlobalScope('superadmin', 'admin'), false);
  assert.equal(canViewGlobalScope('receptionist', 'receptionist'), false);
  assert.equal(canViewGlobalScope('technician', 'technician'), false);

  // Tenants visible per role
  assert.equal(getVisibleTenantsForScope(allTenants, 'superadmin', { role: 'superadmin', tenant_id: null }).length, 2);
  assert.deepEqual(
    getVisibleTenantsForScope(allTenants, 'admin', { role: 'admin', tenant_id: 't2' }).map((t) => t.id),
    ['t2']
  );
  assert.deepEqual(
    getVisibleTenantsForScope(allTenants, 'receptionist', { role: 'receptionist', tenant_id: 't1' }).map((t) => t.id),
    ['t1']
  );
  assert.deepEqual(
    getVisibleTenantsForScope(allTenants, 'technician', { role: 'technician', tenant_id: 't1' }).map((t) => t.id),
    ['t1']
  );
  // Even if superadmin simulates admin role, visible tenant locks to current tenant
  assert.deepEqual(
    getVisibleTenantsForScope(allTenants, 'admin', { role: 'superadmin', tenant_id: null }, 't1').map((t) => t.id),
    ['t1']
  );

  // App users visible per role
  assert.equal(filterVisibleAppUsers(users, 'superadmin', 't1', 'global', 'superadmin').length, 4);
  assert.deepEqual(
    filterVisibleAppUsers(users, 'admin', 't1', 'global', 'admin').map((u) => u.id),
    ['u-t1-adm', 'u-t1-rec']
  );
  assert.deepEqual(
    filterVisibleAppUsers(users, 'receptionist', 't1', 'global', 'receptionist').map((u) => u.id),
    ['u-t1-adm', 'u-t1-rec']
  );
  assert.deepEqual(
    filterVisibleAppUsers(users, 'technician', 't2', 'global', 'technician').map((u) => u.id),
    ['u-t2-adm']
  );
});

test('prepareAppUserUpdate enforces self-protection, uniqueness, role-tenant integrity, and optional password reset', () => {
  const users: AppUser[] = [
    {
      id: 'u-1',
      tenant_id: 't1',
      branch_id: 'b1',
      username: 'diego',
      pin_or_password: 'old-password',
      full_name: 'Diego Torres',
      role: 'technician',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-2',
      tenant_id: 't1',
      branch_id: null,
      username: 'carolina',
      pin_or_password: 'admin-password',
      full_name: 'Carolina Mendoza',
      role: 'admin',
      is_active: true,
      created_at: '2026-01-01',
    },
  ];

  // Self-deactivation blocked
  const selfOff = prepareAppUserUpdate({
    existing: users[1],
    patch: { is_active: false },
    fallbackTenantId: 't1',
    allowGlobalView: false,
    allUsers: users,
    currentSessionUserId: 'u-2',
  });
  assert.equal(selfOff.ok, false);

  // Duplicate username blocked
  const dup = prepareAppUserUpdate({
    existing: users[0],
    patch: { username: '@Carolina' },
    fallbackTenantId: 't1',
    allowGlobalView: false,
    allUsers: users,
  });
  assert.equal(dup.ok, false);

  // Blank password keeps existing password, strips @ from username
  const renameOk = prepareAppUserUpdate({
    existing: users[0],
    patch: { full_name: 'Diego A. Torres', username: '@diegotorres' },
    newPassword: '   ',
    fallbackTenantId: 't1',
    allowGlobalView: false,
    allUsers: users,
  });
  assert.equal(renameOk.ok, true);
  if (renameOk.ok) {
    assert.equal(renameOk.user.username, 'diegotorres');
    assert.equal(renameOk.user.pin_or_password, 'old-password');
  }

  // Promoting to superadmin clears tenant_id & branch_id; demoting restores fallbackTenantId
  const promote = prepareAppUserUpdate({
    existing: users[0],
    patch: { role: 'superadmin' },
    newPassword: 'new-secret',
    fallbackTenantId: 't1',
    allowGlobalView: true,
    allUsers: users,
  });
  assert.equal(promote.ok, true);
  if (promote.ok) {
    assert.equal(promote.user.tenant_id, null);
    assert.equal(promote.user.branch_id, null);
    assert.equal(promote.user.pin_or_password, 'new-secret');

    const demote = prepareAppUserUpdate({
      existing: promote.user,
      patch: { role: 'admin' },
      fallbackTenantId: 't1',
      allowGlobalView: true,
      allUsers: users,
    });
    assert.equal(demote.ok, true);
    if (demote.ok) {
      assert.equal(demote.user.tenant_id, 't1');
    }
  }

  // Search filtering by query, role, and status
  assert.equal(searchFilterAppUsers(users, '@diego', 'ALL', 'ALL').length, 1);
  assert.equal(searchFilterAppUsers(users, '', 'admin', 'active').length, 1);
  assert.equal(searchFilterAppUsers(users, '', 'ALL', 'inactive').length, 0);
});

test('mergeMissingSeedTenants backfills newly seeded fleet tenant and its fleet records without overwriting existing tenants', () => {
  const andesId = '33333333-3333-4333-8333-333333333333';
  const fleetTenant: Tenant = {
    ...mockTenant,
    id: andesId,
    name: 'AndesFleet Rent a Car SpA',
    sector: 'automotive',
    folio_prefix: 'FL',
  };
  const seedFixture: ErpState = {
    tenants: [mockTenant, fleetTenant],
    branches: [
      mockBranch,
      {
        ...mockBranch,
        id: '33333333-3333-4333-8333-333333333301',
        tenant_id: andesId,
        name: 'Base Central Aeropuerto Pudahuel',
        code: 'HQ-SCL',
      },
    ],
    appUsers: [
      {
        id: '33333333-3333-4333-8333-333333330111',
        tenant_id: andesId,
        branch_id: null,
        username: 'patricio',
        pin_or_password: '123456',
        full_name: 'Patricio Morales',
        role: 'admin',
        is_active: true,
        created_at: '2026-03-01T09:00:00Z',
      },
    ],
    clients: [
      mockClient,
      {
        ...mockClient,
        id: '33333333-3333-4333-8333-333333330207',
        tenant_id: andesId,
        name: 'Minera Atacama Norte SpA',
      },
    ],
    assets: [
      mockAsset,
      {
        ...mockAsset,
        id: '33333333-3333-4333-8333-333333330307',
        tenant_id: andesId,
        client_id: '33333333-3333-4333-8333-333333330207',
        category: 'Camioneta 4x4',
        brand: 'Toyota',
        model: 'Hilux DX',
      },
    ],
    catalogItems: [],
    loanAssets: [
      {
        id: '33333333-3333-4333-8333-333333330505',
        tenant_id: andesId,
        branch_id: '33333333-3333-4333-8333-333333333301',
        code: 'FLOTA-01',
        name: 'Camioneta 4x4 Toyota Hilux DX',
        brand_model: 'Toyota Hilux 2.4 TD 4x4',
        serial_number: 'TDKL-48',
        status: 'available',
        condition_notes: 'Operativa',
      },
    ],
    workOrders: [
      mockOrder,
      {
        ...mockOrder,
        id: '33333333-3333-4333-8333-333333330604',
        tenant_id: andesId,
        branch_id: '33333333-3333-4333-8333-333333333301',
        folio: 'FL-000104',
        client_id: '33333333-3333-4333-8333-333333330207',
        asset_id: '33333333-3333-4333-8333-333333330307',
      },
    ],
    appointments: [],
  };

  const legacyStored: ErpState = {
    tenants: [{ ...mockTenant, name: 'GlobalTech Custom' }],
    branches: [mockBranch],
    appUsers: [],
    clients: [mockClient],
    assets: [mockAsset],
    catalogItems: [],
    loanAssets: [],
    workOrders: [mockOrder],
    appointments: [],
  };

  const merged = mergeMissingSeedTenants(legacyStored, seedFixture);
  assert.equal(merged.changed, true);
  assert.equal(
    merged.state.tenants.find((t) => t.id === mockTenant.id)?.name,
    'GlobalTech Custom'
  );
  const andesTenant = merged.state.tenants.find((t) => t.id === andesId);
  assert.ok(andesTenant);
  assert.equal(andesTenant.sector, 'automotive');
  assert.equal(merged.state.loanAssets.filter((l) => l.tenant_id === andesId).length, 1);
  assert.equal(merged.state.workOrders.filter((w) => w.tenant_id === andesId).length, 1);
  assert.equal(merged.state.clients.filter((c) => c.tenant_id === andesId).length, 1);
  assert.equal(merged.state.assets.filter((a) => a.tenant_id === andesId).length, 1);
  assert.equal(merged.state.appUsers.filter((u) => u.tenant_id === andesId).length, 1);

  const secondPass = mergeMissingSeedTenants(merged.state, seedFixture);
  assert.equal(secondPass.changed, false);

  const andesSubset = filterErpStateForTenants(
    merged.state,
    new Set([andesId]),
    { includeGlobalAppUsers: false }
  );
  assert.equal(andesSubset.tenants.length, 1);
  assert.equal(andesSubset.tenants[0].id, andesId);
  assert.equal(andesSubset.branches.every((b) => b.tenant_id === andesId), true);
  assert.equal(andesSubset.appUsers.every((u) => u.tenant_id === andesId), true);
  assert.equal(andesSubset.clients.every((c) => c.tenant_id === andesId), true);
  assert.equal(andesSubset.assets.every((a) => a.tenant_id === andesId), true);
  assert.equal(andesSubset.loanAssets.every((l) => l.tenant_id === andesId), true);
  assert.equal(andesSubset.workOrders.every((w) => w.tenant_id === andesId), true);
});

test('getDefaultAssetCategoryForSector maps every industry sector cleanly', () => {
  assert.equal(getDefaultAssetCategoryForSector('computing'), 'Notebook');
  assert.equal(getDefaultAssetCategoryForSector('mobile'), 'Smartphone');
  assert.equal(getDefaultAssetCategoryForSector('machinery'), 'Generador Eléctrico');
  assert.equal(getDefaultAssetCategoryForSector('automotive'), 'Vehículo / Camioneta');
  assert.equal(getDefaultAssetCategoryForSector('appliances'), 'Electrodoméstico');
  assert.equal(getDefaultAssetCategoryForSector('general'), 'Equipo');
});

test('getDefaultTenantTechnicianName scopes to branch/tenant without cross-tenant leaks', () => {
  const users: AppUser[] = [
    {
      id: 'u-t1-tech-b2',
      tenant_id: 't1',
      branch_id: 'b2',
      username: 'techb2',
      pin_or_password: '123',
      full_name: 'Tech Sucursal 2',
      role: 'technician',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-t1-tech-b1',
      tenant_id: 't1',
      branch_id: 'b1',
      username: 'techb1',
      pin_or_password: '123',
      full_name: 'Tech Sucursal 1',
      role: 'technician',
      is_active: true,
      created_at: '2026-01-01',
    },
    {
      id: 'u-t2-admin',
      tenant_id: 't2',
      branch_id: null,
      username: 'adm2',
      pin_or_password: '123',
      full_name: 'Admin T2',
      role: 'admin',
      is_active: true,
      created_at: '2026-01-01',
    },
  ];

  assert.equal(getDefaultTenantTechnicianName(users, 't1', 'b1'), 'Tech Sucursal 1');
  assert.equal(getDefaultTenantTechnicianName(users, 't1', 'ALL'), 'Tech Sucursal 2');
  assert.equal(getDefaultTenantTechnicianName(users, 't2', 'b9'), 'Admin T2');
  assert.equal(getDefaultTenantTechnicianName(users, 't3', 'b1'), 'Por asignar');
});

test('canDeductCatalogStock blocks negative physical part stock and permits services', () => {
  assert.equal(canDeductCatalogStock('part', 2, 1), true);
  assert.equal(canDeductCatalogStock('part', 2, 2), true);
  assert.equal(canDeductCatalogStock('part', 2, 3), false);
  assert.equal(canDeductCatalogStock('part', 0, 1), false);
  assert.equal(canDeductCatalogStock('service', 0, 5), true);
  assert.equal(canDeductCatalogStock('service', 0, 0), false);
});

test('canManageClients, canDeleteBranchSafely, and sanitizeOrderUpdateForRole enforce RBAC & integrity', () => {
  assert.equal(getRolePermissions('superadmin').canManageClients, true);
  assert.equal(getRolePermissions('admin').canManageClients, true);
  assert.equal(getRolePermissions('receptionist').canManageClients, true);
  assert.equal(getRolePermissions('technician').canManageClients, false);

  const nonHqClean: Branch = { ...mockBranch, id: 'b-clean', is_hq: false };
  const nonHqLinked: Branch = { ...mockBranch, id: 'b-linked', is_hq: false };
  const branchState: ErpState = {
    tenants: [mockTenant],
    branches: [mockBranch, nonHqClean, nonHqLinked],
    appUsers: [],
    clients: [mockClient],
    assets: [mockAsset],
    catalogItems: [],
    loanAssets: [],
    workOrders: [{ ...mockOrder, branch_id: 'b-linked' }],
    appointments: [],
  };

  assert.equal(canDeleteBranchSafely('b1', branchState).ok, false);
  assert.equal(canDeleteBranchSafely('b-linked', branchState).ok, false);
  assert.equal(canDeleteBranchSafely('b-clean', branchState).ok, true);

  // Technician can update diagnosis/status/photos, but NOT financials, client intake, or technician assignment
  const techAttempt: WorkOrder = {
    ...mockOrder,
    status: 'ready',
    technical_diagnosis: 'Nuevo diagnostico tecnico',
    work_performed: 'Reparacion completa',
    parts_and_observations: 'Observacion tecnica',
    apply_iva: false,
    discount_amount: 50000,
    items: [],
    payments: [],
    reported_symptoms: 'Intento alterar sintoma',
    assigned_technician: 'Otro Tecnico',
    modality: 'home_service',
    warranty_days: 999,
  };
  const sanitizedTech = sanitizeOrderUpdateForRole(mockOrder, techAttempt, 'technician');
  assert.equal(sanitizedTech.status, 'ready');
  assert.equal(sanitizedTech.technical_diagnosis, 'Nuevo diagnostico tecnico');
  assert.equal(sanitizedTech.work_performed, 'Reparacion completa');
  assert.equal(sanitizedTech.parts_and_observations, 'Observacion tecnica');
  assert.equal(sanitizedTech.apply_iva, mockOrder.apply_iva);
  assert.equal(sanitizedTech.discount_amount, mockOrder.discount_amount);
  assert.equal(sanitizedTech.items.length, mockOrder.items.length);
  assert.equal(sanitizedTech.payments.length, mockOrder.payments.length);
  assert.equal(sanitizedTech.reported_symptoms, mockOrder.reported_symptoms);
  assert.equal(sanitizedTech.assigned_technician, mockOrder.assigned_technician);
  assert.equal(sanitizedTech.modality, mockOrder.modality);

  // Receptionist can update financials/payments/symptoms, but NOT diagnosis
  const recAttempt: WorkOrder = {
    ...mockOrder,
    apply_iva: false,
    reported_symptoms: 'Sintoma aclarado en recepcion',
    technical_diagnosis: 'No deberia cambiar',
  };
  const sanitizedRec = sanitizeOrderUpdateForRole(mockOrder, recAttempt, 'receptionist');
  assert.equal(sanitizedRec.apply_iva, mockOrder.apply_iva);
  assert.equal(sanitizedRec.reported_symptoms, 'Sintoma aclarado en recepcion');
  assert.equal(sanitizedRec.technical_diagnosis, mockOrder.technical_diagnosis);
});

test('calculateOrderFinancials guards against NaN and Infinity numeric inputs', () => {
  const res = calculateOrderFinancials(
    [{ id: 'bad1', source: 'free', description: 'Test', qty: Number.NaN, unit_price: 10000 }],
    Number.POSITIVE_INFINITY,
    true,
    Number.NaN,
    [{ id: 'pbad', date: '2026-11-10', amount: Number.NaN, method: 'cash' }]
  );
  assert.equal(res.subtotal, 0);
  assert.equal(res.discount, 0);
  assert.equal(res.ivaAmount, 0);
  assert.equal(res.totalAmount, 0);
  assert.equal(res.paidAmount, 0);
  assert.equal(res.balanceDue, 0);
});

test('technician RBAC blocks stock edits, delivery status, photo deletion, and loan mutation while allowing diagnosis and photo additions', () => {
  const techPerms = getRolePermissions('technician');
  assert.equal(techPerms.canManageStock, false);
  assert.equal(techPerms.canManageCatalogPrices, false);
  assert.equal(techPerms.canDeletePhotos, false);
  assert.equal(techPerms.canDeliverOrder, false);
  assert.equal(techPerms.canManageOrderLoans, false);
  assert.equal(techPerms.canEditDiagnosis, true);

  const recPerms = getRolePermissions('receptionist');
  assert.equal(recPerms.canManageOrderLoans, true);
  assert.equal(recPerms.canDeliverOrder, true);
  assert.equal(recPerms.canDeletePhotos, false);

  const existingPhoto = {
    id: 'ph-existing',
    url: 'https://example.com/1.webp',
    stage: 'reception' as const,
    caption: 'Ingreso',
    created_at: '2026-11-10T10:00:00Z',
  };
  const newPhoto = {
    id: 'ph-new',
    url: 'https://example.com/2.webp',
    stage: 'diagnosis' as const,
    caption: 'Placa',
    created_at: '2026-11-10T11:00:00Z',
  };
  const baseWithPhoto: WorkOrder = {
    ...mockOrder,
    photos: [existingPhoto],
  };

  // Technician tries to transition to delivered, delete existingPhoto, add newPhoto, and attach a loan
  const techSanitized = sanitizeOrderUpdateForRole(
    baseWithPhoto,
    {
      ...baseWithPhoto,
      status: 'delivered',
      photos: [newPhoto],
      loan: {
        id: 'ln-1',
        loan_asset_id: 'la-1',
        asset_code: 'PREST-01',
        asset_name: 'Equipo Respaldo',
        loaned_at: '2026-11-10T12:00:00Z',
        delivery_notes: 'No permitido',
      },
    },
    'technician'
  );
  assert.equal(techSanitized.status, mockOrder.status);
  assert.deepEqual(
    techSanitized.photos.map((p) => p.id),
    ['ph-existing', 'ph-new']
  );
  assert.equal(techSanitized.loan, undefined);

  // Receptionist blocked from setting workshop diagnosis/repair stages, allowed waiting_approval/delivered
  const recBlockedStatus = sanitizeOrderUpdateForRole(
    { ...mockOrder, status: 'received' },
    { ...mockOrder, status: 'in_repair' },
    'receptionist'
  );
  assert.equal(recBlockedStatus.status, 'received');

  const recAllowedStatus = sanitizeOrderUpdateForRole(
    { ...mockOrder, status: 'ready' },
    { ...mockOrder, status: 'delivered' },
    'receptionist'
  );
  assert.equal(recAllowedStatus.status, 'delivered');
});

test('generateUniqueUsername prevents collisions when creating companies with matching prefixes', () => {
  const existing = new Set(['admin_glo', 'admin_glo1', 'tec_glo']);
  assert.equal(generateUniqueUsername('admin_glo', existing), 'admin_glo2');
  assert.equal(generateUniqueUsername('admin_glo', existing), 'admin_glo3');
  assert.equal(generateUniqueUsername(' @TEC_glo ', existing), 'tec_glo1');
  assert.equal(generateUniqueUsername('recep_glo', existing), 'recep_glo');
});
