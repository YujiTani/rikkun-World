import type { DigSystemImpl } from './DigSystem';

/** `window.__rikkun.target` と `window.__rikkun.dig`（M2 §6.1）を返す */
export function createDigHook(dig: DigSystemImpl) {
  return {
    target: {
      get: () => {
        const t = dig.target();
        return t
          ? { block: { ...t.block }, id: t.id, face: { ...t.face }, place: { ...t.place }, distance: t.distance }
          : null;
      },
    },
    dig: {
      get: () => dig.state(),
      /** 前に呼んでから起きた出来事（呼ぶと空になる。画面側の列とは別） */
      events: () => dig.takeHookEvents(),
    },
  };
}
