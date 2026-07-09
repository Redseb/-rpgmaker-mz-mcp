import { readJsonFile, writeJsonFile, getDataPath } from '../utils/fileHandler.js';
import { SystemData } from '../utils/types.js';
import { ToolDefinition } from '../registry.js';

/**
 * Get system data
 */
export async function getSystem(projectPath: string): Promise<SystemData> {
  const systemPath = getDataPath(projectPath, 'System.json');
  return await readJsonFile<SystemData>(systemPath);
}

/**
 * Update system data
 */
export async function updateSystem(
  projectPath: string,
  updates: Partial<SystemData>,
): Promise<SystemData> {
  const system = await getSystem(projectPath);
  const updatedSystem = { ...system, ...updates };

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, updatedSystem);

  return updatedSystem;
}

/**
 * Get game variables
 */
export async function getVariables(projectPath: string): Promise<string[]> {
  const system = await getSystem(projectPath);
  return system.variables;
}

/**
 * Set a variable name
 */
export async function setVariableName(
  projectPath: string,
  variableId: number,
  name: string,
): Promise<void> {
  const system = await getSystem(projectPath);
  system.variables[variableId] = name;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Get game switches
 */
export async function getSwitches(projectPath: string): Promise<string[]> {
  const system = await getSystem(projectPath);
  return system.switches;
}

/**
 * Set a switch name
 */
export async function setSwitchName(
  projectPath: string,
  switchId: number,
  name: string,
): Promise<void> {
  const system = await getSystem(projectPath);
  system.switches[switchId] = name;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Get party members
 */
export async function getPartyMembers(projectPath: string): Promise<number[]> {
  const system = await getSystem(projectPath);
  return system.partyMembers;
}

/**
 * Update party members
 */
export async function updatePartyMembers(
  projectPath: string,
  partyMembers: number[],
): Promise<void> {
  const system = await getSystem(projectPath);
  system.partyMembers = partyMembers;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Get starting position
 */
export async function getStartingPosition(
  projectPath: string,
): Promise<{ mapId: number; x: number; y: number }> {
  const system = await getSystem(projectPath);
  return {
    mapId: system.startMapId,
    x: system.startX,
    y: system.startY,
  };
}

/**
 * Update starting position
 */
export async function updateStartingPosition(
  projectPath: string,
  mapId: number,
  x: number,
  y: number,
): Promise<void> {
  const system = await getSystem(projectPath);
  system.startMapId = mapId;
  system.startX = x;
  system.startY = y;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Get game title
 */
export async function getGameTitle(projectPath: string): Promise<string> {
  const system = await getSystem(projectPath);
  return system.gameTitle;
}

/**
 * Update game title
 */
export async function updateGameTitle(projectPath: string, title: string): Promise<void> {
  const system = await getSystem(projectPath);
  system.gameTitle = title;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Get all terms (vocabulary)
 */
export async function getTerms(projectPath: string): Promise<any> {
  const system = await getSystem(projectPath);
  return system.terms;
}

/**
 * Update a basic term
 */
export async function updateBasicTerm(
  projectPath: string,
  index: number,
  value: string,
): Promise<void> {
  const system = await getSystem(projectPath);
  system.terms.basic[index] = value;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

/**
 * Update a command term
 */
export async function updateCommandTerm(
  projectPath: string,
  index: number,
  value: string,
): Promise<void> {
  const system = await getSystem(projectPath);
  system.terms.commands[index] = value;

  const systemPath = getDataPath(projectPath, 'System.json');
  await writeJsonFile(systemPath, system);
}

export const systemToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_system',
    description: 'Get system data',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => getSystem(ctx.projectPath),
  },
  {
    name: 'get_variables',
    description: 'Get all game variable names',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => getVariables(ctx.projectPath),
  },
  {
    name: 'set_variable_name',
    description: 'Set a variable name',
    inputSchema: {
      type: 'object',
      properties: { variableId: { type: 'number' }, name: { type: 'string' } },
      required: ['variableId', 'name'],
    },
    handler: async (ctx, args) => {
      await setVariableName(ctx.projectPath, args.variableId, args.name);
      return { success: true };
    },
  },
  {
    name: 'get_switches',
    description: 'Get all game switch names',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => getSwitches(ctx.projectPath),
  },
  {
    name: 'set_switch_name',
    description: 'Set a switch name',
    inputSchema: {
      type: 'object',
      properties: { switchId: { type: 'number' }, name: { type: 'string' } },
      required: ['switchId', 'name'],
    },
    handler: async (ctx, args) => {
      await setSwitchName(ctx.projectPath, args.switchId, args.name);
      return { success: true };
    },
  },
  {
    name: 'get_game_title',
    description: 'Get the game title',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => getGameTitle(ctx.projectPath),
  },
  {
    name: 'update_game_title',
    description: 'Update the game title',
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
    },
    handler: async (ctx, args) => {
      await updateGameTitle(ctx.projectPath, args.title);
      return { success: true };
    },
  },
  {
    name: 'update_starting_position',
    description: 'Update the game starting position',
    inputSchema: {
      type: 'object',
      properties: {
        mapId: { type: 'number' },
        x: { type: 'number' },
        y: { type: 'number' },
      },
      required: ['mapId', 'x', 'y'],
    },
    handler: async (ctx, args) => {
      await updateStartingPosition(ctx.projectPath, args.mapId, args.x, args.y);
      return { success: true };
    },
  },
];
