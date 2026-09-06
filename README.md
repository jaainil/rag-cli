# Compliance CLI — Pharma SOP Checker (`compliance-check`)

> **Terminal-native regulatory risk analysis for pharmaceutical SOPs.**  
> Evaluates procedures against 200+ historical FDA Warning Letters, Form 483 Observations, and cGMP regulations (21 CFR Parts 210/211, 21 CFR Part 11, EU GMP Annex 11/15).

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-v20+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-8%20passing-brightgreen.svg)](test/)
[![Status](https://img.shields.io/badge/Status-Client%20Pitch%20Demo%20Ready-blueviolet.svg)](#)

---

## 1. Overview & Architecture

Designed specifically for compliance and QA engineers who work in scripts, document control systems (Veeva Vault, MasterControl), and automated pipelines. `compliance-check` parses SOP documents, extracts structured regulatory clauses, performs hybrid lexical and semantic retrieval against an indexed corpus of real FDA enforcement actions, and generates actionable, audit-ready remediation recommendations.

```
CLI (Node.js / TypeScript / Commander.js)
   │
   ├── Parser & Chunker → extracts sections from PDF / DOCX / Markdown / Text (with SHA-256)
   │
   ├── Cache Layer (Dragonfly Redis) → sub-millisecond embedding & query result caching
   │
   ├── Primary Vector DB (PostgreSQL 18 + pgvector) → HNSW vector similarity search
   │
   ├── Fallback Database (SQLite) → local on-prem redundancy
   │
   ├── Reasoning Engine → Claude 3.5 Sonnet / OpenAI + Offline Deterministic cGMP Rule Engine
   │
   └── Presentation Layer → OpenCode-style Interactive Chatbot + JSON / CSV / HTML export
```

---

## 2. Key Capabilities (Demo Scope)

- **Interactive Terminal Chatbot (OpenCode Style):** Run `compliance-check` or `npm start` with zero arguments to enter an interactive conversational REPL. Ask regulatory questions, scan files, explain sections, and review findings conversationally.
- **Zero-Setup Execution:** Works 100% locally out-of-the-box using embedded SQLite. No Docker containers or cloud accounts needed for the demo.
- **200+ Curated FDA Precedents:** Pre-loaded with 225 Warning Letters and 483 citations across deviation timelines, cleaning validation, data integrity/audit trails, aseptic controls, and quality unit oversight.
- **Clean Terminal UI:** Real-time step progress spinners, risk breakdown badges (`[HIGH]`, `[MEDIUM]`, `[LOW]`), and quotation excerpts.
- **Deep Explanations (`explain`):** Explains *why* a clause is vulnerable and provides an audit-ready suggested replacement.
- **Continuous Learning Loop (`review`):** Feedback mechanism that boosts relevant citations when accepted and down-weights false positives.
- **Auditable Exports (`export`):** Generates structured JSON, CSV, and formatted HTML audit reports for integration with enterprise systems.

---

## 3. Quickstart & Installation

```bash
# Clone and enter workspace
git clone <repo-url>
cd rag-cli

# Install dependencies and build
npm install
npm run build

# Run automated test suite
npm test

# 1. Start OpenCode-style interactive chatbot (Default)
compliance-check
# or: npm start

# 2. Or run scripted pipeline scan directly
compliance-check scan sample_sops/sop_deviation_handling.md
```

The CLI binary is located at `./bin/compliance-check.js`. If installed globally or symlinked into your `PATH`:
```bash
compliance-check --version
```

---

## 4. Command Reference

### 4.1 Scan SOP File or Batch Directory
```bash
# Scan a single SOP file (.md, .txt, .pdf, .docx)
compliance-check scan sample_sops/sop_deviation_handling.md

# Scan an entire directory of SOPs (Batch Scan)
compliance-check scan sample_sops/

# Scan and immediately export to JSON
compliance-check scan sample_sops/sop_deviation_handling.md --export json --output my_report.json
```

### 4.2 U.S. Pharma Export — Pre-Shipment 10-Gate Master Audit (`preshipment`)
Beyond checking SOPs, exporting drugs from India to the U.S. requires verifying that the shipment is **fully compliant and defensible** across 10 critical regulatory gates:

```bash
# Run 10-gate audit on pre-shipment dossier/manifest
compliance-check preshipment sample_shipments/atorvastatin_tablets_export_pass.json

# Audit failing shipment and inspect hard-stop triggers
compliance-check preshipment sample_shipments/amoxicillin_capsules_export_fail.json

# Export official U.S. Customs Regulatory Defense Dossier (HTML, CSV, JSON)
compliance-check preshipment sample_shipments/atorvastatin_tablets_export_pass.json --export html
```

The 10 Gates evaluated:
1. **Manufacturer / Facility:** FDA registration current, renewed, listed in DECRS, US Agent valid.
2. **Product:** Legally importable SKU, strength, dosage form, active ingredients, intended use.
3. **FDA Drug Listing:** Registered in FDA eList / SPL, NDC directory match, corresponds to foreign manufacturer.
4. **FDA Approval / Regulatory Pathway (HARD STOP):** Verified NDA, ANDA, BLA, OTC Monograph, or API DMF.
5. **cGMP Manufacturing Controls:** 21 CFR 210/211, completed BMR/BPR, 0 unresolved deviations, 0 unresolved OOS.
6. **Batch Release (QA MUST SIGN OFF):** Analytical COA, testing passed, independent QA Unit release sign-off.
7. **Labeling (VERY HIGH RISK):** Physical container label inspected, 21 CFR 201 compliant, 0 unauthorized claims.
8. **Import Alert / Enforcement Check:** Queried FDA Import Alert database (DWPE 66-40, 99-32) & Debarment List.
9. **Shipping & Customs Documentation:** Commercial invoice, AWB, HTS code, FDA Product Code, Affirmations of Compliance (REG, DLS, AND/NDA).
10. **Final "DO NOT SHIP" Hard Stop Gate:** Automatic enforcement matrix; halts dispatch if ANY hard stop is triggered.

### 4.3 Explain a Flagged Finding
```bash
# View deep statutory analysis and audit remediation for Section 4.2
compliance-check explain 4.2

# Explain Section 6.1 (cleaning validation frequency)
compliance-check explain 6.1
```

### 4.3 Export Audit Reports
```bash
# Export last scan report to JSON (default)
compliance-check export --format=json

# Export to CSV for spreadsheet review
compliance-check export --format=csv --output=audit_findings.csv

# Export to formatted HTML for executive sharing
compliance-check export --format=html --output=audit_report.html
```

### 4.4 Human-in-the-Loop Review (Continuous Retrieval Learning)
```bash
# Accept a flag as a true-positive risk (boosts precedent weight in future scans)
compliance-check review 4.2 --accept --note "Accurate observation; capping investigation window at 30 days"

# Reject a flag as a false-positive (down-weights precedent)
compliance-check review 9.0 --reject --note "Alternate QA sign-off policy covered in annex"
```

### 4.5 Inspect Scan History & Trends
```bash
# View all historical scans and risk progression
compliance-check history

# Filter history by SOP filename
compliance-check history sop_deviation_handling
```

### 4.6 Inspect Knowledge Base
```bash
# Display dataset metrics by category, date range, and severity
compliance-check dataset stats
```

### 4.7 View or Update Configuration
```bash
# View current settings
compliance-check config

# Set LLM provider to Claude API
compliance-check config set llmProvider anthropic
compliance-check config set anthropicApiKey sk-ant-...

# Adjust similarity threshold
compliance-check config set similarityThreshold 0.65
```

---

## 5. Sample Terminal Output

```text
$ compliance-check scan sample_sops/sop_deviation_handling.md

✔ Loading SOP...                     done (3.8 KB)
✔ Parsing sections...                10 sections found
✔ Embedding + retrieving matches...  done (725 FDA precedents via PostgreSQL 18 pgvector + Dragonfly cache)
✔ Running risk analysis...           done

╭─────────────────────────────────────────────────╮
│  SOP Compliance Risk Audit Report               │
│  File: sop_deviation_handling.md                │
│  Scanned: Sun, 06 Sep 2026 10:48:30 GMT         │
│  Sections scanned: 10   Flags found: 4          │
│  Risk Breakdown: 2 HIGH  |  1 MEDIUM  |  1 LOW  │
╰─────────────────────────────────────────────────╯

 HIGH    Section 4.2 — Deviation Handling & Investigation Timeframes [Line 29]
  ▶ Current SOP Flawed Text:
    "Investigations shall proceed expeditiously and be completed as soon as
     feasible depending on operational constraints. In complex multi-departmental
     investigations, target dates may be extended upon verbal concurrence..."
  Compliance Defect: No defined timeline for deviation escalation
  Statutory Regulation: 21 CFR 211.192 (Unexplained discrepancies and failure investigations)
  ▶ Cited Historical FDA Precedent (Past Enforcement Data):
    Citation: FDA Warning Letter WL-320-24-72
    Target Facility: Topical and Transdermal Manufacturing Site (Redacted) | Issued: 2024-03-15
    Past Historical Enforcement Excerpt:
      "Investigations into assay failures and batch yield discrepancies
       repeatedly concluded 'operator error' without conducting thorough
       equipment calibration checks or extending timelines under QA supervision..."
    Precedent Remediation Standard: Mandate explicit 30-day investigation completion with QA risk assessment.
  Auditor Confidence: 87%

 MEDIUM  Section 6.1 — Cleaning Validation Frequency & Verification [Line 35]
  ▶ Current SOP Flawed Text:
    "Equipment cleaning verification for multi-product granulators and tablet
     compression presses shall be performed periodically by designated line
     clearance operators."
  Compliance Defect: Frequency stated as "periodic" without a defined interval
  Statutory Regulation: 21 CFR 211.67 (Equipment cleaning and maintenance)
  ▶ Cited Historical FDA Precedent (Past Enforcement Data):
    Citation: FDA Form 483 Observation (2024) - Facility #1006
    Target Facility: Topical and Transdermal Manufacturing Site (Redacted) | Issued: 2024-07-15
    Past Historical Enforcement Excerpt:
      "Your cleaning validation SOP states that visual and swab verification
       will be performed 'periodically' on multi-product fluid bed dryers,
       without defining an objective frequency, batch limit, or maximum hold time..."
    Precedent Remediation Standard: Replace subjective wording with explicit campaign batch limits.
  Auditor Confidence: 71%

──────────────────────────────────────────────────────────────────────
Run compliance-check explain 4.2 for full reasoning on a section.
Run compliance-check export --format=json to save this report.
```

---

## 6. Client Pitch Runbook

When pitching to pharmaceutical QA / Compliance Leads:

1. **Address Privacy First:**
   - Emphasize that the document parsing, sectioning, SQLite database, and retrieval engine run **100% on-premise inside their firewall**.
   - No SOP text leaves their servers unless they configure an external LLM key, or they can point the CLI to an on-prem LLM (e.g. Ollama/vLLM).

2. **Demonstrate CI/CD Document Pipeline Fit:**
   - Show how this slots into a Git pre-commit hook or GitHub/GitLab CI pipeline:
     ```yaml
     # .github/workflows/sop-compliance.yml
     name: SOP Regulatory Check
     on: [pull_request]
     jobs:
       audit:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v3
           - run: npm install -g compliance-check
           - run: compliance-check scan ./active_sops --export json
     ```

3. **Demonstrate the Explain Command:**
   - Run `compliance-check explain 4.2`. Highlight the direct FDA Warning Letter citation and the exact remediation clause that their team can adopt immediately.

4. **Show Continuous Improvement:**
   - Run `compliance-check review 4.2 --accept`. Explain that this feedback tunes the retrieval weighting over time without requiring costly model retraining.

---

## 7. License

Proprietary — Developed by Jainil (Aexaware Infotech) for client evaluation.
