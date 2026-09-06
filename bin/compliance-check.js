#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const distPath = path.join(__dirname, '..', 'dist', 'index.js');
const srcPath = path.join(__dirname, '..', 'src', 'index.ts');

if (fs.existsSync(distPath)) {
  require(distPath);
} else {
  // Try tsx runner when running from source
  try {
    require('tsx/cjs');
    require(srcPath);
  } catch (err) {
    // Fallback: child process tsx
    const { spawnSync } = require('child_process');
    const result = spawnSync('npx', ['tsx', srcPath, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 0);
  }
}
