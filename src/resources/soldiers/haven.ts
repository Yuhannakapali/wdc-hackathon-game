import type { SoldierData } from '.';
import { FACTIONS_IDS } from '../enums';
import {} from '../factions';
import { skills } from '../skills';

export const havenSoldiers: SoldierData[] = [
  {
    characterId: 'swordsman',
    factionId: FACTIONS_IDS.HAVEN,
    name: 'Swordsman',
    cost: 2,
    initiative: 5,
    maxHp: 12,
    attack: 2,
    defense: 2,
    skills: [skills.meleeAttack]
  }
];
