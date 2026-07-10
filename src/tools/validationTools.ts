import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import { getMap, getMapInfos, getMapEvent } from './mapTools.js';
import { validateEvent, validateEvents, ValidationWarning } from '../validation/eventCommands.js';

/**
 * Validate a single event's command lists against the known-command table.
 * Warn-by-default: this reports problems, it never modifies anything.
 */
export async function validateEventTool(
  projectPath: string,
  mapId: number,
  eventId: number,
): Promise<{ mapId: number; eventId: number; ok: boolean; warnings: ValidationWarning[] }> {
  const event = await getMapEvent(projectPath, mapId, eventId);
  if (!event) {
    throw new Error(`Event ${eventId} not found on map ${mapId}`);
  }
  const report = validateEvent(event);
  return { mapId, eventId, ...report };
}

interface MapInfo {
  id: number;
  name: string;
}

/**
 * Validate the event command lists of every map in the project. Aggregates each
 * map's warnings, tagging them with the map ID so callers can locate them.
 */
export async function validateProjectTool(projectPath: string): Promise<{
  ok: boolean;
  mapsChecked: number;
  warnings: Array<ValidationWarning & { mapId: number }>;
}> {
  const infos = (await getMapInfos(projectPath)) as (MapInfo | null)[];
  const mapIds = infos.filter((info): info is MapInfo => info != null).map((info) => info.id);

  const warnings: Array<ValidationWarning & { mapId: number }> = [];
  let mapsChecked = 0;

  for (const mapId of mapIds) {
    let map;
    try {
      map = await getMap(projectPath, mapId);
    } catch {
      // A map listed in MapInfos may not have a MapNNN.json file yet; skip it.
      continue;
    }
    mapsChecked++;
    const report = validateEvents(map.events);
    for (const warning of report.warnings) {
      warnings.push({ mapId, ...warning });
    }
  }

  return { ok: warnings.length === 0, mapsChecked, warnings };
}

export const validationToolDefinitions: ToolDefinition[] = [
  {
    name: 'validate_event',
    description:
      "Validate a single event's command lists against the known RPG Maker MZ command table. Read-only: reports parameter/structure warnings without changing anything.",
    inputSchema: {
      mapId: z.number().describe('The ID of the map'),
      eventId: z.number().describe('The ID of the event to validate'),
    },
    handler: (ctx, args) => validateEventTool(ctx.projectPath, args.mapId, args.eventId),
  },
  {
    name: 'validate_project',
    description:
      'Validate the event command lists of every map in the project. Read-only: returns aggregated, map-tagged warnings for auditing before or after a batch of edits.',
    inputSchema: {},
    handler: (ctx) => validateProjectTool(ctx.projectPath),
  },
];
