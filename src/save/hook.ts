import type { SaveManager } from './SaveManager';

/** `save.*`（M2 §6.1、VOX-F）。`?nosave=1` のときは now が何もしない。now は 書き終わると解決する Promise */
export function createSaveHook(save: SaveManager) {
  return {
    now: (): Promise<void> => save.now(),
    info: () => save.info(),
    clear: (): Promise<void> => save.clear(),
  };
}
