<script setup lang="ts">
import { api } from '../../api';

const { game, state } = useGame();

const players = computed(() =>
  game.value.players.map(player => ({
    ...player,
    general: state.value.entities.find(
      e => e.kind === 'general' && e.owner === player.userId
    )
  }))
);
</script>

<template>
  <div class="player player-1">
    <img :src="players[0].general?.blueprint.iconUrl" class="fancy-surface" />
    <div>
      <div class="player-name">{{ players[0].user.name }}</div>

      <div class="hp">
        <div class="i-game-icons:health-normal" />
        {{ players[0].general?.hp.toFixed() }}
      </div>
    </div>
  </div>

  <div class="player player-2">
    <img :src="players[1].general?.blueprint.iconUrl" class="fancy-surface" />
    <div>
      <div class="player-name">{{ players[1].user.name }}</div>

      <div class="hp">
        <div class="i-game-icons:health-normal" />
        {{ players[1].general?.hp.toFixed() }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="postcss">
.player {
  display: flex;
  gap: var(--size-3);
  padding: var(--size-3);
  text-shadow: black 1px 0 5px;
  img {
    margin-inline: auto;
    padding: var(--size-1);
    border-width: 3px;
    border-radius: var(--radius-round);
  }
  [class^='i'] {
    font-size: var(--font-size-4);
    color: var(--green-4);
  }
}
.player-1 {
  position: absolute;
  top: var(--size-3);
  left: var(--size-5);
}
.player-2 {
  position: absolute;
  top: var(--size-3);
  right: var(--size-5);

  flex-direction: row-reverse;

  text-align: right;

  .hp {
    flex-direction: row-reverse;
  }
}

.player-name {
  font-size: var(--font-size-4);
  font-weight: var(--font-weight-6);
}

.hp {
  display: flex;
  gap: var(--size-1);
  align-items: center;
  font-size: var(--font-size-2);
}
</style>
