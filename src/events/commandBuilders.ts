import { EventCommand } from '../utils/types.js';

/**
 * Pure builders for common vanilla RPG Maker MZ event commands. Each returns the
 * exact `EventCommand[]` sequence the editor writes on disk (validated against
 * real editor output), ready to splice into an event page's `list` via
 * `insert_event_commands`. No I/O — every function is a pure transform so the
 * byte-for-byte shape can be unit-tested.
 *
 * Block commands (Show Choices, Conditional Branch) follow the editor's recursive
 * layout: the block-opener sits at `indent`, each branch body sits at `indent + 1`
 * and is closed by its own `{ code: 0 }` end-of-branch marker at that child indent
 * — exactly as the editor serializes them (an empty branch still gets the marker).
 */

/** Event command codes emitted by these builders. */
const CODE = {
  SHOW_TEXT: 101,
  SHOW_TEXT_LINE: 401,
  SHOW_CHOICES: 102,
  WHEN_CHOICE: 402,
  WHEN_CANCEL: 403,
  END_CHOICES: 404,
  CONDITIONAL_BRANCH: 111,
  ELSE: 411,
  END_BRANCH: 412,
  EXIT_EVENT: 115,
  LABEL: 118,
  JUMP_TO_LABEL: 119,
  CONTROL_SWITCHES: 121,
  CONTROL_VARIABLES: 122,
  CONTROL_SELF_SWITCH: 123,
  CHANGE_GOLD: 125,
  CHANGE_ITEMS: 126,
  CHANGE_WEAPONS: 127,
  CHANGE_ARMORS: 128,
  CHANGE_PARTY_MEMBER: 129,
  WAIT: 230,
  END_OF_LIST: 0,
} as const;

/** Encode a switch/self-switch on/off value as the engine's code (0 on, 1 off). */
const onOff = (value?: 'on' | 'off'): number => (value === 'off' ? 1 : 0);

/** Build one event command with an always-present parameters array. */
function cmd(code: number, indent: number, parameters: unknown[] = []): EventCommand {
  return { code, indent, parameters };
}

/**
 * Place a caller-supplied branch body at `childIndent`. The body is normalized so
 * its shallowest command sits at `childIndent` (regardless of the indent it was
 * authored at), preserving any internal nesting — so builders compose cleanly.
 * Always followed by the `{ code: 0 }` end-of-branch marker the editor writes.
 */
function branchBody(body: EventCommand[] | undefined, childIndent: number): EventCommand[] {
  const commands = body ?? [];
  const minIndent = commands.reduce(
    (min, c) => Math.min(min, c.indent ?? 0),
    commands.length > 0 ? Infinity : 0,
  );
  const shifted = commands.map((c) =>
    cmd(c.code, (c.indent ?? 0) - minIndent + childIndent, [
      ...(Array.isArray(c.parameters) ? c.parameters : []),
    ]),
  );
  shifted.push(cmd(CODE.END_OF_LIST, childIndent));
  return shifted;
}

/** Message window position (top/middle/bottom) as the engine's positionType code. */
export type TextPosition = 'top' | 'middle' | 'bottom';
/** Message window background (window/dim/transparent) as the engine's code. */
export type TextBackground = 'window' | 'dim' | 'transparent';

const POSITION_CODE: Record<TextPosition, number> = { top: 0, middle: 1, bottom: 2 };
const BACKGROUND_CODE: Record<TextBackground, number> = { window: 0, dim: 1, transparent: 2 };

export interface ShowTextOptions {
  /** Face image basename (from list_assets('faces')); '' = no face. Default ''. */
  faceName?: string;
  /** Face index 0–7 within the face sheet. Default 0. */
  faceIndex?: number;
  /** Window background. Default 'window'. */
  background?: TextBackground;
  /** Window position on screen. Default 'bottom'. */
  position?: TextPosition;
  /** MZ name-box speaker name (may include \C[n] color codes). Default ''. */
  speakerName?: string;
  /** Indentation level in the target list. Default 0. */
  indent?: number;
}

/**
 * Show Text (command 101 setup + one 401 line per text line). `lines` are the
 * message lines; the engine word-wraps within a window, so pass one entry per
 * visual line you intend. Face/background/position/speaker match the editor's
 * Show Text dialog.
 */
export function showText(lines: string[], options: ShowTextOptions = {}): EventCommand[] {
  const indent = options.indent ?? 0;
  const setup = cmd(CODE.SHOW_TEXT, indent, [
    options.faceName ?? '',
    options.faceIndex ?? 0,
    BACKGROUND_CODE[options.background ?? 'window'],
    POSITION_CODE[options.position ?? 'bottom'],
    options.speakerName ?? '',
  ]);
  return [setup, ...lines.map((line) => cmd(CODE.SHOW_TEXT_LINE, indent, [String(line)]))];
}

/** Choice list window position (left/middle/right). */
export type ChoicePosition = 'left' | 'middle' | 'right';
const CHOICE_POSITION_CODE: Record<ChoicePosition, number> = { left: 0, middle: 1, right: 2 };

export interface ShowChoicesOptions {
  /** Command body per choice (same order as `choices`); omitted/short = empty branches. */
  branches?: EventCommand[][];
  /** When present, adds a "When Cancel" (403) branch and marks cancel = branch. */
  cancelBranch?: EventCommand[];
  /**
   * Which choice the Cancel button maps to when there's no cancelBranch: a 0-based
   * choice index, or -1 for "Disallow" (cancel does nothing). Default -1. Ignored
   * when `cancelBranch` is given (cancel then routes to that branch).
   */
  cancelType?: number;
  /** 0-based default (highlighted) choice, or -1 for none. Default 0. */
  defaultType?: number;
  /** Choice window position. Default 'right'. */
  position?: ChoicePosition;
  /** Choice window background. Default 'window'. */
  background?: TextBackground;
  /** Indentation level of the block opener. Default 0. */
  indent?: number;
}

/**
 * Show Choices — the 102 opener + a 402 "When [choice]" branch per choice
 * (optionally a 403 "When Cancel" branch) + the 404 "End Choices" closer. Each
 * branch body is placed at indent+1 and terminated with a code-0 marker, matching
 * the editor. The engine reads cancelType via `params[1] < choices.length ? … : -2`,
 * so a cancel branch is encoded as cancelType = choices.length.
 */
export function showChoices(choices: string[], options: ShowChoicesOptions = {}): EventCommand[] {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('showChoices requires a non-empty `choices` array');
  }
  const indent = options.indent ?? 0;
  const child = indent + 1;
  const hasCancelBranch = options.cancelBranch !== undefined;
  const cancelType = hasCancelBranch ? choices.length : (options.cancelType ?? -1);

  const out: EventCommand[] = [
    cmd(CODE.SHOW_CHOICES, indent, [
      choices.map((c) => String(c)),
      cancelType,
      options.defaultType ?? 0,
      CHOICE_POSITION_CODE[options.position ?? 'right'],
      BACKGROUND_CODE[options.background ?? 'window'],
    ]),
  ];

  choices.forEach((choice, i) => {
    out.push(cmd(CODE.WHEN_CHOICE, indent, [i, String(choice)]));
    out.push(...branchBody(options.branches?.[i], child));
  });

  if (hasCancelBranch) {
    out.push(cmd(CODE.WHEN_CANCEL, indent));
    out.push(...branchBody(options.cancelBranch, child));
  }

  out.push(cmd(CODE.END_CHOICES, indent));
  return out;
}

/** A comparison operator for the Variable conditional-branch condition. */
export type Comparison = '==' | '>=' | '<=' | '>' | '<' | '!=';
const COMPARISON_CODE: Record<Comparison, number> = {
  '==': 0,
  '>=': 1,
  '<=': 2,
  '>': 3,
  '<': 4,
  '!=': 5,
};
/** A comparison operator for the Gold conditional-branch condition. */
export type GoldCompare = '>=' | '<=' | '<';
const GOLD_COMPARE_CODE: Record<GoldCompare, number> = { '>=': 0, '<=': 1, '<': 2 };

/**
 * A Conditional Branch condition. Covers the common vanilla condition types
 * (switch, variable, self switch, actor-in-party, gold, item). Each maps to the
 * engine's `command111` parameter layout.
 */
export type BranchCondition =
  | { type: 'switch'; switchId: number; value?: 'on' | 'off' }
  | { type: 'self_switch'; name: 'A' | 'B' | 'C' | 'D'; value?: 'on' | 'off' }
  | {
      type: 'variable';
      variableId: number;
      comparison: Comparison;
      /** Compare against this constant (default 0) unless `variableOperand` is set. */
      constant?: number;
      /** Compare against the value of this variable id (takes precedence over constant). */
      variableOperand?: number;
    }
  | { type: 'actor_in_party'; actorId: number }
  | { type: 'gold'; value: number; compare?: GoldCompare }
  | { type: 'item'; itemId: number };

/** Turn a {@link BranchCondition} into the code-111 parameters array. */
export function conditionParameters(condition: BranchCondition): unknown[] {
  switch (condition.type) {
    case 'switch':
      return [0, condition.switchId, condition.value === 'off' ? 1 : 0];
    case 'self_switch':
      return [2, condition.name, condition.value === 'off' ? 1 : 0];
    case 'variable': {
      const useVar = condition.variableOperand !== undefined;
      return [
        1,
        condition.variableId,
        useVar ? 1 : 0,
        useVar ? condition.variableOperand : (condition.constant ?? 0),
        COMPARISON_CODE[condition.comparison],
      ];
    }
    case 'actor_in_party':
      return [4, condition.actorId, 0];
    case 'gold':
      return [7, condition.value, GOLD_COMPARE_CODE[condition.compare ?? '>=']];
    case 'item':
      return [8, condition.itemId];
  }
}

export interface ConditionalBranchOptions {
  /** Commands to run when the condition is true. Default empty. */
  thenBranch?: EventCommand[];
  /** Commands for the Else branch. Presence (even if empty) adds the 411 Else block. */
  elseBranch?: EventCommand[];
  /** Indentation level of the block opener. Default 0. */
  indent?: number;
}

/**
 * Conditional Branch — the 111 opener (condition), the then-branch body, an
 * optional 411 "Else" branch, and the 412 "End" closer. Each branch body is
 * placed at indent+1 and terminated with a code-0 marker, matching the editor.
 * The Else block is emitted only when `elseBranch` is provided.
 */
export function conditionalBranch(
  condition: BranchCondition,
  options: ConditionalBranchOptions = {},
): EventCommand[] {
  const indent = options.indent ?? 0;
  const child = indent + 1;

  const out: EventCommand[] = [
    cmd(CODE.CONDITIONAL_BRANCH, indent, conditionParameters(condition)),
    ...branchBody(options.thenBranch, child),
  ];

  if (options.elseBranch !== undefined) {
    out.push(cmd(CODE.ELSE, indent));
    out.push(...branchBody(options.elseBranch, child));
  }

  out.push(cmd(CODE.END_BRANCH, indent));
  return out;
}

/** Wait a number of frames (command 230; 60 frames = 1 second). */
export function wait(frames: number, indent = 0): EventCommand {
  return cmd(CODE.WAIT, indent, [frames]);
}

/** Exit Event Processing (command 115) — stops the current event's list early. */
export function exitEvent(indent = 0): EventCommand {
  return cmd(CODE.EXIT_EVENT, indent, []);
}

/** Label (command 118) — a named jump target within the same command list. */
export function label(name: string, indent = 0): EventCommand {
  return cmd(CODE.LABEL, indent, [String(name)]);
}

/** Jump to Label (command 119) — jumps to the matching {@link label} by name. */
export function jumpToLabel(name: string, indent = 0): EventCommand {
  return cmd(CODE.JUMP_TO_LABEL, indent, [String(name)]);
}

// --- 5e-2 game state ---

/**
 * Control Switches (command 121) — turn a switch (or an inclusive range of
 * switches `startId..endId`) on or off. Pass the same id for `endId` to set a
 * single switch. On disk: `[startId, endId, value]` where value 0 = ON, 1 = OFF.
 */
export function controlSwitches(
  startId: number,
  endId: number,
  value: 'on' | 'off' = 'on',
  indent = 0,
): EventCommand {
  return cmd(CODE.CONTROL_SWITCHES, indent, [startId, endId, onOff(value)]);
}

/**
 * Control Self Switch (command 123) — turn one of the current event's self
 * switches (A–D) on or off. On disk: `[name, value]` (value 0 = ON, 1 = OFF).
 */
export function controlSelfSwitch(
  name: 'A' | 'B' | 'C' | 'D',
  value: 'on' | 'off' = 'on',
  indent = 0,
): EventCommand {
  return cmd(CODE.CONTROL_SELF_SWITCH, indent, [name, onOff(value)]);
}

/** The arithmetic applied to the target variable(s) by Control Variables. */
export type VariableOperation = 'set' | 'add' | 'sub' | 'mul' | 'div' | 'mod';
const VARIABLE_OPERATION_CODE: Record<VariableOperation, number> = {
  set: 0,
  add: 1,
  sub: 2,
  mul: 3,
  div: 4,
  mod: 5,
};

/**
 * The right-hand operand of a Control Variables command. `game_data` reaches the
 * engine's `gameDataOperand(dataType, param1, param2)` table (dataType 0 item /
 * 1 weapon / 2 armor count, 3 actor, 4 enemy, 5 character, 6 party, 7 other,
 * 8 last — see the corescript for each type's param1/param2 meanings).
 */
export type VariableOperand =
  | { type: 'constant'; value: number }
  | { type: 'variable'; variableId: number }
  | { type: 'random'; min: number; max: number }
  | { type: 'game_data'; dataType: number; param1?: number; param2?: number };

/** Turn a {@link VariableOperand} into the trailing code-122 parameters (from params[3]). */
function variableOperandParams(operand: VariableOperand): unknown[] {
  switch (operand.type) {
    case 'constant':
      return [0, operand.value];
    case 'variable':
      return [1, operand.variableId];
    case 'random':
      return [2, operand.min, operand.max];
    case 'game_data':
      return [3, operand.dataType, operand.param1 ?? 0, operand.param2 ?? 0];
  }
}

export interface ControlVariablesOptions {
  /** Range end id (inclusive); defaults to `variableId` (a single variable). */
  endId?: number;
  /** Indentation level. Default 0. */
  indent?: number;
}

/**
 * Control Variables (command 122) — apply `operation` to a variable (or an
 * inclusive `variableId..endId` range) using `operand`. On disk:
 * `[startId, endId, operationType, operandType, ...operandParams]`.
 */
export function controlVariables(
  variableId: number,
  operation: VariableOperation,
  operand: VariableOperand,
  options: ControlVariablesOptions = {},
): EventCommand {
  return cmd(CODE.CONTROL_VARIABLES, options.indent ?? 0, [
    variableId,
    options.endId ?? variableId,
    VARIABLE_OPERATION_CODE[operation],
    ...variableOperandParams(operand),
  ]);
}

/** Increase or decrease, shared by Change Gold/Items/Weapons/Armors. */
export type GainOperation = 'increase' | 'decrease';
/** A constant or variable amount, shared by the Change Gold/Items/Weapons/Armors commands. */
export type GainOperand =
  { type: 'constant'; value: number } | { type: 'variable'; variableId: number };

/**
 * The engine's `operateValue(operation, operandType, operand)` triple:
 * `[operation(0 increase/1 decrease), operandType(0 constant/1 variable), operand]`.
 */
function operateValueParams(operation: GainOperation, operand: GainOperand): unknown[] {
  const opCode = operation === 'decrease' ? 1 : 0;
  return operand.type === 'variable' ? [opCode, 1, operand.variableId] : [opCode, 0, operand.value];
}

/** Change Gold (command 125) — gain or lose gold by a constant or variable amount. */
export function changeGold(
  operation: GainOperation,
  operand: GainOperand,
  indent = 0,
): EventCommand {
  return cmd(CODE.CHANGE_GOLD, indent, operateValueParams(operation, operand));
}

/**
 * Change Items (command 126) — gain or lose `itemId` from the party inventory by
 * a constant or variable amount. On disk: `[itemId, operation, operandType, operand]`.
 */
export function changeItems(
  itemId: number,
  operation: GainOperation,
  operand: GainOperand,
  indent = 0,
): EventCommand {
  return cmd(CODE.CHANGE_ITEMS, indent, [itemId, ...operateValueParams(operation, operand)]);
}

/**
 * Change Weapons (command 127) — gain or lose `weaponId`. `includeEquip` (default
 * false) also counts weapons currently equipped by party members when removing.
 * On disk: `[weaponId, operation, operandType, operand, includeEquip]`.
 */
export function changeWeapons(
  weaponId: number,
  operation: GainOperation,
  operand: GainOperand,
  includeEquip = false,
  indent = 0,
): EventCommand {
  return cmd(CODE.CHANGE_WEAPONS, indent, [
    weaponId,
    ...operateValueParams(operation, operand),
    includeEquip,
  ]);
}

/**
 * Change Armors (command 128) — gain or lose `armorId`. `includeEquip` (default
 * false) also counts armors currently equipped when removing.
 * On disk: `[armorId, operation, operandType, operand, includeEquip]`.
 */
export function changeArmors(
  armorId: number,
  operation: GainOperation,
  operand: GainOperand,
  includeEquip = false,
  indent = 0,
): EventCommand {
  return cmd(CODE.CHANGE_ARMORS, indent, [
    armorId,
    ...operateValueParams(operation, operand),
    includeEquip,
  ]);
}

/** Add an actor to, or remove one from, the party (Change Party Member). */
export type PartyMemberOperation = 'add' | 'remove';

/**
 * Change Party Member (command 129) — add or remove `actorId`. `initialize`
 * (default false, add only) resets the actor to their initial state on add.
 * On disk: `[actorId, operation(0 add/1 remove), initialize]`.
 */
export function changePartyMember(
  actorId: number,
  operation: PartyMemberOperation,
  initialize = false,
  indent = 0,
): EventCommand {
  return cmd(CODE.CHANGE_PARTY_MEMBER, indent, [
    actorId,
    operation === 'remove' ? 1 : 0,
    initialize,
  ]);
}
