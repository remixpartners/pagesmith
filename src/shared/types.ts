export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface SaveRequest {
  html: string;
  css: string;
}

export interface SaveAsRequest {
  filename: string;
  html: string;
  css: string;
}

export interface PdfExportRequest {
  html: string;
  format?: 'a4' | '16:9' | '4:3';
}

export interface ApiError {
  error: string;
  message: string;
}
