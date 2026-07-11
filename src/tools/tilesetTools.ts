import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import { getDataPath, readJsonFile } from '../utils/fileHandler.js';
import { MapData, Tileset } from '../utils/types.js';
import { getMap, tileIndex } from './mapTools.js';
import {
  Direction,
  decodeFlags,
  layeredPassability,
  layeredTerrainTag,
} from '../tiles/tileFlags.js';
import { decodeTile } from '../tiles/tileCodec.js';

/**
 * Read-only tools over a tileset's `flags[]` array (Phase 3e) — the bit-packed
 * per-tile-id metadata the editor sets and the engine reads for movement.
 * `get_tile_flags` decodes one tile's flag word; `check_passability` reproduces
 * the engine's *layered* passage logic for a real map cell (the stacked tiles
 * decide, upper layer first). Independent of the paint pipeline — pure reads.
 */

/** Load one tileset from the project's data/Tilesets.json (1-indexed, slot 0 null). */
export async function getTileset(projectPath: string, tilesetId: number): Promise<Tileset> {
  const tilesets = await readJsonFile<(Tileset | null)[]>(
    getDataPath(projectPath, 'Tilesets.json'),
  );
  const tileset = tilesets[tilesetId];
  if (!tileset) {
    throw new Error(`Tileset ${tilesetId} not found`);
  }
  return tileset;
}

/** The four stacked tile ids at a cell, upper layer first (z 3,2,1,0) — the engine's `layeredTiles` order. */
function layeredTileIds(map: MapData, x: number, y: number): number[] {
  const ids: number[] = [];
  for (let z = 3; z >= 0; z--) {
    ids.push(map.data[tileIndex(map.width, map.height, x, y, z)] || 0);
  }
  return ids;
}

export const tilesetToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_tile_flags',
    description:
      "Decode a tileset's flag word for a single tile id into a legible view: 4-direction passability (down/left/right/up — true = walkable that way), the [*] 'star' overlay bit, ladder/bush/counter/damage-floor flags, and terrain tag (0–7). Read-only inspection of data/Tilesets.json flags[]. Note passability here is for the tile in isolation; a real cell's passability layers its stacked tiles — use check_passability for that. Returns { tilesetId, tileId, tile, flags }.",
    inputSchema: {
      tilesetId: z.number().int().positive().describe('Tileset id (from Tilesets.json / the map)'),
      tileId: z.number().int().nonnegative().describe('The raw tile id whose flags to decode'),
    },
    handler: async (ctx, args) => {
      const tileset = await getTileset(ctx.projectPath, args.tilesetId);
      const flag = tileset.flags[args.tileId] ?? 0;
      return {
        tilesetId: args.tilesetId,
        tilesetName: tileset.name,
        tileId: args.tileId,
        tile: decodeTile(args.tileId),
        flags: decodeFlags(flag),
      };
    },
  },
  {
    name: 'check_passability',
    description:
      "Check whether a map cell can be walked onto, reproducing the engine's layered passage rule: the stacked tiles at (x, y) are examined upper-layer first, and the first non-[*] tile decides each direction. Reads the map's tileset flags. Returns per-direction passability (down/left/right/up — true = a character can walk off the cell that way), the cell's terrain tag, the stacked tile ids, and — when `direction` is given — a single `passable` boolean for that direction. Read-only.",
    inputSchema: {
      mapId: z.number().int().positive().describe('The map id to inspect'),
      x: z.number().int().nonnegative().describe('Tile x coordinate'),
      y: z.number().int().nonnegative().describe('Tile y coordinate'),
      direction: z
        .enum(['down', 'left', 'right', 'up'])
        .optional()
        .describe('Optional: also report a single passable boolean for this direction'),
    },
    handler: async (ctx, args) => {
      const map = await getMap(ctx.projectPath, args.mapId);
      if (args.x < 0 || args.x >= map.width || args.y < 0 || args.y >= map.height) {
        throw new Error(
          `Position (${args.x}, ${args.y}) is out of map bounds (${map.width}x${map.height})`,
        );
      }
      const tileset = await getTileset(ctx.projectPath, map.tilesetId);
      const stack = layeredTileIds(map, args.x, args.y);
      const stackFlags = stack.map((id) => tileset.flags[id] ?? 0);
      const passable = layeredPassability(stackFlags);
      return {
        mapId: args.mapId,
        x: args.x,
        y: args.y,
        tilesetId: map.tilesetId,
        stack,
        passable,
        terrainTag: layeredTerrainTag(stackFlags),
        ...(args.direction
          ? {
              direction: args.direction,
              passableInDirection: passable[args.direction as Direction],
            }
          : {}),
      };
    },
  },
];
