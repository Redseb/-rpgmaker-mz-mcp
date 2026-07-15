import { z } from 'zod';
import { ToolDefinition } from '../registry.js';
import {
  PluginRegistry,
  buildPluginCommand,
  validatePluginCommand,
} from '../validation/pluginCommands.js';
import { projectPluginRegistry } from './pluginScanTools.js';

/**
 * Every plugin command known for this project — the plugins it actually ships
 * (scanned from `js/plugins/*.js`) merged over the built-in allowlist — or a
 * single plugin's entry when `pluginName` is given. Read-only view so a caller can
 * discover which plugin commands `create_plugin_command` will validate.
 */
export function listPluginCommands(registry: PluginRegistry, pluginName?: string): unknown {
  if (pluginName === undefined) {
    return registry;
  }
  const plugin = registry[pluginName];
  if (!plugin) {
    throw new Error(
      `Plugin "${pluginName}" is not installed in this project and is not in the known-plugin allowlist`,
    );
  }
  return { [pluginName]: plugin };
}

export const pluginToolDefinitions: ToolDefinition[] = [
  {
    name: 'list_plugin_commands',
    description:
      'List every plugin command create_plugin_command can validate (plugin filename → command key → args): the plugins this project actually ships, scanned from their js/plugins/*.js annotations, merged over a small built-in allowlist. Pass pluginName to narrow to one plugin. Read-only. Use scan_plugins for the richer per-project view (arg types/defaults, enabled state); an unlisted plugin command can still be built, it just isn’t validated.',
    inputSchema: {
      pluginName: z
        .string()
        .optional()
        .describe('Optional: restrict to one plugin (its filename without .js)'),
    },
    handler: async (ctx, args) =>
      listPluginCommands(await projectPluginRegistry(ctx.projectPath), args.pluginName),
  },
  {
    name: 'create_plugin_command',
    description:
      'Build an RPG Maker MZ plugin command (event command code 357) for insertion into an event page via add_event_command. Validates against the plugins this project actually ships (scanned from their js/plugins/*.js @command/@arg annotations) merged over a small built-in allowlist — warn-by-default: an unknown plugin/command, a stray arg, or a plugin that is installed but disabled in js/plugins.js produces a warning but never blocks. Args are normalized to the editor’s string-valued shape. Read-only: returns { command, warnings? }, writes nothing.',
    inputSchema: {
      pluginName: z.string().describe('Plugin filename without .js (event command parameters[0])'),
      commandName: z
        .string()
        .describe('The command key the plugin registered (event command parameters[1])'),
      args: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Command arguments as { name: value }; values are stored as strings on disk'),
      label: z
        .string()
        .optional()
        .describe('Editor display label (parameters[2]); defaults to the command key'),
      indent: z
        .number()
        .int()
        .optional()
        .describe('Indentation level in the target list (default 0)'),
    },
    handler: async (ctx, args) => {
      const argValues = (args.args as Record<string, unknown> | undefined) ?? {};
      const registry = await projectPluginRegistry(ctx.projectPath);
      const command = buildPluginCommand(
        args.pluginName,
        args.commandName,
        argValues,
        args.indent ?? 0,
        args.label,
        registry,
      );
      const warnings = validatePluginCommand(
        args.pluginName,
        args.commandName,
        argValues,
        undefined,
        registry,
      );
      return warnings.length > 0 ? { command, warnings } : { command };
    },
  },
];
