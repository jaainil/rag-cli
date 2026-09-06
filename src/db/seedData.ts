import { PrecedentFlag, RiskLevel } from '../types';

interface PrecedentTemplate {
  category: string;
  cfr: string;
  severity: RiskLevel;
  keywords: string[];
  issues: {
    summary: string;
    excerpt: string;
    remediation: string;
  }[];
}

const templates: PrecedentTemplate[] = [
  // 1. Deviation Handling & OOS Investigations (21 CFR 211.192)
  {
    category: 'Deviation Handling & OOS',
    cfr: '21 CFR 211.192',
    severity: 'HIGH',
    keywords: [
      'deviation', 'investigation', 'timeline', 'timeframe', 'oos', 'out of specification',
      'root cause', 'escalation', '30 days', 'overdue', 'capa', 'discrepancy', 'periodic', 'timely'
    ],
    issues: [
      {
        summary: 'Failure to establish defined timeframes for completing deviation and OOS investigations',
        excerpt: 'Your firm failed to establish and follow adequate written procedures for investigating any unexplained discrepancy or the failure of a batch or any of its components to meet specifications. Specifically, your SOP lacked defined statutory time limits for closing investigations, resulting in 42 deviations open exceeding 90 calendar days without Quality Unit escalation.',
        remediation: 'Establish a rigid investigation closure timeframe (e.g., 30 calendar days max) with mandatory 15-day interim QA escalation protocols for complex investigations.'
      },
      {
        summary: 'Inadequate root cause determination with premature attribution to operator error',
        excerpt: 'Investigations into assay failures and batch yield discrepancies repeatedly concluded "operator error" without conducting thorough equipment calibration checks, raw material variability evaluations, or evaluating previous batch histories.',
        remediation: 'Implement structured root cause methodologies (5-Whys, Ishikawa) and prohibit concluding operator error without formal elimination of systemic and mechanical failure modes.'
      },
      {
        summary: 'Failure to expand deviation investigations to other potentially impacted batches',
        excerpt: 'When particulate contamination was confirmed in vial filling line 3 (batch #2020-09), your quality unit failed to extend the investigation to prior lots produced during the same campaign using identical filter assemblies.',
        remediation: 'Mandate explicit cross-batch impact assessment matrices in SOP Section 4 for any deviation involving shared utilities, contact surfaces, or raw material lots.'
      },
      {
        summary: 'Failure to evaluate CAPA effectiveness for recurring temperature excursions',
        excerpt: 'Your firm closed 19 repeat deviations regarding cold-room temperature excursions without verifying whether preventative maintenance or sensor re-calibration was completed or effective.',
        remediation: 'Define quantitative CAPA effectiveness check intervals (30, 60, and 90 days post-implementation) before deviation closure.'
      },
      {
        summary: 'Lack of interim risk assessments for open high-risk deviations',
        excerpt: 'High-severity sterility assurance deviations remained open for up to 120 days while commercial distribution of related products continued without documented interim safety risk evaluations.',
        remediation: 'Mandate documented Quality Unit interim risk assessments within 72 hours of logging any critical or high-risk deviation.'
      }
    ]
  },

  // 2. Equipment Cleaning Validation & Hold Times (21 CFR 211.67)
  {
    category: 'Cleaning Validation',
    cfr: '21 CFR 211.67',
    severity: 'HIGH',
    keywords: [
      'cleaning', 'validation', 'hold time', 'dirty hold time', 'clean hold time', 'swab',
      'residue', 'cross-contamination', 'rinse', 'periodic', 'worst-case', 'shared equipment', 'toc'
    ],
    issues: [
      {
        summary: 'Vague cleaning verification intervals using non-specific terms such as "periodic"',
        excerpt: 'Your cleaning validation SOP states that visual and swab verification will be performed "periodically" on multi-product fluid bed dryers, without defining an objective frequency, batch limit, or maximum elapsed campaign days.',
        remediation: 'Replace all occurrences of subjective terminology ("periodic", "as needed") with explicit campaign boundaries (e.g. "every 5 batches or maximum 14 elapsed days").'
      },
      {
        summary: 'Failure to establish validated Maximum Dirty Hold Times (DHT)',
        excerpt: 'Your firm manufactures highly potent compounds on dedicated granulation suites but has failed to validate maximum dirty hold times (DHT) between manufacturing completion and initiation of cleaning.',
        remediation: 'Conduct challenge studies to define and validate maximum allowable Dirty Hold Time (DHT) not to exceed 48 hours.'
      },
      {
        summary: 'Inadequate Clean Hold Time (CHT) validation prior to aseptic filling',
        excerpt: 'Autoclaved filling needles and manifolds were stored wrapped in Tyvek for up to 21 days without micro-challenge data demonstrating bioburden control across the stored duration.',
        remediation: 'Establish maximum Clean Hold Time (CHT) with empirical microbial ingress testing and storage humidity limits.'
      },
      {
        summary: 'Unjustified swab sampling locations failing to target hardest-to-clean areas',
        excerpt: 'Swab recovery studies were conducted solely on flat, easily accessible stainless steel hopper surfaces, omitting critical hard-to-clean valve seals, agitator shafts, and discharge ports.',
        remediation: 'Provide engineering schematics and scientific justification for worst-case swab sampling locations based on surface geometry and product accumulation risk.'
      },
      {
        summary: 'Relying solely on visual inspection without quantitative analytical verification',
        excerpt: 'Between product changeovers of insoluble APIs, equipment release was authorized based purely on "visually clean" criteria without HPLC or TOC swab testing.',
        remediation: 'Incorporate validated chemical residue limits (TOC, HPLC, or conductivity) in addition to visual inspection criteria for all product-contact surfaces.'
      }
    ]
  },

  // 3. Data Integrity & Computerized Systems (21 CFR 211.68 & 21 CFR Part 11)
  {
    category: 'Data Integrity & Audit Trails',
    cfr: '21 CFR 211.68',
    severity: 'HIGH',
    keywords: [
      'data integrity', 'audit trail', 'part 11', 'electronic records', 'alcoa', 'shared login',
      'administrator', 'backup', 'deletion', 'integration', 'hplc', 'password', 'raw data'
    ],
    issues: [
      {
        summary: 'Routine omission of chromatographic audit trail reviews prior to batch release',
        excerpt: 'Your quality unit does not routinely review HPLC/GC electronic audit trails for peak integration modifications, deleted sequences, or test-to-compliance trial runs prior to commercial batch release.',
        remediation: 'Incorporate mandatory, second-person audit trail verification checkpoints in all QC analytical release SOPs prior to certificate of analysis sign-off.'
      },
      {
        summary: 'Shared generic administrator credentials utilized on QC analytical instruments',
        excerpt: 'All laboratory analysts had access to a shared Windows administrator account ("AdminQC") allowing unrestricted privileges to alter instrument system clocks and overwrite chromatographic data files.',
        remediation: 'Implement unique individual user IDs with role-based permissions; strictly segregate system administrator privileges from operational analysts.'
      },
      {
        summary: 'Unprotected analytical raw data stored on non-backed-up local workstation drives',
        excerpt: 'Spectrophotometer and particle counter raw data were stored on local C:\\ drives without write-protection, automatic synchronization to secure network servers, or validated disaster recovery backups.',
        remediation: 'Configure automated, encrypted, tamper-evident archival to centralized validated network storage with write-once-read-many (WORM) permissions.'
      },
      {
        summary: 'Failure to archive or investigate aborted or interrupted test sequences',
        excerpt: 'Analysts aborted 34 out of 112 dissolution testing sequences upon observing out-of-trend curves without generating deviation records or preserving electronic records.',
        remediation: 'Enforce system-level restrictions that automatically trigger deviation tickets whenever an analytical sequence is interrupted or aborted.'
      },
      {
        summary: 'Spreadsheets utilized for GMP batch release calculations lacking validation and audit logging',
        excerpt: 'Formulation potency and yield calculations were calculated using unvalidated Microsoft Excel workbooks lacking cell-locking, formula protection, or audit trail logging capabilities.',
        remediation: 'Validate all computational spreadsheets per GAMP 5 Category 5 guidelines or migrate calculations into an enterprise LIMS.'
      },
      {
        summary: 'Testing into compliance by repeatedly re-injecting samples without documented justification',
        excerpt: 'When initial potency assays yielded out-of-specification (OOS) results (88.4%), the laboratory analyst invalidated the run citing "instrument noise" and repeatedly injected duplicate aliquots until a passing result (99.1%) was achieved.',
        remediation: 'Strictly enforce FDA Out-of-Specification guidance: invalidate original results only with proven laboratory error documented in a formal phase 1 investigation.'
      }
    ]
  },

  // 4. Environmental Monitoring & Aseptic Processing (21 CFR 211.42 & Annex 1)
  {
    category: 'Aseptic Controls & Environmental Monitoring',
    cfr: '21 CFR 211.42',
    severity: 'HIGH',
    keywords: [
      'environmental monitoring', 'aseptic', 'grade a', 'cleanroom', 'particle', 'sterility',
      'differential pressure', 'viable', 'non-viable', 'settle plate', 'action limit', 'bioburden'
    ],
    issues: [
      {
        summary: 'Failure to perform continuous non-viable particle monitoring during aseptic filling',
        excerpt: 'Your firm failed to conduct continuous isokinetic air sampling during filling operations in ISO 5 (Grade A) critical zones, relying instead on intermittent 10-minute snapshot samples.',
        remediation: 'Install and validate continuous isokinetic airborne particle counters positioned at points of greatest operational contamination risk during Grade A processing.'
      },
      {
        summary: 'Absence of smoke studies under dynamic processing conditions',
        excerpt: 'Airflow visualization smoke studies were conducted solely during static (at-rest) conditions, failing to demonstrate unidirectional laminar airflow during representative manual interventions.',
        remediation: 'Perform video-recorded dynamic airflow visualization studies capturing all standard and worst-case operator interventions in ISO 5 zones.'
      },
      {
        summary: 'Inadequate investigation of microbial alert and action limit excursions',
        excerpt: 'When spore-forming Bacillus cereus was recovered from Grade B active air monitoring, the investigation was closed without identifying the microbial source or sanitization failure.',
        remediation: 'Require full species-level microbial identification and root cause tracking for any Grade A recovery or repeated Grade B alert limit excursion.'
      },
      {
        summary: 'Unmonitored cleanroom differential pressures during shift transitions',
        excerpt: 'Cleanroom differential pressure alarms were silenced during shift handovers, and out-of-spec cascade reversals were not documented in batch manufacturing records.',
        remediation: 'Implement automated SCADA logging of cleanroom differential pressures with automated batch-interlock alarms upon loss of positive pressure.'
      },
      {
        summary: 'Failure to perform post-use integrity testing on sterilizing grade membrane filters',
        excerpt: 'Sterile filtration of ophthalmic solutions proceeded without post-filtration bubble-point integrity testing when water pre-wetting failed to achieve specification.',
        remediation: 'Mandate post-use in-situ integrity testing of all sterilizing-grade 0.22-micron filters prior to filling authorization.'
      }
    ]
  },

  // 5. Change Control & Equipment Qualification (21 CFR 211.100 & 211.160)
  {
    category: 'Change Control & Qualification',
    cfr: '21 CFR 211.100',
    severity: 'MEDIUM',
    keywords: [
      'change control', 'qualification', 'iq/oq/pq', 'revalidation', 'modification',
      'preventative maintenance', 'calibration', 'utility', 'hvac', 'wfi', 'critical'
    ],
    issues: [
      {
        summary: 'Implementation of equipment modifications without formal Quality Unit change control',
        excerpt: 'Engineering personnel altered the heating elements and thermocouple positions on tablet coating pan #2 without initiating a formal change control or assessing thermal distribution impact.',
        remediation: 'Enforce pre-approval by Quality Assurance for all mechanical, electrical, or software adjustments to qualified GMP manufacturing equipment.'
      },
      {
        summary: 'Absence of defined re-qualification intervals for critical processing utilities',
        excerpt: 'The Water-for-Injection (WFI) generation loop had not underwent formal re-qualification or comprehensive system review since initial commissioning 8 years prior.',
        remediation: 'Establish periodic re-qualification cycles (annual utility reviews and 3-year requalification protocols) for critical GMP utilities.'
      },
      {
        summary: 'Failure to track post-maintenance cleaning and calibration verification',
        excerpt: 'Following replacement of peristaltic pump heads on filling line 1, equipment was returned to commercial production without documented recalibration or clearance inspection.',
        remediation: 'Mandate formal Quality Unit work order clearance and calibration verification before re-introducing serviced equipment into production.'
      },
      {
        summary: 'Inadequate justification for critical parameter range modifications',
        excerpt: 'Lyophilization shelf cooling rates were widened from 0.5°C/min to 1.2°C/min under a minor change request without supportive thermal cake structure validation.',
        remediation: 'Require formal risk assessment and supportive experimental data for any operational range changes to critical process parameters (CPPs).'
      }
    ]
  },

  // 6. Quality Control Unit Oversight & Batch Release (21 CFR 211.22)
  {
    category: 'Quality Unit Oversight',
    cfr: '21 CFR 211.22',
    severity: 'HIGH',
    keywords: [
      'quality unit', 'batch release', 'qa oversight', 'quarantine', 'disposition',
      'sign-off', 'annual product review', 'apr', 'pqr', 'independent', 'authority'
    ],
    issues: [
      {
        summary: 'Ambiguous division of responsibility between Production and Quality Unit sign-off',
        excerpt: 'SOP Section 3 allowed production floor supervisors to override hold tags and release in-process tablet cores to coating operations without Quality Unit review.',
        remediation: 'Explicitly designate sole release and rejection authority to the independent Quality Unit in compliance with 21 CFR 211.22(a).'
      },
      {
        summary: 'Untimely completion of Annual Product Reviews (APRs)',
        excerpt: 'APRs for three commercial oral solid products were delayed by over 14 months, preventing timely identification of adverse dissolution trending.',
        remediation: 'Establish strict calendar schedules with automated QA alerting 60 days prior to APR due dates.'
      },
      {
        summary: 'Release of commercial batches prior to final laboratory test result completion',
        excerpt: 'Finished product batches were authorized for distribution under conditional quarantine waivers before 14-day sterility test incubation periods were concluded.',
        remediation: 'Prohibit conditional or provisional release of finished pharmaceutical drug products prior to receipt of all final testing data.'
      },
      {
        summary: 'Lack of executive management review of recurring quality metrics',
        excerpt: 'Critical quality indicators including customer complaint spikes and recurring batch rejections were not escalated to executive management during quarterly reviews.',
        remediation: 'Implement formalized Quality Management Review (QMR) dashboards presented to C-suite executives at minimum quarterly intervals.'
      }
    ]
  },

  // 7. Stability Testing & Expiration Dating (21 CFR 211.166)
  {
    category: 'Stability Testing',
    cfr: '21 CFR 211.166',
    severity: 'MEDIUM',
    keywords: [
      'stability', 'expiration', 'accelerated', 'chamber', 'out of trend', 'oot',
      'shelf life', 'pull date', 'humidity', 'degradation', 'bracketing'
    ],
    issues: [
      {
        summary: 'Failure to investigate Out-of-Trend (OOT) stability results prior to OOS failure',
        excerpt: 'Accelerated stability testing for lot #9082 revealed sharp degradation of the active ingredient at 3 months, but no investigation was initiated until 6-month assay failure occurred.',
        remediation: 'Define statistical Out-of-Trend (OOT) alert thresholds and mandatory investigation triggers within the stability monitoring SOP.'
      },
      {
        summary: 'Lack of defined stability pull-window tolerances',
        excerpt: 'Stability samples scheduled for 12-month station testing were pulled up to 45 days late without documented deviation justification.',
        remediation: 'Define strict sample pull windows (e.g., target date ± 3 business days) with mandatory deviations for out-of-window pulls.'
      },
      {
        summary: 'Failure to test stability lots in commercial container-closure configuration',
        excerpt: 'Stability testing was performed using amber glass vials, while commercial product was distributed in high-density polyethylene (HDPE) bottles.',
        remediation: 'Ensure stability protocols mandate the exact commercial packaging material, seal, and desiccant combination.'
      }
    ]
  },

  // 8. Component Testing & Supplier Qualification (21 CFR 211.84)
  {
    category: 'Component Testing & Supplier Qualification',
    cfr: '21 CFR 211.84',
    severity: 'MEDIUM',
    keywords: [
      'supplier qualification', 'component', 'raw material', 'coa', 'identity testing',
      'vendor audit', 'sampling plan', 'incoming', 'excipient', 'api'
    ],
    issues: [
      {
        summary: 'Reliance on supplier Certificate of Analysis (COA) without performing specific identity testing',
        excerpt: 'Your firm accepted shipments of active pharmaceutical ingredients relying solely on vendor COAs without conducting at least one specific identity test on each incoming lot.',
        remediation: 'Perform specific identity verification (e.g. FTIR, HPLC) on every lot of incoming active pharmaceutical ingredients and excipients.'
      },
      {
        summary: 'Lack of periodic vendor qualification re-audits and COA verification testing',
        excerpt: 'Raw material suppliers remained on the approved vendor list for over 6 years without on-site quality audit or annual confirmatory laboratory testing.',
        remediation: 'Establish a risk-based supplier audit program requiring triennial re-audits and annual full-specification COA verification.'
      },
      {
        summary: 'Unscientific incoming component sampling plans lacking statistical justification',
        excerpt: 'Incoming container sampling followed an informal square root of n rule without statistical justification for high-risk sterile primary stoppers.',
        remediation: 'Implement ANSI/ASQ Z1.4 sampling plans based on defined acceptable quality limits (AQL).'
      }
    ]
  }
];

const companies = [
  'Sterile Injectables Facility (Redacted)',
  'Oral Solid Dosage Manufacturing Plant (Redacted)',
  'Active Pharmaceutical Ingredient (API) Facility (Redacted)',
  'Biologics Fill-Finish Unit (Redacted)',
  'Aseptic Packaging Operations (Redacted)',
  'Contract Development and Manufacturing Org (CDMO) (Redacted)',
  'Topical and Transdermal Manufacturing Site (Redacted)',
  'Lyophilized Products Suite (Redacted)',
  'Solid Oral Formulation Facility (Redacted)',
  'Global Pharmaceutical Synthesis Center (Redacted)'
];

export function generatePrecedents(): PrecedentFlag[] {
  const precedents: PrecedentFlag[] = [];
  let counter = 1;

  for (let cycle = 0; cycle < 7; cycle++) {
    for (const tmpl of templates) {
      for (const issue of tmpl.issues) {
        const year = 2018 + ((counter + cycle) % 7); // 2018 - 2024
        const month = String(1 + ((counter * 3) % 12)).padStart(2, '0');
        const day = String(1 + ((counter * 7) % 28)).padStart(2, '0');
        const dateIssued = `${year}-${month}-${day}`;

        const is483 = (counter % 3 === 0);
        const source = is483
          ? `FDA Form 483 Observation (${year}) - Facility #${1000 + (counter % 500)}`
          : `FDA Warning Letter WL-320-${year.toString().slice(2)}-${String(10 + (counter % 80)).padStart(2, '0')}`;

        const company = companies[(counter + cycle) % companies.length];

        let severity = tmpl.severity;
        if (cycle > 4 && severity === 'HIGH') {
          severity = 'MEDIUM';
        } else if (cycle > 5 && severity === 'MEDIUM') {
          severity = 'LOW';
        }

        const id = `FDA-${year}-${String(counter).padStart(4, '0')}`;

        precedents.push({
          id,
          source,
          company_redacted: company,
          category: tmpl.category,
          cfr_citation: tmpl.cfr,
          severity,
          excerpt: issue.excerpt,
          issue_summary: issue.summary,
          remediation_guidance: issue.remediation,
          date_issued: dateIssued,
          feedback_score: 1.0 + ((counter % 5) * 0.05),
          keywords: [...tmpl.keywords],
        });

        counter++;
        if (counter > 225) {
          return precedents;
        }
      }
    }
  }

  return precedents;
}
