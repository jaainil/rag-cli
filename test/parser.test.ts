import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import { parseDocument } from '../src/core/parser';
import { extractSections } from '../src/core/chunker';

describe('Document Parser & Chunker', () => {
  it('should parse markdown SOP and compute SHA-256 hash', async () => {
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_deviation_handling.md');
    const doc = await parseDocument(docPath);

    assert.strictEqual(doc.filename, 'sop_deviation_handling.md');
    assert.ok(doc.fileSize > 0);
    assert.strictEqual(doc.fileHash.length, 64); // SHA-256 is 64 hex chars
    assert.ok(doc.rawText.includes('STANDARD OPERATING PROCEDURE'));
  });

  it('should parse text SOP and compute SHA-256 hash', async () => {
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_cleaning_validation.txt');
    const doc = await parseDocument(docPath);

    assert.strictEqual(doc.filename, 'sop_cleaning_validation.txt');
    assert.ok(doc.fileSize > 0);
    assert.strictEqual(doc.fileHash.length, 64);
  });

  it('should extract structured pharma sections with numbering and entities', async () => {
    const docPath = path.join(__dirname, '..', 'sample_sops', 'sop_deviation_handling.md');
    const doc = await parseDocument(docPath);
    const sections = extractSections(doc.rawText);

    assert.ok(sections.length >= 8);

    const sec42 = sections.find((s) => s.sectionNumber === '4.2');
    assert.ok(sec42, 'Section 4.2 should be found');
    assert.strictEqual(sec42.title, 'Deviation Handling & Investigation Timeframes');
    assert.ok(sec42.keyEntities.includes('investigation') || sec42.keyEntities.includes('as soon as feasible'));

    const sec61 = sections.find((s) => s.sectionNumber === '6.1');
    assert.ok(sec61, 'Section 6.1 should be found');
    assert.strictEqual(sec61.title, 'Cleaning Validation Frequency & Verification');
  });
});
