import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import { decodeTile } from '../tiles/tileCodec.js';

/**
 * Read-only tools over the tile-id codec. `describe_tile` turns an opaque raw
 * tile integer into a legible {sheet, kind, shape, autotile geometry} view —
 * the inspection counterpart to the low-level `set_map_tile` primitive, and the
 * foothold for the semantic catalog and paint commands that follow.
 */
export const tileToolDefinitions: ToolDefinition[] = [
  {
    name: 'describe_tile',
    description:
      'Decode a raw RPG Maker MZ tile id into its tileset sheet (A1–A5, B–E), and for autotiles its kind + shape slot (0–47) and autotile geometry (floor/wall/waterfall). Read-only inspection helper — raw tile ids are opaque integers, this makes one legible. Returns { tileId, empty, sheet, sheetIndex, autotile, kind?, shape?, autotileType? }.',
    inputSchema: {
      tileId: z.number().int().nonnegative().describe('The raw tile id to decode'),
    },
    handler: async (_ctx, args) => decodeTile(args.tileId),
  },
];
