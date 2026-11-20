import type { AuthSessionUser } from '../types/erp';
import { mapDbRoleToRoleType } from './erpLogic';
import { mapBranchFromDb, mapTenantFromDb } from './supabaseMappers';

export function normalizeLoginUsername(username: string): string {
  return username.trim().replace(/^@+/, '');
}

export function buildAuthSessionUserFromRow(
  userRow: Record<string, unknown>,
  fallbackUsername: string,
  relations?: {
    tenant?: Record<string, unknown> | null;
    branch?: Record<string, unknown> | null;
  }
): AuthSessionUser | null {
  if (!userRow || userRow.id == null) return null;
  const isActive = userRow.is_active !== false;
  if (!isActive) return null;

  const rawTenant =
    relations?.tenant ??
    (userRow.tenants as Record<string, unknown> | null | undefined) ??
    null;
  const rawBranch =
    relations?.branch ??
    (userRow.branches as Record<string, unknown> | null | undefined) ??
    null;

  const cleanUsername = normalizeLoginUsername(
    String(userRow.username ?? fallbackUsername)
  );

  return {
    id: String(userRow.id),
    username: cleanUsername || fallbackUsername,
    full_name: String(userRow.full_name ?? (cleanUsername || fallbackUsername)),
    tenant_id: userRow.tenant_id != null ? String(userRow.tenant_id) : null,
    branch_id: userRow.branch_id != null ? String(userRow.branch_id) : null,
    role: mapDbRoleToRoleType(userRow.role != null ? String(userRow.role) : null),
    is_active: true,
    mode: 'supabase',
    tenant: rawTenant ? mapTenantFromDb(rawTenant) : null,
    branch: rawBranch ? mapBranchFromDb(rawBranch) : null,
  };
}

export function parseRpcAuthPayload(
  data: unknown,
  fallbackUsername: string
): AuthSessionUser | null {
  const first = Array.isArray(data) ? data[0] : data;
  if (!first || typeof first !== 'object') return null;

  const record = first as Record<string, unknown>;
  const userObj =
    record.user && typeof record.user === 'object'
      ? (record.user as Record<string, unknown>)
      : record.id != null && ('username' in record || 'role' in record)
      ? record
      : null;

  if (!userObj) return null;

  const tenantObj =
    record.tenant && typeof record.tenant === 'object'
      ? (record.tenant as Record<string, unknown>)
      : null;
  const branchObj =
    record.branch && typeof record.branch === 'object'
      ? (record.branch as Record<string, unknown>)
      : null;

  return buildAuthSessionUserFromRow(userObj, fallbackUsername, {
    tenant: tenantObj,
    branch: branchObj,
  });
}

export function findMatchingAppUserRow(
  rows: Array<Record<string, unknown>>,
  cleanUsername: string
): Record<string, unknown> | null {
  const target = normalizeLoginUsername(cleanUsername).toLowerCase();
  if (!target) return null;

  return (
    rows.find((row) => {
      if (row.is_active === false) return false;
      const rowUser = normalizeLoginUsername(String(row.username ?? '')).toLowerCase();
      return rowUser === target;
    }) ?? null
  );
}
