import { describe, expect, it } from 'vitest';

import { hasMinimumRole, isRole, requireAnyRole, requireRole } from './auth';

describe('role hierarchy', () => {
  it('recognizes the four supported roles and rejects unknown claims', () => {
    expect(isRole('public')).toBe(true);
    expect(isRole('admin')).toBe(true);
    expect(isRole('owner')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('allows higher roles to satisfy minimum-role checks', () => {
    expect(hasMinimumRole('admin', 'viewer')).toBe(true);
    expect(hasMinimumRole('operator', 'operator')).toBe(true);
    expect(hasMinimumRole('viewer', 'operator')).toBe(false);
    expect(hasMinimumRole('public', 'viewer')).toBe(false);
  });

  it('supports exact allow lists for non-hierarchical actions', () => {
    const next = (error?: unknown) => error;
    const request = { user: { sub: 'operator-1', role: 'operator' } } as never;

    expect(requireAnyRole('operator', 'admin')(request, {} as never, next)).toBeUndefined();
    expect(requireAnyRole('viewer', 'admin')(request, {} as never, next)).toBeInstanceOf(Error);
    expect(requireRole('viewer')(request, {} as never, next)).toBeUndefined();
  });
});
