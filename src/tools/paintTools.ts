import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import { getMapPath } from '../utils/fileHandler.js';
import { commitChange } from '../utils/commit.js';
import { MapData } from '../utils/types.js';
import { getMap, tileIndex } from './mapTools.js';
import { LayerAccess, applyAutotiling } from '../tiles/paint.js';
import { isAutotile } from '../tiles/tileCodec.js';

/** The 6 z-layers: 0-1 lower tiles, 2-3 upper tiles, 4 shadow, 5 region id. */
const MAX_LAYER = 5;
/** Layers that hold real tiles (autotiles only make sense here). */
const TILE_LAYERS = 4;

/** A LayerAccess bound to one z-layer of a map's flat `data` array (mutates in place). */
function layerAccess(map: MapData, layer: number): LayerAccess {
  return {
    width: map.width,
    height: map.height,
    get: (x, y) => map.data[tileIndex(map.width, map.height, x, y, layer)],
    set: (x, y, tileId) => {
      map.data[tileIndex(map.width, map.height, x, y, layer)] = tileId;
    },
  };
}

/** Response shape for a paint op: how much changed, plus any advisory warnings. */
interface PaintResult {
  mapId: number;
  layer: number;
  painted: number;
  warnings?: string[];
}

/**
 * Paint tiles onto a map layer, then autotile: each painted cell is set to the
 * given tile id and — for autotiles — every painted cell and its neighbours get
 * their shape recomputed from same-kind adjacency. Out-of-bounds cells are
 * skipped with a warning. Writes through the commit choke point (dry-run/diff).
 */
async function paintCells(
  projectPath: string,
  mapId: number,
  cells: { x: number; y: number; tileId: number }[],
  layer: number,
): Promise<PaintResult> {
  const map = await getMap(projectPath, mapId);
  const grid = layerAccess(map, layer);
  const warnings: string[] = [];
  const painted: { x: number; y: number }[] = [];
  let sawAutotile = false;

  for (const cell of cells) {
    if (cell.x < 0 || cell.x >= map.width || cell.y < 0 || cell.y >= map.height) {
      warnings.push(
        `(${cell.x}, ${cell.y}) is out of bounds (${map.width}x${map.height}) — skipped`,
      );
      continue;
    }
    grid.set(cell.x, cell.y, cell.tileId);
    painted.push({ x: cell.x, y: cell.y });
    if (isAutotile(cell.tileId)) sawAutotile = true;
  }

  // Autotiles only shape correctly on the tile layers (0-3); shadow/region don't
  // hold tiles. Flag it but still paint (the caller may know what they're doing).
  if (sawAutotile && layer >= TILE_LAYERS) {
    warnings.push(
      `layer ${layer} is not a tile layer (0-3) — autotile shapes will not render as expected`,
    );
  }

  applyAutotiling(grid, painted);

  await commitChange(getMapPath(projectPath, mapId), map);

  return warnings.length > 0
    ? { mapId, layer, painted: painted.length, warnings }
    : { mapId, layer, painted: painted.length };
}

export const paintToolDefinitions: ToolDefinition[] = [
  {
    name: 'paint_tiles',
    mutates: true,
    description:
      "Paint specific tiles onto a map, with automatic autotiling. Each cell is set to its tile id; if that id is an autotile (A1-A4, e.g. a catalog 'kind' base from find_tile), its shape and its neighbours' shapes are recomputed from same-kind adjacency so borders/corners line up. Flat tiles are painted as-is. Defaults to the lower ground layer (0). Higher-level than set_map_tile, which is a single raw tile with no autotiling.",
    inputSchema: {
      mapId: z.number().int().describe('The ID of the map'),
      tiles: z
        .array(
          z.object({
            x: z.number().int().describe('X tile position'),
            y: z.number().int().describe('Y tile position'),
            tileId: z
              .number()
              .int()
              .nonnegative()
              .describe('Tile id to paint (autotile base id from find_tile, or a raw id)'),
          }),
        )
        .min(1)
        .describe('Cells to paint'),
      layer: z
        .number()
        .int()
        .min(0)
        .max(MAX_LAYER)
        .optional()
        .describe('Z-layer 0-5 (default 0 = lower ground; 0-3 tiles, 4 shadow, 5 region id)'),
    },
    handler: (ctx, args) => paintCells(ctx.projectPath, args.mapId, args.tiles, args.layer ?? 0),
  },
  {
    name: 'fill_area',
    mutates: true,
    description:
      'Fill a rectangular area of a map with one tile id, with automatic autotiling — a filled autotile region borders itself correctly (and re-borders any same-kind tiles it touches). Flat tiles fill uniformly. Defaults to the lower ground layer (0). For region ids, fill layer 5 with the region number as tileId.',
    inputSchema: {
      mapId: z.number().int().describe('The ID of the map'),
      x: z.number().int().describe('Left tile position of the rectangle'),
      y: z.number().int().describe('Top tile position of the rectangle'),
      width: z.number().int().positive().describe('Rectangle width in tiles'),
      height: z.number().int().positive().describe('Rectangle height in tiles'),
      tileId: z
        .number()
        .int()
        .nonnegative()
        .describe('Tile id to fill with (autotile base or raw)'),
      layer: z
        .number()
        .int()
        .min(0)
        .max(MAX_LAYER)
        .optional()
        .describe('Z-layer 0-5 (default 0 = lower ground; 5 = region id)'),
    },
    handler: (ctx, args) => {
      const cells: { x: number; y: number; tileId: number }[] = [];
      for (let dy = 0; dy < args.height; dy++) {
        for (let dx = 0; dx < args.width; dx++) {
          cells.push({ x: args.x + dx, y: args.y + dy, tileId: args.tileId });
        }
      }
      return paintCells(ctx.projectPath, args.mapId, cells, args.layer ?? 0);
    },
  },
];
