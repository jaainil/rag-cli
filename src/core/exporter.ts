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
        'Line Location',
        'Current SOP Flawed Text',
        'Risk Level',
        'Confidence (%)',
        'Compliance Defect',
        'Applicable Regulation',
        'Historical Precedent Source',
        'Historical Precedent Facility',
        'Historical Issuance Date',
        'Historical Enforcement Excerpt (Past Data)',
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
        f.startLine ? String(f.startLine) : 'N/A',
        `"${(f.sopTextSnippet || '').replace(/"/g, '""')}"`,
        f.riskLevel,
        String(f.confidence),
        `"${f.issue.replace(/"/g, '""')}"`,
        `"${f.regulation.replace(/"/g, '""')}"`,
        `"${f.matchedPrecedent.source.replace(/"/g, '""')}"`,
        `"${f.matchedPrecedent.companyRedacted.replace(/"/g, '""')}"`,
        `"${f.matchedPrecedent.dateIssued || ''}"`,
        `"${f.matchedPrecedent.excerpt.replace(/"/g, '""')}"`,
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
        <td><span class="badge ${f.riskLevel.toLowerCase()}">${f.riskLevel}</span><br><small style="color:#64748b;font-weight:600;">${f.confidence}% conf</small></td>
        <td>
          <strong>Section ${f.sectionRef}</strong>: ${f.sectionTitle}
          ${f.startLine ? `<span class="line-tag">Line ${f.startLine}</span>` : ''}
          <div class="sop-quote-box">
            <div class="quote-header">Audited SOP Text:</div>
            <div class="quote-body">"${f.sopTextSnippet || 'N/A'}"</div>
          </div>
        </td>
        <td>
          <div class="defect-desc">${f.issue}</div>
          <div class="regulation-tag"><code>${f.regulation}</code></div>
        </td>
        <td>
          <div class="precedent-title">${f.matchedPrecedent.source}</div>
          <div class="precedent-meta">${f.matchedPrecedent.companyRedacted} &bull; ${f.matchedPrecedent.dateIssued}</div>
          <blockquote class="past-excerpt">"${f.matchedPrecedent.excerpt}"</blockquote>
        </td>
        <td>
          <div class="remediation-text">${f.remediationRecommendation}</div>
        </td>
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
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 30px; background: #f8fafc; color: #1e293b; }
    .header { background: #ffffff; padding: 24px 30px; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 24px; }
    h1 { margin: 0 0 12px; font-size: 24px; color: #0f172a; }
    .meta { display: flex; gap: 24px; color: #64748b; font-size: 14px; }
    .stats { display: flex; gap: 16px; margin-top: 18px; }
    .stat-pill { padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; }
    .pill-high { background: #fee2e2; color: #991b1b; }
    .pill-med { background: #fef3c7; color: #92400e; }
    .pill-low { background: #e0f2fe; color: #075985; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    th { background: #f1f5f9; padding: 14px 16px; text-align: left; font-size: 13px; color: #475569; border-bottom: 2px solid #e2e8f0; }
    td { padding: 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; vertical-align: top; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .badge.high { background: #ef4444; color: white; }
    .badge.medium { background: #f59e0b; color: white; }
    .badge.low { background: #0ea5e9; color: white; }
    .line-tag { display: inline-block; background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 6px; }
    .sop-quote-box { margin-top: 10px; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 0 6px 6px 0; }
    .quote-header { font-size: 11px; font-weight: 700; color: #92400e; text-transform: uppercase; margin-bottom: 4px; }
    .quote-body { font-size: 12px; font-style: italic; color: #78350f; line-height: 1.4; }
    .defect-desc { font-weight: 600; color: #b91c1c; margin-bottom: 8px; font-size: 13px; }
    .regulation-tag { margin-top: 4px; }
    code { background: #f1f5f9; color: #6d28d9; padding: 3px 6px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .precedent-title { font-weight: 700; color: #0369a1; font-size: 13px; }
    .precedent-meta { color: #64748b; font-size: 12px; margin: 2px 0 6px; }
    .past-excerpt { margin: 0; padding-left: 10px; border-left: 2px solid #cbd5e1; font-size: 12px; font-style: italic; color: #475569; }
    .remediation-text { font-size: 13px; color: #166534; line-height: 1.4; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 8px 10px; border-radius: 6px; }
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
        <th style="width: 10%;">Severity</th>
        <th style="width: 28%;">Current SOP Location & Audited Text</th>
        <th style="width: 22%;">Identified Defect & Regulation</th>
        <th style="width: 24%;">Cited Historical FDA Precedent (Past Data)</th>
        <th style="width: 16%;">Remediation Guidance</th>
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
