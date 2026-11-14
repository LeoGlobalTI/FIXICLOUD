import type { AuthSessionUser, ErpState, SupabaseConfig } from '../types/erp';
import { SEED_ERP_STATE } from '../data/seedData';
import { hasLegacyNonUuidIds } from '../utils/supabaseMappers';
import { isValidUUID } from '../utils/uuid';

const ERP_STATE_KEY = 'fixicloud_erp_state_v1';
const SUPABASE_CFG_KEY = 'fixicloud_supabase_cfg_v1';
const AUTH_SESSION_KEY = 'fixicloud_auth_session_v1';

export function getEnvSupabaseCredentials(): { url: string; anonKey: string } {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
  return {
    url: (env?.VITE_SUPABASE_URL ?? '').trim(),
    anonKey: (env?.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  };
}

export function clearLegacyNonUuidStorage(): boolean {
  try {
    const raw = localStorage.getItem(ERP_STATE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as ErpState;
    if (hasLegacyNonUuidIds(parsed)) {
      localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
      const sessRaw = localStorage.getItem(AUTH_SESSION_KEY);
      if (sessRaw) {
        const sess = JSON.parse(sessRaw) as AuthSessionUser;
        if ((sess.tenant_id && !isValidUUID(sess.tenant_id)) || (sess.branch_id && !isValidUUID(sess.branch_id))) {
          localStorage.removeItem(AUTH_SESSION_KEY);
        }
      }
      return true;
    }
  } catch {
    localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
    return true;
  }
  return false;
}

export function loadErpState(): ErpState {
  try {
    const raw = localStorage.getItem(ERP_STATE_KEY);
    if (!raw) {
      localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
      return SEED_ERP_STATE;
    }
    const parsed = JSON.parse(raw) as ErpState;
    if (!parsed.tenants?.length || !parsed.workOrders || hasLegacyNonUuidIds(parsed)) {
      localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
      return SEED_ERP_STATE;
    }
    return {
      ...parsed,
      profiles: parsed.profiles ?? SEED_ERP_STATE.profiles,
      appUsers: parsed.appUsers?.length ? parsed.appUsers : SEED_ERP_STATE.appUsers,
      appointments: parsed.appointments ?? SEED_ERP_STATE.appointments,
    };
  } catch {
    localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
    return SEED_ERP_STATE;
  }
}

export function saveErpState(state: ErpState): void {
  try {
    localStorage.setItem(ERP_STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function resetErpState(): ErpState {
  try {
    localStorage.setItem(ERP_STATE_KEY, JSON.stringify(SEED_ERP_STATE));
  } catch {
    // Ignore
  }
  return SEED_ERP_STATE;
}

export function loadSupabaseConfig(): SupabaseConfig {
  const envCreds = getEnvSupabaseCredentials();
  try {
    const raw = localStorage.getItem(SUPABASE_CFG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SupabaseConfig;
      if (envCreds.url && envCreds.anonKey && !parsed.url) {
        return {
          url: envCreds.url,
          anonKey: envCreds.anonKey,
          connected: !parsed.demoMode,
          demoMode: Boolean(parsed.demoMode),
          source: 'env',
        };
      }
      return {
        ...parsed,
        source:
          envCreds.url && envCreds.anonKey && parsed.url === envCreds.url
            ? 'env'
            : parsed.url
            ? 'local'
            : 'none',
      };
    }
  } catch {
    // Fallback below
  }

  if (envCreds.url && envCreds.anonKey) {
    return {
      url: envCreds.url,
      anonKey: envCreds.anonKey,
      connected: true,
      demoMode: false,
      source: 'env',
    };
  }

  return {
    url: '',
    anonKey: '',
    connected: false,
    demoMode: true,
    source: 'none',
  };
}

export function saveSupabaseConfig(cfg: SupabaseConfig): void {
  try {
    localStorage.setItem(SUPABASE_CFG_KEY, JSON.stringify(cfg));
  } catch {
    // Ignore
  }
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
