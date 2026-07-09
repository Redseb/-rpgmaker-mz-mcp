import { ToolDefinition } from '../registry.js';
import { actorToolDefinitions } from './actorTools.js';
import { itemToolDefinitions } from './itemTools.js';
import { skillToolDefinitions } from './skillTools.js';
import { mapToolDefinitions } from './mapTools.js';
import { systemToolDefinitions } from './systemTools.js';

/**
 * Every tool the server exposes, gathered from the per-domain tool modules.
 * Kept in its own side-effect-free module so it can be imported by both the
 * server entry point and the tests without booting the stdio server.
 */
export const allToolDefinitions: ToolDefinition[] = [
  ...actorToolDefinitions,
  ...itemToolDefinitions,
  ...skillToolDefinitions,
  ...mapToolDefinitions,
  ...systemToolDefinitions,
];
