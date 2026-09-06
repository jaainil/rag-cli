import dotenv from 'dotenv';
dotenv.config();

import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { PreShipmentAuditor } from '../src/core/preShipmentAuditor';
import { PreShipmentExporter } from '../src/core/preShipmentExporter';

describe('U.S. Pharma Pre-Shipment 10-Gate Regulatory Master Checklist', () => {
  it('should audit fully-compliant finished formulation and CLEAR for export across all 10 gates', () => {
    const manifestPath = path.join(
      __dirname,
      '..',
      'sample_shipments',
      'atorvastatin_tablets_export_pass.json'
    );
    const dossier = PreShipmentAuditor.loadDossierFromFile(manifestPath);
    const report = PreShipmentAuditor.auditDossier(dossier);

    assert.strictEqual(report.shipmentId, 'EXP-US-2024-8801');
    assert.strictEqual(report.productName, 'Atorvastatin Calcium Tablets USP');
    assert.strictEqual(report.overallDecision, 'CLEARED_FOR_EXPORT');
    assert.strictEqual(report.hardStopTriggers.length, 0);
    assert.strictEqual(report.failCount, 0);
    assert.strictEqual(report.gates.length, 10);

    // All 10 gates must pass
    for (const gate of report.gates) {
      assert.strictEqual(gate.status, 'PASS', `Gate ${gate.gateNumber} (${gate.gateName}) should pass`);
    }
  });

  it('should detect multiple hard stops and mandate STOP_DO_NOT_SHIP for non-compliant shipment', () => {
    const manifestPath = path.join(
      __dirname,
      '..',
      'sample_shipments',
      'amoxicillin_capsules_export_fail.json'
    );
    const dossier = PreShipmentAuditor.loadDossierFromFile(manifestPath);
    const report = PreShipmentAuditor.auditDossier(dossier);

    assert.strictEqual(report.shipmentId, 'EXP-US-2024-9104');
    assert.strictEqual(report.overallDecision, 'STOP_DO_NOT_SHIP');
    assert.ok(report.hardStopTriggers.length >= 3, 'Multiple hard stops must be recorded');
    assert.ok(report.failCount >= 5, 'Multiple checks must fail');

    // Gate 1 (Facility registration) must fail
    const g1 = report.gates.find((g) => g.gateNumber === 1);
    assert.strictEqual(g1?.status, 'FAIL');

    // Gate 6 (Batch release - missing QA release signoff) must fail
    const g6 = report.gates.find((g) => g.gateNumber === 6);
    assert.strictEqual(g6?.status, 'FAIL');

    // Gate 8 (Import Alert 66-40) must fail
    const g8 = report.gates.find((g) => g.gateNumber === 8);
    assert.strictEqual(g8?.status, 'FAIL');

    // Gate 10 (Final DO NOT SHIP Gate) must be FAIL
    const g10 = report.gates.find((g) => g.gateNumber === 10);
    assert.strictEqual(g10?.status, 'FAIL');
  });

  it('should audit API bulk shipment under DMF / ICH Q7 and clear for export', () => {
    const manifestPath = path.join(
      __dirname,
      '..',
      'sample_shipments',
      'metformin_api_export_pass.json'
    );
    const dossier = PreShipmentAuditor.loadDossierFromFile(manifestPath);
    const report = PreShipmentAuditor.auditDossier(dossier);

    assert.strictEqual(report.productType, 'API');
    assert.strictEqual(report.overallDecision, 'CLEARED_FOR_EXPORT');
    assert.strictEqual(report.hardStopTriggers.length, 0);

    const g4 = report.gates.find((g) => g.gateNumber === 4);
    assert.strictEqual(g4?.status, 'PASS');
    assert.ok(g4?.summary.includes('DMF_API'));
  });

  it('should export pre-shipment audit reports to valid JSON, CSV, and HTML defense dossiers', () => {
    const manifestPath = path.join(
      __dirname,
      '..',
      'sample_shipments',
      'atorvastatin_tablets_export_pass.json'
    );
    const dossier = PreShipmentAuditor.loadDossierFromFile(manifestPath);
    const report = PreShipmentAuditor.auditDossier(dossier);

    const jsonPath = path.join(__dirname, '..', 'test_preship_out.json');
    const csvPath = path.join(__dirname, '..', 'test_preship_out.csv');
    const htmlPath = path.join(__dirname, '..', 'test_preship_out.html');

    try {
      PreShipmentExporter.exportReport(report, 'json', jsonPath);
      PreShipmentExporter.exportReport(report, 'csv', csvPath);
      PreShipmentExporter.exportReport(report, 'html', htmlPath);

      assert.ok(fs.existsSync(jsonPath));
      assert.ok(fs.existsSync(csvPath));
      assert.ok(fs.existsSync(htmlPath));

      const parsedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      assert.strictEqual(parsedJson.overallDecision, 'CLEARED_FOR_EXPORT');

      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      assert.ok(csvContent.includes('Gate 1'));
      assert.ok(csvContent.includes('CLEARED_FOR_EXPORT'));

      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      assert.ok(htmlContent.includes('U.S. Pharma Export — Pre-Shipment Master Regulatory Audit'));
      assert.ok(htmlContent.includes('CLEARED FOR U.S. EXPORT'));
    } finally {
      if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
    }
  });
});
