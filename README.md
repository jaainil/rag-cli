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
   ├── Vector & Lexical Retriever → BM25 + dense cosine similarity + recency decay
   │
   ├── Reasoning Engine → Claude 3.5 Sonnet / OpenAI + Offline Deterministic cGMP Rule Engine
   │
   ├── SQLite Audit Store → persistent WAL database for scans, flags, and review feedback
   │
   └── Presentation Layer → high-contrast Boxen/Chalk UI + JSON / CSV / HTML export
```

---

## 2. Key Capabilities (Demo Scope)

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

# Run demo scan
npm run demo
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

### 4.2 Explain a Flagged Finding
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
✔ Embedding + retrieving matches...  done (225 FDA precedents indexed)
✔ Running risk analysis...           done

╭─────────────────────────────────────────────────╮
│  SOP Compliance Risk Audit Report               │
│  File: sop_deviation_handling.md                │
│  Scanned: Sun, 06 Sep 2026 08:53:57 GMT         │
│  Sections scanned: 10   Flags found: 4          │
│  Risk Breakdown: 2 HIGH  |  1 MEDIUM  |  1 LOW  │
╰─────────────────────────────────────────────────╯

 HIGH    Section 4.2 — Deviation Handling & Investigation Timeframes
  Issue: No defined timeline for deviation escalation
  Regulation: 21 CFR 211.192 (Unexplained discrepancies and failure investigations)
  Matched precedent: FDA Form 483 Observation (2024) - Facility #1108
    "When particulate contamination was confirmed in vial filling line 3
     (batch #2020-09), your quality unit failed to extend the investigation..."
  Confidence: 87%

 MEDIUM  Section 6.1 — Cleaning Validation Frequency & Verification
  Issue: Frequency stated as "periodic" without a defined interval
  Regulation: 21 CFR 211.67 (Equipment cleaning and maintenance)
  Matched precedent: FDA Form 483 Observation (2024) - Facility #1006
    "Your cleaning validation SOP states that visual and swab verification
     will be performed "periodically" on multi-product fluid bed dryers,..."
  Confidence: 71%

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
