import path from 'node:path';

export function resolveSafePath(baseDir: string, requestedPath: string): string {
  const decoded = decodeURIComponent(requestedPath);

  if (decoded.includes('\0')) {
    throw new Error('Path outside project directory');
  }

  const resolved = path.resolve(baseDir, decoded);
  const normalizedBase = path.resolve(baseDir);

  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error('Path outside project directory');
  }

  return resolved;
}
