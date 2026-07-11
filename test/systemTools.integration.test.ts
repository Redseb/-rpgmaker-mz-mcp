import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getPartyMembers,
  updatePartyMembers,
  getTerms,
  setTerm,
  getTypes,
  setTypeName,
  setCurrencyUnit,
} from '../src/tools/systemTools.js';

/** A minimal System.json with the fields these tools touch. */
function seedSystem() {
  return {
    partyMembers: [1],
    currencyUnit: 'G',
    elements: ['', 'Physical', 'Fire'],
    skillTypes: ['', 'Magic'],
    weaponTypes: ['', 'Dagger', 'Sword'],
    armorTypes: ['', 'General Armor'],
    equipTypes: ['', 'Weapon', 'Shield'],
    terms: {
      basic: ['Level', 'Lv', 'HP', 'HP'],
      commands: ['Fight', 'Escape'],
      params: ['Max HP', 'Max MP'],
      messages: { actorDamage: '%1 took %2 damage!' },
    },
  };
}

/** Scaffold a project with System.json and a 2-actor Actors.json (ids 1 and 2). */
async function scaffoldProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rpgmz-system-'));
  await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
  await mkdir(join(dir, 'data'));
  await writeFile(join(dir, 'data', 'System.json'), JSON.stringify(seedSystem()));
  await writeFile(
    join(dir, 'data', 'Actors.json'),
    JSON.stringify([null, { id: 1, name: 'Harold' }, { id: 2, name: 'Therese' }]),
  );
  return dir;
}

describe('system tools (integration)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await scaffoldProject();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('get_party / set_party round-trip and persist compactly', async () => {
    expect(await getPartyMembers(dir)).toEqual([1]);

    await updatePartyMembers(dir, [2, 1]);
    expect(await getPartyMembers(dir)).toEqual([2, 1]);

    const raw = await readFile(join(dir, 'data', 'System.json'), 'utf-8');
    expect(raw).not.toContain('\n');
  });

  it('set_party rejects a non-existent actor id', async () => {
    await expect(updatePartyMembers(dir, [1, 99])).rejects.toThrow(/actor id 99 does not exist/);
  });

  it('setTerm edits an indexed array category', async () => {
    const terms = await setTerm(dir, 'commands', '0', 'Attack');
    expect(terms.commands[0]).toBe('Attack');
    expect((await getTerms(dir)).commands[0]).toBe('Attack');
  });

  it('setTerm edits a message-key category', async () => {
    await setTerm(dir, 'messages', 'actorRecovery', '%1 recovered %2 HP!');
    expect((await getTerms(dir)).messages.actorRecovery).toBe('%1 recovered %2 HP!');
  });

  it('setTerm throws on an out-of-range index', async () => {
    await expect(setTerm(dir, 'basic', '99', 'x')).rejects.toThrow(/out of range/);
  });

  it('getTypes / setTypeName round-trip', async () => {
    expect(await getTypes(dir, 'weaponTypes')).toEqual(['', 'Dagger', 'Sword']);
    const updated = await setTypeName(dir, 'weaponTypes', 2, 'Broadsword');
    expect(updated[2]).toBe('Broadsword');
    expect(await getTypes(dir, 'weaponTypes')).toEqual(['', 'Dagger', 'Broadsword']);
  });

  it('setTypeName throws on an out-of-range index', async () => {
    await expect(setTypeName(dir, 'elements', 99, 'Plasma')).rejects.toThrow(/out of range/);
  });

  it('setCurrencyUnit updates the unit', async () => {
    await setCurrencyUnit(dir, 'Gold');
    const raw = JSON.parse(await readFile(join(dir, 'data', 'System.json'), 'utf-8'));
    expect(raw.currencyUnit).toBe('Gold');
  });
});
