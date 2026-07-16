#!/usr/bin/env node
// Build a self-contained MCPB bundle (.mcpb) for one-click install in Claude
// Desktop. Stages the manifest, the compiled server, and production-only
// node_modules in a scratch directory, then packs it with the official
// @anthropic-ai/mcpb CLI. Output: rpgmaker-mz-mcp.mcpb at the repo root.

import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stage = join(root, '.mcpb-stage');
const out = join(root, 'rpgmaker-mz-mcp.mcpb');

const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

if (!existsSync(join(root, 'dist', 'index.js'))) {
  console.error('dist/index.js missing — run `npm run build` first.');
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage);
cpSync(join(root, 'mcpb', 'manifest.json'), join(stage, 'manifest.json'));
cpSync(join(root, 'package.json'), join(stage, 'package.json'));
cpSync(join(root, 'package-lock.json'), join(stage, 'package-lock.json'));
cpSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
cpSync(join(root, 'dist'), join(stage, 'dist'), { recursive: true });

// Production dependencies only — the bundle ships its node_modules.
// --ignore-scripts keeps our own `prepare` (tsc) from running in the stage,
// where there is no src/ to compile.
run('npm ci --omit=dev --ignore-scripts', stage);

run(`npx --yes @anthropic-ai/mcpb pack "${stage}" "${out}"`);
rmSync(stage, { recursive: true, force: true });
console.log(`\nBuilt ${out}`);
