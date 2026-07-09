import { describe, it, expect } from 'vitest';
import { buildRegistry, toTool, ToolDefinition } from '../src/registry.js';
import { allToolDefinitions } from '../src/tools/allTools.js';

const dummy: ToolDefinition = {
  name: 'dummy',
  description: 'test',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({ ok: true }),
};

describe('buildRegistry', () => {
  it('indexes definitions by name', () => {
    const registry = buildRegistry([dummy]);
    expect(registry.get('dummy')).toBe(dummy);
  });

  it('throws on duplicate tool names', () => {
    expect(() => buildRegistry([dummy, { ...dummy }])).toThrow(/Duplicate tool definition: dummy/);
  });
});

describe('toTool', () => {
  it('strips the handler, leaving only the MCP schema', () => {
    const tool = toTool(dummy);
    expect(tool).toEqual({
      name: 'dummy',
      description: 'test',
      inputSchema: { type: 'object', properties: {} },
    });
    expect('handler' in tool).toBe(false);
  });
});

describe('tool registry contract', () => {
  it('exposes the expected number of tools', () => {
    expect(allToolDefinitions.length).toBe(39);
  });

  it('has unique tool names', () => {
    const names = allToolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('builds a registry without throwing (no duplicate names)', () => {
    expect(() => buildRegistry(allToolDefinitions)).not.toThrow();
  });

  it('every tool has a non-empty description, object schema, and a handler', () => {
    for (const tool of allToolDefinitions) {
      expect(tool.name, `${tool.name} name`).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.length, `${tool.name} description`).toBeGreaterThan(0);
      expect(tool.inputSchema.type, `${tool.name} schema type`).toBe('object');
      expect(typeof tool.handler, `${tool.name} handler`).toBe('function');
    }
  });
});
