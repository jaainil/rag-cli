import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { handleScan } from '../src/commands/scan';
import { ReportExporter } from '../src/core/exporter';

describe('End-to-End Scan & Exporter', () => {
  it('should scan sample SOP and flag Section 4.2, 6.1, 9.0', async () => {
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_deviation_handling.md');
    const report = await handleScan(docPath, {});

    assert.ok(report.sectionCount >= 8);
    assert.ok(report.flagCount >= 3);

    const flag42 = report.flags.find((f) => f.sectionRef === '4.2');
    assert.ok(flag42, 'Section 4.2 should be flagged');
    assert.strictEqual(flag42.riskLevel, 'HIGH');
    assert.strictEqual(flag42.confidence, 87);

    const flag61 = report.flags.find((f) => f.sectionRef === '6.1');
    assert.ok(flag61, 'Section 6.1 should be flagged');
    assert.strictEqual(flag61.riskLevel, 'MEDIUM');
    assert.strictEqual(flag61.confidence, 71);

    const flag90 = report.flags.find((f) => f.sectionRef === '9.0');
    assert.ok(flag90, 'Section 9.0 should be flagged');
    assert.strictEqual(flag90.riskLevel, 'LOW');
    assert.strictEqual(flag90.confidence, 54);
  });

  it('should export scan report to valid JSON, CSV, and HTML', async () => {
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_cleaning_validation.txt');
    const report = await handleScan(docPath, {});

    const jsonPath = path.join(__dirname, '..', 'test_out.json');
    const csvPath = path.join(__dirname, '..', 'test_out.csv');
    const htmlPath = path.join(__dirname, '..', 'test_out.html');

    try {
      ReportExporter.exportReport(report, 'json', jsonPath);
      ReportExporter.exportReport(report, 'csv', csvPath);
      ReportExporter.exportReport(report, 'html', htmlPath);

      assert.ok(fs.existsSync(jsonPath));
      assert.ok(fs.existsSync(csvPath));
      assert.ok(fs.existsSync(htmlPath));

      const parsedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      assert.strictEqual(parsedJson.filename, 'sop_cleaning_validation.txt');

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      assert.ok(csvContent.includes('21 CFR 211.67'));

      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      assert.ok(htmlContent.includes('Pharma SOP Compliance Audit Report'));
    } finally {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  });
});
