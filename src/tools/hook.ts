import type { ToolSystemImpl } from './ToolSystem';

const v3 = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y, z: p.z });

/**
 * `window.__rikkun.tool`（M4 §6.1）・`bow`（WEAPON-2 §6.1）と、`combat` に足す口の中身。
 * つなぎ込み: `combat.arrows` = `arrows`、`combat.events()` に `arrowEvents()` を足す、`bow` = `bow`。
 */
export function createToolHook(tool: ToolSystemImpl) {
  return {
    tool: {
      get: () => ({ ...tool.current() }),
    },
    bow: {
      state: () => tool.bow().state(),
      /** まだ 読まれていない 出来事（読んでも 空に ならない） */
      events: () => tool.bow().peekEvents().map((e) => ({ ...e })),
      arrows: () =>
        tool.bow().arrows().map((a) => ({ id: a.id, position: v3(a.position), velocity: v3(a.velocity), age: a.age })),
      stuck: () => tool.bow().stuck().map((a) => ({ id: a.id, position: v3(a.position), age: a.age, dir: v3(a.dir) })),
    },
    arrows: () => tool.arrows(),
    /** 前に呼んでから起きた や の出来事（呼ぶと空） */
    arrowEvents: () => tool.takeHookEvents(),
  };
}
