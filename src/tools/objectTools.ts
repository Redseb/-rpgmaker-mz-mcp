import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import { getMapPath } from '../utils/fileHandler.js';
import { commitChange } from '../utils/commit.js';
import { MapData, Tileset } from '../utils/types.js';
import { getMap, tileIndex } from './mapTools.js';
import { getTileset } from './tilesetTools.js';
import { Passability, layeredPassability, layeredTerrainTag } from '../tiles/tileFlags.js';
import { isAutotile } from '../tiles/tileCodec.js';

/**
 * Smart multi-tile object placement (Phase 4). A B/C "object" (a house, tree,
 * fountain, …) is a rectangular block of *flat* sheet tiles that occupies more
 * than one cell. `place_object` stamps such a block onto a map — by default the
 * upper tile layer (2), so the object draws over the ground — and, using the
 * Phase 3e tileset flags, reports the placement's passability: which ground it
 * covered was walkable, and which footprint cells the object turns into a solid
 * (impassable) obstacle. Warn-by-default, like the rest of the validation layer:
 * it never refuses a placement, it tells you what the placement did.
 *
 * The differentiator from `paint_tiles`: no autotiling (objects are flat), plus
 * the passability site-check + collision report that `paint_tiles` has no notion
 * of. The object grid is supplied explicitly (rows of tile ids, 0 = a transparent
 * hole so L-shaped objects work) — obtain the ids from `find_tile`/`get_tile_catalog`.
 */

/** Upper tile layer — objects draw above the ground tiles on layers 0-1. */
const DEFAULT_LAYER = 2;
/** Layers that hold real tiles (0-3); 4 is the shadow pen, 5 region ids. */
const MAX_TILE_LAYER = 3;

/** The four stacked tile ids at a cell, upper layer first (z 3,2,1,0). */
function layeredTileIds(map: MapData, x: number, y: number): number[] {
  const ids: number[] = [];
  for (let z = 3; z >= 0; z--) {
    ids.push(map.data[tileIndex(map.width, map.height, x, y, z)] || 0);
  }
  return ids;
}

/** Layered passability + terrain tag of a cell as the map currently stands. */
function cellPassability(
  map: MapData,
  tileset: Tileset,
  x: number,
  y: number,
): { passable: Passability; terrainTag: number } {
  const flags = layeredTileIds(map, x, y).map((id) => tileset.flags[id] ?? 0);
  return { passable: layeredPassability(flags), terrainTag: layeredTerrainTag(flags) };
}

/** A cell with no walkable direction is impassable ground (water, cliff, wall, …). */
function isBlocked(p: Passability): boolean {
  return !p.down && !p.left && !p.right && !p.up;
}

/** Per-cell report of what the object did at one footprint cell. */
interface FootprintCell {
  x: number;
  y: number;
  tileId: number;
  /** Resulting layered passability of the cell after the object is placed. */
  passable: Passability;
  /** Terrain tag now reported at the cell. */
  terrainTag: number;
}

interface PlaceObjectResult {
  mapId: number;
  layer: number;
  /** Number of footprint cells actually written (skips 0-holes and out-of-bounds). */
  placed: number;
  footprint: FootprintCell[];
  /** Footprint cells the object turns into a fully-impassable obstacle. */
  collision: { x: number; y: number }[];
  warnings?: string[];
}

/**
 * Stamp a rectangular grid of flat object tiles onto a map layer and report the
 * placement's passability. `tiles` is rows (top→bottom) of tile ids (left→right);
 * a 0 leaves that cell untouched so non-rectangular objects can be described.
 */
async function placeObject(
  projectPath: string,
  mapId: number,
  originX: number,
  originY: number,
  tiles: number[][],
  layer: number,
): Promise<PlaceObjectResult> {
  const width = tiles[0].length;
  if (tiles.some((row) => row.length !== width)) {
    throw new Error('Object grid must be rectangular (every row the same length)');
  }

  const map = await getMap(projectPath, mapId);
  const tileset = await getTileset(projectPath, map.tilesetId);
  const warnings: string[] = [];
  const written: { x: number; y: number; tileId: number }[] = [];

  for (let dy = 0; dy < tiles.length; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const tileId = tiles[dy][dx];
      if (tileId === 0) continue; // transparent hole in the stamp — leave the cell as-is
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
        warnings.push(`(${x}, ${y}) is out of bounds (${map.width}x${map.height}) — skipped`);
        continue;
      }
      if (isAutotile(tileId)) {
        warnings.push(
          `tile ${tileId} at (${x}, ${y}) is an autotile — place_object does not autotile; use paint_tiles for terrain`,
        );
      }
      // Site check against the ground *before* we cover it.
      if (isBlocked(cellPassability(map, tileset, x, y).passable)) {
        warnings.push(`(${x}, ${y}) sits on impassable terrain — object placed over it`);
      }
      const existing = map.data[tileIndex(map.width, map.height, x, y, layer)] || 0;
      if (existing !== 0) {
        warnings.push(`overwrote existing tile ${existing} on layer ${layer} at (${x}, ${y})`);
      }
      map.data[tileIndex(map.width, map.height, x, y, layer)] = tileId;
      written.push({ x, y, tileId });
    }
  }

  // Resulting passability, now that the object tiles are in the stack.
  const footprint: FootprintCell[] = written.map(({ x, y, tileId }) => {
    const { passable, terrainTag } = cellPassability(map, tileset, x, y);
    return { x, y, tileId, passable, terrainTag };
  });
  const collision = footprint.filter((c) => isBlocked(c.passable)).map(({ x, y }) => ({ x, y }));

  await commitChange(getMapPath(projectPath, mapId), map);

  const result: PlaceObjectResult = {
    mapId,
    layer,
    placed: written.length,
    footprint,
    collision,
  };
  return warnings.length > 0 ? { ...result, warnings } : result;
}

export const objectToolDefinitions: ToolDefinition[] = [
  {
    name: 'place_object',
    mutates: true,
    description:
      "Place a multi-tile B/C object (a house, tree, fountain, …) on a map and report its passability. `tiles` is the object's block of flat tile ids as rows (top to bottom), each row left to right; a 0 leaves that cell untouched so L-shaped/irregular objects work. Stamped onto the upper tile layer (2) by default so it draws over the ground. Unlike paint_tiles this does NOT autotile (objects are flat sheet tiles) — instead it uses the tileset flags to warn when a footprint cell sits on impassable terrain or overwrites an existing tile, and returns the resulting per-cell passability plus the `collision` cells the object turns into a solid obstacle. Warn-by-default: never refuses a placement. Get tile ids from find_tile/get_tile_catalog.",
    inputSchema: {
      mapId: z.number().int().positive().describe('The ID of the map'),
      x: z.number().int().describe('Left (top-left) tile x of where the object is placed'),
      y: z.number().int().describe('Top (top-left) tile y of where the object is placed'),
      tiles: z
        .array(z.array(z.number().int().nonnegative()).min(1))
        .min(1)
        .describe(
          'The object as a rectangular grid of tile ids: rows top→bottom, each row left→right. 0 = a transparent cell (left untouched).',
        ),
      layer: z
        .number()
        .int()
        .min(0)
        .max(MAX_TILE_LAYER)
        .optional()
        .describe(
          'Z-layer 0-3 to stamp onto (default 2 = upper tile layer, drawn over the ground)',
        ),
    },
    handler: (ctx, args) =>
      placeObject(
        ctx.projectPath,
        args.mapId,
        args.x,
        args.y,
        args.tiles,
        args.layer ?? DEFAULT_LAYER,
      ),
  },
];
