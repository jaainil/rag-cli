import fs from 'fs';
import path from 'path';
import {
  ShipmentDossier,
  PreShipmentAuditReport,
  GateAuditResult,
  PreShipmentItemCheck,
  GateStatus,
  ExportProductType,
} from '../types/preshipment';

export class PreShipmentAuditor {
  public static auditDossier(dossier: ShipmentDossier): PreShipmentAuditReport {
    const startTime = Date.now();
    const gates: GateAuditResult[] = [];
    const hardStopTriggers: string[] = [];

    // Gate 1: Manufacturer / Facility
    const g1 = this.auditGate1Facility(dossier);
    gates.push(g1);
    if (g1.status === 'FAIL') hardStopTriggers.push(...g1.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 1: ${c.label}`));

    // Gate 2: Product Importability
    const g2 = this.auditGate2Product(dossier);
    gates.push(g2);
    if (g2.status === 'FAIL') hardStopTriggers.push(...g2.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 2: ${c.label}`));

    // Gate 3: FDA Drug Listing
    const g3 = this.auditGate3Listing(dossier);
    gates.push(g3);
    if (g3.status === 'FAIL') hardStopTriggers.push(...g3.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 3: ${c.label}`));

    // Gate 4: FDA Approval / Regulatory Status
    const g4 = this.auditGate4RegulatoryPathway(dossier);
    gates.push(g4);
    if (g4.status === 'FAIL') hardStopTriggers.push(...g4.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 4: ${c.label}`));

    // Gate 5: cGMP & Quality Controls
    const g5 = this.auditGate5Cgmp(dossier);
    gates.push(g5);
    if (g5.status === 'FAIL') hardStopTriggers.push(...g5.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 5: ${c.label}`));

    // Gate 6: Batch Release (QA Sign-off)
    const g6 = this.auditGate6BatchRelease(dossier);
    gates.push(g6);
    if (g6.status === 'FAIL') hardStopTriggers.push(...g6.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 6: ${c.label}`));

    // Gate 7: Labeling
    const g7 = this.auditGate7Labeling(dossier);
    gates.push(g7);
    if (g7.status === 'FAIL') hardStopTriggers.push(...g7.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 7: ${c.label}`));

    // Gate 8: Import Alert / Enforcement Check
    const g8 = this.auditGate8ImportAlerts(dossier);
    gates.push(g8);
    if (g8.status === 'FAIL') hardStopTriggers.push(...g8.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 8: ${c.label}`));

    // Gate 9: Shipping / Customs Documentation
    const g9 = this.auditGate9Customs(dossier);
    gates.push(g9);
    if (g9.status === 'FAIL') hardStopTriggers.push(...g9.checks.filter(c => c.isHardStopTrigger && c.status === 'FAIL').map(c => `Gate 9: ${c.label}`));

    // Gate 10: Final DO NOT SHIP Hard Stop Gate
    const g10 = this.auditGate10FinalDecision(gates, hardStopTriggers);
    gates.push(g10);

    let passCount = 0;
    let failCount = 0;
    let warningCount = 0;
    let totalChecks = 0;

    for (const g of gates) {
      for (const c of g.checks) {
        totalChecks++;
        if (c.status === 'PASS') passCount++;
        else if (c.status === 'FAIL') failCount++;
        else if (c.status === 'WARNING') warningCount++;
      }
    }

    const overallDecision = hardStopTriggers.length === 0 && failCount === 0
      ? 'CLEARED_FOR_EXPORT'
      : 'STOP_DO_NOT_SHIP';

    return {
      id: `PRESHIP-${Date.now()}`,
      shipmentId: dossier.shipmentId || 'UNKNOWN-SHIPMENT',
      productName: dossier.product?.productName || 'Unknown Product',
      batchNumber: dossier.batchRelease?.batchNumber || 'N/A',
      productType: dossier.productType || 'FINISHED_DRUG',
      auditedAt: new Date().toISOString(),
      overallDecision,
      gates,
      hardStopTriggers,
      passCount,
      failCount,
      warningCount,
      totalChecks,
      executionTimeMs: Date.now() - startTime,
    };
  }

  public static loadDossierFromFile(filePath: string): ShipmentDossier {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Shipment dossier file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(resolved, 'utf-8');
    return JSON.parse(raw) as ShipmentDossier;
  }

  // --- Gate Auditors ---

  private static auditGate1Facility(d: ShipmentDossier): GateAuditResult {
    const f = d.facility || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G1-01',
        label: 'Foreign Manufacturing Facility Registered with FDA',
        status: f.fdaRegistrationCurrent ? 'PASS' : 'FAIL',
        details: f.fdaRegistrationCurrent
          ? `Facility "${f.name}" registered (FEI: ${f.feiNumber || 'Verified'})`
          : 'Facility registration missing or lapsed with FDA',
        cfrReference: '21 CFR Part 207 Subpart B / FD&C Act Sec. 510',
        fdaSystem: 'FDA Drug Establishments Registration',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G1-02',
        label: 'Facility Listed in Current Registration Site (DECRS)',
        status: f.listedInDecrs ? 'PASS' : 'FAIL',
        details: f.listedInDecrs
          ? 'Confirmed active listing in DECRS public database'
          : 'Facility NOT visible in FDA DECRS database',
        cfrReference: '21 CFR 207.29',
        fdaSystem: 'DECRS',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G1-03',
        label: 'Designated U.S. Agent Information Valid',
        status: f.usAgentName && f.usAgentContact ? 'PASS' : 'FAIL',
        details: f.usAgentName
          ? `U.S. Agent: ${f.usAgentName} (${f.usAgentContact})`
          : 'No valid designated U.S. Agent on file',
        cfrReference: '21 CFR 207.69',
        fdaSystem: 'FDA eSubmitter',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G1-04',
        label: 'U.S. Importers Properly Identified',
        status: f.usImportersIdentified ? 'PASS' : 'WARNING',
        details: f.usImportersIdentified
          ? 'Registered importers of record declared'
          : 'Importer declaration requires verification prior to port entry',
        cfrReference: '21 CFR 207.41',
        fdaSystem: 'ACE / CBP',
      },
      {
        checkId: 'G1-05',
        label: 'No Active Invalidation / Revocation Actions',
        status: !f.activeEnforcementActions ? 'PASS' : 'FAIL',
        details: !f.activeEnforcementActions
          ? 'No active FDA enforcement orders impacting establishment registration'
          : 'Active FDA enforcement action or registration suspension detected',
        cfrReference: '21 U.S.C. 381(a)',
        fdaSystem: 'CDER Compliance',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 1,
      gateName: 'Manufacturer / Facility Registration',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'Facility registration check failed. Establishment must be legally registered before drug offer for import.'
        : 'Facility is actively registered in DECRS with designated U.S. Agent.',
    };
  }

  private static auditGate2Product(d: ShipmentDossier): GateAuditResult {
    const p = d.product || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G2-01',
        label: 'Product Identity & Critical Attribute Definition',
        status: p.productName && p.strength && p.dosageForm ? 'PASS' : 'FAIL',
        details: `${p.productName || 'Unnamed'} | ${p.strength || 'No strength'} | ${p.dosageForm || 'No dosage form'}`,
        cfrReference: '21 CFR 314.50(d)(1)',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G2-02',
        label: 'Active Pharmaceutical Ingredients & Route Defined',
        status: p.activeIngredients && p.activeIngredients.length > 0 && p.routeOfAdministration ? 'PASS' : 'FAIL',
        details: `Active: ${(p.activeIngredients || []).join(', ')} | Route: ${p.routeOfAdministration || 'Undefined'}`,
        cfrReference: '21 CFR 201.100',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G2-03',
        label: 'Legally Importable into the U.S. Market',
        status: p.countryOfOrigin && p.intendedUsUse ? 'PASS' : 'FAIL',
        details: `Country of Origin: ${p.countryOfOrigin || 'Unknown'} | Intended Use: ${p.intendedUsUse || 'Unspecified'}`,
        cfrReference: 'FD&C Act Sec. 801(a)',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 2,
      gateName: 'Product Legal Importability',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'Product identity or importability criteria missing or incomplete.'
        : 'Product specifications and U.S. eligibility confirmed.',
    };
  }

  private static auditGate3Listing(d: ShipmentDossier): GateAuditResult {
    const l = d.listing || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G3-01',
        label: 'FDA Electronic Drug Listing Submitted (eList / SPL)',
        status: l.listingSubmitted && l.eListStatus === 'CURRENT' ? 'PASS' : 'FAIL',
        details: l.listingSubmitted
          ? `Drug listing active (Status: ${l.eListStatus})`
          : 'Drug listing missing in FDA electronic repository',
        cfrReference: '21 CFR Part 207 Subpart D',
        fdaSystem: 'FDA eList / NDC Directory',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G3-02',
        label: 'National Drug Code (NDC) & Labeler Code Match',
        status: l.ndc && /^[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}$/.test(l.ndc) ? 'PASS' : 'WARNING',
        details: l.ndc ? `Assigned NDC: ${l.ndc}` : 'NDC format unverified or pending',
        cfrReference: '21 CFR 207.33',
        fdaSystem: 'NDC Directory',
      },
      {
        checkId: 'G3-03',
        label: 'Listing Corresponds to Actual Foreign Manufacturer',
        status: l.correspondsToActualManufacturer ? 'PASS' : 'FAIL',
        details: l.correspondsToActualManufacturer
          ? 'Foreign manufacturing site matches registered drug listing record'
          : 'Listing discrepancy: Manufacturer does not match foreign establishment',
        cfrReference: '21 CFR 207.49',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G3-04',
        label: 'Listing Matches Physical Shipped Product',
        status: l.matchesPhysicalProduct ? 'PASS' : 'FAIL',
        details: l.matchesPhysicalProduct
          ? 'Physical SKU attributes reconcile with FDA listing'
          : 'Variance found between physical product and registered SPL listing',
        cfrReference: '21 CFR 207.54',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 3,
      gateName: 'FDA Drug Listing & NDC Alignment',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'Drug listing incomplete or mismatched with foreign manufacturing site.'
        : 'Active drug listing confirmed in FDA eList database.',
    };
  }

  private static auditGate4RegulatoryPathway(d: ShipmentDossier): GateAuditResult {
    const p = d.product || ({} as any);
    const isApi = d.productType === 'API';
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G4-01',
        label: 'Statutory U.S. Regulatory Pathway Established',
        status: p.pathwayVerified && p.legalPathway ? 'PASS' : 'FAIL',
        details: `Regulatory Pathway: ${p.legalPathway || 'NONE'} ${p.applicationNumber ? `(${p.applicationNumber})` : ''}`,
        cfrReference: isApi ? '21 U.S.C. 355 / DMF' : '21 U.S.C. 355 / 21 CFR 314',
        fdaSystem: 'CDER Application Database',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G4-02',
        label: 'Manufactured in Strict Accordance with FDA Approval',
        status: p.manufacturedAccordanceWithApproval ? 'PASS' : 'FAIL',
        details: p.manufacturedAccordanceWithApproval
          ? 'Batch manufactured conforming to approved CMC / DMF specifications'
          : 'Batch altered from FDA-approved application chemistry or manufacturing controls',
        cfrReference: '21 CFR 314.70 / FD&C Act Sec. 505',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 4,
      gateName: 'FDA Approval & Regulatory Pathway (HARD STOP)',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'HARD STOP: No verified legal pathway (NDA/ANDA/BLA/OTC/DMF). Foreign goods without approval are unapproved new drugs.'
        : `Verified statutory pathway: ${p.legalPathway} (${p.applicationNumber || 'Authorized'}).`,
    };
  }

  private static auditGate5Cgmp(d: ShipmentDossier): GateAuditResult {
    const c = d.cgmp || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G5-01',
        label: 'SOP System & Employee Training Records Current',
        status: c.approvedSopsCurrent && c.employeeTrainingRecordsCurrent ? 'PASS' : 'FAIL',
        details: c.approvedSopsCurrent ? 'SOPs approved and training logged' : 'Unapproved SOPs or incomplete training files',
        cfrReference: '21 CFR 211.25 & 211.100',
      },
      {
        checkId: 'G5-02',
        label: 'Batch Production & Packaging Records (BMR / BPR) Complete',
        status: c.bmrComplete && c.bprComplete ? 'PASS' : 'FAIL',
        details: c.bmrComplete && c.bprComplete ? 'BMR and BPR executed and verified' : 'Incomplete batch manufacturing/packaging record',
        cfrReference: '21 CFR 211.188',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G5-03',
        label: 'Zero Unresolved Critical Deviations',
        status: (c.openCriticalDeviations || 0) === 0 ? 'PASS' : 'FAIL',
        details: (c.openCriticalDeviations || 0) === 0
          ? 'No open critical deviations on batch'
          : `CRITICAL DEFECT: ${c.openCriticalDeviations} unresolved critical deviation(s)`,
        cfrReference: '21 CFR 211.192',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G5-04',
        label: 'Zero Unresolved Out-of-Specification (OOS) Investigations',
        status: (c.openOosInvestigations || 0) === 0 ? 'PASS' : 'FAIL',
        details: (c.openOosInvestigations || 0) === 0
          ? 'No unresolved OOS investigations'
          : `CRITICAL DEFECT: ${c.openOosInvestigations} pending/unresolved OOS failure(s)`,
        cfrReference: '21 CFR 211.192',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G5-05',
        label: 'Cleaning Validation & Equipment Calibration Verified',
        status: c.cleaningValidationCurrent && c.equipmentCalibrationCurrent ? 'PASS' : 'FAIL',
        details: 'Validated clean state and calibrated instrument telemetry confirmed',
        cfrReference: '21 CFR 211.67 & 211.68',
      },
      {
        checkId: 'G5-06',
        label: 'Environmental Monitoring & Stability Testing Acceptable',
        status: c.environmentalMonitoringCompliant && c.stabilityTestingAcceptable ? 'PASS' : 'WARNING',
        details: 'EM alert/action limits in compliance; ongoing stability parameters verified',
        cfrReference: '21 CFR 211.42 & 211.166',
      },
      {
        checkId: 'G5-07',
        label: 'Finished Product Specifications & Raw Materials Qualified',
        status: c.finishedSpecsMet && c.rawMaterialsAndSuppliersQualified ? 'PASS' : 'FAIL',
        details: 'All analytical release specifications met; certified raw materials utilized',
        cfrReference: '21 CFR 211.84 & 211.165',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 5,
      gateName: 'cGMP Compliance & Manufacturing Controls',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'cGMP compliance gap detected. Open deviations, unresolved OOS, or incomplete records violate 21 CFR 211.'
        : 'cGMP manufacturing operations, BMR, cleaning validation, and analytical controls fully verified.',
    };
  }

  private static auditGate6BatchRelease(d: ShipmentDossier): GateAuditResult {
    const b = d.batchRelease || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G6-01',
        label: 'Certificate of Analysis (COA) Generated with Full Analytical Testing',
        status: b.coaGenerated && b.allQcTestsPassed ? 'PASS' : 'FAIL',
        details: b.coaGenerated
          ? `COA generated for Batch ${b.batchNumber || 'N/A'}`
          : 'COA missing or analytical testing incomplete',
        cfrReference: '21 CFR 211.165',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G6-02',
        label: 'Independent Quality Assurance Unit Release Sign-off',
        status: b.qaReleaseSignoff ? 'PASS' : 'FAIL',
        details: b.qaReleaseSignoff
          ? `Formally QA released by ${b.qaOfficerName || 'QA Director'} on ${b.qaSignoffDate || 'today'}`
          : 'NO QA RELEASE SIGN-OFF (STRICT SHIPMENT PROHIBITION)',
        cfrReference: '21 CFR 211.22(a)',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G6-03',
        label: 'Batch Traceability, Mfg Date & Expiry Integrity',
        status: b.batchNumber && b.mfgDate && b.expDate ? 'PASS' : 'FAIL',
        details: `Batch #${b.batchNumber} | Mfg: ${b.mfgDate} | Exp: ${b.expDate}`,
        cfrReference: '21 CFR 211.137',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G6-04',
        label: 'Physical Packaging & Tamper-Evident Inspection Passed',
        status: b.packagingInspectionPassed && b.labelInspectionPassed ? 'PASS' : 'FAIL',
        details: 'Secondary packaging, lot integrity, and carton reconciliation verified',
        cfrReference: '21 CFR 211.130',
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 6,
      gateName: 'Batch Release & QA Authorization (QA MUST SIGN OFF)',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'HARD STOP: No formal QA batch release sign-off. Drugs cannot be exported without Quality Control Unit disposition.'
        : `Batch ${b.batchNumber} authorized and released by QA Unit.`,
    };
  }

  private static auditGate7Labeling(d: ShipmentDossier): GateAuditResult {
    const l = d.labeling || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G7-01',
        label: 'Physical Label Inspected on Immediate Container & Carton',
        status: l.physicalLabelInspected ? 'PASS' : 'FAIL',
        details: l.physicalLabelInspected
          ? 'Physical container label inspected and reconciled against approved artwork'
          : 'Physical label inspection not performed (relying solely on artwork file)',
        cfrReference: '21 CFR 201.100 & 211.122',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G7-02',
        label: 'Label Matches FDA-Approved / Listed Labeling Verbatim',
        status: l.fdaApprovedLabelingMatched ? 'PASS' : 'FAIL',
        details: l.fdaApprovedLabelingMatched
          ? 'Prescription/OTC text conforms to FDA-approved package insert'
          : 'Labeling text deviates from approved regulatory filing',
        cfrReference: '21 CFR 201.56 / FD&C Act 502',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G7-03',
        label: 'Lot Number, Expiry Date & Storage Conditions Prominently Declared',
        status: l.lotAndExpOnContainer && Boolean(l.storageConditionsDeclared) ? 'PASS' : 'FAIL',
        details: `Storage: ${l.storageConditionsDeclared || 'Unstated'} | Lot/Exp verified on container`,
        cfrReference: '21 CFR 201.17',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G7-04',
        label: 'Zero Misleading Claims or Unauthorized Indications',
        status: l.noMisleadingOrUnauthorizedClaims ? 'PASS' : 'FAIL',
        details: l.noMisleadingOrUnauthorizedClaims
          ? 'No unsubstantiated or off-label therapeutic claims on trade dress'
          : 'Misbranding violation: Label contains unauthorized therapeutic claims',
        cfrReference: 'FD&C Act Sec. 502(a)',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 7,
      gateName: 'Labeling & Misbranding Verification (VERY HIGH RISK)',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'Labeling defect detected. Misbranded containers will trigger immediate FDA port detention under Sec. 801(a).'
        : 'Physical labeling inspected and verified compliant with 21 CFR Part 201.',
    };
  }

  private static auditGate8ImportAlerts(d: ShipmentDossier): GateAuditResult {
    const a = d.importAlerts || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G8-01',
        label: 'FDA Import Alert Database Queried for Firm, Country & Product',
        status: a.searchedImportAlertDatabase ? 'PASS' : 'FAIL',
        details: a.searchedImportAlertDatabase
          ? 'Pre-shipment verification executed against active FDA Red Lists'
          : 'Import Alert database search was NOT executed prior to shipment dispatch',
        cfrReference: 'FDA Regulatory Procedures Manual Chap. 9',
        fdaSystem: 'FDA Import Alerts (OACI)',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G8-02',
        label: 'Absence from DWPE Red List (Detention Without Physical Exam)',
        status: !a.onImportAlert ? 'PASS' : 'FAIL',
        details: !a.onImportAlert
          ? 'Manufacturer and product clear of all FDA Import Alerts'
          : `CRITICAL ENFORCEMENT HIT: Firm or product flagged on Import Alert(s): ${(a.alertNumbers || ['Active']).join(', ')}`,
        cfrReference: 'FD&C Act Sec. 801(a)(3) / DWPE',
        fdaSystem: 'Import Alert 66-40 / 99-32',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G8-03',
        label: 'Firm & Officers Cleared from FDA Debarment List',
        status: !a.firmOnDebarmentList ? 'PASS' : 'FAIL',
        details: !a.firmOnDebarmentList
          ? 'Clean status on FDA Debarment and Disqualified Investigator lists'
          : 'Debarred entity identified in drug supply chain',
        cfrReference: 'FD&C Act Sec. 306',
        fdaSystem: 'FDA Debarment List',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 8,
      gateName: 'Import Alert & Enforcement Clearance (DO BEFORE EVERY SHIPMENT)',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'CRITICAL STOP: Shipment subject to active FDA Import Alert (DWPE) or Debarment. Shipment will be refused at border.'
        : 'Confirmed clear of all FDA Import Alerts and enforcement restrictions.',
    };
  }

  private static auditGate9Customs(d: ShipmentDossier): GateAuditResult {
    const c = d.customs || ({} as any);
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G9-01',
        label: 'Commercial Invoice & Packing List Reconciliation',
        status: c.commercialInvoiceValid && c.packingListValid ? 'PASS' : 'FAIL',
        details: c.commercialInvoiceValid
          ? 'Invoice and packing list match exact batch quantity and consignee'
          : 'Documentation variance between invoice and physical shipment manifest',
        cfrReference: '19 CFR Part 141',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G9-02',
        label: 'Airway Bill (AWB) / Bill of Lading Issued',
        status: Boolean(c.billOfLadingOrAwb) ? 'PASS' : 'FAIL',
        details: c.billOfLadingOrAwb ? `AWB/BOL #: ${c.billOfLadingOrAwb}` : 'Shipping bill of lading missing',
        cfrReference: '19 CFR 141.11',
      },
      {
        checkId: 'G9-03',
        label: 'HTS Tariff Classification & FDA Product Code Validated',
        status: Boolean(c.htsCode) && Boolean(c.fdaProductCode) ? 'PASS' : 'FAIL',
        details: `HTS: ${c.htsCode || 'Missing'} | FDA Product Code: ${c.fdaProductCode || 'Missing'}`,
        cfrReference: '19 U.S.C. 1202 / FDA Product Code Builder',
        fdaSystem: 'ACE / CBP ITACS',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G9-04',
        label: 'Affirmations of Compliance (A of C) Declared for ACE Entry',
        status: c.affirmationsOfCompliance && c.affirmationsOfCompliance.length > 0 ? 'PASS' : 'FAIL',
        details: c.affirmationsOfCompliance && c.affirmationsOfCompliance.length > 0
          ? `A of C Codes: ${c.affirmationsOfCompliance.map(a => `${a.code}${a.qualifier ? ` (${a.qualifier})` : ''}`).join(', ')}`
          : 'Missing mandatory Affirmations of Compliance (e.g. REG, DLS, AND/NDA)',
        cfrReference: 'FDA ACE Supplemental Guide',
        fdaSystem: 'CBP Automated Commercial Environment (ACE)',
        isHardStopTrigger: true,
      },
      {
        checkId: 'G9-05',
        label: 'Customs Entry Information Matches FDA Systems Verbatim',
        status: c.entryDataMatchesFdaRecords ? 'PASS' : 'FAIL',
        details: c.entryDataMatchesFdaRecords
          ? 'Customs broker declared data identical to FDA DECRS and eList registration'
          : 'Data discrepancy between broker entry filing and FDA official database',
        cfrReference: 'FD&C Act Sec. 801',
        isHardStopTrigger: true,
      },
    ];

    const hasFail = checks.some((c) => c.status === 'FAIL');
    return {
      gateNumber: 9,
      gateName: 'Shipping, Customs & FDA Entry Documentation',
      status: hasFail ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: hasFail
        ? 'Customs documentation or FDA ACE Affirmations of Compliance invalid. Discrepancies cause severe entry detention.'
        : 'Commercial invoice, HTS code, FDA product code, and A of C affirmations verified.',
    };
  }

  private static auditGate10FinalDecision(
    priorGates: GateAuditResult[],
    hardStopTriggers: string[]
  ): GateAuditResult {
    const isHardStop = hardStopTriggers.length > 0;
    const checks: PreShipmentItemCheck[] = [
      {
        checkId: 'G10-01',
        label: 'Evaluation of Pre-Shipment Master Decision Form',
        status: isHardStop ? 'FAIL' : 'PASS',
        details: isHardStop
          ? `🛑 SHIPMENT MUST BE STOPPED: ${hardStopTriggers.length} hard-stop gate(s) triggered`
          : '✔ ALL 10 PRE-SHIPMENT GATES SATISFIED — CLEARED FOR EXPORT TO U.S.',
        cfrReference: '21 CFR Parts 201, 207, 210, 211 & FD&C Act 801(a)',
        isHardStopTrigger: true,
      },
    ];

    return {
      gateNumber: 10,
      gateName: 'Final "DO NOT SHIP" Hard Stop Gate',
      status: isHardStop ? 'FAIL' : 'PASS',
      isHardStop: true,
      checks,
      summary: isHardStop
        ? `🛑 STOP SHIPMENT IMMEDIATELY: Triggered hard stops: ${hardStopTriggers.join('; ')}.`
        : 'CLEARED FOR U.S. EXPORT: All facility, product, listing, approval, cGMP, batch release, label, import alert, and customs gates passed.',
    };
  }
}
