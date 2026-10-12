import type { YokaiKind } from '../contracts';
import type { PlayerCombatImpl } from './PlayerCombat';

/** `window.__rikkun.combat`（M3 §6.1）の中身を返す */
export function createCombatHook(combat: PlayerCombatImpl) {
  return {
    get: () => combat.hookState(),
    setHp: (n: number) => combat.setHp(n),
    /** 妖怪の攻撃として受ける（防具を通る。M4 §6.1）。by を省くと からかさ */
    damage: (n: number, by: YokaiKind = 'karakasa') => {
      combat.debugDamage(n, by);
    },
    /** 前に呼んでから起きた出来事（呼ぶと空になる。画面側の列とは別） */
    events: () => combat.takeHookEvents(),
    bags: () => combat.bags(),
  };
}
