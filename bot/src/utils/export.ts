import ExcelJS from 'exceljs';

export function buildCsvBuffer(
  rows: Array<Record<string, string | number | boolean>>,
  headers: string[],
): Buffer {
  const escape = (value: string | number | boolean): string => {
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header] ?? '')).join(','));
  }

  return Buffer.from(lines.join('\n'), 'utf-8');
}

export interface BanlistRow {
  username: string;
  userId: string;
}

export async function buildBanlistExcel(bans: BanlistRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ban List');

  sheet.columns = [
    { header: 'Username', key: 'username', width: 32 },
    { header: 'User ID', key: 'userId', width: 24 },
  ];

  for (const ban of bans) {
    sheet.addRow(ban);
  }

  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
