import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  pluginScanToolDefinitions,
  scanPlugins,
  clearPluginScanCache,
} from '../src/tools/pluginScanTools.js';
import { pluginToolDefinitions } from '../src/tools/pluginTools.js';
import { ToolContext } from '../src/registry.js';

const scanTool = pluginScanToolDefinitions.find((t) => t.name === 'scan_plugins')!;
const createPluginCommand = pluginToolDefinitions.find((t) => t.name === 'create_plugin_command')!;

const PLUGIN_SOURCE = `/*:
 * @target MZ
 * @plugindesc Makes a picture clickable.
 * @author Yoji Ojima
 *
 * @command set
 * @text Set Button Picture
 * @desc Makes the specified picture clickable.
 *
 * @arg pictureId
 * @type number
 * @default 1
 * @text Picture Number
 */
`;

async function scaffoldProject(opts: { manifest?: string } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rpgmz-plugins-'));
  await writeFile(join(dir, 'game.rmmzproject'), 'RPGMZ 1.0.0');
  await mkdir(join(dir, 'data'));
  await writeFile(join(dir, 'data', 'System.json'), '{}');
  await mkdir(join(dir, 'js', 'plugins'), { recursive: true });
  await writeFile(join(dir, 'js', 'plugins', 'ButtonPicture.js'), PLUGIN_SOURCE);
  // A plugin with no annotation block contributes nothing.
  await writeFile(join(dir, 'js', 'plugins', 'Bare.js'), '// no annotations here\n');
  if (opts.manifest !== undefined) {
    await writeFile(join(dir, 'js', 'plugins.js'), opts.manifest);
  }
  return dir;
}

const ENABLED = 'var $plugins =\n[\n{"name":"ButtonPicture","status":true,"parameters":{}}\n];';
const DISABLED = 'var $plugins =\n[\n{"name":"ButtonPicture","status":false,"parameters":{}}\n];';

describe('scan_plugins (integration)', () => {
  let dir: string;

  beforeEach(async () => {
    clearPluginScanCache();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('discovers a project plugin, its command and args', async () => {
    dir = await scaffoldProject({ manifest: ENABLED });
    const result = (await scanTool.handler({ projectPath: dir } as ToolContext, {})) as {
      pluginCount: number;
      commandCount: number;
      plugins: Record<string, { enabled?: boolean; commands: Record<string, unknown> }>;
    };

    expect(result.pluginCount).toBe(1); // Bare.js has no annotation block
    expect(result.commandCount).toBe(1);
    expect(result.plugins.ButtonPicture.enabled).toBe(true);
    expect(result.plugins.ButtonPicture.commands.set).toMatchObject({
      label: 'Set Button Picture',
      args: [{ name: 'pictureId', type: 'number', default: '1' }],
    });
  });

  it('reports a plugin present on disk but switched off', async () => {
    dir = await scaffoldProject({ manifest: DISABLED });
    const registry = await scanPlugins(dir);
    expect(registry.ButtonPicture.enabled).toBe(false);
  });

  it('treats a plugin missing from plugins.js as not enabled', async () => {
    dir = await scaffoldProject({ manifest: 'var $plugins =\n[\n];' });
    const registry = await scanPlugins(dir);
    expect(registry.ButtonPicture.enabled).toBe(false);
  });

  it('leaves enabled unknown when plugins.js is absent', async () => {
    dir = await scaffoldProject();
    const registry = await scanPlugins(dir);
    expect(registry.ButtonPicture.enabled).toBeUndefined();
  });

  it('fails soft on a project with no plugins dir', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rpgmz-noplugins-'));
    expect(await scanPlugins(dir)).toEqual({});
  });

  it('narrows to one plugin and throws on an unknown one', async () => {
    dir = await scaffoldProject({ manifest: ENABLED });
    const ctx = { projectPath: dir } as ToolContext;
    const one = (await scanTool.handler(ctx, { pluginName: 'ButtonPicture' })) as {
      pluginCount: number;
    };
    expect(one.pluginCount).toBe(1);
    await expect(scanTool.handler(ctx, { pluginName: 'Nope' })).rejects.toThrow(/was not found/);
  });

  it('enabledOnly skips a disabled plugin', async () => {
    dir = await scaffoldProject({ manifest: DISABLED });
    const result = (await scanTool.handler({ projectPath: dir } as ToolContext, {
      enabledOnly: true,
    })) as { pluginCount: number };
    expect(result.pluginCount).toBe(0);
  });
});

describe('create_plugin_command validates against the project scan', () => {
  let dir: string;

  beforeEach(() => clearPluginScanCache());
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts a scanned command with a known arg, with no warnings', async () => {
    dir = await scaffoldProject({ manifest: ENABLED });
    const result = (await createPluginCommand.handler({ projectPath: dir } as ToolContext, {
      pluginName: 'ButtonPicture',
      commandName: 'set',
      args: { pictureId: 1 },
    })) as { command: { parameters: unknown[] }; warnings?: unknown[] };

    expect(result.warnings).toBeUndefined();
    // The scanned @text becomes the editor's display label (parameters[2]).
    expect(result.command.parameters).toEqual([
      'ButtonPicture',
      'set',
      'Set Button Picture',
      { pictureId: '1' },
    ]);
  });

  it('warns on a stray arg the scanned plugin does not declare', async () => {
    dir = await scaffoldProject({ manifest: ENABLED });
    const result = (await createPluginCommand.handler({ projectPath: dir } as ToolContext, {
      pluginName: 'ButtonPicture',
      commandName: 'set',
      args: { pictureId: 1, nope: 'x' },
    })) as { warnings?: { message: string }[] };

    expect(result.warnings?.some((w) => /unknown argument "nope"/.test(w.message))).toBe(true);
  });

  it('warns that an installed-but-disabled plugin will not run', async () => {
    dir = await scaffoldProject({ manifest: DISABLED });
    const result = (await createPluginCommand.handler({ projectPath: dir } as ToolContext, {
      pluginName: 'ButtonPicture',
      commandName: 'set',
      args: { pictureId: 1 },
    })) as { warnings?: { message: string }[] };

    expect(result.warnings?.some((w) => /disabled in js\/plugins\.js/.test(w.message))).toBe(true);
  });

  it('still warns for a plugin the project does not have at all', async () => {
    dir = await scaffoldProject({ manifest: ENABLED });
    const result = (await createPluginCommand.handler({ projectPath: dir } as ToolContext, {
      pluginName: 'NotInstalled',
      commandName: 'go',
    })) as { warnings?: { message: string }[] };

    expect(result.warnings?.some((w) => /is not installed in this project/.test(w.message))).toBe(
      true,
    );
  });
});
