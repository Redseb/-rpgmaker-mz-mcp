#!/usr/bin/env node
// Keep the advertised tool count in sync with the source of truth.
//
// The number of tools is stamped into human-facing places that git can't keep
// current on their own: the README prose and badge, and the two SVGs in assets/.
// This script counts the real tools straight from src/ and rewrites every one of
// those spots so "each time we add a tool" is a one-command bump.
//
//   node scripts/sync-tool-count.mjs           # rewrite files in place
//   node scripts/sync-tool-count.mjs --check    # verify only; exit 1 if stale (CI)
//
// The count is derived from source (not the compiled dist/) so it needs no build
// and always reflects the current tree — every ToolDefinition carries exactly one
// `handler:` field, so counting those counts the tools.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

/** Count tool definitions across src/tools/*.ts by their unique `handler:` field. */
function countTools() {
  const toolsDir = join(root, 'src', 'tools');
  let count = 0;
  for (const file of readdirSync(toolsDir)) {
    if (!file.endsWith('.ts')) continue;
    const src = readFileSync(join(toolsDir, file), 'utf8');
    count += (src.match(/^\s*handler:/gm) ?? []).length;
  }
  return count;
}

/**
 * Each target lists the file plus the substitutions that carry the count. Every
 * pattern is expected to match at least once — a miss means the text moved and the
 * rule needs updating, so we fail loudly rather than silently skip it.
 */
function targets(n) {
  return [
    {
      file: 'README.md',
      subs: [
        [/\*\*\d+ tools\*\*/g, `**${n} tools**`],
        [/All \d+ tools, grouped/g, `All ${n} tools, grouped`],
        [/badge\/tools-\d+-/g, `badge/tools-${n}-`],
      ],
    },
    {
      file: 'assets/banner.svg',
      subs: [[/>\d+ tools<\/text>/g, `>${n} tools</text>`]],
    },
    {
      file: 'assets/architecture.svg',
      subs: [[/\d+ Zod-validated tools/g, `${n} Zod-validated tools`]],
    },
  ];
}

const n = countTools();
const stale = [];

for (const { file, subs } of targets(n)) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [pattern, replacement] of subs) {
    if (!pattern.test(after)) {
      console.error(`✗ ${file}: pattern ${pattern} matched nothing — update this script.`);
      process.exit(2);
    }
    after = after.replace(pattern, replacement);
  }
  if (after === before) continue;
  stale.push(file);
  if (!check) writeFileSync(path, after);
}

if (check) {
  if (stale.length) {
    console.error(`✗ Tool count is ${n}, but these are out of date: ${stale.join(', ')}`);
    console.error(`  Run: npm run sync:tools`);
    process.exit(1);
  }
  console.log(`✓ Tool count (${n}) is in sync.`);
} else if (stale.length) {
  console.log(`✓ Bumped tool count to ${n} in: ${stale.join(', ')}`);
} else {
  console.log(`✓ Tool count (${n}) already in sync — nothing to do.`);
}
