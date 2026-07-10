import { z } from 'zod';
import { readJsonFile, getDataPath } from '../utils/fileHandler.js';
import { commitChange } from '../utils/commit.js';
import { GameClass, Learning, Skill } from '../utils/types.js';
import { ToolDefinition } from '../registry.js';

/** Human-readable labels for the 8 base parameters, indexed 0-7. */
export const PARAM_NAMES = ['maxHP', 'maxMP', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk'] as const;

/**
 * Per-param [level-1 base, growth-per-level] for the default new-class curve.
 * RPG Maker MZ's sample curves are effectively linear, so a fresh class gets a
 * clean linear growth the user can then reshape with `set_class_param_curve`.
 */
const DEFAULT_PARAM_CURVE: [base: number, growth: number][] = [
  [500, 50], // maxHP
  [50, 8], // maxMP
  [15, 2], // atk
  [15, 2], // def
  [15, 2], // mat
  [15, 2], // mdf
  [15, 2], // agi
  [15, 2], // luk
];

const DEFAULT_MAX_LEVEL = 99;

/**
 * Drop keys whose value is `undefined` so a caller's omitted optional field can't
 * clobber a template default when spread over it.
 */
function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Build the 8×(maxLevel+1) parameter matrix for a new class: one linear curve per
 * param. Index 0 mirrors the level-1 value (the engine never reads level 0).
 */
export function defaultClassParams(maxLevel: number = DEFAULT_MAX_LEVEL): number[][] {
  return DEFAULT_PARAM_CURVE.map(([base, growth]) => {
    const row: number[] = [];
    for (let level = 0; level <= maxLevel; level++) {
      row.push(base + growth * Math.max(level - 1, 0));
    }
    return row;
  });
}

/**
 * A blank class mirroring what the RPG Maker MZ editor writes for a freshly-created
 * class: the default EXP curve, no traits or learnings, and a default linear param
 * curve. Pure so the template shape can be unit-tested. Field order mirrors the
 * editor's on-disk shape.
 */
export function defaultClass(maxLevel: number = DEFAULT_MAX_LEVEL): Omit<GameClass, 'id'> {
  return {
    name: '',
    expParams: [30, 20, 30, 30],
    traits: [],
    learnings: [],
    note: '',
    params: defaultClassParams(maxLevel),
  };
}

/** Get all classes from the project (`data/Classes.json`). */
export async function getClasses(projectPath: string): Promise<(GameClass | null)[]> {
  return await readJsonFile<(GameClass | null)[]>(getDataPath(projectPath, 'Classes.json'));
}

/** Load a class by id or throw a "not found" error. Returns [classes, index]. */
async function findClassIndex(
  projectPath: string,
  classId: number,
): Promise<[(GameClass | null)[], number]> {
  const classes = await getClasses(projectPath);
  const index = classes.findIndex((c) => c && c.id === classId);
  if (index === -1) {
    throw new Error(`Class with ID ${classId} not found`);
  }
  return [classes, index];
}

/**
 * Create a new class. Only `name` is required; any omitted field falls back to the
 * editor's new-class default (see {@link defaultClass}). Allocates the next unused
 * id (max existing + 1) and writes through the commit choke point.
 */
export async function createClass(
  projectPath: string,
  options: { name: string; maxLevel?: number } & Partial<Omit<GameClass, 'id' | 'name'>>,
): Promise<GameClass> {
  const { maxLevel, ...overrides } = options;
  const classes = await getClasses(projectPath);
  const maxId = classes.reduce((max, c) => (c && c.id > max ? c.id : max), 0);

  // Template first, caller's defined fields next, computed id last so it always wins.
  const gameClass: GameClass = {
    ...defaultClass(maxLevel),
    ...definedOnly(overrides),
    id: maxId + 1,
  };

  classes.push(gameClass);
  await commitChange(getDataPath(projectPath, 'Classes.json'), classes);
  return gameClass;
}

/** Update an existing class's properties (shallow merge; id re-pinned). */
export async function updateClass(
  projectPath: string,
  classId: number,
  updates: Partial<GameClass>,
): Promise<GameClass> {
  const [classes, index] = await findClassIndex(projectPath, classId);
  classes[index] = { ...classes[index]!, ...updates, id: classId };
  await commitChange(getDataPath(projectPath, 'Classes.json'), classes);
  return classes[index]!;
}

/**
 * Add a "learn skill at level" entry to a class — the first-class replacement for
 * the hack of attaching skills directly to an actor via an Add-Skill trait. The
 * `skillId` is validated to reference an existing skill (throws otherwise) and the
 * resulting `learnings` list is kept sorted by level.
 */
export async function addClassLearning(
  projectPath: string,
  classId: number,
  skillId: number,
  level: number,
  note = '',
): Promise<GameClass> {
  const skills = await readJsonFile<(Skill | null)[]>(getDataPath(projectPath, 'Skills.json'));
  if (!skills.some((s) => s && s.id === skillId)) {
    throw new Error(`Learning references skillId ${skillId}, which does not exist`);
  }

  const [classes, index] = await findClassIndex(projectPath, classId);
  const gameClass = classes[index]!;
  const learning: Learning = { level, note, skillId };
  const learnings = [...(gameClass.learnings ?? []), learning].sort((a, b) => a.level - b.level);
  classes[index] = { ...gameClass, learnings };

  await commitChange(getDataPath(projectPath, 'Classes.json'), classes);
  return classes[index]!;
}

/**
 * Replace one of a class's 8 parameter growth curves. `paramId` is 0-7
 * ([maxHP, maxMP, atk, def, mat, mdf, agi, luk]) and `values` must match the
 * existing curve's length (so the matrix stays rectangular / same max level).
 */
export async function setClassParamCurve(
  projectPath: string,
  classId: number,
  paramId: number,
  values: number[],
): Promise<GameClass> {
  if (paramId < 0 || paramId > 7) {
    throw new Error(`paramId must be 0-7 (got ${paramId})`);
  }

  const [classes, index] = await findClassIndex(projectPath, classId);
  const gameClass = classes[index]!;
  const expectedLength = gameClass.params[paramId]?.length ?? values.length;
  if (values.length !== expectedLength) {
    throw new Error(
      `Param curve for ${PARAM_NAMES[paramId]} must have ${expectedLength} entries (got ${values.length})`,
    );
  }

  const params = gameClass.params.map((row, i) => (i === paramId ? values : row));
  classes[index] = { ...gameClass, params };

  await commitChange(getDataPath(projectPath, 'Classes.json'), classes);
  return classes[index]!;
}

export const classToolDefinitions: ToolDefinition[] = [
  {
    name: 'get_classes',
    description: 'Get all character classes from the project (data/Classes.json)',
    inputSchema: {},
    handler: (ctx) => getClasses(ctx.projectPath),
  },
  {
    name: 'create_class',
    mutates: true,
    description:
      "Create a new character class in data/Classes.json. Only `name` is required; omitted fields use the editor's new-class defaults (EXP curve [30,20,30,30], no traits/learnings, a linear param curve to maxLevel). Allocates and returns the next unused class id.",
    inputSchema: {
      name: z.string().describe('Class name shown in the database'),
      maxLevel: z
        .number()
        .int()
        .optional()
        .describe('Highest level the param curve covers (default 99); sizes the params matrix'),
      expParams: z
        .array(z.number())
        .length(4)
        .optional()
        .describe('EXP curve: [basis, extra, accelerationA, accelerationB]'),
      params: z
        .array(z.array(z.number()))
        .optional()
        .describe(
          '8 param growth curves, each maxLevel+1 long: [maxHP,maxMP,atk,def,mat,mdf,agi,luk]',
        ),
      learnings: z
        .array(z.unknown())
        .optional()
        .describe('Learned-skill entries { level, skillId, note }'),
      traits: z.array(z.unknown()).optional().describe('Trait objects { code, dataId, value }'),
      note: z.string().optional().describe('Note field'),
    },
    handler: (ctx, args) => {
      const { dryRun: _dryRun, name, ...rest } = args;
      return createClass(ctx.projectPath, { name, ...rest });
    },
  },
  {
    name: 'update_class',
    mutates: true,
    description:
      "Update a class's properties (shallow merge into the existing record). Use for name, expParams, traits, or to replace the whole learnings/params arrays; for targeted edits prefer add_class_learning / set_class_param_curve.",
    inputSchema: {
      classId: z.number().describe('The ID of the class to update'),
      updates: z
        .record(z.string(), z.unknown())
        .describe('Object containing class properties to update'),
    },
    handler: (ctx, args) => updateClass(ctx.projectPath, args.classId, args.updates),
  },
  {
    name: 'add_class_learning',
    mutates: true,
    description:
      'Add a "learn skill at level" entry to a class (replaces the hack of attaching skills to an actor via an Add-Skill trait). Validates the skillId exists and keeps the learnings sorted by level.',
    inputSchema: {
      classId: z.number().describe('The ID of the class to add the learning to'),
      skillId: z.number().describe('The skill learned (must exist in data/Skills.json)'),
      level: z.number().int().describe('Level at which the skill is learned'),
      note: z.string().optional().describe('Optional note for the learning entry'),
    },
    handler: (ctx, args) =>
      addClassLearning(ctx.projectPath, args.classId, args.skillId, args.level, args.note),
  },
  {
    name: 'set_class_param_curve',
    mutates: true,
    description:
      "Replace one of a class's 8 parameter growth curves. paramId is 0-7 ([maxHP,maxMP,atk,def,mat,mdf,agi,luk]); values must match the existing curve length (same max level).",
    inputSchema: {
      classId: z.number().describe('The ID of the class to edit'),
      paramId: z
        .number()
        .int()
        .min(0)
        .max(7)
        .describe('Which param: 0 maxHP,1 maxMP,2 atk,3 def,4 mat,5 mdf,6 agi,7 luk'),
      values: z
        .array(z.number())
        .describe('New curve, indexed by level; must match the existing curve length'),
    },
    handler: (ctx, args) =>
      setClassParamCurve(ctx.projectPath, args.classId, args.paramId, args.values),
  },
];
