const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEGACY_ID_TO_UUID: Record<string, string> = {
  'tenant-globaltech': '11111111-1111-4111-8111-111111111111',
  'tenant-maquinarias': '22222222-2222-4222-8222-222222222222',
  'branch-gt-hq': '11111111-1111-4111-8111-111111111101',
  'branch-gt-centro': '11111111-1111-4111-8111-111111111102',
  'branch-gt-stgo': '11111111-1111-4111-8111-111111111103',
  'branch-mq-hq': '22222222-2222-4222-8222-222222222201',
  'branch-mq-osorno': '22222222-2222-4222-8222-222222222202',
  'prof-gt-admin': '11111111-1111-4111-8111-111111110101',
  'prof-gt-tech1': '11111111-1111-4111-8111-111111110102',
  'prof-gt-tech2': '11111111-1111-4111-8111-111111110103',
  'prof-gt-rec1': '11111111-1111-4111-8111-111111110104',
  'prof-mq-admin': '22222222-2222-4222-8222-222222220101',
  'cli-1': '11111111-1111-4111-8111-111111110201',
  'cli-2': '11111111-1111-4111-8111-111111110202',
  'cli-3': '11111111-1111-4111-8111-111111110203',
  'cli-4': '11111111-1111-4111-8111-111111110204',
  'cli-5': '22222222-2222-4222-8222-222222220205',
  'cli-6': '22222222-2222-4222-8222-222222220206',
  'ast-1': '11111111-1111-4111-8111-111111110301',
  'ast-2': '11111111-1111-4111-8111-111111110302',
  'ast-3': '11111111-1111-4111-8111-111111110303',
  'ast-4': '11111111-1111-4111-8111-111111110304',
  'ast-5': '22222222-2222-4222-8222-222222220305',
  'ast-6': '22222222-2222-4222-8222-222222220306',
  'cat-1': '11111111-1111-4111-8111-111111110401',
  'cat-2': '11111111-1111-4111-8111-111111110402',
  'cat-3': '11111111-1111-4111-8111-111111110403',
  'cat-4': '11111111-1111-4111-8111-111111110404',
  'cat-5': '11111111-1111-4111-8111-111111110405',
  'cat-6': '11111111-1111-4111-8111-111111110406',
  'cat-7': '11111111-1111-4111-8111-111111110407',
  'cat-8': '22222222-2222-4222-8222-222222220408',
  'cat-9': '22222222-2222-4222-8222-222222220409',
  'cat-10': '22222222-2222-4222-8222-222222220410',
  'loan-1': '11111111-1111-4111-8111-111111110501',
  'loan-2': '11111111-1111-4111-8111-111111110502',
  'loan-3': '11111111-1111-4111-8111-111111110503',
  'loan-4': '22222222-2222-4222-8222-222222220504',
  'wo-105': '11111111-1111-4111-8111-111111110605',
  'wo-104': '11111111-1111-4111-8111-111111110604',
  'wo-103': '11111111-1111-4111-8111-111111110603',
  'wo-102': '11111111-1111-4111-8111-111111110602',
  'wo-101': '11111111-1111-4111-8111-111111110601',
  'wo-mq-101': '22222222-2222-4222-8222-222222220601',
  'wo-mq-102': '22222222-2222-4222-8222-222222220602',
  'apt-1': '11111111-1111-4111-8111-111111110901',
  'apt-2': '11111111-1111-4111-8111-111111110902',
  'apt-3': '11111111-1111-4111-8111-111111110903',
  'apt-4': '22222222-2222-4222-8222-222222220904',
};

export function isValidUUID(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  return UUID_REGEX.test(val.trim());
}

export function generateUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function deterministicUuidFromString(input: string): string {
  // Produce a repeatable UUIDv4-formatted string so parent & child FKs stay consistent
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (c * 31), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (c ^ 0x5a), 0x27d4eb2f) >>> 0;
  }
  const p1 = h1.toString(16).padStart(8, '0');
  const p2 = (h2 >>> 16).toString(16).padStart(4, '0');
  const p3 = ((0x4000 | (h2 & 0x0fff)) >>> 0).toString(16).padStart(4, '0');
  const p4 = ((0x8000 | (h3 & 0x3fff)) >>> 0).toString(16).padStart(4, '0');
  const p5 =
    ((h3 >>> 16) & 0xffff).toString(16).padStart(4, '0') +
    h4.toString(16).padStart(8, '0');
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export function ensureUUID(val?: string | null): string {
  if (!val || !val.trim()) return generateUUID();
  const trimmed = val.trim();
  if (isValidUUID(trimmed)) return trimmed.toLowerCase();
  if (LEGACY_ID_TO_UUID[trimmed]) return LEGACY_ID_TO_UUID[trimmed];
  return deterministicUuidFromString(trimmed);
}
