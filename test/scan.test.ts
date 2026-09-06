import dotenv from 'dotenv';
dotenv.config();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { handleScan } from '../src/commands/scan';
import { ReportExporter } from '../src/core/exporter';

describe('End-to-End Scan & Exporter', () => {
  it('should scan sample SOP and flag Section 4.2, 6.1, 9.0', async () => {
    process.env.LLM_PROVIDER = 'offline';
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_deviation_handling.md');
    const report = await handleScan(docPath, {});

    assert.ok(report.sectionCount >= 8);
    assert.ok(report.flagCount >= 3);

    const flag42 = report.flags.find((f) => f.sectionRef === '4.2');
    assert.ok(flag42, 'Section 4.2 should be flagged');
    assert.strictEqual(flag42.riskLevel, 'HIGH');
    assert.strictEqual(flag42.confidence, 87);
    assert.ok(flag42.startLine && flag42.startLine >= 28, 'Section 4.2 startLine should be identified');
    assert.ok(flag42.sopTextSnippet && flag42.sopTextSnippet.includes('as soon as feasible'), 'Section 4.2 sopTextSnippet should quote flawed text');
    assert.ok(flag42.matchedPrecedent.source, 'Historical precedent source must be cited');
    assert.ok(flag42.matchedPrecedent.excerpt, 'Historical precedent excerpt must be cited');

    const flag61 = report.flags.find((f) => f.sectionRef === '6.1');
    assert.ok(flag61, 'Section 6.1 should be flagged');
    assert.strictEqual(flag61.riskLevel, 'MEDIUM');
    assert.strictEqual(flag61.confidence, 71);
    assert.ok(flag61.startLine && flag61.startLine >= 34);
    assert.ok(flag61.sopTextSnippet);

    const flag90 = report.flags.find((f) => f.sectionRef === '9.0');
    assert.ok(flag90, 'Section 9.0 should be flagged');
    assert.strictEqual(flag90.riskLevel, 'LOW');
    assert.strictEqual(flag90.confidence, 54);
    assert.ok(flag90.startLine && flag90.startLine >= 43);
    assert.ok(flag90.sopTextSnippet);
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
      assert.ok(parsedJson.flags[0].sopTextSnippet);

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      assert.ok(csvContent.includes('21 CFR 211.67'));
      assert.ok(csvContent.includes('Current SOP Flawed Text'));
      assert.ok(csvContent.includes('Historical Precedent Source'));

      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      assert.ok(htmlContent.includes('Pharma SOP Compliance Audit Report'));
      assert.ok(htmlContent.includes('sop-quote-box'));
      assert.ok(htmlContent.includes('Audited SOP Text:'));
    } finally {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  });
});
