import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AppUser,
  Appointment,
  AuthSessionUser,
  Branch,
  CatalogItem,
  Client,
  CustomerAsset,
  ErpState,
  LoanAsset,
  PhotoStage,
  PublicOrderTrackData,
  SupabaseConfig,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderLoan,
  WorkOrderPayment,
  WorkOrderPhoto,
} from '../types/erp';
import {
  buildAuthSessionUserFromRow,
  findMatchingAppUserRow,
  normalizeLoginUsername,
  parseRpcAuthPayload,
} from '../utils/authParsers';
import { generateNextFolio } from '../utils/erpLogic';
import {
  mapAppUserFromDb,
  mapAppUserToDb,
  mapAppUserUpdateWithoutPasswordToDb,
  mapAppointmentFromDb,
  mapAppointmentToDb,
  mapAssetFromDb,
  mapAssetToDb,
  mapBranchFromDb,
  mapBranchToDb,
  mapCatalogItemFromDb,
  mapCatalogItemToDb,
  mapClientFromDb,
  mapClientToDb,
  mapLoanAssetFromDb,
  mapLoanAssetToDb,
  mapOrderItemFromDb,
  mapOrderLoanFromDb,
  mapOrderPaymentFromDb,
  mapOrderPhotoFromDb,
  mapPublicRpcOrderToTrackData,
  mapTenantFromDb,
  mapTenantToDb,
  mapTenantUpdateToDb,
  mapWorkOrderFromDb,
  mapWorkOrderItemToDb,
  mapWorkOrderLoanToDb,
  mapWorkOrderPaymentToDb,
  mapWorkOrderPhotoToDb,
  mapWorkOrderToDb,
  stripOptionalBranchColumns,
  stripOptionalTenantColumns,
  stripOptionalWorkOrderColumns,
} from '../utils/supabaseMappers';
import { ensureUUID } from '../utils/uuid';

let cachedClientKey = '';
let cachedClient: SupabaseClient | null = null;
let rpcAuthUnavailableForUrl = '';

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function isMissingColumnError(
  err?: { code?: string | null; message?: string | null } | null
): boolean {
  if (!err) return false;
  if (err.code === 'PGRST204' || err.code === '42703') return true;
  const msg = (err.message ?? '').toLowerCase();
  return (
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find the') && msg.includes('column'))
  );
}

function isMissingRpcError(
  err?: { code?: string | null; message?: string | null } | null
): boolean {
  if (!err) return false;
  if (err.code === 'PGRST202') return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('does not exist');
}

function formatPgError(
  table: string,
  err: { message?: string; details?: string | null; hint?: string | null; code?: string | null }
): string {
  const parts = [
    `Error en tabla public.${table}: ${err.message ?? 'Bad Request'}`,
    err.code ? `[${err.code}]` : '',
    err.details ? `Detalle: ${err.details}` : '',
    err.hint ? `Sugerencia: ${err.hint}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function getSupabaseClient(url: string, anonKey: string): SupabaseClient | null {
  const cleanUrl = normalizeUrl(url);
  const cleanKey = anonKey.trim();
  if (!cleanUrl || !cleanKey) return null;
  const key = `${cleanUrl}::${cleanKey}`;
  if (cachedClient && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClientKey = key;
  cachedClient = createClient(cleanUrl, cleanKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export function isSupabaseLive(cfg: SupabaseConfig): boolean {
  return Boolean(cfg.connected && cfg.url.trim() && cfg.anonKey.trim());
}

export async function pullSupabaseErpState(
  url: string,
  anonKey: string,
  scope?: { tenantId?: string | null; branchId?: string | null }
): Promise<{ ok: boolean; data?: Partial<ErpState>; error?: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, error: 'Credenciales Supabase inválidas.' };

  const scopedTenantId = scope?.tenantId ? ensureUUID(scope.tenantId) : null;
  const scopedBranchId =
    scope?.branchId && scope.branchId !== 'ALL' ? ensureUUID(scope.branchId) : null;

  try {
    let tenantsQ = client.from('tenants').select('*');
    let branchesQ = client.from('branches').select('*');
    let appUsersQ = client
      .from('app_users')
      .select('id, tenant_id, branch_id, username, full_name, role, is_active, created_at');
    let clientsQ = client.from('clients').select('*');
    let assetsQ = client.from('customer_assets').select('*');
    let catalogQ = client.from('catalog_items').select('*');
    let loansQ = client.from('loan_assets').select('*');
    let ordersQ = client
      .from('work_orders')
      .select('*')
      .order('received_at', { ascending: false });
    let itemsQ = client.from('work_order_items').select('*');
    let photosQ = client.from('work_order_photos').select('*');
    let orderLoansQ = client.from('work_order_loans').select('*');
    let paymentsQ = client.from('work_order_payments').select('*');
    let appointmentsQ = client
      .from('appointments')
      .select('*')
      .order('scheduled_start', { ascending: true });

    if (scopedTenantId) {
      tenantsQ = tenantsQ.eq('id', scopedTenantId);
      branchesQ = branchesQ.eq('tenant_id', scopedTenantId);
      appUsersQ = appUsersQ.eq('tenant_id', scopedTenantId);
      clientsQ = clientsQ.eq('tenant_id', scopedTenantId);
      assetsQ = assetsQ.eq('tenant_id', scopedTenantId);
      catalogQ = catalogQ.eq('tenant_id', scopedTenantId);
      loansQ = loansQ.eq('tenant_id', scopedTenantId);
      ordersQ = ordersQ.eq('tenant_id', scopedTenantId);
      itemsQ = itemsQ.eq('tenant_id', scopedTenantId);
      photosQ = photosQ.eq('tenant_id', scopedTenantId);
      orderLoansQ = orderLoansQ.eq('tenant_id', scopedTenantId);
      paymentsQ = paymentsQ.eq('tenant_id', scopedTenantId);
      appointmentsQ = appointmentsQ.eq('tenant_id', scopedTenantId);

      if (scopedBranchId) {
        catalogQ = catalogQ.eq('branch_id', scopedBranchId);
        loansQ = loansQ.eq('branch_id', scopedBranchId);
        ordersQ = ordersQ.eq('branch_id', scopedBranchId);
        paymentsQ = paymentsQ.eq('branch_id', scopedBranchId);
        appointmentsQ = appointmentsQ.eq('branch_id', scopedBranchId);
      }
    }

    const [
      tenantsRes,
      branchesRes,
      appUsersRes,
      clientsRes,
      assetsRes,
      catalogRes,
      loansRes,
      ordersRes,
      itemsRes,
      photosRes,
      orderLoansRes,
      paymentsRes,
      appointmentsRes,
    ] = await Promise.all([
      tenantsQ,
      branchesQ,
      appUsersQ,
      clientsQ,
      assetsQ,
      catalogQ,
      loansQ,
      ordersQ,
      itemsQ,
      photosQ,
      orderLoansQ,
      paymentsQ,
      appointmentsQ,
    ]);

    if (tenantsRes.error || ordersRes.error) {
      return {
        ok: false,
        error:
          tenantsRes.error?.message ??
          ordersRes.error?.message ??
          'Error leyendo tablas principales desde Supabase.',
      };
    }

    const rawItems = (itemsRes.data ?? []) as Array<Record<string, unknown>>;
    const rawPhotos = (photosRes.data ?? []) as Array<Record<string, unknown>>;
    const rawOrderLoans = (orderLoansRes.data ?? []) as Array<Record<string, unknown>>;
    const rawPayments = (paymentsRes.data ?? []) as Array<Record<string, unknown>>;

    const itemsByOrder = new Map<string, WorkOrderItem[]>();
    for (const row of rawItems) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = itemsByOrder.get(woId) ?? [];
      list.push(mapOrderItemFromDb(row));
      itemsByOrder.set(woId, list);
    }

    const photosByOrder = new Map<string, WorkOrderPhoto[]>();
    for (const row of rawPhotos) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = photosByOrder.get(woId) ?? [];
      list.push(mapOrderPhotoFromDb(row));
      photosByOrder.set(woId, list);
    }

    const paymentsByOrder = new Map<string, WorkOrderPayment[]>();
    for (const row of rawPayments) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const list = paymentsByOrder.get(woId) ?? [];
      list.push(mapOrderPaymentFromDb(row));
      paymentsByOrder.set(woId, list);
    }

    const loanAssets: LoanAsset[] = (loansRes.data ?? []).map((l) =>
      mapLoanAssetFromDb(l as Record<string, unknown>)
    );
    const loanAssetLookupMap = new Map(
      loanAssets.map((la) => [la.id, { code: la.code, name: la.name }])
    );

    const loanByOrder = new Map<string, WorkOrderLoan>();
    for (const row of rawOrderLoans) {
      const woId = row.work_order_id ? String(row.work_order_id) : '';
      if (!woId) continue;
      const laId = row.loan_asset_id ? String(row.loan_asset_id) : '';
      const mapped = mapOrderLoanFromDb(row, loanAssetLookupMap.get(laId));
      const existing = loanByOrder.get(woId);
      if (!existing) {
        loanByOrder.set(woId, mapped);
      } else {
        const mappedActive = !mapped.returned_at;
        const existingActive = !existing.returned_at;
        if (mappedActive && !existingActive) {
          loanByOrder.set(woId, mapped);
        } else if (
          mappedActive === existingActive &&
          mapped.loaned_at >= existing.loaned_at
        ) {
          loanByOrder.set(woId, mapped);
        }
      }
    }

    const tenants: Tenant[] = (tenantsRes.data ?? []).map((t) =>
      mapTenantFromDb(t as Record<string, unknown>)
    );
    const branches: Branch[] = (branchesRes.data ?? []).map((b) =>
      mapBranchFromDb(b as Record<string, unknown>)
    );
    const appUsers: AppUser[] = (appUsersRes.data ?? []).map((u) =>
      mapAppUserFromDb(u as Record<string, unknown>)
    );
    const clients: Client[] = (clientsRes.data ?? []).map((c) =>
      mapClientFromDb(c as Record<string, unknown>)
    );
    const assets: CustomerAsset[] = (assetsRes.data ?? []).map((a) =>
      mapAssetFromDb(a as Record<string, unknown>)
    );
    const catalogItems: CatalogItem[] = (catalogRes.data ?? []).map((c) =>
      mapCatalogItemFromDb(c as Record<string, unknown>)
    );
    const workOrders: WorkOrder[] = (ordersRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const id = String(r.id);
      return mapWorkOrderFromDb(r, {
        items: itemsByOrder.get(id),
        photos: photosByOrder.get(id),
        payments: paymentsByOrder.get(id),
        loan: loanByOrder.get(id),
      });
    });
    const appointments: Appointment[] = (appointmentsRes.data ?? []).map((a) =>
      mapAppointmentFromDb(a as Record<string, unknown>)
    );

    return {
      ok: true,
      data: {
        tenants,
        branches,
        appUsers,
        clients,
        assets,
        catalogItems,
        loanAssets,
        workOrders,
        appointments,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red al sincronizar.',
    };
  }
}

// ---------- LIVE CRUD OPERATIONS ----------

export async function syncTenantToSupabase(
  cfg: SupabaseConfig,
  tenant: Tenant,
  options?: { isNew?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  if (options?.isNew) {
    const fullRow = mapTenantToDb(tenant);
    let res = await client.from('tenants').upsert(fullRow, { onConflict: 'id' });
    if (res.error && isMissingColumnError(res.error)) {
      res = await client
        .from('tenants')
        .upsert(stripOptionalTenantColumns(fullRow), { onConflict: 'id' });
    }
    if (res.error) return { ok: false, error: formatPgError('tenants', res.error) };
    return { ok: true };
  }

  const fullPatch = mapTenantUpdateToDb(tenant);
  let res = await client
    .from('tenants')
    .update(fullPatch)
    .eq('id', ensureUUID(tenant.id));
  if (res.error && isMissingColumnError(res.error)) {
    res = await client
      .from('tenants')
      .update(stripOptionalTenantColumns(fullPatch))
      .eq('id', ensureUUID(tenant.id));
  }
  if (res.error) return { ok: false, error: formatPgError('tenants', res.error) };
  return { ok: true };
}

export async function syncBranchToSupabase(
  cfg: SupabaseConfig,
  branch: Branch
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const fullRow = mapBranchToDb(branch);
  let res = await client.from('branches').upsert(fullRow, { onConflict: 'id' });
  if (res.error && isMissingColumnError(res.error)) {
    res = await client
      .from('branches')
      .upsert(stripOptionalBranchColumns(fullRow), { onConflict: 'id' });
  }
  if (res.error) return { ok: false, error: formatPgError('branches', res.error) };
  return { ok: true };
}

export async function deleteBranchFromSupabase(
  cfg: SupabaseConfig,
  branchId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('branches')
    .delete()
    .eq('id', ensureUUID(branchId));
  if (res.error) return { ok: false, error: formatPgError('branches', res.error) };
  return { ok: true };
}

export async function checkAppUsernameAvailable(
  cfg: SupabaseConfig,
  username: string
): Promise<{ available: boolean; error?: string }> {
  const clean = normalizeLoginUsername(username);
  if (!clean) return { available: false, error: 'Usuario vacío.' };
  if (!isSupabaseLive(cfg)) return { available: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { available: false, error: 'Cliente Supabase no inicializado.' };

  const rpcRes = await client.rpc('check_app_username_available', {
    p_username: clean,
  });

  if (!rpcRes.error && rpcRes.data != null) {
    if (typeof rpcRes.data === 'boolean') {
      return { available: rpcRes.data };
    }
    const obj = rpcRes.data as { available?: boolean };
    if (typeof obj?.available === 'boolean') {
      return { available: obj.available };
    }
  }

  if (rpcRes.error && !isMissingRpcError(rpcRes.error)) {
    return { available: false, error: rpcRes.error.message };
  }

  const escaped = clean.replace(/[%_\\]/g, '\\$&');
  const queryRes = await client
    .from('app_users')
    .select('id')
    .ilike('username', escaped)
    .limit(1);
  if (queryRes.error) {
    // Allow creation attempt if anon SELECT on app_users is restricted by RLS;
    // the subsequent INSERT/RPC will be authoritative and rollback on failure.
    return { available: true };
  }
  return { available: (queryRes.data ?? []).length === 0 };
}

export async function syncNewTenantBundleToSupabase(
  cfg: SupabaseConfig,
  bundle: {
    tenant: Tenant;
    branch: Branch;
    users: AppUser[];
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  for (const user of bundle.users) {
    const check = await checkAppUsernameAvailable(cfg, user.username);
    if (check.error) {
      return { ok: false, error: check.error };
    }
    if (!check.available) {
      return {
        ok: false,
        error: `El usuario "@${user.username}" ya existe en FIXICLOUD. Elige otro nombre de usuario.`,
      };
    }
  }

  const tenantRes = await syncTenantToSupabase(cfg, bundle.tenant, { isNew: true });
  if (!tenantRes.ok) return tenantRes;

  const branchRes = await syncBranchToSupabase(cfg, bundle.branch);
  if (!branchRes.ok) {
    await client.from('tenants').delete().eq('id', ensureUUID(bundle.tenant.id));
    return branchRes;
  }

  const createdUserIds: string[] = [];
  for (const user of bundle.users) {
    const uRes = await syncAppUserToSupabase(cfg, user, { isNew: true });
    if (!uRes.ok) {
      if (createdUserIds.length > 0) {
        await client.from('app_users').delete().in('id', createdUserIds);
      }
      await client.from('branches').delete().eq('id', ensureUUID(bundle.branch.id));
      await client.from('tenants').delete().eq('id', ensureUUID(bundle.tenant.id));
      return uRes;
    }
    createdUserIds.push(ensureUUID(user.id));
  }

  return { ok: true };
}

export async function syncAppUserToSupabase(
  cfg: SupabaseConfig,
  user: AppUser,
  options?: { isNew?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  const hasPassword = user.pin_or_password.trim().length > 0;
  const res =
    options?.isNew || hasPassword
      ? await client
          .from('app_users')
          .upsert(mapAppUserToDb(user), { onConflict: 'id' })
      : await client
          .from('app_users')
          .update(mapAppUserUpdateWithoutPasswordToDb(user))
          .eq('id', ensureUUID(user.id));

  if (res.error) {
    return { ok: false, error: formatPgError('app_users', res.error) };
  }
  return { ok: true };
}

export async function deleteAppUserFromSupabase(
  cfg: SupabaseConfig,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('app_users')
    .delete()
    .eq('id', ensureUUID(userId));
  if (res.error) {
    return { ok: false, error: formatPgError('app_users', res.error) };
  }
  return { ok: true };
}

export async function syncClientToSupabase(
  cfg: SupabaseConfig,
  c: Client
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client.from('clients').upsert(mapClientToDb(c), { onConflict: 'id' });
  if (res.error) return { ok: false, error: formatPgError('clients', res.error) };
  return { ok: true };
}

export async function syncAssetToSupabase(
  cfg: SupabaseConfig,
  a: CustomerAsset
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('customer_assets')
    .upsert(mapAssetToDb(a), { onConflict: 'id' });
  if (res.error) {
    return { ok: false, error: formatPgError('customer_assets', res.error) };
  }
  return { ok: true };
}

export async function syncCatalogItemToSupabase(
  cfg: SupabaseConfig,
  item: CatalogItem
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('catalog_items')
    .upsert(mapCatalogItemToDb(item), { onConflict: 'id' });
  if (res.error) {
    return { ok: false, error: formatPgError('catalog_items', res.error) };
  }
  return { ok: true };
}

export async function deleteCatalogItemFromSupabase(
  cfg: SupabaseConfig,
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('catalog_items')
    .delete()
    .eq('id', ensureUUID(itemId));
  if (res.error) {
    return { ok: false, error: formatPgError('catalog_items', res.error) };
  }
  return { ok: true };
}

export async function adjustCatalogStockAtomic(
  cfg: SupabaseConfig,
  params: {
    itemId: string;
    delta: number;
    fallbackCurrentQty: number;
    category: 'part' | 'service';
  }
): Promise<{
  ok: boolean;
  newStock?: number;
  insufficientStock?: boolean;
  error?: string;
}> {
  const { itemId, delta, fallbackCurrentQty, category } = params;
  if (category === 'service') {
    return { ok: true, newStock: fallbackCurrentQty };
  }
  const roundedDelta = Math.round(delta);
  if (!isSupabaseLive(cfg)) {
    const nextQty = fallbackCurrentQty + roundedDelta;
    if (roundedDelta < 0 && nextQty < 0) {
      return {
        ok: false,
        insufficientStock: true,
        error: `Stock insuficiente (disponible: ${fallbackCurrentQty}).`,
      };
    }
    return { ok: true, newStock: Math.max(0, nextQty) };
  }

  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const uuid = ensureUUID(itemId);

  const rpcRes = await client.rpc('adjust_catalog_stock_atomic', {
    p_item_id: uuid,
    p_delta: roundedDelta,
  });

  if (!rpcRes.error && rpcRes.data != null) {
    if (typeof rpcRes.data === 'number') {
      return { ok: true, newStock: rpcRes.data };
    }
    const row = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as {
      ok?: boolean;
      new_stock?: number;
      error?: string;
    } | null;
    if (row && typeof row === 'object') {
      if (row.ok === false) {
        return {
          ok: false,
          insufficientStock: true,
          error: row.error ?? 'Stock insuficiente en Supabase.',
        };
      }
      if (typeof row.new_stock === 'number') {
        return { ok: true, newStock: row.new_stock };
      }
    }
  }

  if (rpcRes.error && !isMissingRpcError(rpcRes.error)) {
    const msg = (rpcRes.error.message ?? '').toLowerCase();
    if (msg.includes('stock') || msg.includes('insufic')) {
      return { ok: false, insufficientStock: true, error: rpcRes.error.message };
    }
    return { ok: false, error: rpcRes.error.message };
  }

  // Optimistic / guarded fallback when RPC is not yet installed
  const currentRes = await client
    .from('catalog_items')
    .select('stock_quantity, type')
    .eq('id', uuid)
    .maybeSingle();

  if (currentRes.error || !currentRes.data) {
    return {
      ok: false,
      error:
        currentRes.error?.message ?? 'Ítem de catálogo no encontrado en Supabase.',
    };
  }

  const currentQty = Number(
    (currentRes.data as { stock_quantity?: number }).stock_quantity ?? fallbackCurrentQty
  );
  const nextQty = currentQty + roundedDelta;
  if (roundedDelta < 0 && nextQty < 0) {
    return {
      ok: false,
      insufficientStock: true,
      error: `Stock insuficiente en inventario (disponible actual: ${currentQty}).`,
    };
  }

  const minRequired = roundedDelta < 0 ? Math.abs(roundedDelta) : 0;
  const updRes = await client
    .from('catalog_items')
    .update({ stock_quantity: Math.max(0, nextQty) })
    .eq('id', uuid)
    .gte('stock_quantity', minRequired)
    .select('stock_quantity')
    .maybeSingle();

  if (updRes.error) {
    return { ok: false, error: formatPgError('catalog_items', updRes.error) };
  }
  if (!updRes.data) {
    return {
      ok: false,
      insufficientStock: true,
      error: 'El stock cambió concurrentemente y no alcanza para esta operación.',
    };
  }
  return {
    ok: true,
    newStock: Number((updRes.data as { stock_quantity?: number }).stock_quantity ?? nextQty),
  };
}

export async function syncLoanAssetToSupabase(
  cfg: SupabaseConfig,
  loan: LoanAsset
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('loan_assets')
    .upsert(mapLoanAssetToDb(loan), { onConflict: 'id' });
  if (res.error) {
    return { ok: false, error: formatPgError('loan_assets', res.error) };
  }
  return { ok: true };
}

export async function deleteLoanAssetFromSupabase(
  cfg: SupabaseConfig,
  loanAssetId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('loan_assets')
    .delete()
    .eq('id', ensureUUID(loanAssetId));
  if (res.error) {
    return { ok: false, error: formatPgError('loan_assets', res.error) };
  }
  return { ok: true };
}

export async function deleteClientFromSupabase(
  cfg: SupabaseConfig,
  clientId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('clients')
    .delete()
    .eq('id', ensureUUID(clientId));
  if (res.error) {
    return { ok: false, error: formatPgError('clients', res.error) };
  }
  return { ok: true };
}

export async function deleteCustomerAssetFromSupabase(
  cfg: SupabaseConfig,
  assetId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('customer_assets')
    .delete()
    .eq('id', ensureUUID(assetId));
  if (res.error) {
    return { ok: false, error: formatPgError('customer_assets', res.error) };
  }
  return { ok: true };
}

export async function allocateOrderFolioAtomic(
  cfg: SupabaseConfig,
  params: {
    tenantId: string;
    prefix: string;
    fallbackOrders: WorkOrder[];
    minFloor?: number;
  }
): Promise<string> {
  const fallback = generateNextFolio(
    params.prefix,
    params.fallbackOrders,
    params.tenantId,
    params.minFloor ?? 100
  );
  if (!isSupabaseLive(cfg)) return fallback;
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return fallback;

  try {
    const rpcRes = await client.rpc('allocate_next_order_folio', {
      p_tenant_id: ensureUUID(params.tenantId),
      p_prefix: params.prefix || 'OT',
    });
    if (!rpcRes.error && rpcRes.data != null) {
      if (typeof rpcRes.data === 'string' && rpcRes.data.trim()) {
        return rpcRes.data.trim();
      }
      const row = (Array.isArray(rpcRes.data) ? rpcRes.data[0] : rpcRes.data) as {
        folio?: string;
      } | null;
      if (row?.folio && typeof row.folio === 'string') {
        return row.folio;
      }
    }
  } catch {
    // Fallback cleanly to local computation
  }
  return fallback;
}

export async function syncWorkOrderToSupabase(
  cfg: SupabaseConfig,
  order: WorkOrder,
  taxRate = 19,
  catalogItems?: CatalogItem[],
  options?: {
    syncItems?: boolean;
    syncPayments?: boolean;
    syncPhotos?: boolean;
    syncLoan?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  const woRow = mapWorkOrderToDb(order, taxRate);
  let woRes = await client
    .from('work_orders')
    .upsert(woRow, { onConflict: 'id' });
  if (woRes.error && isMissingColumnError(woRes.error)) {
    woRes = await client
      .from('work_orders')
      .upsert(stripOptionalWorkOrderColumns(woRow), { onConflict: 'id' });
  }
  if (woRes.error) {
    return { ok: false, error: formatPgError('work_orders', woRes.error) };
  }

  const syncItems = options?.syncItems ?? true;
  const syncPayments = options?.syncPayments ?? true;
  const syncPhotos = options?.syncPhotos ?? true;
  const syncLoan = options?.syncLoan ?? true;

  if (syncItems && order.items.length > 0) {
    const catalogTypeMap = new Map(
      (catalogItems ?? []).map((cat) => [
        ensureUUID(cat.id),
        cat.category === 'service' ? ('service' as const) : ('part' as const),
      ])
    );
    const itemsRes = await client.from('work_order_items').upsert(
      order.items.map((it) =>
        mapWorkOrderItemToDb(it, {
          tenantId: order.tenant_id,
          workOrderId: order.id,
          catalogItemType: it.catalog_item_id
            ? catalogTypeMap.get(ensureUUID(it.catalog_item_id)) ??
              (it.sku?.startsWith('SRV-') ? 'service' : undefined)
            : undefined,
        })
      ),
      { onConflict: 'id' }
    );
    if (itemsRes.error) {
      return { ok: false, error: formatPgError('work_order_items', itemsRes.error) };
    }
  }
  if (syncPayments && order.payments.length > 0) {
    const payRes = await client.from('work_order_payments').upsert(
      order.payments.map((p) =>
        mapWorkOrderPaymentToDb(p, {
          tenantId: order.tenant_id,
          branchId: order.branch_id,
          workOrderId: order.id,
        })
      ),
      { onConflict: 'id' }
    );
    if (payRes.error) {
      return { ok: false, error: formatPgError('work_order_payments', payRes.error) };
    }
  }
  if (syncPhotos && order.photos.length > 0) {
    const photoRes = await client.from('work_order_photos').upsert(
      order.photos.map((ph) =>
        mapWorkOrderPhotoToDb(ph, {
          tenantId: order.tenant_id,
          workOrderId: order.id,
        })
      ),
      { onConflict: 'id' }
    );
    if (photoRes.error) {
      return { ok: false, error: formatPgError('work_order_photos', photoRes.error) };
    }
  }
  if (syncLoan && order.loan) {
    const loanRes = await client.from('work_order_loans').upsert(
      mapWorkOrderLoanToDb(order.loan, {
        tenantId: order.tenant_id,
        workOrderId: order.id,
      }),
      { onConflict: 'id' }
    );
    if (loanRes.error) {
      return { ok: false, error: formatPgError('work_order_loans', loanRes.error) };
    }
  }
  return { ok: true };
}

export async function deleteWorkOrderFromSupabase(
  cfg: SupabaseConfig,
  orderId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  const uuid = ensureUUID(orderId);
  const childTables = [
    'work_order_items',
    'work_order_payments',
    'work_order_photos',
    'work_order_loans',
  ] as const;

  for (const tbl of childTables) {
    const cRes = await client.from(tbl).delete().eq('work_order_id', uuid);
    if (cRes.error) {
      return { ok: false, error: formatPgError(tbl, cRes.error) };
    }
  }

  const woRes = await client.from('work_orders').delete().eq('id', uuid);
  if (woRes.error) {
    return { ok: false, error: formatPgError('work_orders', woRes.error) };
  }
  return { ok: true };
}

export async function deleteOrderItemFromSupabase(
  cfg: SupabaseConfig,
  itemId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('work_order_items')
    .delete()
    .eq('id', ensureUUID(itemId));
  if (res.error) {
    return { ok: false, error: formatPgError('work_order_items', res.error) };
  }
  return { ok: true };
}

export async function deleteOrderPhotoFromSupabase(
  cfg: SupabaseConfig,
  photoId: string,
  photoUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  const uuid = ensureUUID(photoId);
  let storagePath = '';
  const marker = '/storage/v1/object/public/order-photos/';
  if (photoUrl) {
    const idx = photoUrl.indexOf(marker);
    if (idx !== -1) {
      storagePath = decodeURIComponent(photoUrl.slice(idx + marker.length).split('?')[0].trim());
    }
  }
  if (!storagePath) {
    const existing = await client
      .from('work_order_photos')
      .select('storage_path')
      .eq('id', uuid)
      .maybeSingle();
    const rawPath = (existing.data as { storage_path?: string } | null)?.storage_path;
    if (rawPath && rawPath !== 'demo' && rawPath !== 'external') {
      storagePath = rawPath;
    }
  }
  if (storagePath) {
    await client.storage.from('order-photos').remove([storagePath]);
  }

  const res = await client.from('work_order_photos').delete().eq('id', uuid);
  if (res.error) {
    return { ok: false, error: formatPgError('work_order_photos', res.error) };
  }
  return { ok: true };
}

export async function deleteOrderPaymentFromSupabase(
  cfg: SupabaseConfig,
  paymentId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('work_order_payments')
    .delete()
    .eq('id', ensureUUID(paymentId));
  if (res.error) {
    return { ok: false, error: formatPgError('work_order_payments', res.error) };
  }
  return { ok: true };
}

export async function syncAppointmentToSupabase(
  cfg: SupabaseConfig,
  apt: Appointment
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('appointments')
    .upsert(mapAppointmentToDb(apt), { onConflict: 'id' });
  if (res.error) {
    return { ok: false, error: formatPgError('appointments', res.error) };
  }
  return { ok: true };
}

// ---------- SUPABASE STORAGE (order-photos) ----------

export async function uploadOrderPhotoToStorage(
  cfg: SupabaseConfig,
  params: {
    tenantId: string;
    workOrderId: string;
    blob: Blob;
    stage: PhotoStage;
    caption: string;
  }
): Promise<{ ok: boolean; publicUrl?: string; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: false, error: 'Supabase no conectado' };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente inválido' };

  const path = `${ensureUUID(params.tenantId)}/${ensureUUID(params.workOrderId)}/${Date.now()}.webp`;
  const uploadRes = await client.storage.from('order-photos').upload(path, params.blob, {
    contentType: 'image/webp',
    upsert: true,
  });

  if (uploadRes.error) {
    return { ok: false, error: uploadRes.error.message };
  }

  const { data } = client.storage.from('order-photos').getPublicUrl(path);
  return { ok: true, publicUrl: data.publicUrl };
}

// ---------- DIRECT LOGIN VIA public.app_users ----------

export async function loginWithAppUsers(
  cfg: SupabaseConfig,
  username: string,
  password: string
): Promise<{ ok: boolean; user?: AuthSessionUser; error?: string }> {
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) {
    return {
      ok: false,
      error:
        'No hay conexión activa a Supabase (faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).',
    };
  }

  const cleanUser = normalizeLoginUsername(username);
  const cleanPass = password.trim();
  if (!cleanUser || !cleanPass) {
    return { ok: false, error: 'Ingresa tu usuario y contraseña o PIN.' };
  }

  const normalizedCfgUrl = normalizeUrl(cfg.url);
  if (rpcAuthUnavailableForUrl !== normalizedCfgUrl) {
    const rpcRes = await client.rpc('authenticate_app_user', {
      p_username: cleanUser,
      p_password: cleanPass,
    });

    if (!rpcRes.error) {
      if (rpcRes.data != null) {
        const parsedUser = parseRpcAuthPayload(rpcRes.data, cleanUser);
        if (parsedUser) {
          return { ok: true, user: parsedUser };
        }
      }
      return {
        ok: false,
        error: 'Usuario o contraseña/PIN incorrectos, o cuenta inactiva.',
      };
    }

    const msg = (rpcRes.error.message ?? '').toLowerCase();
    const isMissingRpc =
      rpcRes.error.code === 'PGRST202' ||
      msg.includes('could not find the function');

    if (!isMissingRpc) {
      return {
        ok: false,
        error: `Error autenticando en Supabase (${rpcRes.error.message}).`,
      };
    }

    rpcAuthUnavailableForUrl = normalizedCfgUrl;
  }

  const escaped = cleanUser.replace(/[%_\\]/g, '\\$&');
  let queryRes = await client
    .from('app_users')
    .select(
      'id, tenant_id, branch_id, username, full_name, role, is_active, tenants(*), branches(*)'
    )
    .ilike('username', escaped)
    .eq('pin_or_password', cleanPass)
    .neq('is_active', false)
    .limit(5);

  if (queryRes.error) {
    const plainRes = await client
      .from('app_users')
      .select('id, tenant_id, branch_id, username, full_name, role, is_active')
      .ilike('username', escaped)
      .eq('pin_or_password', cleanPass)
      .neq('is_active', false)
      .limit(5);
    queryRes = plainRes as typeof queryRes;
  }

  if (queryRes.error) {
    return {
      ok: false,
      error: `Error autenticando en Supabase (${queryRes.error.message}).`,
    };
  }

  const candidates = (queryRes.data ?? []) as Array<Record<string, unknown>>;
  const matchedRow = findMatchingAppUserRow(candidates, cleanUser);

  if (!matchedRow) {
    return {
      ok: false,
      error: 'Usuario o contraseña/PIN incorrectos, o cuenta inactiva.',
    };
  }

  const authUser = buildAuthSessionUserFromRow(matchedRow, cleanUser);
  if (!authUser) {
    return {
      ok: false,
      error: 'La cuenta se encuentra inactiva o incompleta.',
    };
  }

  return { ok: true, user: authUser };
}

export async function revalidateAppUserSession(
  cfg: SupabaseConfig,
  session: AuthSessionUser
): Promise<{
  ok: boolean;
  inactive?: boolean;
  user?: AuthSessionUser;
  error?: string;
}> {
  if (!isSupabaseLive(cfg)) return { ok: true, user: session };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Sin cliente Supabase.' };

  const userUuid = ensureUUID(session.id);

  try {
    const rpcRes = await client.rpc('revalidate_app_user_session', {
      p_user_id: userUuid,
    });

    if (!rpcRes.error) {
      if (rpcRes.data == null) {
        return {
          ok: false,
          inactive: true,
          error:
            'Tu sesión fue cerrada porque la cuenta fue desactivada o eliminada.',
        };
      }
      const parsed = parseRpcAuthPayload(rpcRes.data, session.username);
      if (!parsed || !parsed.is_active) {
        return {
          ok: false,
          inactive: true,
          error:
            'Tu sesión fue cerrada porque la cuenta fue desactivada o eliminada.',
        };
      }
      return { ok: true, user: parsed };
    }

    if (!isMissingRpcError(rpcRes.error)) {
      return { ok: false, error: rpcRes.error.message };
    }

    let queryRes = await client
      .from('app_users')
      .select(
        'id, tenant_id, branch_id, username, full_name, role, is_active, tenants(*), branches(*)'
      )
      .eq('id', userUuid)
      .maybeSingle();

    if (queryRes.error) {
      const plainRes = await client
        .from('app_users')
        .select('id, tenant_id, branch_id, username, full_name, role, is_active')
        .eq('id', userUuid)
        .maybeSingle();
      queryRes = plainRes as typeof queryRes;
    }

    if (queryRes.error) {
      return { ok: false, error: queryRes.error.message };
    }

    if (!queryRes.data) {
      return {
        ok: false,
        inactive: true,
        error:
          'Tu sesión fue cerrada porque el usuario ya no existe en FIXICLOUD.',
      };
    }

    const row = queryRes.data as Record<string, unknown>;
    if (row.is_active === false) {
      return {
        ok: false,
        inactive: true,
        error:
          'Tu sesión fue cerrada porque tu cuenta fue desactivada por un administrador.',
      };
    }

    const built = buildAuthSessionUserFromRow(row, session.username);
    if (!built) {
      return {
        ok: false,
        inactive: true,
        error:
          'Tu sesión fue cerrada porque la cuenta ya no se encuentra activa.',
      };
    }
    return { ok: true, user: built };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error validando sesión.',
    };
  }
}

// ---------- RPC get_public_order_status ----------

export async function fetchPublicOrderStatusViaRpc(
  cfg: SupabaseConfig,
  codeOrFolio: string
): Promise<{ ok: boolean; data?: PublicOrderTrackData; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: false, error: 'Offline' };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Sin cliente Supabase' };

  try {
    const res = await client.rpc('get_public_order_status', {
      p_code: codeOrFolio.trim(),
    });
    if (res.error || !res.data) {
      return { ok: false, error: res.error?.message ?? 'No encontrado' };
    }

    const mapped = mapPublicRpcOrderToTrackData(res.data);
    if (!mapped) {
      return { ok: false, error: 'Orden no encontrada en RPC' };
    }

    return { ok: true, data: mapped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error RPC' };
  }
}

export async function upsertMigratedDataToSupabase(
  url: string,
  anonKey: string,
  payload: {
    clients: Client[];
    assets: CustomerAsset[];
    workOrders: WorkOrder[];
    catalogItems?: CatalogItem[];
    ivaRate?: number;
  }
): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, error: 'Credenciales Supabase inválidas.' };

  try {
    if (payload.clients.length > 0) {
      const rows = payload.clients.map((c) => mapClientToDb(c));
      const res = await client.from('clients').upsert(rows, { onConflict: 'id' });
      if (res.error) return { ok: false, error: formatPgError('clients', res.error) };
    }
    if (payload.assets.length > 0) {
      const rows = payload.assets.map((a) => mapAssetToDb(a));
      const res = await client
        .from('customer_assets')
        .upsert(rows, { onConflict: 'id' });
      if (res.error) {
        return { ok: false, error: formatPgError('customer_assets', res.error) };
      }
    }
    if (payload.workOrders.length > 0) {
      const ivaRate = payload.ivaRate ?? 19;
      const rows = payload.workOrders.map((wo) => mapWorkOrderToDb(wo, ivaRate));
      let res = await client.from('work_orders').upsert(rows, { onConflict: 'id' });
      if (res.error && isMissingColumnError(res.error)) {
        res = await client
          .from('work_orders')
          .upsert(rows.map((r) => stripOptionalWorkOrderColumns(r)), {
            onConflict: 'id',
          });
      }
      if (res.error) {
        return { ok: false, error: formatPgError('work_orders', res.error) };
      }
      const catalogTypeMap = new Map(
        (payload.catalogItems ?? []).map((cat) => [
          ensureUUID(cat.id),
          cat.category === 'service' ? ('service' as const) : ('part' as const),
        ])
      );
      const itemRows = payload.workOrders.flatMap((o) =>
        o.items.map((it) =>
          mapWorkOrderItemToDb(it, {
            tenantId: o.tenant_id,
            workOrderId: o.id,
            catalogItemType: it.catalog_item_id
              ? catalogTypeMap.get(ensureUUID(it.catalog_item_id)) ??
                (it.sku?.startsWith('SRV-') ? 'service' : undefined)
              : undefined,
          })
        )
      );
      if (itemRows.length > 0) {
        const itRes = await client
          .from('work_order_items')
          .upsert(itemRows, { onConflict: 'id' });
        if (itRes.error) {
          return { ok: false, error: formatPgError('work_order_items', itRes.error) };
        }
      }
      const payRows = payload.workOrders.flatMap((o) =>
        o.payments.map((p) =>
          mapWorkOrderPaymentToDb(p, {
            tenantId: o.tenant_id,
            branchId: o.branch_id,
            workOrderId: o.id,
          })
        )
      );
      if (payRows.length > 0) {
        const payRes = await client
          .from('work_order_payments')
          .upsert(payRows, { onConflict: 'id' });
        if (payRes.error) {
          return {
            ok: false,
            error: formatPgError('work_order_payments', payRes.error),
          };
        }
      }
      const photoRows = payload.workOrders.flatMap((o) =>
        o.photos.map((ph) =>
          mapWorkOrderPhotoToDb(ph, {
            tenantId: o.tenant_id,
            workOrderId: o.id,
          })
        )
      );
      if (photoRows.length > 0) {
        const phRes = await client
          .from('work_order_photos')
          .upsert(photoRows, { onConflict: 'id' });
        if (phRes.error) {
          return {
            ok: false,
            error: formatPgError('work_order_photos', phRes.error),
          };
        }
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error de red' };
  }
}
