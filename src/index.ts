#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { basename } from 'path';

import { validateProjectPath } from './utils/fileHandler.js';
import { ToolContext, ToolDefinition, buildRegistry, toTool } from './registry.js';
import { CommitContext, commitStore } from './utils/commit.js';
import { allToolDefinitions } from './tools/allTools.js';

/**
 * RPG Maker MZ MCP Server
 *
 * A Model Context Protocol server for reading and writing RPG Maker MZ project
 * data. Tool schemas and handlers live in each `tools/*` module and are
 * collected here into a single registry that drives both listing and dispatch.
 */

const PROJECT_PATH = process.env.RPGMAKER_PROJECT_PATH || '';

class RPGMakerMZServer {
  private server: Server;
  private projectPath: string;
  private registry: Map<string, ToolDefinition>;

  constructor() {
    this.server = new Server(
      {
        name: 'rpgmaker-mz-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.projectPath = PROJECT_PATH;
    this.registry = buildRegistry(allToolDefinitions);
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: allToolDefinitions.map(toTool),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (!this.projectPath) {
          throw new Error('RPGMAKER_PROJECT_PATH environment variable not set');
        }

        const isValid = await validateProjectPath(this.projectPath);
        if (!isValid) {
          throw new Error('Invalid RPG Maker MZ project path');
        }

        const tool = this.registry.get(request.params.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${request.params.name}`);
        }

        const ctx = { projectPath: this.projectPath };
        const args = request.params.arguments || {};
        const result = await this.runTool(tool, ctx, args);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: `Error: ${errorMessage}` }],
        };
      }
    });
  }

  /**
   * Run a tool. Mutating tools execute inside a commit context so that, when
   * `dryRun` is requested, every write is intercepted and returned as a preview
   * diff instead of being applied.
   */
  private async runTool(
    tool: ToolDefinition,
    ctx: ToolContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!tool.mutates) {
      return tool.handler(ctx, args);
    }

    const dryRun = args.dryRun === true;
    const commitCtx: CommitContext = { dryRun, commits: [] };
    const result = await commitStore.run(commitCtx, () => tool.handler(ctx, args));

    if (!dryRun) {
      return result;
    }

    return {
      dryRun: true,
      wouldChange: commitCtx.commits.map((commit) => ({
        file: basename(commit.path),
        changed: commit.changed,
        diff: commit.diff,
      })),
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RPG Maker MZ MCP server running on stdio');
  }
}

const server = new RPGMakerMZServer();
server.run().catch(console.error);
