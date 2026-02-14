import type { FileEntry, SaveRequest, SaveAsRequest, PdfExportRequest } from '../shared/types.js';

const BASE = '';

export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(`${BASE}/api/files`);
  if (!res.ok) throw new Error('Failed to list files');
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function readFile(filePath: string): Promise<string> {
  const res = await fetch(`${BASE}/api/files/${filePath}`);
  if (!res.ok) throw new ApiError(`Failed to read file (${res.status}): ${filePath}`, res.status);
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

export async function fetchRemoteFile(url: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}/api/files/fetch-remote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename }),
  });
  if (!res.ok) {
    let msg = `status ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch { /* non-JSON response */ }
    throw new Error(`Failed to fetch remote file: ${msg}`);
  }
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

export interface EmirRevisionResponse {
  html: string;
  changes_summary: string;
  sections_changed: string[];
}

export interface EmirMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  phase: string;
  created_at: string;
}

export async function emirRevise(
  emirApi: string,
  proposalId: string,
  html: string,
  message: string,
  syncToken: string,
): Promise<EmirRevisionResponse> {
  const res = await fetch(`${BASE}/api/files/emir-revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emir_api: emirApi, proposal_id: proposalId, html, message, sync_token: syncToken }),
  });
  if (!res.ok) {
    let msg = `status ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch { /* non-JSON */ }
    throw new Error(`Revision failed: ${msg}`);
  }
  return res.json();
}

export async function emirGetMessages(emirApi: string, proposalId: string, syncToken: string): Promise<EmirMessage[]> {
  const res = await fetch(`${BASE}/api/files/emir-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emir_api: emirApi, proposal_id: proposalId, sync_token: syncToken }),
  });
  if (!res.ok) return []; // Graceful fallback — empty history
  return res.json();
}
