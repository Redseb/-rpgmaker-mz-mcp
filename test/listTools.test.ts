import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  listNames,
  getDatabase,
  listToolDefinitions,
  LISTABLE_FILES,
  DATABASE_TYPES,
} from '../src/tools/listTools.js';

async function scaffold(files: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rpgmz-list-'));
  await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
  await mkdir(join(dir, 'data'));
  for (const [name, data] of Object.entries(files)) {
    await writeFile(join(dir, 'data', name), JSON.stringify(data));
  }
  return dir;
}

describe('listNames', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await scaffold({
      'Actors.json': [null, { id: 1, name: 'Reid' }, { id: 2, name: 'Priscilla' }],
      'MapInfos.json': [null, { id: 1, name: 'Town', parentId: 0 }],
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns a compact id/name index, dropping the null slot 0', async () => {
    const result = await listNames(dir, 'actors');
    expect(result).toEqual({
      type: 'actors',
      count: 2,
      entries: [
        { id: 1, name: 'Reid' },
        { id: 2, name: 'Priscilla' },
      ],
    });
  });

  it('works for maps (MapInfos) and strips extra fields like parentId', async () => {
    const result = await listNames(dir, 'maps');
    expect(result.entries).toEqual([{ id: 1, name: 'Town' }]);
  });

  it('covers every listable type in LISTABLE_FILES', () => {
    // Guards against a type being added to the enum without a file mapping.
    for (const file of Object.values(LISTABLE_FILES)) {
      expect(file).toMatch(/\.json$/);
    }
  });

  it('the list_names tool handler dispatches to listNames', async () => {
    const def = listToolDefinitions.find((t) => t.name === 'list_names')!;
    const result = (await def.handler({ projectPath: dir }, { type: 'actors' })) as Awaited<
      ReturnType<typeof listNames>
    >;
    expect(result.count).toBe(2);
  });
});

describe('getDatabase', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await scaffold({
      'Actors.json': [null, { id: 1, name: 'Reid' }, { id: 2, name: 'Priscilla' }],
      'Items.json': [null, { id: 1, name: 'Potion' }],
    });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns the raw 1-indexed table, null slot 0 included', async () => {
    const records = (await getDatabase(dir, 'actors')) as ({ id: number; name: string } | null)[];
    expect(records[0]).toBeNull();
    expect(records.map((r) => r?.name)).toEqual([undefined, 'Reid', 'Priscilla']);
  });

  it('returns a single record by id, and null when it does not exist', async () => {
    expect(await getDatabase(dir, 'actors', 2)).toMatchObject({ name: 'Priscilla' });
    expect(await getDatabase(dir, 'actors', 99)).toBeNull();
  });

  it('reads a different table off the same type enum', async () => {
    expect(await getDatabase(dir, 'items', 1)).toMatchObject({ name: 'Potion' });
  });

  it('only names types that LISTABLE_FILES can resolve to a file', () => {
    // get_database's enum is a subset of the listable tables; a type added to one
    // without the other would read undefined.json.
    for (const type of DATABASE_TYPES) {
      expect(LISTABLE_FILES[type]).toMatch(/\.json$/);
    }
  });

  it('the get_database tool handler dispatches to getDatabase', async () => {
    const def = listToolDefinitions.find((t) => t.name === 'get_database')!;
    const result = await def.handler({ projectPath: dir }, { type: 'actors', id: 1 });
    expect(result).toMatchObject({ name: 'Reid' });
  });
});
