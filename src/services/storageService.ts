import type { AuthSessionUser, ErpState, SupabaseConfig } from '../types/erp';
import { hasLegacyNonUuidIds } from '../utils/supabaseMappers';
import { isValidUUID } from '../utils/uuid';

const ERP_STATE_KEY = 'fixicloud_erp_state_v1';
const AUTH_SESSION_KEY = 'fixicloud_auth_session_v1';

export const EMPTY_ERP_STATE: ErpState = {
  tenants: [],
  branches: [],
  appUsers: [],
  clients: [],
  assets: [],
  catalogItems: [],
  loanAssets: [],
  workOrders: [],
  appointments: [],
};

function sanitizeEnvVar(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function getEnvSupabaseCredentials(): {
  url: string;
  anonKey: string;
  hasSecretKeyMistake: boolean;
} {
  const url =
    typeof import.meta.env !== 'undefined'
      ? sanitizeEnvVar(import.meta.env.VITE_SUPABASE_URL)
      : '';
  const rawAnon =
    typeof import.meta.env !== 'undefined'
      ? sanitizeEnvVar(import.meta.env.VITE_SUPABASE_ANON_KEY)
      : '';
  const rawPublishable =
    typeof import.meta.env !== 'undefined'
      ? sanitizeEnvVar(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      : '';

  const isSecretAnon = rawAnon.startsWith('sb_secret_');
  const safeAnon = !isSecretAnon && rawAnon ? rawAnon : rawPublishable;

  return {
    url,
    anonKey: safeAnon.startsWith('sb_secret_') ? '' : safeAnon,
    hasSecretKeyMistake: isSecretAnon && !rawPublishable,
  };
}

export function loadErpState(): ErpState {
  try {
    const raw = localStorage.getItem(ERP_STATE_KEY);
    if (!raw) return EMPTY_ERP_STATE;
    const parsed = JSON.parse(raw) as Partial<ErpState>;
    if (!parsed || !Array.isArray(parsed.tenants) || hasLegacyNonUuidIds(parsed)) {
      localStorage.removeItem(ERP_STATE_KEY);
      return EMPTY_ERP_STATE;
    }
    return {
      tenants: parsed.tenants ?? [],
      branches: parsed.branches ?? [],
      appUsers: parsed.appUsers ?? [],
      clients: parsed.clients ?? [],
      assets: parsed.assets ?? [],
      catalogItems: parsed.catalogItems ?? [],
      loanAssets: parsed.loanAssets ?? [],
      workOrders: parsed.workOrders ?? [],
      appointments: parsed.appointments ?? [],
    };
  } catch {
    return EMPTY_ERP_STATE;
  }
}

export function saveErpState(
  state: ErpState,
  options?: { stripCredentials?: boolean }
): void {
  try {
    const toPersist = options?.stripCredentials
      ? {
          ...state,
          appUsers: state.appUsers.map((u) => ({ ...u, pin_or_password: '' })),
        }
      : state;
    localStorage.setItem(ERP_STATE_KEY, JSON.stringify(toPersist));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function clearErpState(): void {
  try {
    localStorage.removeItem(ERP_STATE_KEY);
  } catch {
    // Ignore
  }
}

export function loadSupabaseConfig(): SupabaseConfig {
  const envCreds = getEnvSupabaseCredentials();
  if (envCreds.url && envCreds.anonKey) {
    return {
      url: envCreds.url,
      anonKey: envCreds.anonKey,
      connected: true,
      source: 'env',
    };
  }

  return {
    url: envCreds.url,
    anonKey: '',
    connected: false,
    source: 'none',
    lastError: envCreds.hasSecretKeyMistake
      ? 'La variable VITE_SUPABASE_ANON_KEY tiene una clave secreta (sb_secret_...). Reemplázala por la clave pública (sb_publishable_...) en las variables de entorno.'
      : undefined,
  };
}

export function loadAuthSession(): AuthSessionUser | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSessionUser;
    if (!parsed?.id || !isValidUUID(parsed.id) || !parsed.username) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    if (parsed.tenant_id && !isValidUUID(parsed.tenant_id)) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    if (parsed.branch_id && !isValidUUID(parsed.branch_id)) {
      localStorage.removeItem(AUTH_SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveAuthSession(user: AuthSessionUser | null): void {
  try {
    if (!user) {
      localStorage.removeItem(AUTH_SESSION_KEY);
    } else {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
    }
  } catch {
    // Ignore
  }
}
