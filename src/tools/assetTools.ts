import { z } from 'zod';
import { basename, join } from 'path';
import { listFiles } from '../utils/fileHandler.js';
import { ToolDefinition } from '../registry.js';

/**
 * The project asset kinds a caller can enumerate, mapped to their directory
 * (relative to the project root) and the file extensions they use. RPG Maker MZ
 * references every asset by **basename without extension** (e.g. an event's
 * `characterName` is `"Actor1"`, not `"Actor1.png"`), so `list_assets` strips the
 * extension — the returned names are exactly what the data files expect.
 *
 * Audio ships as `.ogg` (and sometimes a parallel `.m4a` for other runtimes); we
 * list both and dedupe by basename so each track appears once.
 */
const ASSET_DIRS = {
  characters: { dir: 'img/characters', exts: ['.png'] },
  faces: { dir: 'img/faces', exts: ['.png'] },
  tilesets: { dir: 'img/tilesets', exts: ['.png'] },
  pictures: { dir: 'img/pictures', exts: ['.png'] },
  parallaxes: { dir: 'img/parallaxes', exts: ['.png'] },
  battlebacks1: { dir: 'img/battlebacks1', exts: ['.png'] },
  battlebacks2: { dir: 'img/battlebacks2', exts: ['.png'] },
  enemies: { dir: 'img/enemies', exts: ['.png'] },
  sv_actors: { dir: 'img/sv_actors', exts: ['.png'] },
  sv_enemies: { dir: 'img/sv_enemies', exts: ['.png'] },
  titles1: { dir: 'img/titles1', exts: ['.png'] },
  titles2: { dir: 'img/titles2', exts: ['.png'] },
  system: { dir: 'img/system', exts: ['.png'] },
  bgm: { dir: 'audio/bgm', exts: ['.ogg', '.m4a'] },
  bgs: { dir: 'audio/bgs', exts: ['.ogg', '.m4a'] },
  me: { dir: 'audio/me', exts: ['.ogg', '.m4a'] },
  se: { dir: 'audio/se', exts: ['.ogg', '.m4a'] },
} as const;

export type AssetType = keyof typeof ASSET_DIRS;

export interface AssetIndex {
  type: AssetType;
  count: number;
  names: string[];
}

/**
 * List the available asset basenames (extension stripped) for one asset kind —
 * the exact strings the data files reference (a sprite/face/audio name). Use it to
 * validate a graphic/audio name before wiring it into an event, since a wrong
 * filename is a silent runtime failure in the engine.
 *
 * **Fails soft:** a missing asset directory (an unused kind) yields an empty list
 * rather than an error. Read-only — no writes.
 */
export async function listAssets(projectPath: string, type: AssetType): Promise<AssetIndex> {
  const spec = ASSET_DIRS[type];
  if (!spec) {
    throw new Error(
      `Unknown asset type: ${type}. Valid types: ${Object.keys(ASSET_DIRS).join(', ')}`,
    );
  }

  const dirPath = join(projectPath, ...spec.dir.split('/'));
  const names = new Set<string>();
  for (const ext of spec.exts) {
    let files: string[];
    try {
      files = await listFiles(dirPath, ext);
    } catch {
      files = []; // Missing dir (unused asset kind) → fail soft.
    }
    for (const file of files) names.add(basename(file, ext));
  }

  const sorted = [...names].sort();
  return { type, count: sorted.length, names: sorted };
}

export const assetToolDefinitions: ToolDefinition[] = [
  {
    name: 'list_assets',
    description:
      "List the available asset filenames (extension stripped) for one asset kind — the exact names RPG Maker's data references (a sprite/face/tileset/audio name). Use it to validate a graphic or audio name before wiring it into an event; a wrong filename fails silently at runtime. Fails soft: an unused asset directory returns an empty list.",
    inputSchema: {
      type: z
        .enum(Object.keys(ASSET_DIRS) as [AssetType, ...AssetType[]])
        .describe(
          'Asset kind to list. Images: characters, faces, tilesets, pictures, parallaxes, battlebacks1, battlebacks2, enemies, sv_actors, sv_enemies, titles1, titles2, system. Audio: bgm, bgs, me, se.',
        ),
    },
    handler: (ctx, args) => listAssets(ctx.projectPath, args.type),
  },
];
