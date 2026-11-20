import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthSessionUserFromRow,
  findMatchingAppUserRow,
  normalizeLoginUsername,
  parseRpcAuthPayload,
} from './authParsers';

describe('authParsers for Supabase superadmin and app_users login', () => {
  it('normalizes @ prefix and whitespace in usernames', () => {
    assert.equal(normalizeLoginUsername('  @gtitech  '), 'gtitech');
    assert.equal(normalizeLoginUsername('@@admin'), 'admin');
  });

  it('parses wrapped RPC payload for superadmin with null tenant and branch', () => {
    const user = parseRpcAuthPayload(
      {
        user: {
          id: '00000000-0000-4000-8000-000000000099',
          username: 'gtitech',
          full_name: 'Global TI SuperAdmin',
          role: 'superadmin',
          tenant_id: null,
          branch_id: null,
          is_active: true,
        },
        tenant: null,
        branch: null,
      },
      'gtitech'
    );

    assert.ok(user);
    assert.equal(user.username, 'gtitech');
    assert.equal(user.role, 'superadmin');
    assert.equal(user.tenant_id, null);
    assert.equal(user.branch_id, null);
    assert.equal(user.tenant, null);
    assert.equal(user.branch, null);
    assert.equal(user.mode, 'supabase');
  });

  it('parses flat array RPC payload returned by SQL functions', () => {
    const user = parseRpcAuthPayload(
      [
        {
          id: '00000000-0000-4000-8000-000000000099',
          username: '@gtitech',
          full_name: 'Global TI',
          role: 'superadmin',
          tenant_id: null,
          branch_id: null,
          is_active: true,
        },
      ],
      'gtitech'
    );

    assert.ok(user);
    assert.equal(user.username, 'gtitech');
    assert.equal(user.role, 'superadmin');
  });

  it('rejects inactive accounts in RPC and direct row lookup', () => {
    const rpcInactive = parseRpcAuthPayload(
      {
        user: {
          id: '00000000-0000-4000-8000-000000000099',
          username: 'gtitech',
          role: 'superadmin',
          is_active: false,
        },
      },
      'gtitech'
    );
    assert.equal(rpcInactive, null);

    const rowMatch = findMatchingAppUserRow(
      [
        { id: '1', username: 'gtitech', is_active: false },
        { id: '2', username: 'gtitech2', is_active: true },
      ],
      'gtitech'
    );
    assert.equal(rowMatch, null);
  });

  it('matches exact normalized username even when stored with @ or spaces, and maps company_admin', () => {
    const rows = [
      { id: '1', username: 'gtitech_test', role: 'admin', is_active: true },
      { id: '2', username: ' @GtiTech ', role: 'superadmin', is_active: true, tenant_id: null },
    ];
    const matched = findMatchingAppUserRow(rows, 'gtitech');
    assert.ok(matched);
    assert.equal(matched.id, '2');

    const session = buildAuthSessionUserFromRow(matched, 'gtitech');
    assert.ok(session);
    assert.equal(session.username, 'GtiTech');
    assert.equal(session.role, 'superadmin');
    assert.equal(session.tenant_id, null);

    const adminSession = buildAuthSessionUserFromRow(
      {
        id: '3',
        username: 'carolina',
        full_name: 'Carolina',
        role: 'company_admin',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        branch_id: null,
        is_active: true,
      },
      'carolina'
    );
    assert.ok(adminSession);
    assert.equal(adminSession.role, 'admin');
  });
});
