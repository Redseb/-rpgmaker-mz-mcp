import { z } from 'zod';

/**
 * Context passed to every tool handler. Kept as an object (rather than a bare
 * `projectPath` string) so cross-cutting state — e.g. a future dry-run flag or
 * logger — can be threaded through without changing every handler signature.
 */
export interface ToolContext {
  projectPath: string;
}

/**
 * A tool's input schema, expressed as a Zod "raw shape" (a map of argument name
 * to Zod type). The MCP SDK's `registerTool` consumes this directly: it both
 * advertises the JSON Schema to clients and validates incoming arguments before
 * the handler runs, so handlers can trust their inputs.
 */
export type InputShape = Record<string, z.ZodType>;

/**
 * A single MCP tool: its schema (advertised to clients and used for validation)
 * plus the handler that runs it. Each tool module owns its own definitions, so
 * adding a tool means editing one file instead of a central schema list and a
 * central dispatch switch.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: InputShape;
  handler: (ctx: ToolContext, args: Record<string, any>) => Promise<unknown>;
  /**
   * True for tools that write to the project. Such tools accept a `dryRun`
   * argument (injected into their advertised schema at registration time) and
   * are run inside a commit context so the write can be previewed instead of
   * applied.
   */
  mutates?: boolean;
}

/**
 * The shared `dryRun` argument advertised on every mutating tool. Injected into
 * the tool's schema at registration so clients can discover it without each tool
 * having to declare it.
 */
export const DRY_RUN_SHAPE = {
  dryRun: z
    .boolean()
    .optional()
    .describe('Preview only: return a diff of what would change without writing to disk.'),
} as const;

/**
 * Resolve the Zod raw shape a tool should be registered with. Mutating tools get
 * the shared `dryRun` argument folded in.
 */
export function schemaFor(def: ToolDefinition): InputShape {
  return def.mutates ? { ...def.inputSchema, ...DRY_RUN_SHAPE } : def.inputSchema;
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
