import { AnimatedSprite } from 'pixi.js';
import { defineEvent } from '.';
import type { EntityId } from '../entity';
import { getEntityById } from '../utils/entity.helpers';
import { createSpritesheetFrameObject } from '../../utils/sprite-utils';

export const HEAL = 'heal';

export type HealEvent = {
  type: typeof HEAL;
  payload: {
    sourceId: EntityId;
    targetId: EntityId;
    amount: number;
  };
};

export const healEvent = defineEvent({
  create: (sourceId: EntityId, targetId: EntityId, amount: number): HealEvent => ({
    type: HEAL,
    payload: { sourceId, targetId, amount }
  }),
  execute: (state, { targetId, amount }) => {
    const entity = getEntityById(state, targetId);
    if (!entity) return state;

    entity.hp = Math.min(entity.blueprint.maxHp, entity.hp + amount);

    return state;
  },
  sequence: (state, { payload }, { assets, fxContainer, sprites }) =>
    new Promise(resolve => {
      const targetSprite = sprites.resolve(payload.targetId);

      const sheet = assets.resolveFx('heal01');
      const blood = new AnimatedSprite(createSpritesheetFrameObject('idle', sheet));
      blood.position.set(0, 0);
      blood.loop = false;

      blood.onComplete = () => {
        blood.destroy();
      };
      blood.anchor.set(0.5);

      targetSprite?.addChild(blood);
      blood.play();
      resolve();
    })
});
