import fs from 'fs';
import path from 'path';
import { ScanReport } from '../types';

export class ReportExporter {
  public static exportReport(
    report: ScanReport,
    format: 'json' | 'csv' | 'html',
    outputPath?: string
  ): string {
    const timestamp = report.scannedAt.replace(/[:.]/g, '-');
    const sanitizedBase = path.basename(report.filename).replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultFilename = `compliance_report_${sanitizedBase}_${timestamp}.${format}`;
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

  private static generateCSV(report: ScanReport): string {
    const rows: string[][] = [
      [
        'Scan ID',
        'SOP File',
        'Scanned At',
        'Section Ref',
        'Section Title',
        'Risk Level',
        'Confidence (%)',
        'Issue Summary',
        'Regulation',
        'Precedent Source',
        'Precedent Company',
        'Remediation Guidance',
      ],
    ];

    for (const f of report.flags) {
      rows.push([
        report.id,
        report.filename,
        report.scannedAt,
        f.sectionRef,
        `"${f.sectionTitle.replace(/"/g, '""')}"`,
        f.riskLevel,
        String(f.confidence),
        `"${f.issue.replace(/"/g, '""')}"`,
        `"${f.regulation.replace(/"/g, '""')}"`,
        `"${f.matchedPrecedent.source.replace(/"/g, '""')}"`,
        `"${f.matchedPrecedent.companyRedacted.replace(/"/g, '""')}"`,
        `"${f.remediationRecommendation.replace(/"/g, '""')}"`,
      ]);
    }

    return rows.map((r) => r.join(',')).join('\n');
  }

  private static generateHTML(report: ScanReport): string {
    const flagRows = report.flags
      .map(
        (f) => `
      <tr class="risk-${f.riskLevel.toLowerCase()}">
        <td><span class="badge ${f.riskLevel.toLowerCase()}">${f.riskLevel}</span></td>
        <td><strong>Section ${f.sectionRef}</strong>: ${f.sectionTitle}</td>
        <td>${f.issue}</td>
        <td><code>${f.regulation}</code></td>
        <td>${f.matchedPrecedent.source} (<em>${f.matchedPrecedent.companyRedacted}</em>)</td>
        <td><strong>${f.confidence}%</strong></td>
        <td>${f.remediationRecommendation}</td>
      </tr>
    `
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SOP Compliance Audit Report - ${report.filename}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #f8fafc; color: #1e293b; }
    .header { background: #ffffff; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
    h1 { margin: 0 0 10px; font-size: 24px; color: #0f172a; }
    .meta { display: flex; gap: 20px; color: #64748b; font-size: 14px; }
    .stats { display: flex; gap: 16px; margin-top: 16px; }
    .stat-pill { padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; }
    .pill-high { background: #fee2e2; color: #991b1b; }
    .pill-med { background: #fef3c7; color: #92400e; }
    .pill-low { background: #e0f2fe; color: #075985; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th { background: #f1f5f9; padding: 12px 16px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; vertical-align: top; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .badge.high { background: #ef4444; color: white; }
    .badge.medium { background: #f59e0b; color: white; }
    .badge.low { background: #0ea5e9; color: white; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Pharma SOP Compliance Audit Report</h1>
    <div class="meta">
      <div><strong>File:</strong> ${report.filename}</div>
      <div><strong>Scanned:</strong> ${report.scannedAt}</div>
      <div><strong>Sections:</strong> ${report.sectionCount}</div>
      <div><strong>Flags:</strong> ${report.flagCount}</div>
    </div>
    <div class="stats">
      <div class="stat-pill pill-high">${report.highCount} HIGH RISK</div>
      <div class="stat-pill pill-med">${report.mediumCount} MEDIUM RISK</div>
      <div class="stat-pill pill-low">${report.lowCount} LOW RISK</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Section</th>
        <th>Issue Description</th>
        <th>Applicable Regulation</th>
        <th>Precedent Match</th>
        <th>Confidence</th>
        <th>Remediation Recommendation</th>
      </tr>
    </thead>
    <tbody>
      ${flagRows}
    </tbody>
  </table>
</body>
</html>`;
  }
}
