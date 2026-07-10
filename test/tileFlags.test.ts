import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  decodeFlags,
  checkPassage,
  layeredPassability,
  layeredTerrainTag,
  PASSAGE_BITS,
} from '../src/tiles/tileFlags.js';
import { blankMapData } from '../src/tools/mapTools.js';
import { tilesetToolDefinitions } from '../src/tools/tilesetTools.js';

// --- pure codec -------------------------------------------------------------

describe('decodeFlags', () => {
  it('reads a fully-passable, featureless tile', () => {
    expect(decodeFlags(0)).toEqual({
      raw: 0,
      passage: { down: true, left: true, right: true, up: true },
      star: false,
      ladder: false,
      bush: false,
      counter: false,
      damage: false,
      terrainTag: 0,
    });
  });

  it('reads a fully-blocked tile (0x0f)', () => {
    expect(decodeFlags(0x0f).passage).toEqual({
      down: false,
      left: false,
      right: false,
      up: false,
    });
  });

  it('reads one blocked direction at a time', () => {
    expect(decodeFlags(PASSAGE_BITS.down).passage.down).toBe(false);
    expect(decodeFlags(PASSAGE_BITS.down).passage.up).toBe(true);
    expect(decodeFlags(PASSAGE_BITS.up).passage.up).toBe(false);
  });

  it('reads the behaviour bits', () => {
    expect(decodeFlags(0x10).star).toBe(true);
    expect(decodeFlags(0x20).ladder).toBe(true);
    expect(decodeFlags(0x40).bush).toBe(true);
    expect(decodeFlags(0x80).counter).toBe(true);
    expect(decodeFlags(0x100).damage).toBe(true);
  });

  it('extracts the terrain tag from the high bits', () => {
    expect(decodeFlags(0x1000).terrainTag).toBe(1);
    expect(decodeFlags(0x7000).terrainTag).toBe(7);
    // low bits don't leak into the tag
    expect(decodeFlags(0x3000 | 0x0f).terrainTag).toBe(3);
  });
});

// --- layered passage (engine's checkPassage) --------------------------------

describe('checkPassage (layered, upper-first)', () => {
  it('is impassable when the stack is empty or all-star', () => {
    expect(checkPassage([], PASSAGE_BITS.down)).toBe(false);
    expect(checkPassage([0x10, 0x10], PASSAGE_BITS.down)).toBe(false);
  });

  it('lets the first non-star tile decide', () => {
    // star on top, passable ground below → passable
    expect(checkPassage([0x10, 0x00], PASSAGE_BITS.down)).toBe(true);
    // star on top, blocking wall below → blocked
    expect(checkPassage([0x10, 0x0f], PASSAGE_BITS.down)).toBe(false);
    // a solid tile on top decides even if something passable is under it
    expect(checkPassage([0x0f, 0x00], PASSAGE_BITS.down)).toBe(false);
  });
});

describe('layeredPassability / layeredTerrainTag', () => {
  it('resolves all four directions over a stack', () => {
    // empty upper layers (0x10 star) over a wall blocking up only
    expect(layeredPassability([0x10, 0x10, 0x10, PASSAGE_BITS.up])).toEqual({
      down: true,
      left: true,
      right: true,
      up: false,
    });
  });

  it('takes the terrain tag of the first tagged tile, upper-first', () => {
    expect(layeredTerrainTag([0x10, 0x2000, 0x1000])).toBe(2);
    expect(layeredTerrainTag([0, 0, 0])).toBe(0);
  });
});

// --- tool integration -------------------------------------------------------

/** A tileset flags array with a couple of tiles configured. */
function fixtureFlags(): number[] {
  const flags = new Array(8192).fill(0);
  flags[0] = 0x10; // empty tile is a [*] star, per the editor's default
  flags[100] = 0x0f; // a fully-blocking wall tile
  flags[200] = 0x20 | 0x3000; // ladder + terrain tag 3
  return flags;
}

async function scaffold(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rpgmz-flags-'));
  await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
  await mkdir(join(dir, 'data'));
  await writeFile(join(dir, 'data', 'System.json'), '{}');
  const tileset = {
    id: 1,
    name: 'Test',
    mode: 1,
    note: '',
    tilesetNames: ['', '', '', '', '', 'B', '', '', ''],
    flags: fixtureFlags(),
  };
  await writeFile(join(dir, 'data', 'Tilesets.json'), JSON.stringify([null, tileset]));

  // A 4x4 map. Ground tile 300 (flag 0 = passable) everywhere on layer 0, then a
  // wall (tile 100) at (1,1) and a ladder (200) at (2,2) painted over it.
  const map = blankMapData(4, 4, 1);
  const idx = (x: number, y: number, z: number) => (z * map.height + y) * map.width + x;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) map.data[idx(x, y, 0)] = 300;
  map.data[idx(1, 1, 0)] = 100;
  map.data[idx(2, 2, 0)] = 200;
  await writeFile(join(dir, 'data', 'Map001.json'), JSON.stringify(map));
  return dir;
}

const getTileFlags = tilesetToolDefinitions.find((t) => t.name === 'get_tile_flags')!;
const checkPassability = tilesetToolDefinitions.find((t) => t.name === 'check_passability')!;

describe('tileset flag tools (integration)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await scaffold();
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('get_tile_flags decodes a blocking tile', async () => {
    const res = (await getTileFlags.handler(
      { projectPath: dir },
      { tilesetId: 1, tileId: 100 },
    )) as { flags: ReturnType<typeof decodeFlags>; tilesetName: string };
    expect(res.tilesetName).toBe('Test');
    expect(res.flags.passage).toEqual({ down: false, left: false, right: false, up: false });
  });

  it('get_tile_flags decodes ladder + terrain tag', async () => {
    const res = (await getTileFlags.handler(
      { projectPath: dir },
      { tilesetId: 1, tileId: 200 },
    )) as { flags: ReturnType<typeof decodeFlags> };
    expect(res.flags.ladder).toBe(true);
    expect(res.flags.terrainTag).toBe(3);
  });

  it('check_passability blocks the wall cell but not open ground', async () => {
    const wall = (await checkPassability.handler(
      { projectPath: dir },
      { mapId: 1, x: 1, y: 1 },
    )) as { passable: Record<string, boolean>; stack: number[] };
    expect(wall.passable).toEqual({ down: false, left: false, right: false, up: false });
    expect(wall.stack).toContain(100);

    const open = (await checkPassability.handler(
      { projectPath: dir },
      { mapId: 1, x: 0, y: 0 },
    )) as { passable: Record<string, boolean> };
    expect(open.passable).toEqual({ down: true, left: true, right: true, up: true });
  });

  it('check_passability reports terrain tag and a single-direction boolean', async () => {
    const res = (await checkPassability.handler(
      { projectPath: dir },
      { mapId: 1, x: 2, y: 2, direction: 'down' },
    )) as { terrainTag: number; passableInDirection: boolean; direction: string };
    expect(res.terrainTag).toBe(3);
    expect(res.direction).toBe('down');
    expect(res.passableInDirection).toBe(true); // ladder tile is passable
  });

  it('check_passability rejects out-of-bounds coordinates', async () => {
    await expect(
      checkPassability.handler({ projectPath: dir }, { mapId: 1, x: 99, y: 0 }),
    ).rejects.toThrow(/out of map bounds/);
  });
});
