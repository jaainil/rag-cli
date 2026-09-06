import fs from 'fs';
import path from 'path';
import { PreShipmentAuditReport } from '../types/preshipment';

export class PreShipmentExporter {
  public static exportReport(
    report: PreShipmentAuditReport,
    format: 'json' | 'csv' | 'html',
    outputPath?: string
  ): string {
    const timestamp = report.auditedAt.replace(/[:.]/g, '-');
    const sanitizedShipment = report.shipmentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultFilename = `preshipment_audit_${sanitizedShipment}_${timestamp}.${format}`;
    const targetPath = outputPath ? path.resolve(outputPath) : path.resolve(process.cwd(), defaultFilename);

    let content = '';

    if (format === 'json') {
      content = JSON.stringify(report, null, 2);
    } else if (format === 'csv') {
      content = this.generateCSV(report);
    } else if (format === 'html') {
      content = this.generateHTML(report);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, content, 'utf-8');
    return targetPath;
  }

  private static generateCSV(report: PreShipmentAuditReport): string {
    const rows: string[][] = [
      [
        'Audit ID',
        'Shipment ID',
        'Product Name',
        'Batch Number',
        'Product Type',
        'Overall Decision',
        'Gate Number',
        'Gate Name',
        'Check ID',
        'Check Description',
        'Status',
        'Hard Stop Trigger',
        'Details',
        'CFR Reference',
        'FDA Subsystem',
      ],
    ];

    for (const gate of report.gates) {
      for (const check of gate.checks) {
        rows.push([
          report.id,
          report.shipmentId,
          `"${report.productName.replace(/"/g, '""')}"`,
          report.batchNumber,
          report.productType,
          report.overallDecision,
          `Gate ${gate.gateNumber}`,
          `"${gate.gateName.replace(/"/g, '""')}"`,
          check.checkId,
          `"${check.label.replace(/"/g, '""')}"`,
          check.status,
          check.isHardStopTrigger ? 'YES' : 'NO',
          `"${check.details.replace(/"/g, '""')}"`,
          `"${(check.cfrReference || '').replace(/"/g, '""')}"`,
          `"${(check.fdaSystem || '').replace(/"/g, '""')}"`,
        ]);
      }
    }

    return rows.map((r) => r.join(',')).join('\n');
  }

  private static generateHTML(report: PreShipmentAuditReport): string {
    const isCleared = report.overallDecision === 'CLEARED_FOR_EXPORT';
    const decisionBadgeClass = isCleared ? 'cleared' : 'stop';
    const decisionText = isCleared
      ? '✔ CLEARED FOR U.S. EXPORT — ALL 10 GATES SATISFIED'
      : '🛑 FINAL GATE 10 DECISION: SHIPMENT MUST BE STOPPED (DO NOT SHIP)';

    const gateCards = report.gates
      .map((gate) => {
        const checkRows = gate.checks
          .map(
            (c) => `
          <tr class="status-${c.status.toLowerCase()}">
            <td style="width: 10%;"><strong>${c.checkId}</strong></td>
            <td style="width: 32%;">
              ${c.label}
              ${c.isHardStopTrigger ? '<span class="hard-stop-pill">HARD STOP GATE</span>' : ''}
            </td>
            <td style="width: 12%;"><span class="badge ${c.status.toLowerCase()}">${c.status}</span></td>
            <td style="width: 26%;">${c.details}</td>
            <td style="width: 20%;"><small><code>${c.cfrReference || 'N/A'}</code><br><span style="color:#64748b;">${c.fdaSystem || ''}</span></small></td>
          </tr>
        `
          )
          .join('');

        return `
        <div class="gate-card">
          <div class="gate-header">
            <div>
              <span class="gate-number">GATE ${gate.gateNumber}</span>
              <span class="gate-title">${gate.gateName}</span>
            </div>
            <span class="badge ${gate.status.toLowerCase()}">${gate.status}</span>
          </div>
          <div class="gate-summary">${gate.summary}</div>
          <table class="check-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Check Requirement</th>
                <th>Status</th>
                <th>Evaluation Details</th>
                <th>Statute & System</th>
              </tr>
            </thead>
            <tbody>
              ${checkRows}
            </tbody>
          </table>
        </div>
      `;
      })
      .join('');

    const hardStopSection =
      report.hardStopTriggers.length > 0
        ? `
      <div class="hard-stop-alert">
        <h2>🛑 Critical Hard Stop Violations Triggered</h2>
        <p>The following non-conformances mandate that shipment dispatch be immediately halted until QA and Regulatory Affairs resolve each finding:</p>
        <ul>
          ${report.hardStopTriggers.map((t) => `<li><strong>${t}</strong></li>`).join('')}
        </ul>
      </div>
    `
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>U.S. Pre-Shipment Regulatory Audit Dossier - ${report.shipmentId}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; background: #f8fafc; color: #1e293b; }
    .header { background: #ffffff; padding: 24px 30px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 24px; }
    h1 { margin: 0 0 12px; font-size: 24px; color: #0f172a; }
    .meta { display: flex; gap: 24px; color: #64748b; font-size: 14px; flex-wrap: wrap; }
    .decision-card { padding: 18px 24px; border-radius: 8px; font-size: 18px; font-weight: 700; margin-bottom: 24px; }
    .decision-card.cleared { background: #f0fdf4; color: #166534; border: 2px solid #22c55e; }
    .decision-card.stop { background: #fef2f2; color: #991b1b; border: 2px solid #ef4444; }
    .stats { display: flex; gap: 16px; margin-top: 18px; }
    .stat-pill { padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; }
    .pill-pass { background: #dcfce7; color: #166534; }
    .pill-fail { background: #fee2e2; color: #991b1b; }
    .pill-warn { background: #fef3c7; color: #92400e; }
    .hard-stop-alert { background: #fef2f2; border: 2px solid #b91c1c; border-radius: 8px; padding: 20px; margin-bottom: 24px; }
    .hard-stop-alert h2 { color: #991b1b; margin-top: 0; font-size: 18px; }
    .hard-stop-alert ul { margin: 10px 0 0; padding-left: 20px; color: #7f1d1d; }
    .gate-card { background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 20px; overflow: hidden; }
    .gate-header { background: #f1f5f9; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; }
    .gate-number { font-weight: 800; color: #0284c7; margin-right: 10px; font-size: 13px; }
    .gate-title { font-weight: 700; font-size: 15px; color: #0f172a; }
    .gate-summary { padding: 10px 20px; background: #fafafa; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9; font-style: italic; }
    .check-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .check-table th { background: #f8fafc; padding: 10px 16px; text-align: left; color: #475569; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    .check-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .badge.pass { background: #22c55e; color: white; }
    .badge.fail { background: #ef4444; color: white; }
    .badge.warning { background: #f59e0b; color: white; }
    .hard-stop-pill { background: #fee2e2; color: #b91c1c; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-left: 6px; display: inline-block; }
    code { background: #f1f5f9; color: #6d28d9; padding: 2px 5px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>U.S. Pharma Export — Pre-Shipment Master Regulatory Audit</h1>
    <div class="meta">
      <div><strong>Shipment ID:</strong> ${report.shipmentId}</div>
      <div><strong>Product:</strong> ${report.productName}</div>
      <div><strong>Batch:</strong> ${report.batchNumber}</div>
      <div><strong>Type:</strong> ${report.productType}</div>
      <div><strong>Audited At:</strong> ${report.auditedAt}</div>
    </div>
    <div class="stats">
      <div class="stat-pill pill-pass">${report.passCount} CHECKS PASSED</div>
      <div class="stat-pill pill-fail">${report.failCount} CHECKS FAILED</div>
      <div class="stat-pill pill-warn">${report.warningCount} WARNINGS</div>
    </div>
  </div>

  <div class="decision-card ${decisionBadgeClass}">
    ${decisionText}
  </div>

  ${hardStopSection}

  ${gateCards}
</body>
</html>`;
  }
}
