import { readJsonFile, getDataPath } from '../utils/fileHandler.js';
import { commitChange } from '../utils/commit.js';
import { Skill } from '../utils/types.js';
import { ToolDefinition } from '../registry.js';

/**
 * Get all skills from the project
 */
export async function getSkills(projectPath: string): Promise<Skill[]> {
  const skillsPath = getDataPath(projectPath, 'Skills.json');
  return await readJsonFile<Skill[]>(skillsPath);
}

/**
 * Get a specific skill by ID
 */
export async function getSkill(projectPath: string, skillId: number): Promise<Skill | null> {
  const skills = await getSkills(projectPath);
  return skills.find((skill) => skill && skill.id === skillId) || null;
}

/**
 * Create a new skill
 */
export async function createSkill(
  projectPath: string,
  skillData: {
    name: string;
    description?: string;
    iconIndex?: number;
    mpCost?: number;
    tpCost?: number;
    scope?: number;
    damage?: {
      type: number;
      elementId: number;
      formula: string;
      variance?: number;
      critical?: boolean;
    };
    effects?: Array<{
      code: number;
      dataId: number;
      value1: number;
      value2: number;
    }>;
    animationId?: number;
    message1?: string;
    stypeId?: number;
  },
): Promise<Skill> {
  const skills = await getSkills(projectPath);

  // Find the next available ID
  const maxId = skills.reduce((max, skill) => {
    return skill && skill.id > max ? skill.id : max;
  }, 0);

  const newSkill: Skill = {
    id: maxId + 1,
    name: skillData.name,
    description: skillData.description || '',
    iconIndex: skillData.iconIndex || 64,
    mpCost: skillData.mpCost || 0,
    tpCost: skillData.tpCost || 0,
    tpGain: 0,
    scope: skillData.scope || 1, // Default: enemy single
    occasion: 1, // Battle only
    speed: 0,
    successRate: 100,
    repeats: 1,
    hitType: skillData.damage?.type === 1 || skillData.damage?.type === 5 ? 1 : 2,
    animationId: skillData.animationId || 0,
    damage: {
      type: skillData.damage?.type || 0,
      elementId: skillData.damage?.elementId || 0,
      formula: skillData.damage?.formula || '0',
      variance: skillData.damage?.variance !== undefined ? skillData.damage.variance : 20,
      critical: skillData.damage?.critical !== undefined ? skillData.damage.critical : false,
    },
    effects: skillData.effects || [],
    message1: skillData.message1 || '',
    message2: '',
    note: '',
    stypeId: skillData.stypeId || 1, // Default: Magic
    requiredWtypeId1: 0,
    requiredWtypeId2: 0,
    messageType: 1,
    traits: [],
  };

  skills.push(newSkill);

  const skillsPath = getDataPath(projectPath, 'Skills.json');
  await commitChange(skillsPath, skills);

  return newSkill;
}

/**
 * Update a skill's data
 */
export async function updateSkill(
  projectPath: string,
  skillId: number,
  updates: Partial<Skill>,
): Promise<Skill> {
  const skills = await getSkills(projectPath);
  const skillIndex = skills.findIndex((skill) => skill && skill.id === skillId);

  if (skillIndex === -1) {
    throw new Error(`Skill with ID ${skillId} not found`);
  }

  skills[skillIndex] = { ...skills[skillIndex], ...updates };

  const skillsPath = getDataPath(projectPath, 'Skills.json');
  await commitChange(skillsPath, skills);

  return skills[skillIndex];
}

/**
 * Delete a skill
 */
export async function deleteSkill(projectPath: string, skillId: number): Promise<boolean> {
  const skills = await getSkills(projectPath);
  const skillIndex = skills.findIndex((skill) => skill && skill.id === skillId);

  if (skillIndex === -1) {
    return false;
  }

  // Don't delete core skills (1, 2)
  if (skillId === 1 || skillId === 2) {
    throw new Error('Cannot delete core skills (Attack/Guard)');
  }

  skills[skillIndex] = null as any;

  const skillsPath = getDataPath(projectPath, 'Skills.json');
  await commitChange(skillsPath, skills);

  return true;
}

/**
 * Search skills by name
 */
export async function searchSkills(projectPath: string, searchTerm: string): Promise<Skill[]> {
  const skills = await getSkills(projectPath);
  const lowerSearchTerm = searchTerm.toLowerCase();

  return skills.filter(
    (skill) =>
      skill &&
      (skill.name.toLowerCase().includes(lowerSearchTerm) ||
        skill.description.toLowerCase().includes(lowerSearchTerm)),
  );
}

/**
 * Create a damage skill (attack spell or physical skill)
 */
export async function createDamageSkill(
  projectPath: string,
  name: string,
  damageFormula: string,
  mpCost: number,
  scope: number,
  elementId?: number,
  description?: string,
): Promise<Skill> {
  return await createSkill(projectPath, {
    name,
    description: description || `Deals damage with ${name}.`,
    mpCost,
    scope,
    damage: {
      type: 1, // HP damage
      elementId: elementId || 0,
      formula: damageFormula,
      variance: 20,
      critical: true,
    },
    animationId: 1,
    message1: '%1 casts %2!', // %1 = subject name, %2 = skill name
    stypeId: 1, // Magic
  });
}

/**
 * Create a healing skill
 */
export async function createHealingSkill(
  projectPath: string,
  name: string,
  healFormula: string,
  mpCost: number,
  scope: number,
  description?: string,
): Promise<Skill> {
  return await createSkill(projectPath, {
    name,
    description: description || `Restores HP with ${name}.`,
    mpCost,
    scope,
    damage: {
      type: 3, // HP recovery
      elementId: 0,
      formula: healFormula,
      variance: 20,
      critical: false,
    },
    animationId: 47,
    message1: '%1 casts %2!', // %1 = subject name, %2 = skill name
    stypeId: 1,
    iconIndex: 72,
  });
}

/**
 * Create a buff skill
 */
export async function createBuffSkill(
  projectPath: string,
  name: string,
  buffType: number,
  turns: number,
  mpCost: number,
  scope: number,
  description?: string,
): Promise<Skill> {
  return await createSkill(projectPath, {
    name,
    description: description || `Strengthens allies with ${name}.`,
    mpCost,
    scope,
    effects: [
      {
        code: 31, // Add buff
        dataId: buffType,
        value1: turns,
        value2: 0,
      },
    ],
    animationId: 52,
    message1: '%1 uses %2!', // %1 = subject name, %2 = skill name
    stypeId: 1,
    iconIndex: 73,
  });
}

/**
 * Create a debuff skill
 */
export async function createDebuffSkill(
  projectPath: string,
  name: string,
  debuffType: number,
  turns: number,
  mpCost: number,
  scope: number,
  description?: string,
): Promise<Skill> {
  return await createSkill(projectPath, {
    name,
    description: description || `Weakens enemies with ${name}.`,
    mpCost,
    scope,
    effects: [
      {
        code: 32, // Add debuff
        dataId: debuffType,
        value1: turns,
        value2: 0,
      },
    ],
    animationId: 40,
    message1: '%1 uses %2!', // %1 = subject name, %2 = skill name
    stypeId: 1,
    iconIndex: 74,
  });
}

/**
 * Create a state-inflicting skill
 */
export async function createStateSkill(
  projectPath: string,
  name: string,
  stateId: number,
  chance: number,
  mpCost: number,
  scope: number,
  description?: string,
): Promise<Skill> {
  return await createSkill(projectPath, {
    name,
    description: description || `Inflicts a status ailment with ${name}.`,
    mpCost,
    scope,
    effects: [
      {
        code: 21, // Add state
        dataId: stateId,
        value1: chance,
        value2: 0,
      },
    ],
    damage: {
      type: 0,
      elementId: 0,
      formula: '0',
      variance: 20,
      critical: false,
    },
    animationId: 1,
    message1: '%1 uses %2!', // %1 = subject name, %2 = skill name
    stypeId: 1,
  });
}

export const skillToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_skill',
    description: 'Get a specific skill by ID',
    inputSchema: {
      type: 'object',
      properties: { skillId: { type: 'number', description: 'The ID of the skill to retrieve' } },
      required: ['skillId'],
    },
    handler: (ctx, args) => getSkill(ctx.projectPath, args.skillId),
  },
  {
    name: 'create_skill',
    mutates: true,
    description: 'Create a new skill with custom properties',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        description: { type: 'string', description: 'Skill description' },
        iconIndex: { type: 'number', description: 'Icon index (0-1000+)' },
        mpCost: { type: 'number', description: 'MP cost' },
        tpCost: { type: 'number', description: 'TP cost' },
        scope: {
          type: 'number',
          description: 'Target scope (1=enemy single, 2=enemy all, 7=ally all, etc.)',
        },
        damage: {
          type: 'object',
          description: 'Damage configuration',
          properties: {
            type: {
              type: 'number',
              description: 'Damage type (0=none, 1=HP damage, 3=HP recover, etc.)',
            },
            elementId: {
              type: 'number',
              description: 'Element ID (0=none, 2=fire, 3=ice, etc.)',
            },
            formula: {
              type: 'string',
              description: 'Damage formula (e.g., "a.mat * 4 - b.mdf * 2")',
            },
          },
        },
        effects: {
          type: 'array',
          description: 'Skill effects (buffs, debuffs, states, etc.)',
        },
        animationId: { type: 'number', description: 'Animation ID' },
        message1: { type: 'string', description: 'Battle message' },
        stypeId: { type: 'number', description: 'Skill type (1=magic, 2=special, etc.)' },
      },
      required: ['name'],
    },
    handler: (ctx, args) => createSkill(ctx.projectPath, args as Parameters<typeof createSkill>[1]),
  },
  {
    name: 'create_damage_skill',
    mutates: true,
    description: 'Create a damage-dealing skill (simplified)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        damageFormula: { type: 'string', description: 'Damage formula (e.g., "a.mat * 4")' },
        mpCost: { type: 'number', description: 'MP cost' },
        scope: { type: 'number', description: 'Target scope (1=enemy single, 2=enemy all)' },
        elementId: {
          type: 'number',
          description: 'Element ID (0=none, 2=fire, 3=ice, 4=thunder, etc.)',
        },
        description: { type: 'string', description: 'Skill description' },
      },
      required: ['name', 'damageFormula', 'mpCost', 'scope'],
    },
    handler: (ctx, args) =>
      createDamageSkill(
        ctx.projectPath,
        args.name,
        args.damageFormula,
        args.mpCost,
        args.scope,
        args.elementId,
        args.description,
      ),
  },
  {
    name: 'create_healing_skill',
    mutates: true,
    description: 'Create a healing skill (simplified)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        healFormula: { type: 'string', description: 'Heal formula (e.g., "a.mat * 3 + 100")' },
        mpCost: { type: 'number', description: 'MP cost' },
        scope: { type: 'number', description: 'Target scope (7=ally all, 11=user)' },
        description: { type: 'string', description: 'Skill description' },
      },
      required: ['name', 'healFormula', 'mpCost', 'scope'],
    },
    handler: (ctx, args) =>
      createHealingSkill(
        ctx.projectPath,
        args.name,
        args.healFormula,
        args.mpCost,
        args.scope,
        args.description,
      ),
  },
  {
    name: 'create_buff_skill',
    mutates: true,
    description: 'Create a buff skill (simplified)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        buffType: { type: 'number', description: 'Buff type (2=ATK, 3=DEF, 4=MAT, 5=MDF, 6=AGI)' },
        turns: { type: 'number', description: 'Number of turns the buff lasts' },
        mpCost: { type: 'number', description: 'MP cost' },
        scope: { type: 'number', description: 'Target scope (7=ally all, 11=user)' },
        description: { type: 'string', description: 'Skill description' },
      },
      required: ['name', 'buffType', 'turns', 'mpCost', 'scope'],
    },
    handler: (ctx, args) =>
      createBuffSkill(
        ctx.projectPath,
        args.name,
        args.buffType,
        args.turns,
        args.mpCost,
        args.scope,
        args.description,
      ),
  },
  {
    name: 'create_state_skill',
    mutates: true,
    description: 'Create a state-inflicting skill (poison, sleep, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Skill name' },
        stateId: {
          type: 'number',
          description: 'State ID (4=poison, 5=blind, 6=silence, 8=confusion, etc.)',
        },
        chance: { type: 'number', description: 'Success chance (0.0-1.0)' },
        mpCost: { type: 'number', description: 'MP cost' },
        scope: { type: 'number', description: 'Target scope (1=enemy single, 2=enemy all)' },
        description: { type: 'string', description: 'Skill description' },
      },
      required: ['name', 'stateId', 'chance', 'mpCost', 'scope'],
    },
    handler: (ctx, args) =>
      createStateSkill(
        ctx.projectPath,
        args.name,
        args.stateId,
        args.chance,
        args.mpCost,
        args.scope,
        args.description,
      ),
  },
  {
    name: 'update_skill',
    mutates: true,
    description: "Update a skill's properties",
    inputSchema: {
      type: 'object',
      properties: {
        skillId: { type: 'number', description: 'The skill ID to update' },
        updates: { type: 'object', description: 'Properties to update' },
      },
      required: ['skillId', 'updates'],
    },
    handler: (ctx, args) => updateSkill(ctx.projectPath, args.skillId, args.updates),
  },
  {
    name: 'search_skills',
    description: 'Search skills by name or description',
    inputSchema: {
      type: 'object',
      properties: { searchTerm: { type: 'string', description: 'Search term' } },
      required: ['searchTerm'],
    },
    handler: (ctx, args) => searchSkills(ctx.projectPath, args.searchTerm),
  },
];
