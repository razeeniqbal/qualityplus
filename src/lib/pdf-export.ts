import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RowDetail } from '../components/QualityConfiguration';
import type { QualityResult } from '../types/database';

interface ResultWithDetails extends QualityResult {
  rowDetails?: RowDetail[];
}
interface ExportOptions {
  datasetName: string;
  publishedBy?: string;
  overallScore: number;
  totalPassed: number;
  totalFailed: number;
  results: ResultWithDetails[];
  aiSummary?: string;
  rowFilter: 'all' | 'fail';
}

// ── Classic black & white — no fills, thin rules, clean typography ────────────
const BLACK  : [number,number,number] = [0,   0,   0];
const INK    : [number,number,number] = [20,  20,  20];
const GREY   : [number,number,number] = [90,  90,  90];
const LIGHT  : [number,number,number] = [150, 150, 150];
const RULE   : [number,number,number] = [180, 180, 180];
const THBG   : [number,number,number] = [30,  30,  30];   // table header bg (near-black)
const ALTBG  : [number,number,number] = [248, 248, 248];  // alternating row — barely visible
const WHITE  : [number,number,number] = [255, 255, 255];

type AT = { lastAutoTable: { finalY: number } };
function lastY(doc: jsPDF) { return (doc as unknown as AT).lastAutoTable?.finalY ?? 0; }

function grade(s: number) {
  if (s >= 100) return 'Excellent';
  if (s >= 75)  return 'Good';
  if (s >= 50)  return 'Fair';
  return 'Poor';
}

function parseAI(raw: string) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let sec = '';
  const ov: string[] = [], is: string[] = [], re: string[] = [];
  for (const line of lines) {
    if (/^\[OVERVIEW\]$/i.test(line))        { sec = 'o'; continue; }
    if (/^\[KEY ISSUES\]$/i.test(line))      { sec = 'i'; continue; }
    if (/^\[RECOMMENDATIONS\]$/i.test(line)) { sec = 'r'; continue; }
    if (sec === 'o') ov.push(line);
    if (sec === 'i') is.push(line.replace(/^[-*]\s*/, ''));
    if (sec === 'r') re.push(line.replace(/^\d+[.)]\s*/, ''));
  }
  return { overview: ov.join(' ').trim(), issues: is, recs: re };
}

export async function exportResultsPDF(opts: ExportOptions): Promise<void> {
  const { datasetName, publishedBy, overallScore, totalPassed, totalFailed,
          results, aiSummary, rowFilter } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw  = doc.internal.pageSize.getWidth();
  const ph  = doc.internal.pageSize.getHeight();
  const ml  = 20;
  const mr  = 20;
  const cw  = pw - ml - mr;   // 170mm usable width
  const bot = ph - 18;
  let y     = 0;

  // ── Page helpers ────────────────────────────────────────────────────────────
  function ensureSpace(n: number) { if (y + n > bot) addPage(); }

  function addPage() {
    doc.addPage();
    y = 22;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(ml, 13, pw - mr, 13);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LIGHT);
    doc.text('Quality Plus  —  Data Quality Report', ml, 10);
    doc.text(datasetName, pw - mr, 10, { align: 'right' });
  }

  function sectionTitle(title: string) {
    ensureSpace(14);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(title.toUpperCase(), ml, y);
    y += 2;
    // Double rule: thick then thin
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.7);
    doc.line(ml, y, pw - mr, y);
    y += 1;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(ml, y, pw - mr, y);
    y += 7;
  }

  // ── HEADER — classic letterhead style ─────────────────────────────────────
  // Top thick rule
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pw, 1.5, 'F');

  // Report title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text('DATA QUALITY REPORT', ml, 16);

  // Subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GREY);
  doc.text('Quality Plus  ·  AEM Energy Solutions', ml, 23);

  // Meta block — right aligned
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`Dataset: ${datasetName}`, pw - mr, 9, { align: 'right' });
  doc.text(`Published by: ${publishedBy ?? 'Unknown'}`, pw - mr, 15, { align: 'right' });
  doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), pw - mr, 21, { align: 'right' });

  // Bottom rule of header area
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.5);
  doc.line(ml, 27, pw - mr, 27);

  y = 36;

  // ── SCORE OVERVIEW ──────────────────────────────────────────────────────────
  sectionTitle('Score Overview');

  // Layout: 4 equal columns separated by thin rules
  // Col 1: Overall Score  | Col 2: Grade | Col 3: Passed | Col 4: Failed
  const scH  = 22;
  const scW  = cw / 4;

  // Outer border
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.rect(ml, y, cw, scH, 'S');

  // Column internal dividers
  for (let i = 1; i < 4; i++) {
    doc.line(ml + i * scW, y + 2, ml + i * scW, y + scH - 2);
  }

  // Column 1 — Overall Score
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT);
  doc.text('OVERALL SCORE', ml + scW / 2, y + 6, { align: 'center' });
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(`${overallScore.toFixed(1)}%`, ml + scW / 2, y + 17, { align: 'center' });

  // Column 2 — Grade
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT);
  doc.text('GRADE', ml + scW + scW / 2, y + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(grade(overallScore).toUpperCase(), ml + scW + scW / 2, y + 17, { align: 'center' });

  // Column 3 — Passed
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT);
  doc.text('PASSED', ml + 2 * scW + scW / 2, y + 6, { align: 'center' });
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(totalPassed.toLocaleString(), ml + 2 * scW + scW / 2, y + 17, { align: 'center' });

  // Column 4 — Failed
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...LIGHT);
  doc.text('FAILED', ml + 3 * scW + scW / 2, y + 6, { align: 'center' });
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(totalFailed.toLocaleString(), ml + 3 * scW + scW / 2, y + 17, { align: 'center' });

  y += scH + 8;

  // ── DIMENSION BREAKDOWN ───────────────────────────────────────────────────
  const activeDims = ['completeness','uniqueness','consistency','validity']
    .filter(d => results.some(r => r.dimension === d));
  const dw = cw / activeDims.length;
  const dh = 16;

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.rect(ml, y, cw, dh, 'S');

  activeDims.forEach((dim, i) => {
    const dRes   = results.filter(r => r.dimension === dim);
    const dScore = dRes.reduce((s, r) => s + r.score, 0) / dRes.length;
    const dx     = ml + i * dw;

    if (i > 0) {
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(dx, y + 2, dx, y + dh - 2);
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LIGHT);
    doc.text(dim.toUpperCase(), dx + dw / 2, y + 7, { align: 'center' });

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(`${dScore.toFixed(0)}%`, dx + dw / 2, y + 14, { align: 'center' });
  });

  y += dh + 12;

  // ── AI SUMMARY ──────────────────────────────────────────────────────────────
  if (aiSummary) {
    sectionTitle('AI Summary');
    const { overview, issues, recs } = parseAI(aiSummary);

    // Overview — full width, no box, just indented paragraph
    if (overview) {
      // Wrap to full content width
      const lines = doc.splitTextToSize(overview, cw);
      const h     = lines.length * 5.5 + 2;
      ensureSpace(h + 6);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK);
      doc.text(lines, ml, y, { lineHeightFactor: 1.5 });
      y += h + 8;
    }

    // Key Issues
    if (issues.length > 0) {
      ensureSpace(12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text('Key Issues', ml, y);
      y += 2;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(ml, y, pw - mr, y);
      y += 5;

      for (const issue of issues) {
        const parts  = issue.split(' - ');
        const col    = parts[0]?.trim() ?? '';
        const dim    = parts[1]?.trim() ?? '';
        const count  = parts[2]?.trim() ?? '';
        const reason = parts.slice(3).join(' — ').trim() || issue;

        // Wrap reason to full content width minus small indent
        const rLines = doc.splitTextToSize(reason, cw - 4);
        const rowH   = rLines.length * 5 + 10;
        ensureSpace(rowH + 3);

        // Simple left rule only
        doc.setDrawColor(...INK);
        doc.setLineWidth(1.2);
        doc.line(ml, y, ml, y + rowH - 2);
        doc.setLineWidth(0.25);

        // Column name bold + dimension + count
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(col, ml + 4, y + 5.5);

        if (dim) {
          const cw2 = doc.getTextWidth(col);
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...GREY);
          doc.text(`[${dim}]`, ml + 5 + cw2, y + 5.5);
        }

        if (count) {
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...GREY);
          doc.text(count, pw - mr, y + 5.5, { align: 'right' });
        }

        // Reason — full width
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GREY);
        doc.text(rLines, ml + 4, y + rowH - rLines.length * 5 + 1);

        // Bottom hairline
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        doc.line(ml + 4, y + rowH, pw - mr, y + rowH);

        y += rowH + 4;
      }
      y += 4;
    }

    // Recommendations
    if (recs.length > 0) {
      ensureSpace(12);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text('Recommendations', ml, y);
      y += 2;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.25);
      doc.line(ml, y, pw - mr, y);
      y += 5;

      recs.forEach((rec, i) => {
        // Wrap to full content width minus number indent
        const rLines = doc.splitTextToSize(rec, cw - 8);
        const rH     = rLines.length * 5 + 3;
        ensureSpace(rH + 2);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...INK);
        doc.text(`${i + 1}.`, ml, y + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...INK);
        doc.text(rLines, ml + 7, y + 4.5, { lineHeightFactor: 1.4 });
        y += rH + 4;
      });
    }
  }

  // ── DETAILED RESULTS — always starts on a new page ────────────────────────
  addPage();
  sectionTitle('Detailed Results');

  const grouped = new Map<string, ResultWithDetails[]>();
  for (const r of results) {
    if (!grouped.has(r.column_name)) grouped.set(r.column_name, []);
    grouped.get(r.column_name)!.push(r);
  }

  for (const [columnName, colResults] of grouped) {
    const colScore = colResults.reduce((s, r) => s + r.score, 0) / colResults.length;

    ensureSpace(18);

    // Column header row — near-black fill, white text (classic table header)
    doc.setFillColor(...THBG);
    doc.rect(ml, y, cw, 8, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text(columnName, ml + 3, y + 5.8);
    doc.text(`${colScore.toFixed(0)}%`, pw - mr - 3, y + 5.8, { align: 'right' });

    y += 8;

    // Dimension summary
    autoTable(doc, {
      startY: y,
      head: [['Dimension', 'Score', 'Passed', 'Failed', 'Total']],
      body: colResults.map(r => [
        r.dimension.charAt(0).toUpperCase() + r.dimension.slice(1),
        `${r.score.toFixed(0)}%`,
        r.passed_count.toLocaleString(),
        r.failed_count.toLocaleString(),
        r.total_count.toLocaleString(),
      ]),
      margin: { left: ml, right: mr },
      tableWidth: cw,
      styles: {
        fontSize: 8, cellPadding: 2.5,
        lineColor: RULE, lineWidth: 0.25,
        textColor: INK,
      },
      headStyles: {
        fillColor: [70, 70, 70], textColor: WHITE,
        fontStyle: 'bold', fontSize: 8, cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 32, halign: 'center' },
        3: { cellWidth: 32, halign: 'center' },
        4: { cellWidth: 30, halign: 'center', textColor: LIGHT },
      },
      alternateRowStyles: { fillColor: ALTBG },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const v = parseInt(data.cell.text[0].replace(/,/g, ''));
          if (v > 0) data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = lastY(doc) + 4;

    // Row detail tables
    for (const result of colResults) {
      const rowDetails = result.rowDetails ?? [];
      const filtered   = rowFilter === 'fail' ? rowDetails.filter(d => !d.passed) : rowDetails;
      if (filtered.length === 0) continue;

      ensureSpace(16);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...LIGHT);
      doc.text(
        `Row details  ·  ${result.dimension.charAt(0).toUpperCase() + result.dimension.slice(1)}  ·  ${filtered.length} row${filtered.length !== 1 ? 's' : ''}${rowFilter === 'fail' ? '  ·  failed only' : ''}`,
        ml + 2, y + 4
      );
      y += 7;

      autoTable(doc, {
        startY: y,
        head: [['Row #', 'Value', 'Status', 'Reason']],
        body: filtered.map(d => [
          String(d.rowIndex + 1),
          d.value !== null && d.value !== undefined ? String(d.value) : '<empty>',
          d.passed ? 'Pass' : 'Fail',
          d.reason ?? '—',
        ]),
        margin: { left: ml + 2, right: mr },
        tableWidth: cw - 2,
        styles: {
          fontSize: 7.5, cellPadding: 2,
          lineColor: RULE, lineWidth: 0.2,
          textColor: INK,
        },
        headStyles: {
          fillColor: [70, 70, 70], textColor: WHITE,
          fontSize: 7.5, cellPadding: 2.5, fontStyle: 'bold',
        },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center', textColor: LIGHT },
          1: { cellWidth: 42 },
          2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 'auto' },
        },
        alternateRowStyles: { fillColor: ALTBG },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const row = filtered[data.row.index];
            if (data.column.index === 2) {
              data.cell.styles.textColor = row?.passed ? [60, 130, 60] : [160, 30, 30];
            }
          }
        },
      });
      y = lastY(doc) + 5;
    }

    y += 4;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(ml, y, pw - mr, y);
    y += 6;
  }

  // ── FOOTER on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const fy = ph - 10;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(ml, fy - 2, pw - mr, fy - 2);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...LIGHT);
    doc.text(`Quality Plus  ·  ${datasetName}`, ml, fy + 3);
    doc.text(`Page ${i} of ${pageCount}`, pw - mr, fy + 3, { align: 'right' });
  }

  const filename = `QualityPlus_Report_${datasetName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
