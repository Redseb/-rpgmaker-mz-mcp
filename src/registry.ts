import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Context passed to every tool handler. Kept as an object (rather than a bare
 * `projectPath` string) so cross-cutting state — e.g. a future dry-run flag or
 * logger — can be threaded through without changing every handler signature.
 */
export interface ToolContext {
  projectPath: string;
}

/**
 * A single MCP tool: its schema (advertised to clients) plus the handler that
 * runs it. Each tool module owns its own definitions, so adding a tool means
 * editing one file instead of a central schema list and a central dispatch
 * switch.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  handler: (ctx: ToolContext, args: Record<string, any>) => Promise<unknown>;
}

/** Strip the handler to produce the MCP-facing `Tool` schema. */
export function toTool(def: ToolDefinition): Tool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
  };
}

/** Index definitions by name, failing loudly on duplicates. */
export function buildRegistry(defs: ToolDefinition[]): Map<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>();
  for (const def of defs) {
    if (registry.has(def.name)) {
      throw new Error(`Duplicate tool definition: ${def.name}`);
    }
    registry.set(def.name, def);
  }
  return registry;
}
