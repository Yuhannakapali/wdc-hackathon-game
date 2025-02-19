<script setup lang="ts">
import type { Entity } from '../../sdk/entity';

const { entity } = defineProps<{
  entity: Entity;
}>();
</script>

<template>
  <article class="entity-card fancy-surface">
    <img :src="entity.blueprint.iconUrl" class="mx-auto fancy-surface" />
    <div class="text-center">{{ entity.blueprint.name }}</div>

    <div class="stats">
      <div>
        <div class="i-game-icons:health-normal" style="--color: var(--hp)" />
        {{ entity.hp }} / {{ entity.blueprint.maxHp }}
      </div>

      <div>
        <div class="i-game-icons-drop" style="--color: var(--ap)" />
        {{ entity.ap }} / {{ entity.blueprint.maxAp }}
      </div>

      <div>
        <div class="i-game-icons-broadsword" style="--color: var(--attack)" />
        <span
          :class="{
            'is-buffed': entity.attack > entity.blueprint.attack,
            'is-debuffed': entity.attack < entity.blueprint.attack
          }"
        >
          {{ entity.attack }}
        </span>
      </div>

      <div>
        <div class="i-game-icons-rosa-shield" style="--color: var(--defense)" />
        <span
          :class="{
            'is-buffed': entity.attack > entity.blueprint.attack,
            'is-debuffed': entity.attack < entity.blueprint.attack
          }"
        >
          {{ entity.defense }}
        </span>
      </div>

      <div>
        <div class="i-ri-hourglass-fill" />
        <span
          :class="{
            'is-buffed': entity.initiative > entity.blueprint.initiative,
            'is-debuffed': entity.initiative < entity.blueprint.initiative
          }"
        >
          {{ entity.initiative }}
        </span>
      </div>
    </div>

    <div v-for="skill in entity.blueprint.skills" :key="skill.id" class="skill">
      <div :data-cost="skill.cost">
        <img :src="skill.iconUrl" />
      </div>
      <div>{{ skill.name }}</div>
      <p>{{ skill.description }}</p>
    </div>

    <div
      v-for="trigger in entity.triggers"
      :key="trigger.id"
      class="flex gap-2 items-center text-0"
    >
      <div class="i-game-icons-time-trap" />
      {{ trigger.name }}
    </div>

    <div
      v-for="aura in entity.blueprint.auras"
      :key="aura.id"
      class="flex gap-2 items-center text-0"
    >
      <div class="i-game-icons-beams-aura" />
      {{ aura.name }}
    </div>
  </article>
</template>

<style scoped lang="postcss">
.entity-card {
  --hp: var(--green-5);
  --ap: var(--indigo-8);
  --attack: var(--red-7);
  --defense: var(--cyan-5);

  width: var(--size-13);
  padding: 0 var(--size-4) var(--size-4);
  font-size: var(--font-size-2);
  backdrop-filter: blur(5px);

  > img {
    transform: translateY(-25%);
    padding: var(--size-1);
    border-radius: var(--radius-round);
    & + * {
      margin-top: calc(-1 * var(--size-3));
    }
  }
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--size-1);
  column-gap: var(--size-3);

  > * {
    display: flex;
    gap: var(--size-1);
    align-items: center;

    > * {
      color: var(--color, inherit);
    }
  }
}
.is-buffed {
  color: var(--green-6);
}
.is-debuffed {
  color: var(--red-6);
}

.skill {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  row-gap: var(--size-1);
  column-gap: var(--size-3);

  margin-top: var(--size-2);
  margin-bottom: var(--size-4);

  font-size: var(--font-size-1);
  line-height: 1;

  :has(img) {
    grid-row: 1 / span 2;
    aspect-ratio: 1;
    width: var(--size-8);
    border: var(--border);
  }

  p {
    grid-column: 2;
    font-size: var(--font-size-00);
    opacity: 0.8;
  }

  [data-cost] {
    position: relative;
    &::after {
      content: attr(data-cost);

      position: absolute;
      right: 0;
      bottom: 0;
      transform: translate(50%, 50%);

      display: grid;
      place-content: center;

      aspect-ratio: 1;
      width: 3ch;

      font-size: var(--font-size-00);

      background: var(--fancy-bg);
      background-blend-mode: overlay;
      border: var(--fancy-border);
      border-radius: var(--radius-round);
    }
  }
}
</style>
