import type { ComputedRef } from 'vue';
import { fromSerializedState, serializeGameState } from '../../sdk';
import { createReducer, type GameEvent } from '../../sdk/events/reducer';
import type { SoldierData } from '../../sdk/soldiers';
import type { Nullable } from '../../utils/types';
import type { Entity } from '../../sdk/entity';
import { getActiveEntity } from '../../sdk/utils/entity.helpers';
import { createPathFinder } from '../../sdk/utils/pathfinding.helpers';
import { endTurnEvent } from '../../sdk/events/endTurn.event';
import { type FXSequenceContext } from './useFXSequencer';
import type { ActionDispatcher, Game, GameDetail } from './useGame';
import type { SkillData } from '../../sdk/utils/entityData';

const noop = () => {
  return;
};

const waitFor = (duration: number) =>
  new Promise<void>(resolve => {
    setTimeout(() => {
      resolve();
    }, duration);
  });

export const useReplayProvider = (
  game: ComputedRef<GameDetail>,
  sendAction: ActionDispatcher,
  sequencer: FXSequenceContext,
  replayStep: Ref<number>,
  isPlaying: Ref<boolean>
) => {
  const state = ref(fromSerializedState(game.value.serializedState));
  const gameEvents = computed(() => game.value.latestEvents.slice(0, replayStep.value));

  watch(
    () => gameEvents.value.length,
    (newLength, oldLength) => {
      const newEvents = gameEvents.value.slice(
        -1 * (newLength - oldLength)
      ) as GameEvent[];
      const sequence = sequencer.buildSequence(newEvents);

      sequence.play(state, async event => {
        state.value.reducer(state.value, event);
        if (isPlaying.value) {
          await waitFor(800);
          replayStep.value++;
        }
      });
    }
  );

  const activeEntity = computed(() => getActiveEntity(state.value));

  const selectedSummon = ref<Nullable<SoldierData>>();
  const selectedSkill = ref<Nullable<SkillData>>();
  const selectedEntity = ref<Nullable<Entity>>(null);
  const isMyTurn = computed(() => false);

  const pathfinder = computed(() =>
    createPathFinder(state.value, state.value.activeEntityId)
  );

  const isInCastRange = () => false;
  const canSummonAt = () => false;
  const canCastAt = () => false;
  const canCast = () => false;
  const canMoveTo = () => false;
  const move = noop;
  const summon = noop;
  const useSkill = noop;
  const endTurn = noop;

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
    me: null,
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
    canMoveTo,
    canCastAt,
    canCast,
    isInCastRange,
    surrender() {
      return null;
    },
    selectedSummon: computed({
      get() {
        return selectedSummon.value;
      },
      set() {
        return;
      }
    }),
    selectedSkill: computed({
      get() {
        return selectedSkill.value;
      },
      set() {
        return;
      }
    })
  };

  provide(GAME_INJECTION_KEY, api);

  return api;
};
