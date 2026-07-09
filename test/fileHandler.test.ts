import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getDataPath,
  getMapPath,
  readJsonFile,
  writeJsonFile,
  validateProjectPath,
} from '../src/utils/fileHandler.js';

describe('path helpers', () => {
  it('getDataPath joins under data/', () => {
    expect(getDataPath('/proj', 'System.json')).toBe(join('/proj', 'data', 'System.json'));
  });

  it('getMapPath zero-pads the map id to 3 digits', () => {
    expect(getMapPath('/proj', 1)).toBe(join('/proj', 'data', 'Map001.json'));
    expect(getMapPath('/proj', 42)).toBe(join('/proj', 'data', 'Map042.json'));
    expect(getMapPath('/proj', 128)).toBe(join('/proj', 'data', 'Map128.json'));
  });
});

describe('JSON I/O', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rpgmz-io-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips data through write/read', async () => {
    const file = join(dir, 'data.json');
    const data = [null, { id: 1, name: 'Reid' }];
    await writeJsonFile(file, data);
    expect(await readJsonFile(file)).toEqual(data);
  });

  it('writes compact JSON (matching the RPG Maker MZ editor format)', async () => {
    const file = join(dir, 'compact.json');
    await writeJsonFile(file, { a: 1, b: [1, 2, 3] });
    const raw = await readFile(file, 'utf-8');
    // Compact means no pretty-print indentation / newlines.
    expect(raw).toBe('{"a":1,"b":[1,2,3]}');
    expect(raw).not.toContain('\n');
  });

  it('readJsonFile rejects on a missing file', async () => {
    await expect(readJsonFile(join(dir, 'nope.json'))).rejects.toThrow(/Failed to read JSON file/);
  });
});

describe('validateProjectPath', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rpgmz-valid-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is false for a directory that is not an RPG Maker MZ project', async () => {
    expect(await validateProjectPath(dir)).toBe(false);
  });

  it('is true once the marker files exist', async () => {
    const { mkdir, writeFile } = await import('fs/promises');
    await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
    await mkdir(join(dir, 'data'));
    await writeFile(join(dir, 'data', 'System.json'), '{}');
    expect(await validateProjectPath(dir)).toBe(true);
  });
});
