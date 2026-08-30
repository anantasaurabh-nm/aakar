import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { operatorToSql } from './entity-repository.service';

const col = Prisma.raw('"priority"');

describe('operatorToSql (dynamic column filters, finetune-1 §2.3)', () => {
  it('binds the filter value as a normal parameter, never splices it into the SQL text', () => {
    const result = operatorToSql(col, 'eq', 'HIGH');
    expect(result.sql).toBe('"priority" = ?');
    expect(result.values).toEqual(['HIGH']);
  });

  it('wraps contains/does-not-contain as ILIKE/NOT ILIKE with wildcards added to the bound value, not the SQL text', () => {
    expect(operatorToSql(col, 'contains', 'urg').sql).toBe('"priority"::text ILIKE ?');
    expect(operatorToSql(col, 'contains', 'urg').values).toEqual(['%urg%']);
    expect(operatorToSql(col, 'not_contains', 'urg').sql).toBe('"priority"::text NOT ILIKE ?');
  });

  it('maps starts_with/ends_with to a one-sided wildcard', () => {
    expect(operatorToSql(col, 'starts_with', 'HI').values).toEqual(['HI%']);
    expect(operatorToSql(col, 'ends_with', 'GH').values).toEqual(['%GH']);
  });

  it('maps comparison operators directly', () => {
    expect(operatorToSql(col, 'gt', 3).sql).toBe('"priority" > ?');
    expect(operatorToSql(col, 'lte', 3).sql).toBe('"priority" <= ?');
    expect(operatorToSql(col, 'neq', 3).sql).toBe('"priority" != ?');
  });
});
