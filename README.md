# RPG Maker MZ MCP Server

A Model Context Protocol (MCP) server for RPG Maker MZ. It lets an AI assistant read and write an RPG Maker MZ project's database and map data directly — actors, items, skills, map events, and system settings — instead of hand-editing everything in the editor.

> **Fork notice.** This is a fork of [k4zuki0539/-rpgmaker-mz-mcp](https://github.com/k4zuki0539/-rpgmaker-mz-mcp) (MIT). It builds on that project's CRUD scaffolding toward richer level-design capabilities. See [Roadmap](#roadmap) for what's planned.

## Features

- **Actor Management**: Create, read, update, and search actors
- **Item/Equipment Management**: Manage items, weapons, armors, and skills
- **Skill Creation**: Create custom skills from natural language
  - Damage skills, healing skills, buffs, debuffs, status effects
  - Simplified helpers for common skill types, plus a full-control tool
- **Map Management**: Read map data, edit map properties, set individual tiles
- **Event Management**: Create, update, delete, and script map events
- **System Configuration**: Update game settings, variables, and switches
- **Type Safety**: TypeScript throughout, with typed RPG Maker MZ data structures

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the RPG Maker MZ project path as an environment variable:

```bash
# Windows
set RPGMAKER_PROJECT_PATH=C:\path\to\your\rpgmaker\project

# macOS/Linux
export RPGMAKER_PROJECT_PATH=/path/to/your/rpgmaker/project
```

## Usage

### Running the Server

```bash
npm start
```

Or directly:

```bash
node dist/index.js
```

### Configuring in Claude Desktop

Add to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rpgmaker-mz": {
      "command": "node",
      "args": ["C:/path/to/rpgmaker-mz-mcp/dist/index.js"],
      "env": {
        "RPGMAKER_PROJECT_PATH": "C:/path/to/your/rpgmaker/project"
      }
    }
  }
}
```

## Available Tools

### Actor Tools

- `get_actors` - Get all actors from the project
- `get_actor` - Get a specific actor by ID
- `update_actor` - Update an actor's properties
- `create_actor` - Create a new actor
- `search_actors` - Search actors by name or nickname

### Item Tools

- `get_items` - Get all items from the project
- `get_weapons` - Get all weapons from the project
- `get_armors` - Get all armors from the project
- `get_skills` - Get all skills from the project
- `update_item` - Update an item's properties
- `search_items` - Search items by name or description

### Skill Tools

- `get_skill` - Get a specific skill by ID
- `create_skill` - Create a custom skill with full control
- `create_damage_skill` - Create a damage-dealing skill (simplified)
- `create_healing_skill` - Create a healing skill (simplified)
- `create_buff_skill` - Create a buff skill (simplified)
- `create_state_skill` - Create a state-inflicting skill (simplified)
- `update_skill` - Update a skill's properties
- `search_skills` - Search skills by name or description

### Map Tools

- `get_map` - Get map data by ID
- `get_map_infos` - Get information about all maps
- `get_map_events` - Get all events from a specific map
- `get_map_event` - Get a specific event from a map
- `update_map_event` - Update a map event's properties
- `create_map_event` - Create a new event on a map
- `search_map_events` - Search events on a map by name
- `add_event_command` - Add a command to an event page
- `update_map` - Update a map's top-level properties
- `get_map_dimensions` - Get a map's width and height in tiles
- `set_map_tile` - Set a single raw tile ID at (x, y) on a z-layer
- `delete_map_event` - Delete an event from a map by ID

### System Tools

- `get_system` - Get system data
- `get_variables` - Get all game variable names
- `set_variable_name` - Set a variable name
- `get_switches` - Get all game switch names
- `set_switch_name` - Set a switch name
- `get_game_title` - Get the game title
- `update_game_title` - Update the game title
- `update_starting_position` - Update the game starting position

## Example Usage

Once configured, you can use Claude to interact with your RPG Maker MZ project:

### Example 1: Get All Actors

```
Show me all actors in my RPG Maker MZ project
```

Claude will use the `get_actors` tool to retrieve and display all actors.

### Example 2: Update an Actor

```
Update actor 1's name to "Hero" and initial level to 5
```

Claude will use the `update_actor` tool with the appropriate parameters.

### Example 3: Create a New Item

```
Create a new item called "Health Potion" that restores 50 HP
```

Claude will help you create the item with the proper structure.

### Example 4: Search Map Events

```
Find all events on map 1 that contain "treasure" in their name
```

Claude will use the `search_map_events` tool to find matching events.

### Example 5: Update Game Settings

```
Change the game title to "My Epic Adventure"
```

Claude will use the `update_game_title` tool to update the system data.

### Example 6: Create a Custom Skill

```
Create a fire magic skill called "Fireball" that costs 15 MP,
targets a single enemy, and deals "a.mat * 4 - b.mdf * 2" damage
```

Claude will use the `create_damage_skill` tool to create the skill.

### Example 7: Create a Healing Skill

```
Create a group healing spell called "Mass Heal" that costs 30 MP,
targets all allies, and heals "a.mat * 3 + 100" HP
```

Claude will use the `create_healing_skill` tool to create the healing skill.

## Data Structure Reference

### Actor Structure

```typescript
{
  id: number;
  name: string;
  nickname: string;
  profile: string;
  classId: number;
  initialLevel: number;
  maxLevel: number;
  characterName: string;
  characterIndex: number;
  faceName: string;
  faceIndex: number;
  battlerName: string;
  traits: Trait[];
  equips: number[];
  note: string;
}
```

### Map Event Structure

```typescript
{
  id: number;
  name: string;
  note: string;
  pages: EventPage[];
  x: number;
  y: number;
}
```

### Event Command Structure

```typescript
{
  code: number;        // Command code (see RPG Maker MZ documentation)
  indent: number;      // Indentation level
  parameters: any[];   // Command parameters
}
```

## Common Event Command Codes

- `101` - Show Text
- `102` - Show Choices
- `111` - Conditional Branch
- `112` - Loop
- `113` - Break Loop
- `121` - Control Switches
- `122` - Control Variables
- `125` - Change Gold
- `126` - Change Items
- `201` - Transfer Player
- `356` - Plugin Command

For a complete list, refer to the RPG Maker MZ documentation.

## Development

```bash
npm run build         # Compile TypeScript to dist/
npm run dev           # Compile in watch mode
npm run lint          # ESLint
npm run lint:fix      # ESLint with autofix
npm run format        # Format with Prettier
npm run format:check  # Check formatting (used in CI)
```

CI runs lint, format check, and build on every push and pull request (see `.github/workflows/ci.yml`).

## Project Structure

```
rpgmaker-mz-mcp/
├── src/
│   ├── index.ts              # MCP server: tool schemas + dispatch
│   ├── tools/
│   │   ├── actorTools.ts     # Actor management
│   │   ├── itemTools.ts      # Item/weapon/armor management
│   │   ├── skillTools.ts     # Skill creation helpers
│   │   ├── mapTools.ts       # Map and event management
│   │   └── systemTools.ts    # System settings, switches, variables
│   └── utils/
│       ├── fileHandler.ts    # JSON I/O + project path helpers
│       └── types.ts          # RPG Maker MZ data type definitions
├── dist/                     # Compiled JavaScript (gitignored)
├── eslint.config.js
├── .prettierrc.json
├── package.json
├── tsconfig.json
└── README.md
```

## Roadmap

This fork is being extended beyond the original CRUD tools toward full level-design support. Planned, roughly in dependency order:

- **Correctness:** validation on write, lightweight names-only index tools, dry-run/diff previews, automatic pre-write backups.
- **Missing subsystems:** multi-map support (`create_map` + map tree), class editor, enemy/troop tools, common events, move-route builder, plugin-command support.
- **Tile painting (headline feature):** a semantic tile catalog, a deterministic autotile shape calculator, layer-aware paint commands across the six map layers, and passability/terrain-tag exposure.

## Safety and Best Practices

1. **Backup Your Project**: Always backup your RPG Maker MZ project before making changes
2. **Close RPG Maker MZ Editor**: Close the RPG Maker MZ editor when using this server to avoid conflicts
3. **Validate Changes**: Test your game after making changes to ensure everything works correctly
4. **Version Control**: Use git or another version control system for your project

## Limitations

- This server modifies JSON files directly. Make sure the RPG Maker MZ editor is closed when using it
- Some advanced features may require manual editing in the RPG Maker MZ editor
- Plugin-specific data structures may not be fully supported

## Troubleshooting

### "Invalid RPG Maker MZ project path"

Make sure the `RPGMAKER_PROJECT_PATH` environment variable points to a valid RPG Maker MZ project directory containing:

- `game.rmmzproject` file
- `data/` directory with `System.json`

### Changes Not Appearing

1. Make sure the RPG Maker MZ editor is closed
2. Verify the project path is correct
3. Check that the JSON files have write permissions

### Tool Not Found

Restart Claude Desktop after updating the configuration file.

## Contributing

Contributions are welcome! Please ensure:

- Code follows TypeScript best practices
- All functions include proper error handling
- Type definitions are updated for new features
- Documentation is updated accordingly

## License

MIT

## Resources

- [RPG Maker MZ Official Website](https://www.rpgmakerweb.com/products/rpg-maker-mz)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [RPG Maker MZ Database Structure](https://github.com/rpgtkoolmv/rmmz-api-reference)

## Support

For issues and feature requests, please open an issue on the project repository.
