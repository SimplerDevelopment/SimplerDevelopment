// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertE2eSqlTarget } from '../e2e/setup/sql-target';

describe('E2E SQL database target', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]'])('accepts explicit test databases on %s', host => {
    const url = `postgresql://${host}:55435/simplerdev_test`;
    expect(assertE2eSqlTarget(url)).toBe(url);
  });
  it.each(['simplerdev', 'production', 'production_test', 'simplerdev_test_copy', 'test'])('rejects %s outside the test namespace', database => {
    expect(() => assertE2eSqlTarget(`postgres://localhost/${database}`)).toThrow('test namespace');
  });
  it.each(['postgres://remote.example/simplerdev_test', 'postgres://127.0.0.1.remote.example/simplerdev_test',
    'postgres://localhost/simplerdev_test?host=remote.example', 'postgres://localhost/simplerdev_test?database=production',
    'postgres://localhost/simplerdev_test?service=production', 'https://localhost/simplerdev_test'])('rejects unsafe connection %s', url => {
    expect(() => assertE2eSqlTarget(url)).toThrow();
  });
  it('rejects a missing or invalid target before any subprocess can run', () => {
    expect(() => assertE2eSqlTarget(undefined)).toThrow('explicit');
    expect(() => assertE2eSqlTarget('invalid')).toThrow('Invalid');
  });
});
