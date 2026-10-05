import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MonthlyRatesDoc, PieceSize, ProductionRecord, Worker } from '../types';
import { formatNumber, getMonthName, getMonthlyRate } from './formatters';

interface GeneratePdfOptions {
  companyName: string;
  month: string;
  workers: Worker[];
  pieceSizes: PieceSize[];
  monthlyRates?: MonthlyRatesDoc[];
  productionRecords: ProductionRecord[];
}

export function generateMonthlyPaymentPdf({
  companyName,
  month,
  workers,
  pieceSizes,
  monthlyRates = [],
  productionRecords,
}: GeneratePdfOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const monthRecords = productionRecords.filter((r) => r.month === month);
  const monthDisplay = getMonthName(month);
  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(companyName || 'PRODUCTION MANAGEMENT SYSTEM', 14, 18);

  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(`MONTHLY PRODUCTION & PAYMENT REPORT`, 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Billing Month: ${monthDisplay}`, 14, 31);
  doc.text(`Generated On: ${generatedDate} (IST)`, 14, 36);

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 39, 196, 39);

  // Compute summary for each worker
  const activeWorkers = workers.filter((w) => {
    // Show worker if active OR has records in this month
    const hasRecords = monthRecords.some((r) => r.workerId === w.id && r.quantity > 0);
    return w.status === 'active' || hasRecords;
  });

  let grandTotalPieces = 0;
  let grandTotalAmount = 0;

  const workerSummaries = activeWorkers.map((w, idx) => {
    const wRecords = monthRecords.filter((r) => r.workerId === w.id);
    let workerPieces = 0;
    let workerAmount = 0;

    const pieceBreakdown: Record<string, { quantity: number; rate: number; amount: number }> = {};

    pieceSizes.forEach((ps) => {
      const psRecords = wRecords.filter((r) => r.pieceSizeId === ps.id);
      const qty = psRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);

      // Find applicable rate using monthlyRates
      const rate = getMonthlyRate(monthlyRates, ps.id, month, 0);
      const amt = qty * rate;

      pieceBreakdown[ps.id] = { quantity: qty, rate, amount: amt };
      workerPieces += qty;
      workerAmount += amt;
    });

    grandTotalPieces += workerPieces;
    grandTotalAmount += workerAmount;

    return {
      index: idx + 1,
      id: w.id,
      name: w.fullName,
      firstName: w.firstName,
      totalPieces: workerPieces,
      totalAmount: workerAmount,
      breakdown: pieceBreakdown,
    };
  });

  // Table 1: Master Summary Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('1. WORKER SUMMARY & NET PAYABLE', 14, 46);

  const summaryRows = workerSummaries.map((ws) => [
    ws.index.toString(),
    ws.name,
    formatNumber(ws.totalPieces) + ' pcs',
    'Rs. ' + formatNumber(ws.totalAmount),
  ]);

  // Grand total row
  summaryRows.push([
    '',
    'GRAND TOTAL',
    formatNumber(grandTotalPieces) + ' pcs',
    'Rs. ' + formatNumber(grandTotalAmount),
  ]);

  autoTable(doc, {
    startY: 49,
    head: [['#', 'Worker Name', 'Total Production', 'Total Net Amount (Rs.)']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 45, halign: 'right' },
      3: { cellWidth: 55, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Highlight Grand Total row
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Table 2: Detailed Piece Size Breakdown
  let currentY = (doc as any).lastAutoTable?.finalY + 10 || 120;
  if (currentY > 230) {
    doc.addPage();
    currentY = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('2. DETAILED PRODUCTION BREAKDOWN BY PIECE SIZE', 14, currentY);

  const detailRows: any[] = [];

  workerSummaries.forEach((ws) => {
    let firstRow = true;
    pieceSizes.forEach((ps) => {
      const b = ws.breakdown[ps.id];
      if (b && (b.quantity > 0 || pieceSizes.length <= 4)) {
        detailRows.push([
          firstRow ? ws.firstName : '',
          ps.displayName,
          formatNumber(b.quantity),
          'Rs. ' + b.rate.toFixed(2),
          'Rs. ' + formatNumber(b.amount),
        ]);
        firstRow = false;
      }
    });

    // Subtotal for worker
    detailRows.push([
      '',
      `Subtotal (${ws.firstName})`,
      formatNumber(ws.totalPieces),
      '-',
      'Rs. ' + formatNumber(ws.totalAmount),
    ]);
  });

  autoTable(doc, {
    startY: currentY + 3,
    head: [['Worker', 'Piece Size', 'Quantity (pcs)', 'Piece Rate', 'Payable Amount']],
    body: detailRows,
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: 'bold' },
      1: { cellWidth: 45 },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 37, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Subtotal rows styling
      const cellContent = data.row.raw?.[1];
      if (typeof cellContent === 'string' && cellContent.startsWith('Subtotal')) {
        data.cell.styles.fillColor = [248, 250, 252];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer Signatures
  let finalY = (doc as any).lastAutoTable?.finalY + 15 || 250;
  if (finalY > 260) {
    doc.addPage();
    finalY = 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Prepared By: Supervisor', 14, finalY);
  doc.text('Verified & Approved By: Factory Administrator', 110, finalY);
  doc.line(14, finalY + 12, 65, finalY + 12);
  doc.line(110, finalY + 12, 175, finalY + 12);
  doc.text('(Signature / Date)', 14, finalY + 16);
  doc.text('(Signature / Date)', 110, finalY + 16);

  // Save the PDF
  const filename = `Production_Report_${month}_${companyName.replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
}

export interface GenerateWorkerSlipOptions {
  companyName: string;
  month: string;
  worker: Worker;
  pieceSizes: PieceSize[];
  monthlyRates?: MonthlyRatesDoc[];
  productionRecords: ProductionRecord[];
}

export function generateWorkerMonthlySlipPdf({
  companyName,
  month,
  worker,
  pieceSizes,
  monthlyRates = [],
  productionRecords,
}: GenerateWorkerSlipOptions) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const monthRecords = productionRecords.filter(
    (r) => r.month === month && r.workerId === worker.id
  );
  const monthDisplay = getMonthName(month);
  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text(companyName || 'PRODUCTION MANAGEMENT SYSTEM', 14, 18);

  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105);
  doc.text(`WORKER MONTHLY PRODUCTION & WAGE SLIP`, 14, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Worker: ${worker.fullName} (${worker.firstName})`, 14, 31);
  doc.text(`Billing Month: ${monthDisplay}`, 14, 36);
  doc.text(`Generated On: ${generatedDate} (IST)`, 14, 41);

  // Divider
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 44, 196, 44);

  // Calculate Breakdown
  let totalPieces = 0;
  let totalAmount = 0;
  const breakdownRows: any[] = [];

  pieceSizes.forEach((ps) => {
    const psRecords = monthRecords.filter((r) => r.pieceSizeId === ps.id);
    const qty = psRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
    const rate = getMonthlyRate(monthlyRates, ps.id, month, 0);
    const amt = qty * rate;

    totalPieces += qty;
    totalAmount += amt;

    breakdownRows.push([
      ps.displayName,
      formatNumber(qty) + ' pcs',
      'Rs. ' + rate.toFixed(2),
      'Rs. ' + formatNumber(amt),
    ]);
  });

  // Grand total row
  breakdownRows.push([
    'TOTAL NET PAYABLE',
    formatNumber(totalPieces) + ' pcs',
    '-',
    'Rs. ' + formatNumber(totalAmount),
  ]);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('1. PIECE-RATE EARNINGS BREAKDOWN', 14, 51);

  autoTable(doc, {
    startY: 54,
    head: [['Piece Size', 'Total Pieces', 'Piece Rate', 'Payable Amount (Rs.)']],
    body: breakdownRows,
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 9.5, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold' },
      1: { cellWidth: 40, halign: 'right' },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 52, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === breakdownRows.length - 1) {
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Daily log summary table
  let currentY = (doc as any).lastAutoTable?.finalY + 10 || 110;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('2. DAILY SHIFT PRODUCTION LOG (DAYS 1-31)', 14, currentY);

  const dailyRows: any[] = [];
  const daysInMonth = new Date(parseInt(month.split('-')[0], 10), parseInt(month.split('-')[1], 10), 0).getDate();
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dayRecords = monthRecords.filter((r) => r.day === d);
    if (dayRecords.length > 0) {
      const summaryParts = dayRecords.map((r) => {
        if (r.attendanceStatus === 'P') return 'P (Present)';
        if (r.attendanceStatus === 'X') return 'X (Absent)';
        return `${r.pieceSizeName}: ${formatNumber(r.quantity)} pcs`;
      });
      const dayTotal = dayRecords.reduce((s, r) => s + (r.quantity || 0), 0);
      dailyRows.push([
        `Day ${String(d).padStart(2, '0')}`,
        summaryParts.join(' | '),
        formatNumber(dayTotal) + ' pcs',
      ]);
    }
  }

  if (dailyRows.length > 0) {
    autoTable(doc, {
      startY: currentY + 3,
      head: [['Day', 'Production Entries', 'Day Total']],
      body: dailyRows,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 115 },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // Footer Signatures
  let finalY = (doc as any).lastAutoTable?.finalY + 15 || 240;
  if (finalY > 260) {
    doc.addPage();
    finalY = 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Worker Signature: __________________', 14, finalY);
  doc.text('Authorized By: Factory Administrator', 110, finalY);
  doc.text(`Date: __________________`, 14, finalY + 8);
  doc.text('Signature: __________________', 110, finalY + 8);

  const filename = `Salary_Slip_${worker.firstName}_${month}.pdf`;
  doc.save(filename);
}
