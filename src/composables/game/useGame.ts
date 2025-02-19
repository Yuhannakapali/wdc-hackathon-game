import type { WritableComputedRef, ComputedRef, Ref } from 'vue';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import {
  type GameState,
  createGameState,
  type SerializedGameState,
  fromSerializedState,
  serializeGameState
} from '../../sdk';
import { createReducer, type GameEvent } from '../../sdk/events/reducer';
import type { EndTurnActionInput } from '../../sdk/actions/endTurn';
import type { MoveActionInput } from '../../sdk/actions/move';
import type { SkillActionInput } from '../../sdk/actions/skill';
import type { SummonActionInput } from '../../sdk/actions/summon';
import type { SoldierData } from '../../sdk/soldiers';
import type { Nullable, Override } from '../../utils/types';
import type { Entity } from '../../sdk/entity';
import { getActiveEntity } from '../../sdk/utils/entity.helpers';
import { createPathFinder } from '../../sdk/utils/pathfinding.helpers';
import type { AStarFinder } from 'astar-typescript';
import type { GameMapCell } from '../../sdk/map';
import { createPlayerAbility } from '../../sdk/abilities/player.ability';
import { subject } from '@casl/ability';
import { createSkillAbility } from '../../sdk/abilities/skill.ability';
import { endTurnEvent } from '../../sdk/events/endTurn.event';
import { type FXSequenceContext } from './useFXSequencer';
import type { SkillData } from '../../sdk/utils/entityData';
import { createEntityAbility } from '../../sdk/abilities/entity.ability';

export type GameDetail = Override<Doc<'games'>, { creator: Doc<'users'> }> & {
  players: (Doc<'gamePlayers'> & { user: Doc<'users'> })[];
  serializedState: SerializedGameState;
  latestEvents: GameEvent[];
};

export type Action =
  | { type: 'move'; payload: Omit<MoveActionInput, 'playerId'> }
  | { type: 'summon'; payload: Omit<SummonActionInput, 'playerId'> }
  | { type: 'use_skill'; payload: Omit<SkillActionInput, 'playerId'> }
  | { type: 'end_turn'; payload: Omit<EndTurnActionInput, 'playerId'> };

export type ActionDispatcher = (arg: Action) => void;

export type Game = {
  me: Nullable<Id<'users'>>;
  game: ComputedRef<GameDetail>;
  state: Ref<GameState>;
  sendAction: ActionDispatcher;
  activeEntity: ComputedRef<Entity>;
  selectedSummon: WritableComputedRef<Nullable<SoldierData>>;
  selectedSkill: WritableComputedRef<Nullable<SkillData>>;
  selectedEntity: Ref<Nullable<Entity>>;
  targetMode: Ref<'move' | 'summon' | 'skill' | null>;
  isMyTurn: ComputedRef<boolean>;
  pathfinder: ComputedRef<AStarFinder>;
  atbTimeline: ComputedRef<Entity[]>;
  hoveredCell: Ref<Nullable<GameMapCell>>;
  canSummonAt: (cell: GameMapCell) => boolean;
  canCastAt: (cell: GameMapCell) => boolean;
  canCast: (skill: SkillData) => boolean;
  canMoveTo: (cell: GameMapCell) => boolean;
  isInCastRange: (cell: GameMapCell) => boolean;
  move: (cell: GameMapCell) => void;
  summon: (cell: GameMapCell) => void;
  useSkill: (cell: GameMapCell) => void;
  endTurn: (cell: GameMapCell) => void;
  surrender: () => void;
};

export const GAME_INJECTION_KEY = Symbol('game') as InjectionKey<Game>;

export const useGameProvider = (
  game: ComputedRef<GameDetail>,
  sendAction: ActionDispatcher,
  onSurrender: () => void,
  me: Nullable<Id<'users'>>,
  sequencer: FXSequenceContext
) => {
  const state = ref(fromSerializedState(game.value.serializedState));

  watch(
    () => game.value.latestEvents,
    newEvents => {
      const sequence = sequencer.buildSequence(newEvents);

      sequence.play(state, event => {
        state.value.reducer(state.value, event);
      });
    }
  );

  const activeEntity = computed(() => getActiveEntity(state.value));

  const selectedSummon = ref<Nullable<SoldierData>>();
  const selectedSkill = ref<Nullable<SkillData>>();
  const selectedEntity = ref<Nullable<Entity>>(null);

  const selectSummon = (summon: SoldierData) => {
    selectedSummon.value = summon;
    selectedSkill.value = null;
  };

  const selectSkill = (skill: SkillData) => {
    selectedSkill.value = skill;
    selectedSummon.value = null;
  };

  const isMyTurn = computed(() => activeEntity.value.owner === me);

  const pathfinder = computed(() =>
    createPathFinder(state.value, state.value.activeEntityId)
  );

  const isInCastRange = (cell: GameMapCell) => {
    if (!selectedSkill.value) return false;
    if (!cell) return false;

    return (
      Math.abs(cell.x - activeEntity.value.position.x) <= selectedSkill.value.range &&
      Math.abs(cell.y - activeEntity.value.position.y) <= selectedSkill.value.range
    );
  };

  const canSummonAt = ({ x, y }: GameMapCell) => {
    const ability = createPlayerAbility(state.value, activeEntity.value.owner);
    return ability.can('summon_at', subject('position', { x, y }));
  };

  const canMoveTo = (cell: GameMapCell) => {
    const path = pathfinder.value.findPath(
      //we round it because the value can be a float when animated by the FX sequencer
      {
        x: Math.round(activeEntity.value.position.x),
        y: Math.round(activeEntity.value.position.y)
      },
      cell
    );
    const isSameCell =
      cell.x === activeEntity.value.position.x &&
      cell.y === activeEntity.value.position.y;
    if (isSameCell) return true;

    return path.length > 0 && path.length <= activeEntity.value.ap;
  };

  const canCastAt = (cell: GameMapCell) => {
    if (!selectedSkill.value) return false;

    const ability = createSkillAbility(
      state.value,
      selectedSkill.value,
      activeEntity.value
    );
    return ability.can('target', subject('cell', { x: cell.x, y: cell.y }));
  };

  const canCast = (skill: SkillData) => {
    return createEntityAbility(state.value, activeEntity.value).can(
      'cast',
      subject('skill', skill)
    );
  };

  const move = (cell: GameMapCell) => {
    if (!isMyTurn.value) return;
    if (!canMoveTo(cell)) return;

    sendAction({
      type: 'move',
      payload: { target: cell }
    });
  };

  const summon = (cell: GameMapCell) => {
    if (!isMyTurn.value) return;
    if (!canSummonAt(cell)) {
      selectedSummon.value = null;
    }
    if (!selectedSummon.value) return;

    sendAction({
      type: 'summon',
      payload: {
        characterId: selectedSummon.value.characterId,
        position: { x: cell.x, y: cell.y }
      }
    });
    selectedSummon.value = null;
  };

  const useSkill = (cell: GameMapCell) => {
    if (!isMyTurn.value) return;
    if (!canCastAt(cell)) {
      selectedSkill.value = null;
    }
    if (!selectedSkill.value) return;

    sendAction({
      type: 'use_skill',
      payload: {
        skillId: selectedSkill.value.id,
        target: { x: cell.x, y: cell.y }
      }
    });
    selectedSkill.value = null;
  };

  const endTurn = () => {
    if (!isMyTurn.value) return;
    sendAction({
      type: 'end_turn',
      payload: {}
    });
  };

  const atbTimeline = computed(() => {
    const timelineState = fromSerializedState(serializeGameState(state.value));

    const timelineReducer = createReducer({ transient: false });
    const timeline = [getActiveEntity(timelineState)];
    for (let i = 0; i < 10; i++) {
      timelineReducer(timelineState, endTurnEvent.create(timelineState.activeEntityId));
      timeline.push(getActiveEntity(timelineState));
    }
    return timeline;
  });

  const targetMode = ref(null);
  const hoveredCell = ref(null);
  const api: Game = {
    state,
    game,
    pathfinder,
    me,
    isMyTurn,
    sendAction,
    activeEntity,
    selectedEntity,
    move,
    summon,
    useSkill,
    endTurn,
    atbTimeline,
    targetMode,
    hoveredCell,
    canSummonAt,
    canCastAt,
    canCast,
    canMoveTo,
    isInCastRange,
    surrender() {
      return onSurrender();
    },
    selectedSummon: computed({
      get() {
        return selectedSummon.value;
      },
      set(val) {
        if (!val) return;
        selectSummon(val);
      }
    }),
    selectedSkill: computed({
      get() {
        return selectedSkill.value;
      },
      set(val) {
        if (!val) return;
        selectSkill(val);
      }
    })
  };

  provide(GAME_INJECTION_KEY, api);

  return api;
};

export const useGame = () => useSafeInject(GAME_INJECTION_KEY);
