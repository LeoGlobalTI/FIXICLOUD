import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppUser,
  Appointment,
  CatalogItem,
  Client,
  CustomerAsset,
  LoanAsset,
  Tenant,
  WorkOrder,
} from '../types/erp';
import { ensureUUID, generateUUID, isValidUUID } from './uuid';
import {
  hasLegacyNonUuidIds,
  mapAppUserFromDb,
  mapAppUserToDb,
  mapAppointmentFromDb,
  mapAppointmentToDb,
  mapAssetToDb,
  mapBranchesToDbSafe,
  mapCatalogItemToDb,
  mapClientToDb,
  mapLoanAssetToDb,
  mapOrderItemFromDb,
  mapOrderLoanFromDb,
  mapOrderPaymentFromDb,
  mapOrderPhotoFromDb,
  mapTenantToDb,
  mapWorkOrderItemToDb,
  mapWorkOrderLoanToDb,
  mapWorkOrderPaymentToDb,
  mapWorkOrderPhotoToDb,
  mapWorkOrderToDb,
} from './supabaseMappers';

const sampleTenant: Tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'GlobalTech Service SPA',
  tax_id: '76.890.412-3',
  sector: 'computing',
  currency: 'CLP',
  iva_rate: 19,
  folio_prefix: 'OT',
  whatsapp_enabled: true,
  whatsapp_templates: {
    intake: 'Ingreso {folio}',
    quote_ready: 'Presupuesto {folio}',
    ready_for_pickup: 'Listo {folio}',
  },
  phone: '+56 72 245 8900',
  email: 'soporte@globaltech.cl',
  created_at: '2026-01-15T09:00:00Z',
};

const sampleClient: Client = {
  id: '11111111-1111-4111-8111-111111110201',
  tenant_id: sampleTenant.id,
  name: 'Carlos Mendoza Rojas',
  rut: '16.432.890-5',
  phone: '+56 9 8421 3390',
  email: 'cmendoza@empresa.cl',
  address: 'Av. Bernardo O’Higgins 450',
  city: 'Rancagua',
};

const sampleAsset: CustomerAsset = {
  id: '11111111-1111-4111-8111-111111110301',
  tenant_id: sampleTenant.id,
  client_id: sampleClient.id,
  category: 'Notebook',
  brand: 'Lenovo',
  model: 'ThinkPad T14 Gen 3',
  serial_imei: 'PF-3X92A19',
  password_pattern: '1234*',
  custom_attributes: { processor_ram: 'i7 12th / 16GB' },
};

const sampleCatalogItem: CatalogItem = {
  id: '11111111-1111-4111-8111-111111110401',
  tenant_id: sampleTenant.id,
  branch_id: '11111111-1111-4111-8111-111111111101',
  sku: 'SSD-NVME-1TB',
  name: 'SSD NVMe M.2 1TB Gen4',
  category: 'part',
  cost_price: 45000,
  sale_price: 89900,
  stock_qty: 12,
  min_stock: 3,
};

const sampleLoan: LoanAsset = {
  id: '11111111-1111-4111-8111-111111110501',
  tenant_id: sampleTenant.id,
  branch_id: '11111111-1111-4111-8111-111111111101',
  code: 'PREST-01',
  name: 'Notebook Lenovo ThinkPad L14 (Respaldo)',
  brand_model: 'Lenovo L14 · i5 / 8GB / 256GB SSD',
  serial_number: 'SN-PREST-001',
  status: 'available',
  condition_notes: 'Con cargador USB-C y bolso.',
};

const sampleWorkOrder: WorkOrder = {
  id: '11111111-1111-4111-8111-111111110605',
  tenant_id: sampleTenant.id,
  branch_id: '11111111-1111-4111-8111-111111111101',
  folio: 'OT-000105',
  tracking_code: '8F92A1C4',
  client_id: sampleClient.id,
  asset_id: sampleAsset.id,
  status: 'in_repair',
  modality: 'workshop',
  accessories_received: 'Cargador',
  entry_condition: 'Buen estado',
  reported_symptoms: 'No enciende',
  technical_diagnosis: 'Falla en VRM',
  work_performed: 'Reemplazo MOSFET',
  parts_and_observations: 'Prueba térmica OK',
  assigned_technician: 'Diego Torres',
  apply_iva: true,
  discount_amount: 5000,
  items: [
    {
      id: '11111111-1111-4111-8111-111111110701',
      source: 'catalog',
      catalog_item_id: sampleCatalogItem.id,
      sku: sampleCatalogItem.sku,
      description: sampleCatalogItem.name,
      qty: 1,
      unit_price: 89900,
    },
  ],
  payments: [
    {
      id: '11111111-1111-4111-8111-111111110801',
      date: '2026-11-10',
      amount: 30000,
      method: 'transfer',
    },
  ],
  photos: [],
  warranty_days: 90,
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-11T10:00:00Z',
};

const sampleAppointment: Appointment = {
  id: '11111111-1111-4111-8111-111111110901',
  tenant_id: sampleTenant.id,
  branch_id: '11111111-1111-4111-8111-111111111101',
  subject: 'Mantención preventiva en oficina',
  client_id: sampleClient.id,
  modality: 'home_service',
  visit_address: 'Av. Alemania 540',
  technician: 'Camila Herrera',
  date: '2026-11-14',
  start_time: '10:00',
  end_time: '11:30',
  status: 'scheduled',
  notes: 'Llevar pasta térmica',
  created_at: '2026-11-10T09:00:00Z',
};

describe('UUID validation and seedData audit', () => {
  it('verifies every id and *_id field literal in src/data/seedData.ts is a valid UUID (or null)', () => {
    const seedPath = path.resolve(process.cwd(), 'src/data/seedData.ts');
    const source = fs.readFileSync(seedPath, 'utf8');
    const idFieldRegex =
      /\b(?:id|tenant_id|branch_id|client_id|asset_id|catalog_item_id|loan_asset_id|work_order_id)\s*:\s*(?:'([^']+)'|"([^"]+)")/g;

    const invalidIds: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = idFieldRegex.exec(source)) !== null) {
      const value = match[1] ?? match[2];
      if (!isValidUUID(value)) {
        invalidIds.push(value);
      }
    }
    assert.deepEqual(invalidIds, [], `Invalid non-UUID IDs found in seedData.ts: ${invalidIds.join(', ')}`);
  });

  it('ensureUUID preserves valid UUIDs, deterministically converts legacy strings, and generates fresh UUIDs for empty inputs', () => {
    const generated = generateUUID();
    assert.ok(isValidUUID(generated));
    assert.equal(ensureUUID(generated), generated.toLowerCase());

    assert.equal(
      ensureUUID('tenant-globaltech'),
      '11111111-1111-4111-8111-111111111111'
    );
    const customA = ensureUUID('legacy-custom-42');
    const customB = ensureUUID('legacy-custom-42');
    assert.ok(isValidUUID(customA));
    assert.equal(customA, customB);

    const blank = ensureUUID('   ');
    assert.ok(isValidUUID(blank));
  });

  it('hasLegacyNonUuidIds detects old string IDs and returns false for valid UUID state', () => {
    assert.equal(
      hasLegacyNonUuidIds({
        tenants: [sampleTenant],
        clients: [sampleClient],
        assets: [sampleAsset],
        catalogItems: [sampleCatalogItem],
        loanAssets: [sampleLoan],
        workOrders: [sampleWorkOrder],
        appointments: [sampleAppointment],
      }),
      false
    );
    assert.equal(
      hasLegacyNonUuidIds({
        tenants: [{ id: 'tenant-globaltech' }],
      }),
      true
    );
    assert.equal(
      hasLegacyNonUuidIds({
        clients: [{ id: 'cli-1', tenant_id: sampleTenant.id }],
      }),
      true
    );
  });
});

describe('PostgreSQL Exact Column Mappers', () => {
  it('mapTenantToDb emits industry/tax_rate/order_prefix and never emits sector/iva_rate/folio_prefix', () => {
    const dbTenant = mapTenantToDb(sampleTenant, 105) as unknown as Record<
      string,
      unknown
    >;
    assert.equal(dbTenant.industry, 'computing');
    assert.equal(dbTenant.tax_rate, 19);
    assert.equal(dbTenant.order_prefix, 'OT');
    assert.equal(dbTenant.last_order_number, 105);
    assert.equal('sector' in dbTenant, false);
    assert.equal('iva_rate' in dbTenant, false);
    assert.equal('folio_prefix' in dbTenant, false);
  });

  it('mapBranchesToDbSafe enforces at most one is_headquarters=true per tenant_id', () => {
    const mapped = mapBranchesToDbSafe([
      {
        id: generateUUID(),
        tenant_id: sampleTenant.id,
        name: 'HQ 1',
        code: 'HQ-1',
        is_hq: true,
        address: 'Dir 1',
        city: 'Temuco',
        phone: '',
        business_hours: '9-18',
      },
      {
        id: generateUUID(),
        tenant_id: sampleTenant.id,
        name: 'HQ Duplicada',
        code: 'HQ-2',
        is_hq: true,
        address: 'Dir 2',
        city: 'Santiago',
        phone: '',
        business_hours: '9-18',
      },
    ]);
    assert.equal(mapped.filter((b) => b.is_headquarters).length, 1);
    assert.equal(mapped[0].is_headquarters, true);
    assert.equal(mapped[1].is_headquarters, false);
  });

  it('mapClientToDb emits full_name and tax_id, never name or rut', () => {
    const dbClient = mapClientToDb(sampleClient) as unknown as Record<string, unknown>;
    assert.equal(dbClient.full_name, sampleClient.name);
    assert.equal(dbClient.tax_id, sampleClient.rut);
    assert.equal('name' in dbClient, false);
    assert.equal('rut' in dbClient, false);
  });

  it('mapAssetToDb emits asset_category and serial_number, never type/category/serial_imei/password_pattern', () => {
    const dbAsset = mapAssetToDb(sampleAsset) as unknown as Record<string, unknown>;
    assert.equal(dbAsset.asset_category, sampleAsset.category);
    assert.equal(dbAsset.serial_number, sampleAsset.serial_imei);
    assert.equal(dbAsset.unlock_credentials, sampleAsset.password_pattern);
    assert.equal('type' in dbAsset, false);
    assert.equal('category' in dbAsset, false);
    assert.equal('serial_imei' in dbAsset, false);
    assert.equal('password_pattern' in dbAsset, false);
  });

  it('mapCatalogItemToDb emits type, cost_price, sale_price, stock_quantity, min_stock and never price/stock/category', () => {
    const dbItem = mapCatalogItemToDb(sampleCatalogItem) as unknown as Record<
      string,
      unknown
    >;
    assert.equal(dbItem.type, 'part');
    assert.equal(dbItem.stock_quantity, 12);
    assert.equal('price' in dbItem, false);
    assert.equal('stock' in dbItem, false);
    assert.equal('stock_qty' in dbItem, false);
    assert.equal('category' in dbItem, false);
  });

  it('mapLoanAssetToDb emits internal_code, accessories_included, value_amount, notes', () => {
    const dbLoan = mapLoanAssetToDb(sampleLoan) as unknown as Record<string, unknown>;
    assert.equal(dbLoan.internal_code, sampleLoan.code);
    assert.equal(dbLoan.accessories_included, sampleLoan.brand_model);
    assert.equal(dbLoan.value_amount, 0);
    assert.equal(dbLoan.notes, sampleLoan.condition_notes);
    assert.equal('code' in dbLoan, false);
    assert.equal('brand_model' in dbLoan, false);
  });

  it('mapWorkOrderToDb computes financials and NEVER emits balance_due or nested arrays', () => {
    const dbOrder = mapWorkOrderToDb(sampleWorkOrder, 19) as unknown as Record<
      string,
      unknown
    >;
    assert.equal('balance_due' in dbOrder, false);
    assert.equal('items' in dbOrder, false);
    assert.equal('payments' in dbOrder, false);
    assert.equal('photos' in dbOrder, false);
    assert.equal('loan' in dbOrder, false);
    assert.equal('apply_iva' in dbOrder, false);
    assert.equal(dbOrder.order_number, 105);
    assert.equal(typeof dbOrder.subtotal_amount, 'number');
    assert.equal(typeof dbOrder.tax_amount, 'number');
    assert.equal(typeof dbOrder.total_amount, 'number');
    assert.equal(dbOrder.paid_amount, 30000);
    assert.ok(isValidUUID(String(dbOrder.id)));
  });

  it('mapAppointmentToDb emits scheduled_start/scheduled_end/address and round-trips via mapAppointmentFromDb', () => {
    const dbApt = mapAppointmentToDb(sampleAppointment) as unknown as Record<
      string,
      unknown
    >;
    assert.equal('date' in dbApt, false);
    assert.equal('start_time' in dbApt, false);
    assert.equal('end_time' in dbApt, false);
    assert.equal(
      dbApt.scheduled_start,
      `${sampleAppointment.date}T${sampleAppointment.start_time}:00Z`
    );
    assert.equal(
      dbApt.scheduled_end,
      `${sampleAppointment.date}T${sampleAppointment.end_time}:00Z`
    );

    const roundTrip = mapAppointmentFromDb(dbApt);
    assert.equal(roundTrip.id, sampleAppointment.id);
    assert.equal(roundTrip.date, sampleAppointment.date);
    assert.equal(roundTrip.start_time, sampleAppointment.start_time);
    assert.equal(roundTrip.end_time, sampleAppointment.end_time);
    assert.equal(roundTrip.technician, sampleAppointment.technician);
    assert.equal(roundTrip.notes, sampleAppointment.notes);
  });

  it('mapWorkOrderItemToDb sends exact columns (quantity, unit_price, item_type, deducted_from_stock) and NEVER qty/price/total_price/total', () => {
    const dbPart = mapWorkOrderItemToDb(sampleWorkOrder.items[0], {
      tenantId: sampleTenant.id,
      workOrderId: sampleWorkOrder.id,
      catalogItemType: 'part',
    }) as unknown as Record<string, unknown>;

    assert.deepEqual(Object.keys(dbPart).sort(), [
      'catalog_item_id',
      'deducted_from_stock',
      'description',
      'id',
      'item_type',
      'quantity',
      'tenant_id',
      'unit_price',
      'work_order_id',
    ]);
    assert.equal(dbPart.item_type, 'part');
    assert.equal(dbPart.quantity, 1);
    assert.equal(dbPart.unit_price, 89900);
    assert.equal(dbPart.deducted_from_stock, true);
    assert.equal('qty' in dbPart, false);
    assert.equal('price' in dbPart, false);
    assert.equal('total_price' in dbPart, false);
    assert.equal('total' in dbPart, false);

    const dbCustom = mapWorkOrderItemToDb(
      {
        id: generateUUID(),
        source: 'free',
        description: 'Limpieza ultrasónica',
        qty: 2,
        unit_price: 15000,
      },
      {
        tenantId: sampleTenant.id,
        workOrderId: sampleWorkOrder.id,
      }
    );
    assert.equal(dbCustom.item_type, 'custom');
    assert.equal(dbCustom.deducted_from_stock, false);
    assert.equal(dbCustom.quantity, 2);

    const roundTrip = mapOrderItemFromDb(dbPart);
    assert.equal(roundTrip.qty, 1);
    assert.equal(roundTrip.unit_price, 89900);
    assert.equal(roundTrip.source, 'catalog');
  });

  it('mapWorkOrderPaymentToDb sends exact columns (receipt_number, payment_method, paid_at, branch_id) and NEVER method/date', () => {
    const dbPay = mapWorkOrderPaymentToDb(
      {
        id: sampleWorkOrder.payments[0].id,
        date: '2026-11-10',
        amount: 30000,
        method: 'transfer',
        reference: 'REC-9901',
      },
      {
        tenantId: sampleTenant.id,
        branchId: sampleWorkOrder.branch_id,
        workOrderId: sampleWorkOrder.id,
      }
    ) as unknown as Record<string, unknown>;

    assert.deepEqual(Object.keys(dbPay).sort(), [
      'amount',
      'branch_id',
      'id',
      'notes',
      'paid_at',
      'payment_method',
      'receipt_number',
      'tenant_id',
      'work_order_id',
    ]);
    assert.equal(dbPay.payment_method, 'transfer');
    assert.equal(dbPay.receipt_number, 'REC-9901');
    assert.equal(dbPay.paid_at, '2026-11-10T12:00:00Z');
    assert.equal('method' in dbPay, false);
    assert.equal('date' in dbPay, false);

    const roundTrip = mapOrderPaymentFromDb(dbPay);
    assert.equal(roundTrip.date, '2026-11-10');
    assert.equal(roundTrip.method, 'transfer');
    assert.equal(roundTrip.reference, 'REC-9901');
  });

  it('mapWorkOrderLoanToDb sends exact columns including condition_on_loan and is_active', () => {
    const loanObj = {
      id: generateUUID(),
      loan_asset_id: sampleLoan.id,
      asset_code: sampleLoan.code,
      asset_name: sampleLoan.name,
      loaned_at: '2026-11-11T15:00:00Z',
      delivery_notes: 'Con cargador original',
    };
    const dbLoan = mapWorkOrderLoanToDb(loanObj, {
      tenantId: sampleTenant.id,
      workOrderId: sampleWorkOrder.id,
    }) as unknown as Record<string, unknown>;

    assert.deepEqual(Object.keys(dbLoan).sort(), [
      'condition_on_loan',
      'condition_on_return',
      'expected_return_at',
      'id',
      'is_active',
      'loan_asset_id',
      'loaned_at',
      'returned_at',
      'tenant_id',
      'work_order_id',
    ]);
    assert.equal(dbLoan.condition_on_loan, 'Con cargador original');
    assert.equal(dbLoan.is_active, true);

    const roundTrip = mapOrderLoanFromDb(dbLoan, {
      code: sampleLoan.code,
      name: sampleLoan.name,
    });
    assert.equal(roundTrip.asset_code, sampleLoan.code);
    assert.equal(roundTrip.delivery_notes, 'Con cargador original');
  });

  it('mapWorkOrderPhotoToDb sends exact columns (storage_path, public_url) and NEVER url', () => {
    const demoPhoto = {
      id: generateUUID(),
      url: 'https://example.com/photo.jpg',
      stage: 'reception' as const,
      caption: 'Bisagra rota',
      created_at: '2026-11-10T10:00:00Z',
    };
    const dbDemoPhoto = mapWorkOrderPhotoToDb(demoPhoto, {
      tenantId: sampleTenant.id,
      workOrderId: sampleWorkOrder.id,
    }) as unknown as Record<string, unknown>;

    assert.deepEqual(Object.keys(dbDemoPhoto).sort(), [
      'caption',
      'id',
      'public_url',
      'stage',
      'storage_path',
      'tenant_id',
      'work_order_id',
    ]);
    assert.equal(dbDemoPhoto.storage_path, 'demo');
    assert.equal(dbDemoPhoto.public_url, 'https://example.com/photo.jpg');
    assert.equal('url' in dbDemoPhoto, false);

    const storagePhoto = mapWorkOrderPhotoToDb(
      {
        ...demoPhoto,
        url: 'https://abc.supabase.co/storage/v1/object/public/order-photos/1111/2222/1234.webp',
      },
      {
        tenantId: sampleTenant.id,
        workOrderId: sampleWorkOrder.id,
      }
    );
    assert.equal(storagePhoto.storage_path, '1111/2222/1234.webp');

    const roundTrip = mapOrderPhotoFromDb(dbDemoPhoto);
    assert.equal(roundTrip.url, demoPhoto.url);
    assert.equal(roundTrip.stage, 'reception');
  });

  it('mapAppUserToDb and mapAppUserFromDb preserve superadmin null tenant/branch and map company_admin <-> admin', () => {
    const superAdmin: AppUser = {
      id: '00000000-0000-4000-8000-000000000001',
      tenant_id: null,
      branch_id: null,
      username: ' admin ',
      pin_or_password: ' 123456 ',
      full_name: ' SuperAdmin FIXICLOUD ',
      role: 'superadmin',
      is_active: true,
      created_at: '2026-01-01T09:00:00Z',
    };

    const dbSuper = mapAppUserToDb(superAdmin);
    assert.equal(dbSuper.tenant_id, null);
    assert.equal(dbSuper.branch_id, null);
    assert.equal(dbSuper.username, 'admin');
    assert.equal(dbSuper.pin_or_password, '123456');
    assert.equal(dbSuper.role, 'superadmin');

    const companyAdmin: AppUser = {
      id: '11111111-1111-4111-8111-111111110111',
      tenant_id: sampleTenant.id,
      branch_id: null,
      username: 'carolina',
      pin_or_password: '123456',
      full_name: 'Carolina Mendoza',
      role: 'admin',
      is_active: true,
      created_at: '2026-01-15T09:00:00Z',
    };

    const dbAdmin = mapAppUserToDb(companyAdmin);
    assert.equal(dbAdmin.role, 'company_admin');
    const roundTripAdmin = mapAppUserFromDb(
      dbAdmin as unknown as Record<string, unknown>
    );
    assert.equal(roundTripAdmin.role, 'admin');
    assert.equal(roundTripAdmin.tenant_id, sampleTenant.id);
    assert.equal(roundTripAdmin.branch_id, null);

    assert.equal(
      hasLegacyNonUuidIds({
        appUsers: [{ id: 'usr-1', tenant_id: sampleTenant.id, branch_id: null }],
      }),
      true
    );
    assert.equal(
      hasLegacyNonUuidIds({
        appUsers: [superAdmin, companyAdmin],
      }),
      false
    );
  });
});
