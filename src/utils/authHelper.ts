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
  appUsers: AppUser[];
  tenants: Tenant[];
  branches: Branch[];
  username: string;
  password: string;
}): Promise<{ ok: true; user: AuthSessionUser } | { ok: false; error: string }> {
  const cleanUser = params.username.trim().replace(/^@+/, '');
  const cleanPass = params.password.trim();
  if (!cleanUser || !cleanPass) {
    return { ok: false, error: 'Ingresa tu usuario y contraseña o PIN.' };
  }

  if (isSupabaseLive(params.supabaseConfig)) {
    const res = await loginWithAppUsers(params.supabaseConfig, cleanUser, cleanPass);
    if (res.ok && res.user) {
      return { ok: true, user: res.user };
    }
    return {
      ok: false,
      error: res.error ?? 'Credenciales inválidas o cuenta inactiva.',
    };
  }

  const matched = params.appUsers.find(
    (u) =>
      u.is_active &&
      u.username.trim().toLowerCase() === cleanUser.toLowerCase() &&
      u.pin_or_password.trim() === cleanPass
  );

  if (!matched) {
    if (params.supabaseConfig.lastError) {
      return {
        ok: false,
        error: params.supabaseConfig.lastError,
      };
    }
    if (params.supabaseConfig.source === 'none') {
      return {
        ok: false,
        error:
          'Este entorno no tiene configuradas las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para validar cuentas de Supabase.',
      };
    }
    return {
      ok: false,
      error:
        'Usuario o contraseña/PIN incorrectos (verifica en Ajustes -> Usuarios de Acceso).',
    };
  }

  const tenant = matched.tenant_id
    ? params.tenants.find((t) => t.id === matched.tenant_id) ?? null
    : null;
  const branch = matched.branch_id
    ? params.branches.find((b) => b.id === matched.branch_id) ?? null
    : null;

  return {
    ok: true,
    user: {
      id: matched.id,
      username: matched.username,
      full_name: matched.full_name,
      tenant_id: matched.tenant_id,
      branch_id: matched.branch_id,
      role: matched.role,
      is_active: matched.is_active,
      mode: 'demo',
      tenant,
      branch,
    },
  };
}
