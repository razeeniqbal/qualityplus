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

function scoreColor(score: number): [number, number, number] {
  if (score >= 100) return [34, 197, 94];   // green
  if (score >= 75)  return [234, 179, 8];   // yellow
  if (score >= 50)  return [249, 115, 22];  // orange
  return [239, 68, 68];                      // red
}

function drawScoreCircle(doc: jsPDF, x: number, y: number, score: number, size = 10) {
  const [r, g, b] = scoreColor(score);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(1.5);
  doc.circle(x, y, size / 2, 'S');
  doc.setFontSize(size * 0.7);
  doc.setTextColor(r, g, b);
  doc.setFont('helvetica', 'bold');
  const label = `${Math.round(score)}%`;
  const tw = doc.getTextWidth(label);
  doc.text(label, x - tw / 2, y + size * 0.25);
}

export async function exportResultsPDF(opts: ExportOptions): Promise<void> {
  const {
    datasetName, publishedBy, overallScore, totalPassed, totalFailed,
    results, aiSummary, rowFilter,
  } = opts;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  let y = margin;

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 118, 110); // teal-700
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Quality Plus — Data Quality Report', margin, 12);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Dataset: ${datasetName}`, margin, 19);
  doc.text(`Published by: ${publishedBy ?? 'Unknown'} · Generated: ${new Date().toLocaleString('en-GB')}`, margin, 24);
  y = 36;

  // ── Score Overview ──────────────────────────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Score Overview', margin, y);
  y += 7;

  // Overall score circle area
  const circleX = margin + 12;
  drawScoreCircle(doc, circleX, y + 8, overallScore, 20);

  // Stats
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const statsX = margin + 30;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Overall Score', statsX, y + 3);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`${overallScore.toFixed(1)}%`, statsX, y + 8);

  doc.setFontSize(9);
  const cols3X = statsX + 35;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(cols3X, y, 28, 10, 2, 2, 'F');
  doc.setTextColor(22, 163, 74);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalPassed.toLocaleString()}`, cols3X + 14, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Passed', cols3X + 14, y + 8, { align: 'center' });

  doc.setFillColor(254, 242, 242);
  doc.roundedRect(cols3X + 32, y, 28, 10, 2, 2, 'F');
  doc.setTextColor(220, 38, 38);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalFailed.toLocaleString()}`, cols3X + 46, y + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Failed', cols3X + 46, y + 8, { align: 'center' });
  y += 20;

  // ── Dimension scores ────────────────────────────────────────────────────────
  const dims = ['completeness', 'uniqueness', 'consistency', 'validity'];
  const dimW = contentW / dims.length;
  dims.forEach((dim, i) => {
    const dimResults = results.filter(r => r.dimension === dim);
    if (dimResults.length === 0) return;
    const dimScore = dimResults.reduce((s, r) => s + r.score, 0) / dimResults.length;
    const dx = margin + i * dimW;
    const [r2, g2, b2] = scoreColor(dimScore);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(dx, y, dimW - 2, 16, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text(dim.charAt(0).toUpperCase() + dim.slice(1), dx + (dimW - 2) / 2, y + 5, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(r2, g2, b2);
    doc.text(`${dimScore.toFixed(0)}%`, dx + (dimW - 2) / 2, y + 12, { align: 'center' });
  });
  y += 22;

  // ── AI Summary ──────────────────────────────────────────────────────────────
  if (aiSummary) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('AI Summary', margin, y);
    y += 5;

    doc.setFillColor(240, 253, 250);
    const summaryLines = doc.splitTextToSize(aiSummary, contentW - 8);
    const summaryH = summaryLines.length * 4.5 + 6;
    doc.roundedRect(margin, y, contentW, summaryH, 2, 2, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(summaryLines, margin + 4, y + 5);
    y += summaryH + 6;
  }

  // ── Detailed Results grouped by column ──────────────────────────────────────
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Detailed Results', margin, y);
  y += 2;

  // Group by column
  const grouped = new Map<string, ResultWithDetails[]>();
  for (const r of results) {
    if (!grouped.has(r.column_name)) grouped.set(r.column_name, []);
    grouped.get(r.column_name)!.push(r);
  }

  for (const [columnName, colResults] of grouped) {
    const colOverall = colResults.reduce((s, r) => s + r.score, 0) / colResults.length;
    const [cr, cg, cb] = scoreColor(colOverall);

    // Column header band
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y + 2, contentW, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(columnName, margin + 2, y + 7.5);
    doc.setTextColor(cr, cg, cb);
    doc.text(`${colOverall.toFixed(0)}%`, pageW - margin - 2, y + 7.5, { align: 'right' });
    y += 11;

    // Dimension summary table for this column
    const dimSummaryRows = colResults.map(r => [
      r.dimension.charAt(0).toUpperCase() + r.dimension.slice(1),
      `${r.score.toFixed(0)}%`,
      r.passed_count.toLocaleString(),
      r.failed_count.toLocaleString(),
      r.total_count.toLocaleString(),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Dimension', 'Score', 'Passed', 'Failed', 'Total']],
      body: dimSummaryRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'center', textColor: [22, 163, 74] },
        3: { cellWidth: 25, halign: 'center', textColor: [220, 38, 38] },
        4: { cellWidth: 25, halign: 'center' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const score = parseFloat(data.cell.text[0]);
          const [r2, g2, b2] = scoreColor(score);
          data.cell.styles.textColor = [r2, g2, b2];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;

    // Per-row details for each check in this column
    for (const result of colResults) {
      const rowDetails = result.rowDetails ?? [];
      const filtered = rowFilter === 'fail'
        ? rowDetails.filter(d => !d.passed)
        : rowDetails;
      if (filtered.length === 0) continue;

      if (y > 255) { doc.addPage(); y = margin; }
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(`Row details — ${result.dimension} (${filtered.length} rows${rowFilter === 'fail' ? ' · failed only' : ''})`, margin + 4, y + 3);
      y += 5;

      autoTable(doc, {
        startY: y,
        head: [['Row #', 'Value', 'Status', 'Reason']],
        body: filtered.map(d => [
          String(d.rowIndex + 1),
          d.value !== null && d.value !== undefined ? String(d.value) : '<empty>',
          d.passed ? 'Pass' : 'Fail',
          d.reason ?? '—',
        ]),
        margin: { left: margin + 4, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center' },
          1: { cellWidth: 35 },
          2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 'auto' },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2) {
            data.cell.styles.textColor = data.cell.text[0] === 'Pass' ? [22, 163, 74] : [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && !filtered[data.row.index]?.passed) {
            if (data.column.index !== 2) {
              data.cell.styles.fillColor = [255, 242, 242];
            }
          }
        },
        alternateRowStyles: {},
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    }
    y += 4;
  }

  // ── Footer on each page ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Quality Plus — ${datasetName}`, margin, 293);
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, 293, { align: 'right' });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, 290, pageW - margin, 290);
  }

  const filename = `quality_report_${datasetName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}
