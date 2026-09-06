import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mammoth from 'mammoth';

export interface ParsedDocument {
  filename: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  rawText: string;
  extension: string;
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(resolvedPath);
  const fileSize = fileBuffer.length;
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = path.basename(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();

  let rawText = '';

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fileBuffer);
      rawText = data.text;
    } catch (err: any) {
      throw new Error(`Failed to parse PDF document (${filename}): ${err.message}`);
    }
  } else if (ext === '.docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      rawText = result.value;
    } catch (err: any) {
      throw new Error(`Failed to parse DOCX document (${filename}): ${err.message}`);
    }
  } else if (['.txt', '.md', '.markdown', '.log'].includes(ext)) {
    rawText = fileBuffer.toString('utf-8');
  } else {
    // Attempt utf-8 decode
    rawText = fileBuffer.toString('utf-8');
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error(`Document ${filename} contains no readable text content.`);
  }

  return {
    filename,
    filePath: resolvedPath,
    fileHash,
    fileSize,
    rawText,
    extension: ext,
  };
}
