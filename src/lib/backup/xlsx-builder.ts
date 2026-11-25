import { deflateRawSync } from 'zlib';
import {
  AppSettings,
  Account,
  Category,
  BudgetPlan,
  Transaction,
} from '@/lib/db/schema';
import { calculateYearlyCashflowSeries } from '@/lib/budget/calculator';

// ---- Minimal Standards-Compliant ZIP Builder (Store / Deflate) ----

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

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function createZipBuffer(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.data;
    const compressed = deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    // Local File Header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra len

    localParts.push(localHeader, nameBuf, compressed);

    // Central Directory Header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // EOCD signature
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirBuf.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, endRecord]);
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

// Style indices matching xl/styles.xml below:
// 0 = Normal
// 1 = Bold Header (dark fill, white text)
// 2 = Bold Section Title
// 3 = GBP Currency (£#,##0.00)
// 4 = Bold GBP Currency (Totals)
// 5 = Date (yyyy-mm-dd)
// 6 = Percentage (0%)

function buildWorksheetXml(rows: SheetRow[], colWidths: Array<{ min: number; max: number; width: number }>): string {
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
}): Buffer {
  const { year, settings, accounts, categories, plans, transactions } = params;

  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // ---- Sheet 1: Settings (mirrors Ultimate Personal Budget Extended.xlsx Col D/E) ----
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
        E: { type: 'str', value: `Budget Tracker PWA (${new Date().toISOString().split('T')[0]})` },
      },
    },
  ];

  // ---- Sheet 2: Budget Planning (mirrors Col C Category, Col D Annual, Col E-P Jan-Dec) ----
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

  // Zero-Based "To be allocated:" formula row
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

  // ---- Sheet 3: Budget Tracking (exact Row 11 header, Row 12+ Col C-I layout) ----
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

  // ---- Sheet 4: Monthly Summary (12-Month Planned vs Actual Dashboard Archive) ----
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

  // Assemble OOXML files
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

  return createZipBuffer([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRelsXml, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet1Xml, 'utf8') },
    { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(sheet2Xml, 'utf8') },
    { name: 'xl/worksheets/sheet3.xml', data: Buffer.from(sheet3Xml, 'utf8') },
    { name: 'xl/worksheets/sheet4.xml', data: Buffer.from(sheet4Xml, 'utf8') },
  ]);
}
