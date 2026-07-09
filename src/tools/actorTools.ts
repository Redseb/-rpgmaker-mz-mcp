import { readJsonFile, writeJsonFile, getDataPath } from '../utils/fileHandler.js';
import { Actor } from '../utils/types.js';
import { ToolDefinition } from '../registry.js';

/**
 * Get all actors from the project
 */
export async function getActors(projectPath: string): Promise<Actor[]> {
  const actorsPath = getDataPath(projectPath, 'Actors.json');
  return await readJsonFile<Actor[]>(actorsPath);
}

/**
 * Get a specific actor by ID
 */
export async function getActor(projectPath: string, actorId: number): Promise<Actor | null> {
  const actors = await getActors(projectPath);
  return actors.find((actor) => actor && actor.id === actorId) || null;
}

/**
 * Update an actor's data
 */
export async function updateActor(
  projectPath: string,
  actorId: number,
  updates: Partial<Actor>,
): Promise<Actor> {
  const actors = await getActors(projectPath);
  const actorIndex = actors.findIndex((actor) => actor && actor.id === actorId);

  if (actorIndex === -1) {
    throw new Error(`Actor with ID ${actorId} not found`);
  }

  actors[actorIndex] = { ...actors[actorIndex], ...updates };

  const actorsPath = getDataPath(projectPath, 'Actors.json');
  await writeJsonFile(actorsPath, actors);

  return actors[actorIndex];
}

/**
 * Create a new actor
 */
export async function createActor(
  projectPath: string,
  actorData: Omit<Actor, 'id'>,
): Promise<Actor> {
  const actors = await getActors(projectPath);

  // Find the next available ID
  const maxId = actors.reduce((max, actor) => {
    return actor && actor.id > max ? actor.id : max;
  }, 0);

  // Spread first so the computed id always wins, even if a caller passes one.
  const newActor: Actor = {
    ...actorData,
    id: maxId + 1,
  };

  actors.push(newActor);

  const actorsPath = getDataPath(projectPath, 'Actors.json');
  await writeJsonFile(actorsPath, actors);

  return newActor;
}

/**
 * Delete an actor
 */
export async function deleteActor(projectPath: string, actorId: number): Promise<boolean> {
  const actors = await getActors(projectPath);
  const actorIndex = actors.findIndex((actor) => actor && actor.id === actorId);

  if (actorIndex === -1) {
    return false;
  }

  actors[actorIndex] = null as any;

  const actorsPath = getDataPath(projectPath, 'Actors.json');
  await writeJsonFile(actorsPath, actors);

  return true;
}

/**
 * Search actors by name
 */
export async function searchActors(projectPath: string, searchTerm: string): Promise<Actor[]> {
  const actors = await getActors(projectPath);
  const lowerSearchTerm = searchTerm.toLowerCase();

  return actors.filter(
    (actor) =>
      actor &&
      (actor.name.toLowerCase().includes(lowerSearchTerm) ||
        actor.nickname.toLowerCase().includes(lowerSearchTerm)),
  );
}

export const actorToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_actors',
    description: 'Get all actors from the RPG Maker MZ project',
    inputSchema: { type: 'object', properties: {} },
    handler: (ctx) => getActors(ctx.projectPath),
  },
  {
    name: 'get_actor',
    description: 'Get a specific actor by ID',
    inputSchema: {
      type: 'object',
      properties: { actorId: { type: 'number', description: 'The ID of the actor to retrieve' } },
      required: ['actorId'],
    },
    handler: (ctx, args) => getActor(ctx.projectPath, args.actorId),
  },
  {
    name: 'update_actor',
    description: "Update an actor's properties",
    inputSchema: {
      type: 'object',
      properties: {
        actorId: { type: 'number', description: 'The ID of the actor to update' },
        updates: { type: 'object', description: 'Object containing properties to update' },
      },
      required: ['actorId', 'updates'],
    },
    handler: (ctx, args) => updateActor(ctx.projectPath, args.actorId, args.updates),
  },
  {
    name: 'create_actor',
    description: 'Create a new actor',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        nickname: { type: 'string' },
        profile: { type: 'string' },
        classId: { type: 'number' },
        initialLevel: { type: 'number' },
        maxLevel: { type: 'number' },
        characterName: { type: 'string' },
        characterIndex: { type: 'number' },
        faceName: { type: 'string' },
        faceIndex: { type: 'number' },
        battlerName: { type: 'string' },
        traits: { type: 'array' },
        equips: { type: 'array' },
        note: { type: 'string' },
      },
      required: ['name'],
    },
    handler: (ctx, args) => createActor(ctx.projectPath, args as Omit<Actor, 'id'>),
  },
  {
    name: 'search_actors',
    description: 'Search actors by name or nickname',
    inputSchema: {
      type: 'object',
      properties: { searchTerm: { type: 'string', description: 'The search term to find actors' } },
      required: ['searchTerm'],
    },
    handler: (ctx, args) => searchActors(ctx.projectPath, args.searchTerm),
  },
];
