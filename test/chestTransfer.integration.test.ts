import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { eventPageToolDefinitions } from '../src/tools/eventPageTools.js';
import { getMapEvent } from '../src/tools/mapTools.js';
import { ToolContext } from '../src/registry.js';
import { MapEvent } from '../src/utils/types.js';

const createChest = eventPageToolDefinitions.find((t) => t.name === 'create_chest')!;
const createTransfer = eventPageToolDefinitions.find((t) => t.name === 'create_transfer')!;

interface EventResponse {
  event: { id: number; name: string; x: number; y: number; pageCount: number };
  warnings?: { path: string; message: string }[];
}

async function run(
  tool: (typeof eventPageToolDefinitions)[number],
  dir: string,
  args: Record<string, unknown>,
): Promise<EventResponse> {
  return (await tool.handler({ projectPath: dir } as ToolContext, args)) as EventResponse;
}

/** A walkable 10x10 map (tile 2048 on layer 0 is a passable autotile in the fixture). */
function blankMap(id: number) {
  const width = 10;
  const height = 10;
  const data = new Array(width * height * 6).fill(0);
  for (let i = 0; i < width * height; i++) data[i] = 2048;
  return { id, width, height, data, events: [null], tilesetId: 1, encounterList: [] };
}

async function scaffoldProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rpgmz-idiom-'));
  await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
  await mkdir(join(dir, 'data'));
  await writeFile(join(dir, 'data', 'System.json'), '{}');
  await writeFile(
    join(dir, 'data', 'MapInfos.json'),
    JSON.stringify([
      null,
      { id: 1, name: 'Field', parentId: 0, order: 1 },
      { id: 2, name: 'Cave', parentId: 0, order: 2 },
    ]),
  );
  await writeFile(join(dir, 'data', 'Map001.json'), JSON.stringify(blankMap(1)));
  await writeFile(join(dir, 'data', 'Map002.json'), JSON.stringify(blankMap(2)));
  await writeFile(
    join(dir, 'data', 'Items.json'),
    JSON.stringify([null, { id: 1, name: 'Potion', effects: [] }]),
  );
  await writeFile(join(dir, 'data', 'Weapons.json'), JSON.stringify([null]));
  await writeFile(join(dir, 'data', 'Armors.json'), JSON.stringify([null]));
  return dir;
}

describe('create_chest (integration)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await scaffoldProject();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('builds the two-page self-switch chest', async () => {
    const result = await run(createChest, dir, {
      mapId: 1,
      x: 3,
      y: 4,
      kind: 'item',
      id: 1,
      amount: 2,
      characterName: '!Chest',
      text: ['Found 2 Potions!'],
    });

    expect(result.event.pageCount).toBe(2);
    const event = (await getMapEvent(dir, 1, result.event.id)) as MapEvent;

    // Page 1: closed chest, action button, priority `same` so facing it fires.
    const [closed, opened] = event.pages;
    expect(closed.image).toMatchObject({ characterName: '!Chest', direction: 2 });
    expect(closed.trigger).toBe(0);
    expect(closed.priorityType).toBe(1);
    expect(closed.conditions.selfSwitchValid).toBe(false);
    // ...shows the text, gives the item, then flips its self switch, terminated.
    expect(closed.list.map((c) => c.code)).toEqual([101, 401, 126, 123, 0]);
    expect(closed.list[2].parameters).toEqual([1, 0, 0, 2]);
    expect(closed.list[3].parameters).toEqual(['A', 0]);

    // Page 2: opened chest gated on the self switch, doing nothing.
    expect(opened.image).toMatchObject({ characterName: '!Chest', direction: 8 });
    expect(opened.conditions).toMatchObject({ selfSwitchValid: true, selfSwitchCh: 'A' });
    expect(opened.list.map((c) => c.code)).toEqual([0]);
  });

  it('builds a gold chest with no id', async () => {
    const result = await run(createChest, dir, {
      mapId: 1,
      x: 1,
      y: 1,
      kind: 'gold',
      amount: 500,
      characterName: '!Chest',
    });
    const event = (await getMapEvent(dir, 1, result.event.id)) as MapEvent;
    // 125 = Change Gold, [increase, constant, 500]
    expect(event.pages[0].list.map((c) => c.code)).toEqual([125, 123, 0]);
    expect(event.pages[0].list[0].parameters).toEqual([0, 0, 500]);
  });

  it('throws when the payout references a record that does not exist', async () => {
    await expect(
      run(createChest, dir, { mapId: 1, x: 1, y: 1, kind: 'item', id: 99 }),
    ).rejects.toThrow(/item 99 does not exist/);
  });

  it('throws when a non-gold chest has no id', async () => {
    await expect(run(createChest, dir, { mapId: 1, x: 1, y: 1, kind: 'item' })).rejects.toThrow(
      /`id` is required/,
    );
  });

  it('warns when the chest has no graphic', async () => {
    const result = await run(createChest, dir, { mapId: 1, x: 1, y: 1, kind: 'gold', amount: 1 });
    expect(result.warnings?.some((w) => /invisible/i.test(w.message))).toBe(true);
  });

  it('honours a custom self-switch channel', async () => {
    const result = await run(createChest, dir, {
      mapId: 1,
      x: 2,
      y: 2,
      kind: 'gold',
      amount: 1,
      selfSwitch: 'C',
    });
    const event = (await getMapEvent(dir, 1, result.event.id)) as MapEvent;
    expect(event.pages[0].list[1].parameters).toEqual(['C', 0]);
    expect(event.pages[1].conditions).toMatchObject({ selfSwitchValid: true, selfSwitchCh: 'C' });
  });
});

describe('create_transfer (integration)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await scaffoldProject();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('defaults to the action-button, priority-same landmark idiom', async () => {
    const result = await run(createTransfer, dir, {
      mapId: 1,
      x: 5,
      y: 5,
      targetMapId: 2,
      targetX: 3,
      targetY: 7,
      direction: 'up',
    });

    const event = (await getMapEvent(dir, 1, result.event.id)) as MapEvent;
    const page = event.pages[0];
    expect(page.trigger).toBe(0); // action button
    expect(page.priorityType).toBe(1); // same — fires when faced
    // 201 = Transfer Player [direct, mapId, x, y, direction(up=8), fade(black=0)]
    expect(page.list.map((c) => c.code)).toEqual([201, 0]);
    expect(page.list[0].parameters).toEqual([0, 2, 3, 7, 8, 0]);
  });

  it('builds the player-touch doormat idiom', async () => {
    const result = await run(createTransfer, dir, {
      mapId: 1,
      x: 5,
      y: 5,
      targetMapId: 2,
      targetX: 1,
      targetY: 1,
      idiom: 'player_touch',
      fade: 'none',
    });

    const event = (await getMapEvent(dir, 1, result.event.id)) as MapEvent;
    const page = event.pages[0];
    expect(page.trigger).toBe(1); // player touch
    expect(page.priorityType).toBe(0); // below — walked onto
    expect(page.list[0].parameters).toEqual([0, 2, 1, 1, 0, 2]);
  });

  it('throws when the destination map does not exist', async () => {
    await expect(
      run(createTransfer, dir, {
        mapId: 1,
        x: 1,
        y: 1,
        targetMapId: 99,
        targetX: 1,
        targetY: 1,
      }),
    ).rejects.toThrow(/target map 99 does not exist/);
  });

  it('warns when the destination tile is off the target map', async () => {
    const result = await run(createTransfer, dir, {
      mapId: 1,
      x: 1,
      y: 1,
      targetMapId: 2,
      targetX: 50,
      targetY: 50,
    });
    expect(result.warnings?.some((w) => /outside map 2/.test(w.message))).toBe(true);
  });
});
