import { describe, it, expect } from 'vitest';
import { resolveSafePath } from '../../src/server/utils/path-guard.js';

describe('resolveSafePath', () => {
  const baseDir = '/home/user/projects';

  it('resolves a simple filename', () => {
    expect(resolveSafePath(baseDir, 'report.html')).toBe('/home/user/projects/report.html');
  });

  it('resolves a nested path', () => {
    expect(resolveSafePath(baseDir, 'sub/report.html')).toBe('/home/user/projects/sub/report.html');
  });

  it('rejects path traversal with ../', () => {
    expect(() => resolveSafePath(baseDir, '../etc/passwd')).toThrow('Path outside project directory');
  });

  it('rejects path traversal with encoded characters', () => {
    expect(() => resolveSafePath(baseDir, '..%2Fetc/passwd')).toThrow('Path outside project directory');
  });

  it('rejects absolute paths', () => {
    expect(() => resolveSafePath(baseDir, '/etc/passwd')).toThrow('Path outside project directory');
  });

  it('rejects null byte injection', () => {
    expect(() => resolveSafePath(baseDir, 'file\0.html')).toThrow('Path outside project directory');
  });

  it('resolves paths with redundant slashes', () => {
    expect(resolveSafePath(baseDir, 'sub//report.html')).toBe('/home/user/projects/sub/report.html');
  });
});
