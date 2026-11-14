import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMULATED_MDB_RECORDS,
  buildMigrationPreview,
  executeLegacyMigration,
  parseLegacyCsv,
  scanMdbBinaryStrings,
} from './legacyMigration';
import type { ErpState } from '../types/erp';

const baseState: ErpState = {
  tenants: [
    {
      id: 't1',
      name: 'Taller Test',
      tax_id: '76.111.222-3',
      sector: 'computing',
      currency: 'CLP',
      iva_rate: 19,
      folio_prefix: 'OT',
      whatsapp_enabled: true,
      whatsapp_templates: { intake: '', quote_ready: '', ready_for_pickup: '' },
      phone: '',
      email: '',
      created_at: '2026-01-01',
    },
  ],
  branches: [
    {
      id: 'b1',
      tenant_id: 't1',
      name: 'Casa Matriz',
      code: 'HQ',
      is_hq: true,
      address: 'Calle 1',
      city: 'Rancagua',
      phone: '',
      business_hours: '',
    },
  ],
  profiles: [],
  appUsers: [],
  clients: [
    {
      id: 'c-existing',
      tenant_id: 't1',
      name: 'María Fernanda Rojas',
      rut: '17.654.321-9',
      phone: '+56 9 8412 3390',
      email: '',
      address: 'Calle Estado 340',
      city: 'Rancagua',
    },
  ],
  assets: [],
  catalogItems: [],
  loanAssets: [],
  workOrders: [],
  appointments: [],
};

test('parseLegacyCsv parses semicolon-separated Access export rows', () => {
  const csv = [
    'IdOrden;Cliente;Telefono;Direccion;Equipo;Marca;Modelo;Serie;Sintomas;Diagnostico;Repuestos;Importe;Abono;Fecha;Estado',
    'CP-9001;Juan Perez;987654321;Av Central 10;Notebook;Acer;Aspire 5;SN991;No enciende;Placa en corto;Cambio MOSFET;65000;20000;2026-02-10;Listo',
  ].join('\n');

  const rows = parseLegacyCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyId, 'CP-9001');
  assert.equal(rows[0].clientName, 'Juan Perez');
  assert.equal(rows[0].totalAmount, 65000);
  assert.equal(rows[0].paidAmount, 20000);
  assert.equal(rows[0].status, 'ready');
});

test('buildMigrationPreview deduplicates existing and in-batch clients and skips duplicate legacy_mdb_id', () => {
  const preview = buildMigrationPreview(baseState, SIMULATED_MDB_RECORDS, 't1', [
    { name: 'CP-4013_fusor.jpg', dataUrl: 'data:image/png;base64,AAA' },
  ]);

  assert.equal(preview.length, 4);
  // First record matches existing María Fernanda Rojas
  assert.equal(preview[0].clientStatus, 'existing');
  // Second record is new client Transportes del Cachapoal + matched photo
  assert.equal(preview[1].clientStatus, 'new');
  assert.equal(preview[1].matchedPhotos.length, 1);
  // Fourth record is same client Transportes del Cachapoal inside same batch
  assert.equal(preview[3].clientStatus, 'existing');

  const exec = executeLegacyMigration(baseState, preview, {
    tenantId: 't1',
    branchId: 'b1',
  });
  assert.equal(exec.importedOrders, 4);
  assert.equal(exec.createdClients, 2); // Transportes del Cachapoal + Andrés Morales
  assert.equal(exec.attachedPhotos, 1);

  // Re-running preview on updated state detects all 4 orders as duplicates
  const secondPreview = buildMigrationPreview(
    exec.nextState,
    SIMULATED_MDB_RECORDS,
    't1'
  );
  assert.equal(
    secondPreview.every((r) => r.orderStatus === 'duplicate_skip'),
    true
  );
});

test('scanMdbBinaryStrings extracts table signatures from binary buffer', () => {
  const enc = new TextEncoder();
  const buf = enc.encode('Standard Jet DB\0Reparaciones\0Clientes\0Agenda\0').buffer;
  const res = scanMdbBinaryStrings(buf);
  assert.equal(res.detectedTables.includes('Reparaciones'), true);
  assert.equal(res.records.length > 0, true);
});
