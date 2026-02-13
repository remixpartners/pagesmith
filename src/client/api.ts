import type { FileEntry, SaveRequest, SaveAsRequest, PdfExportRequest } from '../shared/types.js';

const BASE = '';

export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(`${BASE}/api/files`);
  if (!res.ok) throw new Error('Failed to list files');
  return res.json();
}

export async function readFile(filePath: string): Promise<string> {
  const res = await fetch(`${BASE}/api/files/${filePath}`);
  if (!res.ok) throw new Error(`Failed to read file: ${filePath}`);
  return res.text();
}

export async function saveFile(filePath: string, data: SaveRequest): Promise<void> {
  const res = await fetch(`${BASE}/api/files/${filePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save file');
}

export async function saveAsFile(data: SaveAsRequest): Promise<string> {
  const res = await fetch(`${BASE}/api/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to save file');
  const result = await res.json();
  return result.path;
}

export async function exportPdf(data: PdfExportRequest): Promise<Blob> {
  const res = await fetch(`${BASE}/api/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('PDF export failed');
  return res.blob();
}

export interface AssetInfo {
  name: string;
  path: string;
}

export async function listAssets(): Promise<AssetInfo[]> {
  const res = await fetch(`${BASE}/api/assets`);
  if (!res.ok) throw new Error('Failed to list assets');
  return res.json();
}

export async function uploadAsset(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/api/assets`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Failed to upload asset');
  const result = await res.json();
  return result.path;
}
