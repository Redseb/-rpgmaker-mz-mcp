#!/usr/bin/env node
// Keep the release version in sync across the packaging manifests.
//
// package.json is the source of truth; the same version is stamped into the
// Claude Code plugin manifest, the MCP-registry metadata, and the MCPB bundle
// manifest so a `npm version` bump can't leave a stale copy behind.
//
//   node scripts/sync-version.mjs           # rewrite files in place
//   node scripts/sync-version.mjs --check    # verify only; exit 1 if stale (CI)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

// Only `"version"` fields are touched (string surgery, not re-serialization, so
// prettier's formatting survives). The pattern can't match `"manifest_version"`
// because of the leading quote. Expected match counts fail loudly if a manifest
// gains or loses a version field.
const VERSION_FIELD = /("version":\s*")[^"]+(")/g;
const targets = [
  { file: '.claude-plugin/plugin.json', expect: 1 },
  { file: 'server.json', expect: 2 }, // top-level + packages[0]
  { file: 'mcpb/manifest.json', expect: 1 },
];

const stale = [];
for (const { file, expect } of targets) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  const matches = [...before.matchAll(VERSION_FIELD)];
  if (matches.length !== expect) {
    console.error(`✗ ${file}: expected ${expect} "version" field(s), found ${matches.length}`);
    process.exit(1);
  }
  const after = before.replace(VERSION_FIELD, `$1${version}$2`);
  if (after !== before) {
    if (check) {
      stale.push(file);
    } else {
      writeFileSync(path, after);
      console.log(`✓ Stamped ${version} into ${file}`);
    }
  }
}

if (check && stale.length > 0) {
  console.error(`✗ Version out of sync with package.json (${version}): ${stale.join(', ')}`);
  console.error('  Run `npm run sync:version` to fix.');
  process.exit(1);
}
console.log(check ? `✓ Version (${version}) is in sync.` : `✓ Done (${version}).`);
