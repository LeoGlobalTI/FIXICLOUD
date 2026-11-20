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
  SupabaseConfig,
  Tenant,
  WorkOrder,
  WorkOrderItem,
  WorkOrderLoan,
  WorkOrderPayment,
  WorkOrderPhoto,
} from '../types/erp';
import { SEED_ERP_STATE } from '../data/seedData';
import {
  buildAuthSessionUserFromRow,
  findMatchingAppUserRow,
  normalizeLoginUsername,
  parseRpcAuthPayload,
} from '../utils/authParsers';
import { filterErpStateForTenants } from '../utils/erpLogic';
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
  mapBranchesToDbSafe,
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
  mapTenantFromDb,
  mapTenantToDb,
  mapWorkOrderFromDb,
  mapWorkOrderItemToDb,
  mapWorkOrderLoanToDb,
  mapWorkOrderPaymentToDb,
  mapWorkOrderPhotoToDb,
  mapWorkOrderToDb,
  stripOptionalBranchColumns,
} from '../utils/supabaseMappers';
import { ensureUUID } from '../utils/uuid';

let cachedClientKey = '';
let cachedClient: SupabaseClient | null = null;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
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

function isMissingOptionalBranchColError(err?: {
  message?: string;
  code?: string | null;
} | null): boolean {
  if (!err) return false;
  const msg = (err.message ?? '').toLowerCase();
  return (
    err.code === 'PGRST204' ||
    msg.includes('business_hours') ||
    (msg.includes('city') && msg.includes('branches'))
  );
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
  return Boolean(cfg.connected && !cfg.demoMode && cfg.url.trim() && cfg.anonKey.trim());
}

export async function pullSupabaseErpState(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; data?: Partial<ErpState>; error?: string }> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) return { ok: false, error: 'Credenciales Supabase inválidas.' };

  try {
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
      client.from('tenants').select('*'),
      client.from('branches').select('*'),
      client
        .from('app_users')
        .select('id, tenant_id, branch_id, username, full_name, role, is_active, created_at'),
      client.from('clients').select('*'),
      client.from('customer_assets').select('*'),
      client.from('catalog_items').select('*'),
      client.from('loan_assets').select('*'),
      client.from('work_orders').select('*').order('received_at', { ascending: false }),
      client.from('work_order_items').select('*'),
      client.from('work_order_photos').select('*'),
      client.from('work_order_loans').select('*'),
      client.from('work_order_payments').select('*'),
      client.from('appointments').select('*').order('scheduled_start', { ascending: true }),
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
      loanByOrder.set(woId, mapOrderLoanFromDb(row, loanAssetLookupMap.get(laId)));
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

async function upsertErpSubsetToSupabase(
  client: SupabaseClient,
  s: ErpState
): Promise<{ ok: boolean; failedTable?: string; message: string }> {
  const tenantTaxMap = new Map(s.tenants.map((t) => [ensureUUID(t.id), t.iva_rate]));

  // Step 1: public.tenants
  if (s.tenants.length > 0) {
    const tenantRows = s.tenants.map((t) => {
      const tenantOrders = s.workOrders.filter((o) => o.tenant_id === t.id);
      const maxNum = tenantOrders.reduce((acc, o) => {
        const m = o.folio.match(/(\d+)$/);
        return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
      }, 100);
      return mapTenantToDb(t, maxNum);
    });
    const tenantsRes = await client
      .from('tenants')
      .upsert(tenantRows, { onConflict: 'id' });
    if (tenantsRes.error) {
      return {
        ok: false,
        failedTable: 'tenants',
        message: formatPgError('tenants', tenantsRes.error),
      };
    }
  }

  // Step 2: public.branches (strictly max 1 is_headquarters = true per tenant)
  if (s.branches.length > 0) {
    const branchRows = mapBranchesToDbSafe(s.branches);
    let branchesRes = await client
      .from('branches')
      .upsert(branchRows, { onConflict: 'id' });
    if (branchesRes.error && isMissingOptionalBranchColError(branchesRes.error)) {
      branchesRes = await client
        .from('branches')
        .upsert(branchRows.map(stripOptionalBranchColumns), { onConflict: 'id' });
    }
    if (branchesRes.error) {
      return {
        ok: false,
        failedTable: 'branches',
        message: formatPgError('branches', branchesRes.error),
      };
    }
  }

  // Step 2b: public.app_users (custom login accounts without Supabase Auth)
  if (s.appUsers.length > 0) {
    const appUserRows = s.appUsers.map((u) => mapAppUserToDb(u));
    const appUsersRes = await client
      .from('app_users')
      .upsert(appUserRows, { onConflict: 'id' });
    if (appUsersRes.error) {
      return {
        ok: false,
        failedTable: 'app_users',
        message: formatPgError('app_users', appUsersRes.error),
      };
    }
  }

  // Step 3: public.clients, public.catalog_items, public.loan_assets
  const hqByTenant = new Map<string, string>();
  for (const b of s.branches) {
    if (b.is_hq && !hqByTenant.has(b.tenant_id)) {
      hqByTenant.set(b.tenant_id, b.id);
    }
  }
  if (s.clients.length > 0) {
    const clientRows = s.clients.map((c) =>
      mapClientToDb(c, { branchId: hqByTenant.get(c.tenant_id) ?? null })
    );
    const clientsRes = await client
      .from('clients')
      .upsert(clientRows, { onConflict: 'id' });
    if (clientsRes.error) {
      return {
        ok: false,
        failedTable: 'clients',
        message: formatPgError('clients', clientsRes.error),
      };
    }
  }

  if (s.catalogItems.length > 0) {
    const catalogRows = s.catalogItems.map((item) => mapCatalogItemToDb(item));
    const catalogRes = await client
      .from('catalog_items')
      .upsert(catalogRows, { onConflict: 'id' });
    if (catalogRes.error) {
      return {
        ok: false,
        failedTable: 'catalog_items',
        message: formatPgError('catalog_items', catalogRes.error),
      };
    }
  }

  if (s.loanAssets.length > 0) {
    const loanAssetRows = s.loanAssets.map((loan) => mapLoanAssetToDb(loan));
    const loanAssetsRes = await client
      .from('loan_assets')
      .upsert(loanAssetRows, { onConflict: 'id' });
    if (loanAssetsRes.error) {
      return {
        ok: false,
        failedTable: 'loan_assets',
        message: formatPgError('loan_assets', loanAssetsRes.error),
      };
    }
  }

  // Step 4: public.customer_assets (depends on clients)
  if (s.assets.length > 0) {
    const assetRows = s.assets.map((asset) => mapAssetToDb(asset));
    const assetsRes = await client
      .from('customer_assets')
      .upsert(assetRows, { onConflict: 'id' });
    if (assetsRes.error) {
      return {
        ok: false,
        failedTable: 'customer_assets',
        message: formatPgError('customer_assets', assetsRes.error),
      };
    }
  }

  // Step 5: public.work_orders (depends on clients & customer_assets; NO balance_due)
  if (s.workOrders.length > 0) {
    const orderRows = s.workOrders.map((o) =>
      mapWorkOrderToDb(o, tenantTaxMap.get(ensureUUID(o.tenant_id)) ?? 19)
    );
    const woRes = await client
      .from('work_orders')
      .upsert(orderRows, { onConflict: 'id' });
    if (woRes.error) {
      return {
        ok: false,
        failedTable: 'work_orders',
        message: formatPgError('work_orders', woRes.error),
      };
    }
  }

  // Step 6: Child tables & appointments (depends on work_orders)
  const catalogTypeMap = new Map(
    s.catalogItems.map((cat) => [
      ensureUUID(cat.id),
      cat.category === 'service' ? ('service' as const) : ('part' as const),
    ])
  );

  const itemRows = s.workOrders.flatMap((o) =>
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
    const itemsRes = await client
      .from('work_order_items')
      .upsert(itemRows, { onConflict: 'id' });
    if (itemsRes.error) {
      return {
        ok: false,
        failedTable: 'work_order_items',
        message: formatPgError('work_order_items', itemsRes.error),
      };
    }
  }

  const paymentRows = s.workOrders.flatMap((o) =>
    o.payments.map((p) =>
      mapWorkOrderPaymentToDb(p, {
        tenantId: o.tenant_id,
        branchId: o.branch_id,
        workOrderId: o.id,
      })
    )
  );
  if (paymentRows.length > 0) {
    const payRes = await client
      .from('work_order_payments')
      .upsert(paymentRows, { onConflict: 'id' });
    if (payRes.error) {
      return {
        ok: false,
        failedTable: 'work_order_payments',
        message: formatPgError('work_order_payments', payRes.error),
      };
    }
  }

  const photoRows = s.workOrders.flatMap((o) =>
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
        failedTable: 'work_order_photos',
        message: formatPgError('work_order_photos', phRes.error),
      };
    }
  }

  const loanRows = s.workOrders
    .filter((o) => Boolean(o.loan))
    .map((o) =>
      mapWorkOrderLoanToDb(o.loan!, {
        tenantId: o.tenant_id,
        workOrderId: o.id,
      })
    );
  if (loanRows.length > 0) {
    const wlRes = await client
      .from('work_order_loans')
      .upsert(loanRows, { onConflict: 'id' });
    if (wlRes.error) {
      return {
        ok: false,
        failedTable: 'work_order_loans',
        message: formatPgError('work_order_loans', wlRes.error),
      };
    }
  }

  const appointmentRows = s.appointments.map((apt) => mapAppointmentToDb(apt));
  if (appointmentRows.length > 0) {
    const aptRes = await client
      .from('appointments')
      .upsert(appointmentRows, { onConflict: 'id' });
    if (aptRes.error) {
      return {
        ok: false,
        failedTable: 'appointments',
        message: formatPgError('appointments', aptRes.error),
      };
    }
  }

  return {
    ok: true,
    message: `Datos cargados en Supabase (${s.tenants.length} empresa(s), ${s.branches.length} sucursales, ${s.clients.length} clientes, ${s.assets.length} equipos, ${s.loanAssets.length} unidades préstamo/flota, ${s.workOrders.length} OTs y ${s.appointments.length} citas).`,
  };
}

export async function seedMissingSeedTenantsToSupabase(
  url: string,
  anonKey: string,
  existingTenantIds: string[],
  options?: { skipIds?: string[] }
): Promise<{
  ok: boolean;
  addedTenantIds: string[];
  failedTable?: string;
  message: string;
}> {
  const client = getSupabaseClient(url, anonKey);
  if (!client) {
    return { ok: false, addedTenantIds: [], message: 'Credenciales inválidas.' };
  }

  const existingSet = new Set(existingTenantIds);
  const skipSet = new Set(options?.skipIds ?? []);
  const missingTenants = SEED_ERP_STATE.tenants.filter(
    (t) => !existingSet.has(t.id) && !skipSet.has(t.id)
  );

  if (missingTenants.length === 0) {
    return {
      ok: true,
      addedTenantIds: [],
      message: 'Todas las empresas semilla ya están cargadas en Supabase.',
    };
  }

  const missingIds = missingTenants.map((t) => t.id);
  const subset = filterErpStateForTenants(SEED_ERP_STATE, new Set(missingIds), {
    includeGlobalAppUsers: false,
  });

  try {
    const res = await upsertErpSubsetToSupabase(client, subset);
    return {
      ...res,
      addedTenantIds: res.ok ? missingIds : [],
    };
  } catch (err) {
    return {
      ok: false,
      addedTenantIds: [],
      message:
        err instanceof Error
          ? err.message
          : 'Error cargando empresas faltantes en Supabase.',
    };
  }
}

// ---------- LIVE CRUD OPERATIONS ----------

export async function syncTenantToSupabase(
  cfg: SupabaseConfig,
  tenant: Tenant
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };
  const res = await client
    .from('tenants')
    .upsert(mapTenantToDb(tenant), { onConflict: 'id' });
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
  const row = mapBranchToDb(branch);
  let res = await client.from('branches').upsert(row, { onConflict: 'id' });
  if (res.error && isMissingOptionalBranchColError(res.error)) {
    res = await client
      .from('branches')
      .upsert(stripOptionalBranchColumns(row), { onConflict: 'id' });
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

export async function syncNewTenantBundleToSupabase(
  cfg: SupabaseConfig,
  bundle: {
    tenant: Tenant;
    branch: Branch;
    users: AppUser[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const tenantRes = await syncTenantToSupabase(cfg, bundle.tenant);
  if (!tenantRes.ok) return tenantRes;

  const branchRes = await syncBranchToSupabase(cfg, bundle.branch);
  if (!branchRes.ok) return branchRes;

  const userResults = await Promise.all(
    bundle.users.map((user) => syncAppUserToSupabase(cfg, user, { isNew: true }))
  );
  const failedUser = userResults.find((r) => !r.ok);
  if (failedUser) return failedUser;

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

export async function syncWorkOrderToSupabase(
  cfg: SupabaseConfig,
  order: WorkOrder,
  taxRate = 19,
  catalogItems?: CatalogItem[]
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseLive(cfg)) return { ok: true };
  const client = getSupabaseClient(cfg.url, cfg.anonKey);
  if (!client) return { ok: false, error: 'Cliente Supabase no inicializado.' };

  const woRes = await client
    .from('work_orders')
    .upsert(mapWorkOrderToDb(order, taxRate), { onConflict: 'id' });
  if (woRes.error) {
    return { ok: false, error: formatPgError('work_orders', woRes.error) };
  }

  if (order.items.length > 0) {
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
  if (order.payments.length > 0) {
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
  if (order.photos.length > 0) {
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
  if (order.loan) {
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
    if (rawPath && rawPath !== 'demo') {
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

// ---------- DIRECT LOGIN VIA public.app_users (SIN SUPABASE AUTH) ----------

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

  // Preferred secure path: POST RPC body (never leaks pin_or_password in GET URL query params)
  const rpcRes = await client.rpc('authenticate_app_user', {
    p_username: cleanUser,
    p_password: cleanPass,
  });

  if (!rpcRes.error && rpcRes.data != null) {
    const parsedUser = parseRpcAuthPayload(rpcRes.data, cleanUser);
    if (parsedUser) {
      return { ok: true, user: parsedUser };
    }
  }

  // Fallback query against public.app_users (also covers RPCs that INNER JOIN tenants
  // and exclude superadmin rows where tenant_id IS NULL, or older schemas without the RPC).
  const escaped = cleanUser.replace(/[%_\\]/g, '\\$&');
  let queryRes = await client
    .from('app_users')
    .select(
      'id, tenant_id, branch_id, username, full_name, role, is_active, tenants(*), branches(*)'
    )
    .ilike('username', `%${escaped}%`)
    .eq('pin_or_password', cleanPass)
    .neq('is_active', false)
    .limit(10);

  if (queryRes.error) {
    // Retry without PostgREST FK embeds in case tenants/branches relationship or RLS blocks the join
    const plainRes = await client
      .from('app_users')
      .select('id, tenant_id, branch_id, username, full_name, role, is_active')
      .ilike('username', `%${escaped}%`)
      .eq('pin_or_password', cleanPass)
      .neq('is_active', false)
      .limit(10);
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

// ---------- RPC get_public_order_status ----------

export interface PublicOrderRpcPayload {
  order: WorkOrder;
  tenant: Tenant;
  branch?: Branch;
  client?: Client;
  asset?: CustomerAsset;
}

export async function fetchPublicOrderStatusViaRpc(
  cfg: SupabaseConfig,
  codeOrFolio: string
): Promise<{ ok: boolean; data?: PublicOrderRpcPayload; error?: string }> {
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

    const raw = (Array.isArray(res.data) ? res.data[0] : res.data) as {
      order?: Record<string, unknown>;
      tenant?: Record<string, unknown>;
      branch?: Record<string, unknown>;
      client?: Record<string, unknown>;
      asset?: Record<string, unknown>;
      items?: Array<Record<string, unknown>>;
      payments?: Array<Record<string, unknown>>;
      photos?: Array<Record<string, unknown>>;
    } | null;

    if (!raw?.order || !raw?.tenant) {
      return { ok: false, error: 'Orden no encontrada en RPC' };
    }

    const order = mapWorkOrderFromDb(raw.order, {
      items: raw.items?.map(mapOrderItemFromDb),
      payments: raw.payments?.map(mapOrderPaymentFromDb),
      photos: raw.photos?.map(mapOrderPhotoFromDb),
    });

    return {
      ok: true,
      data: {
        order,
        tenant: mapTenantFromDb(raw.tenant),
        branch: raw.branch ? mapBranchFromDb(raw.branch) : undefined,
        client: raw.client ? mapClientFromDb(raw.client) : undefined,
        asset: raw.asset ? mapAssetFromDb(raw.asset) : undefined,
      },
    };
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
      const res = await client.from('work_orders').upsert(rows, { onConflict: 'id' });
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
