import test from 'node:test';
import assert from 'node:assert/strict';
import {
  type LegacyMdbRecord,
  buildMigrationPreview,
  executeLegacyMigration,
  normalizeLegacyDate,
  parseLegacyCsv,
  scanMdbBinaryStrings,
} from './legacyMigration';
import type { ErpState } from '../types/erp';

const SAMPLE_RECORDS: LegacyMdbRecord[] = [
  {
    legacyId: 'FX-4012',
    clientName: 'María Fernanda Rojas',
    clientPhone: '+56 9 8412 3390',
    clientAddress: 'Calle Estado 340',
    category: 'Notebook',
    brand: 'HP',
    model: 'ProBook 450 G8',
    serialImei: '5CD1209876',
    symptoms: 'No carga batería',
    diagnosis: 'Pin de carga dañado',
    partsAndObs: 'Reemplazo jack DC',
    totalAmount: 45000,
    paidAmount: 20000,
    entryDate: '2026-01-15',
    status: 'ready',
  },
  {
    legacyId: 'FX-4013',
    clientName: 'Transportes del Cachapoal Ltda',
    clientPhone: '+56 9 9234 5511',
    clientAddress: 'Ruta 5 Sur Km 88',
    category: 'Impresora',
    brand: 'HP',
    model: 'LaserJet Pro M404',
    serialImei: 'VNC3K1122',
    symptoms: 'Atasco de papel en fusor',
    diagnosis: 'Rodillo fusor desgastado',
    partsAndObs: 'Kit fusor HP',
    totalAmount: 85000,
    paidAmount: 0,
    entryDate: '2026-01-18',
    status: 'in_repair',
  },
  {
    legacyId: 'FX-4014',
    clientName: 'Andrés Morales',
    clientPhone: '+56 9 7111 2233',
    clientAddress: 'Av. Central 210',
    category: 'Monitor',
    brand: 'Dell',
    model: 'P2422H',
    serialImei: 'CN-0X912',
    symptoms: 'Sin imagen',
    diagnosis: 'Fuente con condensadores inflados',
    partsAndObs: 'Cambio condensadores',
    totalAmount: 35000,
    paidAmount: 35000,
    entryDate: '2026-01-20',
    status: 'delivered',
  },
  {
    legacyId: 'FX-4015',
    clientName: 'Transportes del Cachapoal Ltda',
    clientPhone: '+56 9 9234 5511',
    clientAddress: 'Ruta 5 Sur Km 88',
    category: 'Desktop',
    brand: 'Lenovo',
    model: 'ThinkCentre M720',
    serialImei: 'PC112233',
    symptoms: 'Reinicios aleatorios',
    diagnosis: 'SSD con sectores dañados',
    partsAndObs: 'SSD 500GB',
    totalAmount: 60000,
    paidAmount: 30000,
    entryDate: '2026-01-22',
    status: 'diagnosing',
  },
];

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
    'FX-9001;Juan Perez;987654321;Av Central 10;Notebook;Acer;Aspire 5;SN991;No enciende;Placa en corto;Cambio MOSFET;65000;20000;2026-02-10;Listo',
  ].join('\n');

  const rows = parseLegacyCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyId, 'FX-9001');
  assert.equal(rows[0].clientName, 'Juan Perez');
  assert.equal(rows[0].totalAmount, 65000);
  assert.equal(rows[0].paidAmount, 20000);
  assert.equal(rows[0].status, 'ready');
});

test('buildMigrationPreview deduplicates existing and in-batch clients and skips duplicate legacy_mdb_id', () => {
  const preview = buildMigrationPreview(baseState, SAMPLE_RECORDS, 't1', [
    { name: 'FX-4013_fusor.jpg', dataUrl: 'data:image/png;base64,AAA' },
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
  assert.equal(exec.createdClientsList.length, 2);
  assert.equal(exec.createdAssetsList.length, 4);
  assert.equal(exec.createdOrdersList.length, 4);

  // Re-running preview on updated state detects all 4 orders as duplicates
  const secondPreview = buildMigrationPreview(
    exec.nextState,
    SAMPLE_RECORDS,
    't1'
  );
  assert.equal(
    secondPreview.every((r) => r.orderStatus === 'duplicate_skip'),
    true
  );
});

test('scanMdbBinaryStrings extracts table signatures from binary buffer without synthesizing fake records', () => {
  const enc = new TextEncoder();
  const buf = enc.encode('Standard Jet DB\0Reparaciones\0Clientes\0Agenda\0').buffer;
  const res = scanMdbBinaryStrings(buf);
  assert.equal(res.detectedTables.includes('Reparaciones'), true);
  assert.equal(res.records.length, 0);
});

test('parseLegacyCsv unescapes RFC-4180 doubled quotes inside quoted cells', () => {
  const csv = [
    'IdOrden;Cliente;Telefono;Direccion;Equipo;Marca;Modelo;Serie;Sintomas;Diagnostico;Repuestos;Importe;Abono;Fecha;Estado',
    'FX-9002;"Empresa ""Andes"" SpA";987654321;Av 1;Notebook;HP;ProBook;SN-1;"Pantalla ""parpadea"" al abrir";Flex dañado;;85000;0;2026-03-01;Pendiente',
  ].join('\n');

  const rows = parseLegacyCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clientName, 'Empresa "Andes" SpA');
  assert.equal(rows[0].symptoms, 'Pantalla "parpadea" al abrir');
});

test('normalizeLegacyDate converts YYYY-MM-DD and DD/MM/YYYY and falls back cleanly on invalid strings', () => {
  assert.equal(normalizeLegacyDate('2026-03-09T14:22:00Z'), '2026-03-09');
  assert.equal(normalizeLegacyDate('15/02/2026'), '2026-02-15');
  assert.match(normalizeLegacyDate('fecha invalida'), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(normalizeLegacyDate(''), /^\d{4}-\d{2}-\d{2}$/);
});


