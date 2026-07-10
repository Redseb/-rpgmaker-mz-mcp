import { z } from 'zod';
import { readJsonFile, getMapPath, getDataPath } from '../utils/fileHandler.js';
import { commitChange } from '../utils/commit.js';
import { MapData, MapEvent, EventCommand } from '../utils/types.js';
import { ToolDefinition } from '../registry.js';
import { validateEvent } from '../validation/eventCommands.js';

/**
 * Attach warn-by-default validation results to an event-write response. Warnings
 * are advisory: the write already happened (or was previewed); this just tells
 * the caller if the resulting event looks structurally off. Warnings are only
 * included when present, so clean writes keep a tidy `{ event }` response.
 */
function withValidation(event: MapEvent): {
  event: MapEvent;
  warnings?: ReturnType<typeof validateEvent>['warnings'];
} {
  const { warnings } = validateEvent(event);
  return warnings.length > 0 ? { event, warnings } : { event };
}

/**
 * Get map data by ID
 */
export async function getMap(projectPath: string, mapId: number): Promise<MapData> {
  const mapPath = getMapPath(projectPath, mapId);
  return await readJsonFile<MapData>(mapPath);
}

/**
 * Get all map info
 */
export async function getMapInfos(projectPath: string): Promise<any[]> {
  const mapInfosPath = getDataPath(projectPath, 'MapInfos.json');
  return await readJsonFile<any[]>(mapInfosPath);
}

/**
 * Update map properties
 */
export async function updateMap(
  projectPath: string,
  mapId: number,
  updates: Partial<MapData>,
): Promise<MapData> {
  const map = await getMap(projectPath, mapId);
  const updatedMap = { ...map, ...updates };

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, updatedMap);

  return updatedMap;
}

/**
 * Get events from a specific map
 */
export async function getMapEvents(
  projectPath: string,
  mapId: number,
): Promise<(MapEvent | null)[]> {
  const map = await getMap(projectPath, mapId);
  return map.events;
}

/**
 * Get a specific event from a map
 */
export async function getMapEvent(
  projectPath: string,
  mapId: number,
  eventId: number,
): Promise<MapEvent | null> {
  const events = await getMapEvents(projectPath, mapId);
  return events[eventId] || null;
}

/**
 * Update a map event
 */
export async function updateMapEvent(
  projectPath: string,
  mapId: number,
  eventId: number,
  updates: Partial<MapEvent>,
): Promise<MapEvent> {
  const map = await getMap(projectPath, mapId);

  if (!map.events[eventId]) {
    throw new Error(`Event ${eventId} not found on map ${mapId}`);
  }

  map.events[eventId] = { ...map.events[eventId]!, ...updates };

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, map);

  return map.events[eventId]!;
}

/**
 * Create a new event on a map
 */
export async function createMapEvent(
  projectPath: string,
  mapId: number,
  eventData: Omit<MapEvent, 'id'>,
): Promise<MapEvent> {
  const map = await getMap(projectPath, mapId);

  // Find the next available event ID
  const maxId = map.events.reduce((max, event, index) => {
    return event && index > max ? index : max;
  }, 0);

  // Spread first so the computed id always wins, even if a caller passes one.
  const newEvent: MapEvent = {
    ...eventData,
    id: maxId + 1,
  };

  map.events[maxId + 1] = newEvent;

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, map);

  return newEvent;
}

/**
 * Delete an event from a map
 */
export async function deleteMapEvent(
  projectPath: string,
  mapId: number,
  eventId: number,
): Promise<boolean> {
  const map = await getMap(projectPath, mapId);

  if (!map.events[eventId]) {
    return false;
  }

  map.events[eventId] = null;

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, map);

  return true;
}

/**
 * Search events by name
 */
export async function searchMapEvents(
  projectPath: string,
  mapId: number,
  searchTerm: string,
): Promise<MapEvent[]> {
  const events = await getMapEvents(projectPath, mapId);
  const lowerSearchTerm = searchTerm.toLowerCase();

  return events.filter(
    (event) => event && event.name.toLowerCase().includes(lowerSearchTerm),
  ) as MapEvent[];
}

/**
 * Add a command to an event page
 */
export async function addEventCommand(
  projectPath: string,
  mapId: number,
  eventId: number,
  pageIndex: number,
  command: EventCommand,
  position?: number,
): Promise<MapEvent> {
  const map = await getMap(projectPath, mapId);

  if (!map.events[eventId]) {
    throw new Error(`Event ${eventId} not found on map ${mapId}`);
  }

  const event = map.events[eventId]!;

  if (!event.pages[pageIndex]) {
    throw new Error(`Page ${pageIndex} not found on event ${eventId}`);
  }

  const commandList = event.pages[pageIndex].list;

  if (position !== undefined && position >= 0 && position < commandList.length - 1) {
    // Insert at specific position (before the end command)
    commandList.splice(position, 0, command);
  } else {
    // Add before the end command (code 0)
    commandList.splice(commandList.length - 1, 0, command);
  }

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, map);

  return event;
}

/**
 * Get map dimensions
 */
export async function getMapDimensions(
  projectPath: string,
  mapId: number,
): Promise<{ width: number; height: number }> {
  const map = await getMap(projectPath, mapId);
  return {
    width: map.width,
    height: map.height,
  };
}

/**
 * Set map tile at specific position
 */
export async function setMapTile(
  projectPath: string,
  mapId: number,
  x: number,
  y: number,
  layer: number,
  tileId: number,
): Promise<void> {
  const map = await getMap(projectPath, mapId);

  if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
    throw new Error(`Position (${x}, ${y}) is out of map bounds`);
  }

  // RPG Maker MZ stores tiles in a 1D array with 6 layers
  // Index = (layer * height + y) * width + x
  const index = tileIndex(map.width, map.height, x, y, layer);
  map.data[index] = tileId;

  const mapPath = getMapPath(projectPath, mapId);
  await commitChange(mapPath, map);
}

/**
 * Compute the flat `data` array index for a tile at (x, y) on a z-layer.
 *
 * RPG Maker MZ stores map tiles in a single 1D array of `width * height * 6`
 * entries (6 stacked layers: 2 lower, 2 upper, shadow pen, region ID). Kept as
 * a pure function so the index math can be unit-tested without file I/O.
 */
export function tileIndex(
  width: number,
  height: number,
  x: number,
  y: number,
  layer: number,
): number {
  return (layer * height + y) * width + x;
}

export const mapToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_map',
    description: 'Get map data by ID',
    inputSchema: { mapId: z.number().describe('The ID of the map to retrieve') },
    handler: (ctx, args) => getMap(ctx.projectPath, args.mapId),
  },
  {
    name: 'get_map_infos',
    description: 'Get information about all maps',
    inputSchema: {},
    handler: (ctx) => getMapInfos(ctx.projectPath),
  },
  {
    name: 'get_map_events',
    description: 'Get all events from a specific map',
    inputSchema: { mapId: z.number().describe('The ID of the map') },
    handler: (ctx, args) => getMapEvents(ctx.projectPath, args.mapId),
  },
  {
    name: 'get_map_event',
    description: 'Get a specific event from a map',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      eventId: z.number().describe('The ID of the event'),
    },
    handler: (ctx, args) => getMapEvent(ctx.projectPath, args.mapId, args.eventId),
  },
  {
    name: 'update_map_event',
    mutates: true,
    description: "Update a map event's properties",
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      eventId: z.number().describe('The ID of the event'),
      updates: z
        .record(z.string(), z.unknown())
        .describe('Object containing event properties to update'),
    },
    handler: async (ctx, args) =>
      withValidation(await updateMapEvent(ctx.projectPath, args.mapId, args.eventId, args.updates)),
  },
  {
    name: 'create_map_event',
    mutates: true,
    description: 'Create a new event on a map',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      name: z.string().describe('Event name'),
      x: z.number().describe('X tile position'),
      y: z.number().describe('Y tile position'),
      note: z.string().optional().describe('Event note field'),
      pages: z.array(z.unknown()).describe('Event pages (conditions, image, command list, etc.)'),
    },
    handler: async (ctx, args) => {
      const { mapId, ...eventData } = args;
      return withValidation(
        await createMapEvent(ctx.projectPath, mapId, eventData as Omit<MapEvent, 'id'>),
      );
    },
  },
  {
    name: 'search_map_events',
    description: 'Search events on a map by name',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      searchTerm: z.string().describe('The search term to find events'),
    },
    handler: (ctx, args) => searchMapEvents(ctx.projectPath, args.mapId, args.searchTerm),
  },
  {
    name: 'add_event_command',
    mutates: true,
    description: 'Add a command to an event page',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      eventId: z.number().describe('The ID of the event'),
      pageIndex: z.number().describe('Zero-based page index'),
      command: z
        .object({
          code: z.number().describe('Event command code (see RPG Maker MZ documentation)'),
          indent: z.number().optional().default(0).describe('Indentation level'),
          parameters: z.array(z.unknown()).describe('Command parameters'),
        })
        .describe('The event command to insert'),
      position: z.number().optional().describe('Insertion index; defaults to end of the list'),
    },
    handler: async (ctx, args) =>
      withValidation(
        await addEventCommand(
          ctx.projectPath,
          args.mapId,
          args.eventId,
          args.pageIndex,
          args.command,
          args.position,
        ),
      ),
  },
  {
    name: 'update_map',
    mutates: true,
    description:
      "Update a map's top-level properties (name, display name, dimensions, bgm, etc.). Does not repaint tiles.",
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      updates: z.record(z.string(), z.unknown()).describe('Partial MapData properties to merge'),
    },
    handler: (ctx, args) => updateMap(ctx.projectPath, args.mapId, args.updates),
  },
  {
    name: 'get_map_dimensions',
    description: 'Get the width and height (in tiles) of a map',
    inputSchema: { mapId: z.number().describe('The ID of the map') },
    handler: (ctx, args) => getMapDimensions(ctx.projectPath, args.mapId),
  },
  {
    name: 'set_map_tile',
    mutates: true,
    description:
      'Set a single raw tile ID at (x, y) on a given z-layer (0-5). Note: tile IDs are raw engine integers; this is a low-level primitive without autotile/passability awareness.',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      x: z.number().describe('X tile position'),
      y: z.number().describe('Y tile position'),
      layer: z.number().describe('Z-layer 0-5 (0-1 lower, 2-3 upper, 4 shadow, 5 region)'),
      tileId: z.number().describe('Raw tile ID'),
    },
    handler: async (ctx, args) => {
      await setMapTile(ctx.projectPath, args.mapId, args.x, args.y, args.layer, args.tileId);
      return { success: true };
    },
  },
  {
    name: 'delete_map_event',
    mutates: true,
    description: 'Delete an event from a map by ID',
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      eventId: z.number().describe('The ID of the event'),
    },
    handler: async (ctx, args) => ({
      success: await deleteMapEvent(ctx.projectPath, args.mapId, args.eventId),
    }),
  },
];
