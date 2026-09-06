export type ExportProductType = 'FINISHED_DRUG' | 'API' | 'OTC_DRUG';

export type GateStatus = 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';

export type GateNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface PreShipmentItemCheck {
  checkId: string;
  label: string;
  status: GateStatus;
  details: string;
  cfrReference?: string;
  fdaSystem?: string; // e.g. DECRS, eList, CDER, Import Alerts, ACE
  isHardStopTrigger?: boolean;
}

export interface GateAuditResult {
  gateNumber: GateNumber;
  gateName: string;
  status: GateStatus;
  isHardStop: boolean;
  checks: PreShipmentItemCheck[];
  summary: string;
}

export interface FacilityDossier {
  name: string;
  address: string;
  country: string;
  feiNumber?: string;
  dunsNumber?: string;
  fdaRegistrationCurrent: boolean;
  registrationRenewalDate?: string;
  manufacturingActivitiesIncluded: boolean;
  usAgentName?: string;
  usAgentContact?: string;
  usImportersIdentified: boolean;
  listedInDecrs: boolean;
  activeEnforcementActions: boolean;
}

export interface ProductDossier {
  productName: string;
  activeIngredients: string[];
  strength: string;
  dosageForm: string;
  routeOfAdministration: string;
  countryOfOrigin: string;
  intendedUsUse: string;
  legalPathway: 'NDA' | 'ANDA' | 'BLA' | 'OTC_MONOGRAPH' | 'IND' | 'DMF_API' | 'OTHER';
  applicationNumber?: string; // e.g. "ANDA 204581"
  pathwayVerified: boolean;
  manufacturedAccordanceWithApproval: boolean;
}

export interface ListingDossier {
  ndc: string;
  listingSubmitted: boolean;
  correspondsToActualManufacturer: boolean;
  eListStatus: 'CURRENT' | 'EXPIRED' | 'MISSING';
  matchesPhysicalProduct: boolean;
  requiredUpdatesSubmitted: boolean;
}

export interface CgmpDossier {
  approvedSopsCurrent: boolean;
  employeeTrainingRecordsCurrent: boolean;
  bmrComplete: boolean;
  bprComplete: boolean;
  openCriticalDeviations: number;
  openOosInvestigations: number;
  capaCompleted: boolean;
  changeControlsCompleted: boolean;
  equipmentCalibrationCurrent: boolean;
  cleaningValidationCurrent: boolean;
  environmentalMonitoringCompliant: boolean;
  stabilityTestingAcceptable: boolean;
  rawMaterialsAndSuppliersQualified: boolean;
  finishedSpecsMet: boolean;
}

export interface BatchReleaseDossier {
  batchNumber: string;
  mfgDate: string;
  expDate: string;
  quantity: string;
  coaGenerated: boolean;
  allQcTestsPassed: boolean;
  noUnresolvedCriticalDeviations: boolean;
  noUnresolvedOos: boolean;
  packagingInspectionPassed: boolean;
  labelInspectionPassed: boolean;
  qaReleaseSignoff: boolean;
  qaOfficerName?: string;
  qaSignoffDate?: string;
}

export interface LabelingDossier {
  physicalLabelInspected: boolean;
  storageConditionsDeclared: string;
  productNameAndStrengthMatched: boolean;
  activeIngredientsListed: boolean;
  lotAndExpOnContainer: boolean;
  noMisleadingOrUnauthorizedClaims: boolean;
  fdaApprovedLabelingMatched: boolean;
  requiredUsWarningsIncluded: boolean;
}

export interface ImportAlertDossier {
  searchedImportAlertDatabase: boolean;
  onImportAlert: boolean;
  alertNumbers?: string[]; // e.g. ["66-40", "99-32"]
  firmOnDebarmentList: boolean;
}

export interface CustomsDocumentationDossier {
  commercialInvoiceValid: boolean;
  packingListValid: boolean;
  billOfLadingOrAwb: string;
  htsCode: string;
  fdaProductCode: string;
  affirmationsOfCompliance: { code: string; qualifier?: string }[];
  consigneeImporterName: string;
  consigneeImporterAddress: string;
  entryDataMatchesFdaRecords: boolean;
}

export interface ShipmentDossier {
  shipmentId: string;
  exportDate: string;
  productType: ExportProductType;
  facility: FacilityDossier;
  product: ProductDossier;
  listing: ListingDossier;
  cgmp: CgmpDossier;
  batchRelease: BatchReleaseDossier;
  labeling: LabelingDossier;
  importAlerts: ImportAlertDossier;
  customs: CustomsDocumentationDossier;
}

export interface PreShipmentAuditReport {
  id: string;
  shipmentId: string;
  productName: string;
  batchNumber: string;
  productType: ExportProductType;
  auditedAt: string;
  overallDecision: 'CLEARED_FOR_EXPORT' | 'STOP_DO_NOT_SHIP';
  gates: GateAuditResult[];
  hardStopTriggers: string[];
  passCount: number;
  failCount: number;
  warningCount: number;
  totalChecks: number;
  executionTimeMs: number;
}
