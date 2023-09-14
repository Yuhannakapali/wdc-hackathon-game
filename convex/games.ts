import { internalMutation, mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { findMe } from './users/user.utils';
import { createUserability } from './users/user.ability';
import { ensureAuthorized } from './utils/ability';
import { GAME_STATES, type GameAction } from './games/game.entity';
import { subject } from '@casl/ability';
import { internal } from './_generated/api';
import { JOIN_CONFIRMATION_TIMEOUT } from './games/game.utils';
import { createGameState } from '../src/game-logic/index';
import type { GameEvent as GameLogicEvent } from '../src/game-logic/events/reducer';
import { createMoveAction } from '../src/game-logic/actions/move';
import { createSummonAction } from '../src/game-logic/actions/summon';
import { createSkillAction } from '../src/game-logic/actions/skill';
import { createEndTurnAction } from '../src/game-logic/actions/endTurn';
import { exhaustiveSwitch } from '../src/utils/assertions';
import { stringify, parse } from 'zipson';

// Create a new task with the given text
export const create = mutation({
  args: {
    generalId: v.string()
  },
  handler: async ({ auth, db }, { generalId }) => {
    const user = await findMe({ auth, db });
    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('create', 'game'));

    const gameId = await db.insert('games', {
      creator: user!._id,
      state: GAME_STATES.WAITING_FOR_OPPONENT
    });

    await db.insert('gamePlayers', {
      generalId,
      gameId,
      userId: user!._id,
      atbSeed: Math.random()
    });

    return gameId;
  }
});

export const cancel = mutation({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ auth, db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) throw new Error('Game not found');

    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('cancel', subject('game', game)));

    const gamePlayers = await db
      .query('gamePlayers')
      .withIndex('by_game_id', q => q.eq('gameId', game._id))
      .collect();

    await Promise.allSettled([
      ...gamePlayers.map(gp => db.delete(gp._id)),
      db.delete(game._id)
    ]);
  }
});

export const join = mutation({
  args: {
    gameId: v.id('games'),
    generalId: v.string()
  },
  handler: async ({ auth, db, scheduler }, { gameId, generalId }) => {
    const user = await findMe({ auth, db });
    const game = await db.get(gameId);
    if (!game) throw new Error('Game not found');

    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('join', subject('game', game)));

    await db.insert('gamePlayers', {
      gameId,
      generalId,
      userId: user!._id,
      atbSeed: Math.random()
    });

    await db.patch(game._id, {
      state: GAME_STATES.WAITING_FOR_CREATOR_CONFIRMATION
    });

    await scheduler.runAfter(JOIN_CONFIRMATION_TIMEOUT, internal.games.decline, {
      gameId: game._id
    });

    return game._id;
  }
});

export const decline = internalMutation({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ db, scheduler }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) return;

    if (game.state === GAME_STATES.WAITING_FOR_CREATOR_CONFIRMATION) {
      await db.patch(game._id, {
        state: GAME_STATES.DECLINED_BY_CREATOR
      });

      await scheduler.runAfter(5000, internal.games.internalCancel, {
        gameId: game._id
      });
    }
  }
});

export const internalCancel = internalMutation({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) return;

    const gamePlayers = await db
      .query('gamePlayers')
      .withIndex('by_game_id', q => q.eq('gameId', game._id))
      .collect();

    await Promise.allSettled([
      ...gamePlayers.map(gp => db.delete(gp._id)),
      db.delete(game._id)
    ]);
  }
});

export const confirm = mutation({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ auth, db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) throw new Error('Game not found');

    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('confirm', subject('game', game)));

    await db.patch(game._id, {
      state: GAME_STATES.ONGOING
    });
  }
});

export const actOn = mutation({
  args: {
    gameId: v.id('games'),
    action: v.object({
      type: v.string(),
      payload: v.any()
    })
  },
  handler: async ({ auth, db }, { gameId, action }) => {
    const me = await findMe({ auth, db });
    const game = await db.get(gameId);
    if (!game) throw new Error('Game not found');

    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('act_on', subject('game', game)));

    // get game infos from DB
    const gamePlayers = await db
      .query('gamePlayers')
      .withIndex('by_game_id', q => q.eq('gameId', gameId))
      .collect();

    const gameEvents: GameLogicEvent[] = game.history ? parse(game.history) : [];

    // replay game event to get to current state
    const state = createGameState({
      players: [
        {
          id: gamePlayers[0].userId,
          characterId: gamePlayers[0].generalId,
          atbSeed: gamePlayers[0].atbSeed
        },
        {
          id: gamePlayers[1].userId,
          characterId: gamePlayers[1].generalId,
          atbSeed: gamePlayers[1].atbSeed
        }
      ],
      history: gameEvents
    });

    // Execute the new action
    const type = action.type as GameAction;
    switch (type) {
      case 'move':
        createMoveAction({ ...action.payload, playerId: me!._id })(state);
        break;
      case 'summon':
        createSummonAction({ ...action.payload, playerId: me!._id })(state);
        break;
      case 'use_skill':
        createSkillAction({ ...action.payload, playerId: me!._id })(state);
        break;
      case 'end_turn':
        createEndTurnAction({ ...action.payload, playerId: me!._id })(state);
        break;
      default:
        exhaustiveSwitch(type);
        throw new Error(`Unknown action type: ${type}`);
    }

    // collect the new events to save to the database
    await db.patch(game._id, {
      history: stringify(state.history)
    });

    // const diff = state.history.length - gameEvents.length;
    // if (diff <= 0) return;
    // const newEvents = state.history.slice(-1 * diff);

    // await Promise.all(
    //   newEvents.map(event =>
    //     db.insert('gameEvents', {
    //       gameId,
    //       type: event.type,
    //       payload: event.payload
    //     })
    //   )
    // );

    if (state.lifecycleState === 'FINISHED') {
      await db.patch(game._id, {
        state: GAME_STATES.ENDED
      });
    }
  }
});

export const surrender = mutation({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ auth, db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) throw new Error('Game not found');

    const userAbility = await createUserability({ auth, db });
    await ensureAuthorized(userAbility.can('surrender', subject('game', game)));

    await db.patch(game._id, {
      state: GAME_STATES.ENDED
    });
  }
});

export const getById = query({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) return null;

    const players = await db
      .query('gamePlayers')
      .withIndex('by_game_id', q => q.eq('gameId', gameId))
      .collect();

    const playersWithUser = await Promise.all(
      players.map(async player => {
        const user = await db.get(player.userId);
        return Object.assign({}, player, { user });
      })
    );

    return {
      ...game,
      creator: await db.get(game.creator),
      // events: await db
      //   .query('gameEvents')
      //   .withIndex('by_game_id', q => q.eq('gameId', gameId))
      //   .collect(),
      players: playersWithUser
    };
  }
});

export const getList = query({
  args: {},
  handler: async ({ db }) => {
    const games = await db
      .query('games')
      .filter(q => q.neq(q.field('state'), GAME_STATES.ENDED))
      .collect();
    return Promise.all(
      games.map(async game => ({
        ...game,
        creator: await db.get(game.creator)
      }))
    );
  }
});

export const currentGame = query({
  args: {},
  handler: async ({ auth, db }) => {
    const identity = await auth.getUserIdentity();
    if (!identity) return null;
    const me = await findMe({ auth, db });
    if (!me) return null;

    const gamePlayers = await db
      .query('gamePlayers')
      .withIndex('by_user_id', q => q.eq('userId', me?._id))
      .collect();

    const games = await Promise.all(gamePlayers.map(gp => db.get(gp.gameId)));

    return games.find(game => game?.state !== 'ENDED') ?? null;
  }
});

export const getGameMessages = query({
  args: {
    gameId: v.id('games')
  },
  handler: async ({ db }, { gameId }) => {
    const game = await db.get(gameId);
    if (!game) return null;

    const players = await db
      .query('gamePlayers')
      .withIndex('by_game_id', q => q.eq('gameId', gameId))
      .collect();

    const users = await Promise.all(
      players.map(async player => {
        return db.get(player.userId);
      })
    );

    const messages = await db
      .query('gameMessages')
      .withIndex('by_game_id', q => q.eq('gameId', gameId))
      .collect();

    return messages.map(m => ({
      ...m,
      user: users.find(u => u?._id === m.userId)!
    }));
  }
});

export const postMessageToGame = mutation({
  args: {
    gameId: v.id('games'),
    text: v.string()
  },
  handler: async ({ db, auth }, { gameId, text }) => {
    const identity = await auth.getUserIdentity();
    if (!identity) return null;
    const me = await findMe({ auth, db });
    if (!me) return null;

    return db.insert('gameMessages', { gameId, text, userId: me._id });
  }
});

export const clearAllGames = internalMutation({
  args: {},
  handler: async ({ db }) => {
    const games = await db.query('games').collect();
    const players = await db.query('gamePlayers').collect();
    await Promise.all([
      ...players.map(p => db.delete(p._id)),
      ...games.map(g => db.delete(g._id))
    ]);
  }
});
