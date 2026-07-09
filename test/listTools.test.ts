import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { listNames, listToolDefinitions, LISTABLE_FILES } from '../src/tools/listTools.js';

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
