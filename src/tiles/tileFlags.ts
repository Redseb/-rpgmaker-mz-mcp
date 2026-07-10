/**
 * RPG Maker MZ tile-flag codec (Phase 3e).
 *
 * Every tileset carries a parallel `flags[]` array — one bit-packed word per
 * tile id (index === tile id, length 8192) — that the *editor* sets and the
 * *engine* reads to decide movement and behaviour. None of it is legible from
 * the integer alone, so this module decodes a flag word into a curated view
 * (4-direction passability, terrain tag, ladder/bush/counter/damage) and
 * reproduces the engine's layered passage logic for a stack of tiles.
 *
 * All functions are pure (no I/O). Bit meanings and the passage algorithm are
 * taken verbatim from `rmmz_objects.js` `Game_Map` (corescript v1.7.0):
 *   - passage bits: down 0x01, left 0x02, right 0x04, up 0x08 (SET = blocked)
 *   - 0x10 [*] "star": drawn above the character, no effect on passage
 *   - 0x20 ladder, 0x40 bush, 0x80 counter, 0x100 damage floor
 *   - terrain tag: flag >> 12 (0–7)
 */

/** Passage bit per compass direction. A SET bit means "blocked" that way. */
export const PASSAGE_BITS = {
  down: 0x01,
  left: 0x02,
  right: 0x04,
  up: 0x08,
} as const;

export const STAR_BIT = 0x10;
export const LADDER_BIT = 0x20;
export const BUSH_BIT = 0x40;
export const COUNTER_BIT = 0x80;
export const DAMAGE_BIT = 0x100;

export type Direction = keyof typeof PASSAGE_BITS;

/** Per-direction passability — `true` means a character can walk off the tile that way. */
export interface Passability {
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
}

/** A decoded single-tile flag word — the curated view `get_tile_flags` returns. */
export interface TileFlags {
  /** The raw bit-packed flag word. */
  raw: number;
  /**
   * Passability read from this one tile in isolation (SET passage bit → not
   * passable that way). Note the engine resolves the *cell's* passability by
   * layering the stacked tiles — see `layeredPassability`.
   */
  passage: Passability;
  /** [*] "star": tile drawn above the character; has no effect on cell passage. */
  star: boolean;
  ladder: boolean;
  bush: boolean;
  counter: boolean;
  /** Damage floor — standing on it hurts. */
  damage: boolean;
  /** Terrain tag 0–7 (0 = none) — a designer-assigned marker read by events/plugins. */
  terrainTag: number;
}

/** Decode one tile's flag word into the curated single-tile view. */
export function decodeFlags(flag: number): TileFlags {
  return {
    raw: flag,
    passage: {
      down: (flag & PASSAGE_BITS.down) === 0,
      left: (flag & PASSAGE_BITS.left) === 0,
      right: (flag & PASSAGE_BITS.right) === 0,
      up: (flag & PASSAGE_BITS.up) === 0,
    },
    star: (flag & STAR_BIT) !== 0,
    ladder: (flag & LADDER_BIT) !== 0,
    bush: (flag & BUSH_BIT) !== 0,
    counter: (flag & COUNTER_BIT) !== 0,
    damage: (flag & DAMAGE_BIT) !== 0,
    terrainTag: flag >> 12,
  };
}

/**
 * Reproduce `Game_Map.checkPassage`: walk a cell's stacked tile flags (upper
 * layer first) and let the first non-star tile decide. A `[*]` star tile has no
 * effect and is skipped; if every tile is a star (or the stack is empty), the
 * cell is impassable — matching the engine's `return false` fall-through.
 *
 * @param stackFlags flag words of the stacked tiles, upper-layer-first.
 * @param bit one of `PASSAGE_BITS`.
 */
export function checkPassage(stackFlags: number[], bit: number): boolean {
  for (const flag of stackFlags) {
    if ((flag & STAR_BIT) !== 0) continue; // [*] no effect on passage
    return (flag & bit) === 0; // first non-star tile decides
  }
  return false;
}

/** Layered 4-direction passability for a cell, from its stacked tile flags (upper-first). */
export function layeredPassability(stackFlags: number[]): Passability {
  return {
    down: checkPassage(stackFlags, PASSAGE_BITS.down),
    left: checkPassage(stackFlags, PASSAGE_BITS.left),
    right: checkPassage(stackFlags, PASSAGE_BITS.right),
    up: checkPassage(stackFlags, PASSAGE_BITS.up),
  };
}

/**
 * Reproduce `Game_Map.terrainTag`: the terrain tag of the first stacked tile
 * (upper-layer-first) that carries a non-zero tag, else 0.
 */
export function layeredTerrainTag(stackFlags: number[]): number {
  for (const flag of stackFlags) {
    const tag = flag >> 12;
    if (tag > 0) return tag;
  }
  return 0;
}
