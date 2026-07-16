import { z } from 'zod';
import { homedir } from 'os';
import { join, resolve } from 'path';

import { ToolDefinition } from '../registry.js';
import { validateProjectPath } from '../utils/fileHandler.js';
import { getGameTitle } from './systemTools.js';

/**
 * Project-targeting tools: inspect and retarget the project directory the
 * server operates on. These are the only tools that run without a valid
 * project path (`requiresProject: false`) — they're how a session diagnoses
 * or fixes an unset/wrong RPGMAKER_PROJECT_PATH without a server restart.
 */

/** Expand a leading `~` and resolve to an absolute path. */
export function normalizeProjectPath(input: string): string {
  const expanded =
    input === '~' || input.startsWith('~/') ? join(homedir(), input.slice(1)) : input;
  return resolve(expanded);
}

/** What both tools report: the path, whether it's usable, and the game it holds. */
async function describeProject(projectPath: string): Promise<unknown> {
  if (!projectPath) {
    return {
      projectPath: null,
      valid: false,
      hint: 'No project set. Call set_project or set RPGMAKER_PROJECT_PATH.',
    };
  }
  if (!(await validateProjectPath(projectPath))) {
    return {
      projectPath,
      valid: false,
      hint: 'Not a valid RPG Maker MZ project (expected game.rmmzproject and data/System.json).',
    };
  }
  // Title read fails soft: a valid project with an unreadable System.json
  // shouldn't make the status tools themselves error.
  let gameTitle: string | undefined;
  try {
    gameTitle = await getGameTitle(projectPath);
  } catch {
    gameTitle = undefined;
  }
  return { projectPath, valid: true, ...(gameTitle === undefined ? {} : { gameTitle }) };
}

export const projectToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_project',
    description:
      'Get the project directory the server is currently operating on: its path, whether it is a valid RPG Maker MZ project, and the game title it holds.',
    inputSchema: {},
    requiresProject: false,
    handler: async (ctx) => describeProject(ctx.projectPath),
  },
  {
    name: 'set_project',
    description:
      'Point the server at a different RPG Maker MZ project directory for the rest of the session (overrides RPGMAKER_PROJECT_PATH until the server restarts). The directory must contain game.rmmzproject and data/System.json.',
    inputSchema: {
      path: z
        .string()
        .describe('Path to the RPG Maker MZ project directory (a leading ~ is expanded).'),
    },
    requiresProject: false,
    handler: async (ctx, args) => {
      if (!ctx.setProjectPath) {
        throw new Error('set_project is not supported by this server context');
      }
      const path = normalizeProjectPath(String(args.path));
      if (!(await validateProjectPath(path))) {
        throw new Error(
          `Not an RPG Maker MZ project: ${path} (expected game.rmmzproject and data/System.json)`,
        );
      }
      ctx.setProjectPath(path);
      return describeProject(path);
    },
  },
];
