import type {
  AppUser,
  AuthSessionUser,
  Branch,
  SupabaseConfig,
  Tenant,
} from '../types/erp';
import { isSupabaseLive, loginWithAppUsers } from '../services/supabaseService';

export async function authenticateUser(params: {
  supabaseConfig: SupabaseConfig;
  appUsers?: AppUser[];
  tenants?: Tenant[];
  branches?: Branch[];
  username: string;
  password: string;
}): Promise<{ ok: true; user: AuthSessionUser } | { ok: false; error: string }> {
  const cleanUser = params.username.trim().replace(/^@+/, '');
  const cleanPass = params.password.trim();
  if (!cleanUser || !cleanPass) {
    return { ok: false, error: 'Ingresa tu usuario y contraseña o PIN.' };
  }

  if (!isSupabaseLive(params.supabaseConfig)) {
    return {
      ok: false,
      error:
        params.supabaseConfig.lastError ??
        'Falta la configuración de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) para validar tu cuenta.',
    };
  }

  const res = await loginWithAppUsers(params.supabaseConfig, cleanUser, cleanPass);
  if (res.ok && res.user) {
    return { ok: true, user: res.user };
  }

  return {
    ok: false,
    error: res.error ?? 'Usuario o contraseña/PIN incorrectos, o cuenta inactiva.',
  };
}
