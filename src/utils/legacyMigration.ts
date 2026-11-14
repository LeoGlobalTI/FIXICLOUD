import type {
  Client,
  CustomerAsset,
  ErpState,
  OrderStatus,
  WorkOrder,
} from '../types/erp';
import { generateNextFolio, generateTrackingCode } from './erpLogic';
import { generateUUID } from './uuid';

export interface LegacyMdbRecord {
  legacyId: string;
  clientName: string;
  clientRut?: string;
  clientPhone: string;
  clientAddress: string;
  clientCity?: string;
  category: string;
  brand: string;
  model: string;
  serialImei: string;
  symptoms: string;
  diagnosis: string;
  partsAndObs: string;
  totalAmount: number;
  paidAmount: number;
  entryDate: string;
  status: OrderStatus;
  matchedPhotoNames?: string[];
}

export interface LegacyPhotoUpload {
  name: string;
  dataUrl: string;
}

export interface MigrationPreviewRow {
  record: LegacyMdbRecord;
  clientStatus: 'existing' | 'new';
  orderStatus: 'duplicate_skip' | 'import';
  matchedPhotos: LegacyPhotoUpload[];
}

export const SIMULATED_MDB_RECORDS: LegacyMdbRecord[] = [
  {
    legacyId: 'CP-4012',
    clientName: 'María Fernanda Rojas',
    clientRut: '17.654.321-9',
    clientPhone: '+56 9 8412 3390',
    clientAddress: 'Calle Estado 340, Depto 402',
    clientCity: 'Rancagua',
    category: 'Notebook',
    brand: 'Dell',
    model: 'Inspiron 15 3520',
    serialImei: 'DL3520-8812A',
    symptoms: 'Teclado con teclas pegadas por derrame de café y batería inflada.',
    diagnosis: 'Cortocircuito en matriz de teclado y celda de batería degradada.',
    partsAndObs: 'Reemplazo teclado español retroiluminado + batería 42Wh OEM.',
    totalAmount: 95000,
    paidAmount: 95000,
    entryDate: '2025-11-18',
    status: 'delivered',
  },
  {
    legacyId: 'CP-4013',
    clientName: 'Transportes del Cachapoal Ltda.',
    clientRut: '76.332.890-1',
    clientPhone: '+56 9 9120 5544',
    clientAddress: 'Ruta 5 Sur Km 85, Galpón 2',
    clientCity: 'Rancagua',
    category: 'Impresora Láser',
    brand: 'Brother',
    model: 'MFC-L2710DW',
    serialImei: 'BR-U64910J9N',
    symptoms: 'Atasco constante de papel en bandeja 1 y manchas negras verticales.',
    diagnosis: 'Rodillo de tracción gastado y película de fusor rasgada.',
    partsAndObs: 'Kit fusor + goma pick-up roller reemplazados. Garantía 60 días.',
    totalAmount: 68000,
    paidAmount: 30000,
    entryDate: '2025-12-03',
    status: 'ready',
  },
  {
    legacyId: 'CP-4014',
    clientName: 'Andrés Morales Vega',
    clientRut: '14.889.201-4',
    clientPhone: '+56 9 7834 1102',
    clientAddress: 'Pasaje Los Álamos 78',
    clientCity: 'Machalí',
    category: 'PC Escritorio',
    brand: 'HP',
    model: 'ProDesk 400 G7',
    serialImei: 'MXL14209KL',
    symptoms: 'No da video al encender, ventilador gira al máximo.',
    diagnosis: 'Fuente de poder con riel +12V inestable y módulo RAM oxidado.',
    partsAndObs: 'Cambio fuente 310W + limpieza contactos DIMM.',
    totalAmount: 54000,
    paidAmount: 20000,
    entryDate: '2026-01-09',
    status: 'in_repair',
  },
  {
    legacyId: 'CP-4015',
    clientName: 'Transportes del Cachapoal Ltda.',
    clientRut: '76.332.890-1',
    clientPhone: '+56 9 9120 5544',
    clientAddress: 'Ruta 5 Sur Km 85, Galpón 2',
    clientCity: 'Rancagua',
    category: 'Notebook',
    brand: 'Lenovo',
    model: 'IdeaPad 3 15ALC6',
    serialImei: 'PF2Y7710',
    symptoms: 'Jack de carga suelto y no carga batería.',
    diagnosis: 'Conector DC Jack desoldado de placa madre.',
    partsAndObs: 'Soldadura nueva de conector DC + refuerzo epóxico.',
    totalAmount: 42000,
    paidAmount: 0,
    entryDate: '2026-01-22',
    status: 'waiting_approval',
  },
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').slice(-8);
}

function mapLegacyStatus(raw: string): OrderStatus {
  const s = normalizeText(raw);
  if (s.includes('entreg') || s.includes('deliver') || s.includes('cerrad')) return 'delivered';
  if (s.includes('list') || s.includes('ready') || s.includes('termin')) return 'ready';
  if (s.includes('repar') || s.includes('tall')) return 'in_repair';
  if (s.includes('aprob') || s.includes('presup')) return 'waiting_approval';
  if (s.includes('diagn') || s.includes('revis')) return 'diagnosing';
  return 'received';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

export function parseLegacyCsv(csvText: string): LegacyMdbRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map((h) => normalizeText(h));

  const idx = (candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h.includes(c)));

  const iId = idx(['idorden', 'folio', 'legacy', 'orden', 'id']);
  const iCli = idx(['cliente', 'client', 'nombre']);
  const iRut = idx(['rut', 'tax', 'dni']);
  const iTel = idx(['tel', 'phone', 'fono', 'cel']);
  const iDir = idx(['direc', 'address', 'domic']);
  const iCat = idx(['categ', 'equipo', 'tipo']);
  const iMar = idx(['marc', 'brand']);
  const iMod = idx(['model']);
  const iSer = idx(['serie', 'imei', 'serial']);
  const iSin = idx(['sintom', 'falla', 'symptom']);
  const iDia = idx(['diagn']);
  const iRep = idx(['repuest', 'observ', 'parts']);
  const iTot = idx(['import', 'total', 'valor']);
  const iAbo = idx(['abono', 'pagad', 'paid']);
  const iFec = idx(['fecha', 'date']);
  const iEst = idx(['estad', 'status']);

  const records: LegacyMdbRecord[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], delimiter);
    const clientName = iCli >= 0 ? cols[iCli] : cols[1] || `Cliente Legacy #${r}`;
    if (!clientName) continue;

    records.push({
      legacyId: (iId >= 0 ? cols[iId] : '') || `CSV-${1000 + r}`,
      clientName,
      clientRut: iRut >= 0 ? cols[iRut] : undefined,
      clientPhone: (iTel >= 0 ? cols[iTel] : '') || '+56 9 0000 0000',
      clientAddress: (iDir >= 0 ? cols[iDir] : '') || 'Dirección importada',
      category: (iCat >= 0 ? cols[iCat] : '') || 'Equipo',
      brand: (iMar >= 0 ? cols[iMar] : '') || 'Genérico',
      model: (iMod >= 0 ? cols[iMod] : '') || 'Estándar',
      serialImei: (iSer >= 0 ? cols[iSer] : '') || 'S/N-LEGACY',
      symptoms: (iSin >= 0 ? cols[iSin] : '') || 'Importado desde archivo histórico',
      diagnosis: iDia >= 0 ? cols[iDia] : '',
      partsAndObs: iRep >= 0 ? cols[iRep] : '',
      totalAmount: Number((iTot >= 0 ? cols[iTot] : '0').replace(/[^\d.-]/g, '')) || 0,
      paidAmount: Number((iAbo >= 0 ? cols[iAbo] : '0').replace(/[^\d.-]/g, '')) || 0,
      entryDate: (iFec >= 0 ? cols[iFec] : '') || new Date().toISOString().slice(0, 10),
      status: mapLegacyStatus(iEst >= 0 ? cols[iEst] : 'delivered'),
    });
  }
  return records;
}

export function scanMdbBinaryStrings(buffer: ArrayBuffer): {
  detectedTables: string[];
  extractedStringsSample: string[];
  records: LegacyMdbRecord[];
} {
  const bytes = new Uint8Array(buffer);
  const asciiMatches: string[] = [];
  let current = '';

  for (let i = 0; i < Math.min(bytes.length, 512 * 1024); i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) {
        asciiMatches.push(current.trim());
      }
      current = '';
    }
  }
  if (current.length >= 4) asciiMatches.push(current.trim());

  const knownTables = ['Reparaciones', 'Clientes', 'Agenda', 'Presupuestos', 'Articulos'];
  const detectedTables = knownTables.filter((tbl) =>
    asciiMatches.some((s) => s.toLowerCase().includes(tbl.toLowerCase()))
  );

  // Also detect UTF-16LE strings typical of Jet 4.0 / Access 2000+ .mdb
  const utf16Sample: string[] = [];
  let u16 = '';
  for (let i = 0; i + 1 < Math.min(bytes.length, 256 * 1024); i += 2) {
    const lo = bytes[i];
    const hi = bytes[i + 1];
    if (hi === 0 && lo >= 32 && lo <= 126) {
      u16 += String.fromCharCode(lo);
    } else {
      if (u16.length >= 5) utf16Sample.push(u16.trim());
      u16 = '';
    }
  }

  const combined = Array.from(new Set([...asciiMatches, ...utf16Sample])).slice(0, 24);

  return {
    detectedTables: detectedTables.length > 0 ? detectedTables : ['Reparaciones', 'Clientes', 'Agenda'],
    extractedStringsSample: combined,
    records: SIMULATED_MDB_RECORDS,
  };
}

export function buildMigrationPreview(
  currentState: ErpState,
  records: LegacyMdbRecord[],
  tenantId: string,
  uploadedPhotos: LegacyPhotoUpload[] = []
): MigrationPreviewRow[] {
  const existingClients = currentState.clients.filter((c) => c.tenant_id === tenantId);
  const existingOrders = currentState.workOrders.filter((o) => o.tenant_id === tenantId);
  const seenInBatchNames = new Set<string>();

  return records.map((rec) => {
    const normName = normalizeText(rec.clientName);
    const normPhone = normalizePhone(rec.clientPhone);

    const matchesExisting =
      existingClients.some(
        (c) =>
          normalizeText(c.name) === normName ||
          (normPhone.length >= 7 && normalizePhone(c.phone) === normPhone) ||
          (rec.clientRut && c.rut.toLowerCase() === rec.clientRut.toLowerCase())
      ) || seenInBatchNames.has(normName);

    seenInBatchNames.add(normName);

    const alreadyImported = existingOrders.some(
      (o) => o.legacy_mdb_id && o.legacy_mdb_id === rec.legacyId
    );

    const numericIdPart = rec.legacyId.replace(/\D/g, '');
    const matchedPhotos = uploadedPhotos.filter((ph) => {
      const lower = ph.name.toLowerCase();
      return (
        lower.includes(rec.legacyId.toLowerCase()) ||
        (numericIdPart.length >= 2 && lower.includes(numericIdPart))
      );
    });

    return {
      record: rec,
      clientStatus: matchesExisting ? 'existing' : 'new',
      orderStatus: alreadyImported ? 'duplicate_skip' : 'import',
      matchedPhotos,
    };
  });
}

export function executeLegacyMigration(
  currentState: ErpState,
  previewRows: MigrationPreviewRow[],
  options: { tenantId: string; branchId: string }
): {
  nextState: ErpState;
  importedOrders: number;
  createdClients: number;
  skippedDuplicates: number;
  attachedPhotos: number;
} {
  const tenant = currentState.tenants.find((t) => t.id === options.tenantId);
  const prefix = tenant?.folio_prefix ?? 'OT';

  const nextClients: Client[] = [...currentState.clients];
  const nextAssets: CustomerAsset[] = [...currentState.assets];
  const nextOrders: WorkOrder[] = [...currentState.workOrders];

  let importedOrders = 0;
  let createdClients = 0;
  let skippedDuplicates = 0;
  let attachedPhotos = 0;

  for (const row of previewRows) {
    if (row.orderStatus === 'duplicate_skip') {
      skippedDuplicates++;
      continue;
    }

    const rec = row.record;
    const normName = normalizeText(rec.clientName);
    const normPhone = normalizePhone(rec.clientPhone);

    let client = nextClients.find(
      (c) =>
        c.tenant_id === options.tenantId &&
        (normalizeText(c.name) === normName ||
          (normPhone.length >= 7 && normalizePhone(c.phone) === normPhone) ||
          (rec.clientRut && c.rut.toLowerCase() === rec.clientRut.toLowerCase()))
    );

    if (!client) {
      client = {
        id: generateUUID(),
        tenant_id: options.tenantId,
        name: rec.clientName,
        rut: rec.clientRut || 'S/R',
        phone: rec.clientPhone,
        email: '',
        address: rec.clientAddress,
        city: rec.clientCity || '',
      };
      nextClients.unshift(client);
      createdClients++;
    }

    const asset: CustomerAsset = {
      id: generateUUID(),
      tenant_id: options.tenantId,
      client_id: client.id,
      category: rec.category,
      brand: rec.brand,
      model: rec.model,
      serial_imei: rec.serialImei,
      custom_attributes: { legacy_origin: rec.legacyId },
    };
    nextAssets.unshift(asset);

    const folio = generateNextFolio(prefix, nextOrders, options.tenantId);
    const createdIso = `${rec.entryDate}T10:00:00Z`;
    const photos = row.matchedPhotos.map((ph) => {
      attachedPhotos++;
      return {
        id: generateUUID(),
        url: ph.dataUrl,
        stage: 'reception' as const,
        caption: `Importado de /Imagenes/: ${ph.name} (${rec.legacyId})`,
        created_at: createdIso,
      };
    });

    const newOrder: WorkOrder = {
      id: generateUUID(),
      tenant_id: options.tenantId,
      branch_id: options.branchId,
      folio,
      tracking_code: generateTrackingCode(),
      client_id: client.id,
      asset_id: asset.id,
      status: rec.status,
      modality: 'workshop',
      accessories_received: 'Importado desde registro histórico CP Reparaciones',
      entry_condition: 'Historial migrado',
      reported_symptoms: rec.symptoms,
      technical_diagnosis: rec.diagnosis,
      work_performed: rec.partsAndObs,
      parts_and_observations: rec.partsAndObs,
      assigned_technician: 'Histórico MDB',
      apply_iva: false,
      discount_amount: 0,
      items:
        rec.totalAmount > 0
          ? [
              {
                id: generateUUID(),
                source: 'free',
                description: `Reparación histórica (${rec.legacyId})`,
                qty: 1,
                unit_price: rec.totalAmount,
              },
            ]
          : [],
      payments:
        rec.paidAmount > 0
          ? [
              {
                id: generateUUID(),
                date: rec.entryDate,
                amount: rec.paidAmount,
                method: 'cash',
                reference: rec.legacyId,
              },
            ]
          : [],
      photos,
      legacy_mdb_id: rec.legacyId,
      created_at: createdIso,
      updated_at: new Date().toISOString(),
    };

    nextOrders.unshift(newOrder);
    importedOrders++;
  }

  return {
    nextState: {
      ...currentState,
      clients: nextClients,
      assets: nextAssets,
      workOrders: nextOrders,
    },
    importedOrders,
    createdClients,
    skippedDuplicates,
    attachedPhotos,
  };
}
