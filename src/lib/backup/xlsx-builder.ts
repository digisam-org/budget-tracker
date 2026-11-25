import {
  AppSettings,
  Account,
  Category,
  BudgetPlan,
  Transaction,
} from '@/lib/types';
import { calculateYearlyCashflowSeries } from '@/lib/budget/calculator';

// ---- Pure Browser & Node Standards-Compliant ZIP Builder (Store Mode, Zero Node Deps) ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function createZipUint8Array(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    // Local File Header (30 bytes + name) — method 0 (STORE) is universally supported by Excel/Numbers/Sheets
    const localHeader = new Uint8Array(30);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true); // STORE (no zlib dependency)
    lhView.setUint16(10, 0, true);
    lhView.setUint16(12, 0, true);
    lhView.setUint32(14, crc, true);
    lhView.setUint32(18, data.length, true);
    lhView.setUint32(22, data.length, true);
    lhView.setUint16(26, nameBytes.length, true);
    lhView.setUint16(28, 0, true);

    localParts.push(localHeader, nameBytes, data);

    // Central Directory Header (46 bytes + name)
    const centralHeader = new Uint8Array(46);
    const chView = new DataView(centralHeader.buffer);
    chView.setUint32(0, 0x02014b50, true);
    chView.setUint16(4, 20, true);
    chView.setUint16(6, 20, true);
    chView.setUint16(8, 0, true);
    chView.setUint16(10, 0, true); // STORE
    chView.setUint16(12, 0, true);
    chView.setUint16(14, 0, true);
    chView.setUint32(16, crc, true);
    chView.setUint32(20, data.length, true);
    chView.setUint32(24, data.length, true);
    chView.setUint16(28, nameBytes.length, true);
    chView.setUint16(30, 0, true);
    chView.setUint16(32, 0, true);
    chView.setUint16(34, 0, true);
    chView.setUint16(36, 0, true);
    chView.setUint32(38, 0, true);
    chView.setUint32(42, offset, true);

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralDirBuf = concatUint8Arrays(centralParts);
  const endRecord = new Uint8Array(22);
  const erView = new DataView(endRecord.buffer);
  erView.setUint32(0, 0x06054b50, true);
  erView.setUint16(4, 0, true);
  erView.setUint16(6, 0, true);
  erView.setUint16(8, entries.length, true);
  erView.setUint16(10, entries.length, true);
  erView.setUint32(12, centralDirBuf.length, true);
  erView.setUint32(16, offset, true);
  erView.setUint16(20, 0, true);

  return concatUint8Arrays([...localParts, centralDirBuf, endRecord]);
}

// ---- OOXML Worksheet Helpers ----

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoToExcelSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return 0;
  const utc = Date.UTC(y, m - 1, d);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / (1000 * 60 * 60 * 24));
}

type CellValue =
  | { type: 'str'; value: string; style?: number }
  | { type: 'num'; value: number; style?: number }
  | { type: 'formula'; formula: string; value?: number; style?: number };

interface SheetRow {
  rowNum: number;
  cells: Record<string, CellValue>;
}

function buildWorksheetXml(
  rows: SheetRow[],
  colWidths: Array<{ min: number; max: number; width: number }>
): string {
  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map(
            (c) =>
              `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`
          )
          .join('')}</cols>`
      : '';

  const rowsXml = rows
    .sort((a, b) => a.rowNum - b.rowNum)
    .map((r) => {
      const cellsXml = Object.entries(r.cells)
        .map(([col, cell]) => {
          const ref = `${col}${r.rowNum}`;
          const styleAttr = cell.style ? ` s="${cell.style}"` : '';
          if (cell.type === 'str') {
            return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t>${escapeXml(
              cell.value
            )}</t></is></c>`;
          }
          if (cell.type === 'formula') {
            const cachedVal =
              typeof cell.value === 'number' ? `<v>${cell.value}</v>` : '';
            return `<c r="${ref}"${styleAttr}><f>${escapeXml(
              cell.formula
            )}</f>${cachedVal}</c>`;
          }
          return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
        })
        .join('');
      return `<row r="${r.rowNum}">${cellsXml}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00;[Red]-&quot;£&quot;#,##0.00"/>
    <numFmt numFmtId="165" formatCode="yyyy-mm-dd"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF18181B"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
</styleSheet>`;

const MONTH_COLS = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function buildUltimateBudgetWorkbook(params: {
  year: number;
  settings: AppSettings | null;
  accounts: Account[];
  categories: Category[];
  plans: BudgetPlan[];
  transactions: Transaction[];
}): Uint8Array {
  const { year, settings, accounts, categories, plans, transactions } = params;
  const encoder = new TextEncoder();

  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // ---- Sheet 1: Settings ----
  const settingsRows: SheetRow[] = [
    {
      rowNum: 2,
      cells: {
        D: { type: 'str', value: 'Ultimate Personal Budget — Settings', style: 1 },
        E: { type: 'str', value: 'Value', style: 1 },
      },
    },
    {
      rowNum: 4,
      cells: {
        D: { type: 'str', value: 'Starting Year:', style: 2 },
        E: { type: 'num', value: year },
      },
    },
    {
      rowNum: 5,
      cells: {
        D: { type: 'str', value: 'Shift late income:', style: 2 },
        E: { type: 'str', value: settings?.shiftLateIncome ? 'Active' : 'Inactive' },
      },
    },
    {
      rowNum: 6,
      cells: {
        D: { type: 'str', value: 'Starting on day x in month:', style: 2 },
        E: { type: 'num', value: settings?.lateIncomeDay ?? 20 },
      },
    },
    {
      rowNum: 7,
      cells: {
        D: { type: 'str', value: 'Savings Rate as % of Income:', style: 2 },
        E: {
          type: 'str',
          value:
            (settings?.savingsRateType || 'active') === 'active'
              ? '% allocated to Savings'
              : '% of Income not spent',
        },
      },
    },
    {
      rowNum: 9,
      cells: {
        D: { type: 'str', value: 'Exported From:', style: 2 },
        E: {
          type: 'str',
          value: `Budget Tracker PWA (${new Date().toISOString().split('T')[0]})`,
        },
      },
    },
  ];

  // ---- Sheet 2: Budget Planning ----
  const planLookup = new Map<string, number>();
  for (const p of plans) {
    if (p.year === year) {
      planLookup.set(`${p.categoryId}_${p.month}`, p.plannedAmount);
    }
  }

  const bpRows: SheetRow[] = [];
  const headerCells: Record<string, CellValue> = {
    C: { type: 'str', value: `Budget Planning (${year})`, style: 1 },
    D: { type: 'str', value: 'Total Year', style: 1 },
  };
  MONTH_COLS.forEach((col, i) => {
    headerCells[col] = { type: 'str', value: MONTH_LABELS[i], style: 1 };
  });
  bpRows.push({ rowNum: 3, cells: headerCells });

  let r = 5;
  const sectionTotalRows: Record<'income' | 'expenses' | 'savings', number> = {
    income: 0,
    expenses: 0,
    savings: 0,
  };

  const orderedSections: Array<{ type: 'income' | 'expenses' | 'savings'; title: string }> = [
    { type: 'income', title: 'Income' },
    { type: 'expenses', title: 'Expenses' },
    { type: 'savings', title: 'Savings' },
  ];

  for (const sec of orderedSections) {
    bpRows.push({
      rowNum: r,
      cells: { C: { type: 'str', value: sec.title, style: 2 } },
    });
    r++;

    const secCats = categories
      .filter((c) => c.type === sec.type)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const startRow = r;

    for (const cat of secCats) {
      const cells: Record<string, CellValue> = {
        C: { type: 'str', value: cat.name },
      };
      let rowSumPounds = 0;
      MONTH_COLS.forEach((col, idx) => {
        const pence = planLookup.get(`${cat.id}_${idx + 1}`) || 0;
        const pounds = Number((pence / 100).toFixed(2));
        rowSumPounds += pounds;
        cells[col] = { type: 'num', value: pounds, style: 3 };
      });
      cells.D = {
        type: 'formula',
        formula: `SUM(E${r}:P${r})`,
        value: Number(rowSumPounds.toFixed(2)),
        style: 4,
      };
      bpRows.push({ rowNum: r, cells });
      r++;
    }

    const endRow = Math.max(startRow, r - 1);
    const totalCells: Record<string, CellValue> = {
      C: { type: 'str', value: 'Total', style: 2 },
      D: { type: 'formula', formula: `SUM(E${r}:P${r})`, style: 4 },
    };
    MONTH_COLS.forEach((col) => {
      totalCells[col] = {
        type: 'formula',
        formula: `SUM(${col}${startRow}:${col}${endRow})`,
        style: 4,
      };
    });
    bpRows.push({ rowNum: r, cells: totalCells });
    sectionTotalRows[sec.type] = r;
    r += 2;
  }

  const tbaCells: Record<string, CellValue> = {
    C: { type: 'str', value: 'To be allocated:', style: 1 },
    D: {
      type: 'formula',
      formula: `D${sectionTotalRows.income}-D${sectionTotalRows.expenses}-D${sectionTotalRows.savings}`,
      style: 4,
    },
  };
  MONTH_COLS.forEach((col) => {
    tbaCells[col] = {
      type: 'formula',
      formula: `${col}${sectionTotalRows.income}-${col}${sectionTotalRows.expenses}-${col}${sectionTotalRows.savings}`,
      style: 4,
    };
  });
  bpRows.push({ rowNum: r, cells: tbaCells });

  // ---- Sheet 3: Budget Tracking ----
  const btRows: SheetRow[] = [
    {
      rowNum: 11,
      cells: {
        C: { type: 'str', value: 'Date', style: 1 },
        D: { type: 'str', value: 'Type', style: 1 },
        E: { type: 'str', value: 'Category', style: 1 },
        F: { type: 'str', value: 'Amount', style: 1 },
        G: { type: 'str', value: 'Details', style: 1 },
        H: { type: 'str', value: 'Account', style: 1 },
        I: { type: 'str', value: 'Effective Date', style: 1 },
        J: { type: 'str', value: 'Status', style: 1 },
      },
    },
  ];

  const exportTxs = transactions
    .filter((t) => t.status !== 'ignored')
    .sort((a, b) => a.date.localeCompare(b.date));

  let btRowNum = 12;
  for (const tx of exportTxs) {
    const cat = tx.categoryId ? catMap.get(tx.categoryId) : null;
    const typeLabel =
      tx.type === 'income'
        ? 'Income'
        : tx.type === 'savings'
        ? 'Savings'
        : 'Expenses';

    btRows.push({
      rowNum: btRowNum,
      cells: {
        C: { type: 'num', value: isoToExcelSerial(tx.date), style: 5 },
        D: { type: 'str', value: typeLabel },
        E: { type: 'str', value: cat?.name || 'Uncategorized' },
        F: { type: 'num', value: Number((Math.abs(tx.amount) / 100).toFixed(2)), style: 3 },
        G: { type: 'str', value: tx.cleanMerchant || tx.rawDescription },
        H: { type: 'str', value: accMap.get(tx.accountId) || tx.accountId },
        I: {
          type: 'num',
          value: isoToExcelSerial(tx.effectiveDate || tx.date),
          style: 5,
        },
        J: { type: 'str', value: tx.status },
      },
    });
    btRowNum++;
  }

  // ---- Sheet 4: Monthly Summary ----
  const series = calculateYearlyCashflowSeries({
    year,
    categories,
    plans,
    transactions,
    shiftLateIncome: settings?.shiftLateIncome,
    lateIncomeDay: settings?.lateIncomeDay,
    savingsRateType: settings?.savingsRateType || 'active',
  });

  const summaryRows: SheetRow[] = [
    {
      rowNum: 2,
      cells: {
        B: { type: 'str', value: `Month (${year})`, style: 1 },
        C: { type: 'str', value: 'Planned Income', style: 1 },
        D: { type: 'str', value: 'Actual Income', style: 1 },
        E: { type: 'str', value: 'Planned Expenses', style: 1 },
        F: { type: 'str', value: 'Actual Expenses', style: 1 },
        G: { type: 'str', value: 'Planned Savings', style: 1 },
        H: { type: 'str', value: 'Actual Savings', style: 1 },
        I: { type: 'str', value: 'Actual Net Balance', style: 1 },
      },
    },
  ];

  series.forEach((pt, idx) => {
    const rowIdx = 3 + idx;
    const net = pt.actualIncome - pt.actualExpenses - pt.actualSavings;
    summaryRows.push({
      rowNum: rowIdx,
      cells: {
        B: { type: 'str', value: `${pt.label} ${year}`, style: 2 },
        C: { type: 'num', value: Number((pt.plannedIncome / 100).toFixed(2)), style: 3 },
        D: { type: 'num', value: Number((pt.actualIncome / 100).toFixed(2)), style: 3 },
        E: { type: 'num', value: Number((pt.plannedExpenses / 100).toFixed(2)), style: 3 },
        F: { type: 'num', value: Number((pt.actualExpenses / 100).toFixed(2)), style: 3 },
        G: { type: 'num', value: Number((pt.plannedSavings / 100).toFixed(2)), style: 3 },
        H: { type: 'num', value: Number((pt.actualSavings / 100).toFixed(2)), style: 3 },
        I: { type: 'num', value: Number((net / 100).toFixed(2)), style: 4 },
      },
    });
  });

  const sheet1Xml = buildWorksheetXml(settingsRows, [
    { min: 4, max: 4, width: 32 },
    { min: 5, max: 5, width: 32 },
  ]);
  const sheet2Xml = buildWorksheetXml(bpRows, [
    { min: 3, max: 3, width: 34 },
    { min: 4, max: 16, width: 13 },
  ]);
  const sheet3Xml = buildWorksheetXml(btRows, [
    { min: 3, max: 3, width: 13 },
    { min: 4, max: 4, width: 12 },
    { min: 5, max: 5, width: 28 },
    { min: 6, max: 6, width: 13 },
    { min: 7, max: 7, width: 34 },
    { min: 8, max: 8, width: 20 },
    { min: 9, max: 9, width: 14 },
    { min: 10, max: 10, width: 12 },
  ]);
  const sheet4Xml = buildWorksheetXml(summaryRows, [
    { min: 2, max: 2, width: 14 },
    { min: 3, max: 9, width: 17 },
  ]);

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Settings" sheetId="1" r:id="rId1"/>
    <sheet name="Budget Planning" sheetId="2" r:id="rId2"/>
    <sheet name="Budget Tracking" sheetId="3" r:id="rId3"/>
    <sheet name="Monthly Summary" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  return createZipUint8Array([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
    { name: 'xl/worksheets/sheet2.xml', data: encoder.encode(sheet2Xml) },
    { name: 'xl/worksheets/sheet3.xml', data: encoder.encode(sheet3Xml) },
    { name: 'xl/worksheets/sheet4.xml', data: encoder.encode(sheet4Xml) },
  ]);
}
