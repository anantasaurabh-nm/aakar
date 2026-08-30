import type { TableColumn } from '@erp/shared-contracts';

function formatValue(type: TableColumn['type'], value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'datetime':
      return new Date(String(value)).toLocaleString();
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : String(value);
    default:
      return String(value);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToCsv(columns: TableColumn[], rows: Record<string, unknown>[], filename: string) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(formatValue(c.type, row[c.key]))).join(','));
  const csv = [header, ...lines].join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`);
}

/** Dynamically imported so the SheetJS bundle is only ever fetched when a user actually clicks "Export XLSX." */
export async function exportToXlsx(columns: TableColumn[], rows: Record<string, unknown>[], filename: string) {
  const XLSX = await import('xlsx');
  const data = rows.map((row) => Object.fromEntries(columns.map((c) => [c.label, formatValue(c.type, row[c.key])])));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
