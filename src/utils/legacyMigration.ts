import type {
  Client,
  CustomerAsset,
  ErpState,
  OrderStatus,
  WorkOrder,
} from '../types/erp';
import { generateNextFolio, generateTrackingCode, getLocalIsoDate } from './erpLogic';
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

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeLegacyDate(raw: unknown): string {
  const fallback = getLocalIsoDate();
  const str = String(raw ?? '').trim();
  if (!str) return fallback;

  // YYYY-MM-DD or ISO timestamp
  const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const candidate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    const parsed = new Date(`${candidate}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return candidate;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const monthNum = Number(m);
    const dayNum = Number(d);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      const candidate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const parsed = new Date(`${candidate}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return candidate;
      }
    }
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return getLocalIsoDate(parsed);
  }
  return fallback;
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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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
      entryDate: normalizeLegacyDate(iFec >= 0 ? cols[iFec] : ''),
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
    detectedTables,
    extractedStringsSample: combined,
    records: [],
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
  createdClientsList: Client[];
  createdAssetsList: CustomerAsset[];
  createdOrdersList: WorkOrder[];
} {
  const tenant = currentState.tenants.find((t) => t.id === options.tenantId);
  const prefix = tenant?.folio_prefix ?? 'OT';

  const nextClients: Client[] = [...currentState.clients];
  const nextAssets: CustomerAsset[] = [...currentState.assets];
  const nextOrders: WorkOrder[] = [...currentState.workOrders];
  const createdClientsList: Client[] = [];
  const createdAssetsList: CustomerAsset[] = [];
  const createdOrdersList: WorkOrder[] = [];

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
      createdClientsList.push(client);
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
    createdAssetsList.push(asset);

    const folio = generateNextFolio(prefix, nextOrders, options.tenantId);
    const normalizedEntryDate = normalizeLegacyDate(rec.entryDate);
    const createdIso = `${normalizedEntryDate}T10:00:00Z`;
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
      accessories_received: 'Importado desde registro histórico FIXICLOUD',
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
                date: normalizedEntryDate,
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
    createdOrdersList.push(newOrder);
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
    createdClientsList,
    createdAssetsList,
    createdOrdersList,
  };
}
