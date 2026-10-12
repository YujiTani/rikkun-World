import type { PlayerCombatImpl } from './PlayerCombat';

/** `window.__rikkun.combat`（M3 §6.1）の中身を返す */
export function createCombatHook(combat: PlayerCombatImpl) {
  return {
    get: () => combat.hookState(),
    setHp: (n: number) => combat.setHp(n),
    damage: (n: number) => {
      combat.debugDamage(n);
    },
    /** 前に呼んでから起きた出来事（呼ぶと空になる。画面側の列とは別） */
    events: () => combat.takeHookEvents(),
    bags: () => combat.bags(),
  };
}
