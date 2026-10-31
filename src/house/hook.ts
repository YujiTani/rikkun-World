import type { ItemId } from '../contracts';
import { LIGHT_DEFAULT, type Rot, type Size, type Step, type WindowKind, type RoofKind } from './editor/tuning';
import { windowCells, type WindowCell } from './editor/model';
import type { Confirm } from './editor/controller';
import type { ArchitectInfo } from './manager';
import type { HouseSystem } from './system';
import type { HouseMenuState } from './talk';

/**
 * 窓口 `window.__rikkun.house`（HOUSE-1A・1B。仕様 docs/design/HOUSE-1.md §6.1。テスト用）。
 *   architects()    読みこまれて いる 建築士さん { id, x, y, z, first, busy }（x・y・z は 足もと）
 *   talk(id)        右クリックで 話すのと 同じ
 *   menu()          { open, page: 'top' | 'kura' | 'editor' | 'need' | null, bubble, buttons: { id, enabled }[] }
 *   press(id, arg?) メニュー・エディターの ボタンを 押す（close は どの ページでも 全部 とじる）
 *   kura()          くらの 中身 { アイテムid: 数 }（1 こ以上 ある 種類だけ）
 *   deposit(item, n) / withdraw(item, n)   くらへ あずける / とりだす。動いた 数を 返す。メニューが とじて いても 動く
 *   editor()        エディターの 今の 形（開いて いない とき null）
 *   edit(op)        エディターを 窓口から 動かす（できたら true。開いて いない とき false）
 *   need(source?)   ひつような もの { item, need, have, short, bonus }[]
 *   blueprints()    持ち物の せっけいず { slot, number, name, w, d, windows, windowKind, roof, furniture, light }[]
 */
interface EditorPreviewInfo {
  mode: 'outside' | 'inside';
  roof: boolean;
  angle: number;
  pitch: number;
  touched: boolean;
  builds: number;
  /** 窓・戸の 光り（PR-2。いまは いつも null） */
  glow: null;
}

interface EditorInfo {
  step: Step;
  size: { w: Size; d: Size };
  windows: number;
  windowMax: number;
  windowKind: WindowKind;
  roof: RoofKind;
  windowCells: WindowCell[];
  furniture: Array<{ kind: string; x: number; z: number; rot: Rot }>;
  selected: { x: number; z: number } | null;
  light: string;
  name: { front: string; back: string };
  canUndo: boolean;
  canRedo: boolean;
  confirm: Confirm;
  preview: EditorPreviewInfo | null;
}

export interface HouseHook {
  architects(): ArchitectInfo[];
  talk(id: string | number): void;
  menu(): HouseMenuState;
  press(id: string, arg?: unknown): void;
  kura(): Record<string, number>;
  deposit(item: string, n: number): number;
  withdraw(item: string, n: number): number;
  editor(): EditorInfo | null;
  edit(op: unknown): boolean;
  need(source?: number): ReturnType<HouseSystem['need']>;
  blueprints(): ReturnType<HouseSystem['blueprints']>;
}

type HookSystem = Pick<HouseSystem, 'architects' | 'talkTo' | 'menu' | 'press' | 'deposit' | 'withdraw' | 'state' | 'editor' | 'editing' | 'edit' | 'need' | 'blueprints' | 'previewProbe'>;

export function createHouseHook(sys: HookSystem): HouseHook {
  const editor = (): EditorInfo | null => {
    if (!sys.editing()) return null;
    const c = sys.editor;
    const s = c.s;
    const sel = c.selected();
    const mode = s.step === 'naka' ? 'inside' : 'outside';
    const v = s.step === 'namae' ? null : sys.previewProbe(mode);
    return {
      step: s.step,
      size: { w: s.w, d: s.d },
      windows: s.windows,
      windowMax: c.windowMax(),
      windowKind: s.windowKind,
      roof: s.roof,
      windowCells: windowCells(s),
      furniture: s.furniture.map((p) => ({ kind: p.kind, x: p.x, z: p.z, rot: p.rot })),
      selected: sel ? { x: sel.x, z: sel.z } : null,
      light: LIGHT_DEFAULT,
      name: { front: s.name.front, back: s.name.back },
      canUndo: c.canUndo(),
      canRedo: c.canRedo(),
      confirm: c.confirm,
      preview: v ? { mode, roof: mode === 'outside', angle: v.yaw, pitch: v.elev, touched: v.touched, builds: v.builds, glow: null } : null,
    };
  };
  return {
    architects: () => sys.architects(),
    talk: (id) => void sys.talkTo(String(id)),
    menu: () => sys.menu(),
    press: (id, arg) => sys.press(id, arg),
    kura: () => sys.state.kura.totals(),
    deposit: (item, n) => sys.deposit(item as ItemId, n),
    withdraw: (item, n) => sys.withdraw(item as ItemId, n),
    editor,
    edit: (op) => sys.edit(op),
    need: (source) => sys.need(source),
    blueprints: () => sys.blueprints(),
  };
}
