import type { SaveManager } from './SaveManager';

/** `save.*`（M2 §6.1、VOX-F）。`?nosave=1` のときは now が何もしない。now は 書き終わると解決する Promise */
export function createSaveHook(save: SaveManager, hasChunk: (cx: number, cz: number) => boolean = () => false) {
  return {
    now: (): Promise<void> => save.now(),
    info: () => save.info(),
    clear: (): Promise<void> => save.clear(),
    /** VOX-D: その列が 保存のキーの一覧にあるか */
    hasChunk: (cx: number, cz: number): boolean => hasChunk(cx, cz),
  };
}
