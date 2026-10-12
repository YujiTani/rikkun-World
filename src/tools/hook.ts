import type { ToolSystemImpl } from './ToolSystem';

/**
 * `window.__rikkun.tool`（M4 §6.1）と、`combat` に足す口の中身。
 * つなぎ込み: `combat.arrows` = `arrows`、`combat.events()` に `arrowEvents()` を足す。
 */
export function createToolHook(tool: ToolSystemImpl) {
  return {
    tool: {
      get: () => ({ ...tool.current() }),
    },
    arrows: () => tool.arrows(),
    /** 前に呼んでから起きた や の出来事（呼ぶと空） */
    arrowEvents: () => tool.takeHookEvents(),
  };
}
