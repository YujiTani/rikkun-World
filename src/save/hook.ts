import type { SaveManager } from './SaveManager';

/** `save.*`（M2 §6.1）。`?nosave=1` のときは now が何もしない */
export function createSaveHook(save: SaveManager) {
  return {
    now: () => save.now(),
    info: () => save.info(),
    clear: () => save.clear(),
  };
}
