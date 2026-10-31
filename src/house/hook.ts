import type { ItemId, Vec3 } from '../contracts';
import type { HouseView } from './book';
import type { CellInfo } from './cell';
import { LIGHT_DEFAULT, type Rot, type Size, type Step, type WindowKind, type RoofKind } from './editor/tuning';
import { windowCells, type WindowCell } from './editor/model';
import type { Confirm } from './editor/controller';
import type { ArchitectInfo } from './manager';
import type { GlowInfo } from './preview/glow';
import { previewModeOf } from './preview/port';
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
 *   previewDrag(dx, dy) / previewWheel(dx, dy)   見本の 上で ドラッグ／wheel した のと 同じ。今の { angle, pitch }（見本が 出て いなければ null）
 *   hover(id | null)    まどの ボタンに マウスを のせた／はなした のと 同じ（光るのは windowsDown・windowsUp・windowKind）
 * 1C PR-1（#340）:
 *   buildNow(number, at)  せっけいずから 家を その場に 建てる（at ＝ 外の 箱の 北西の すみの 床の 高さ）。知らない 番号は null
 *   houses()        戸で おぼえた 記録 { id, name, number, outer, door, doorOpen }[]
 *   blockAt(x, y, z) { id, item, dir }（ほると 手に 入る アイテム・家具の 向き）
 *   renaming()      名前の 画面で 作って いる { id, name }（ほかの ページでは null）
 */
interface EditorPreviewInfo {
  mode: 'outside' | 'inside';
  roof: boolean;
  angle: number;
  pitch: number;
  touched: boolean;
  /** さわった あと また 回り出す までの のこりの コマ（はなすと 600、1 コマごとに 1 へり、0 で null。さわる 前・回って いる 間・動きを へらす 設定は null） */
  wait: number | null;
  builds: number;
  /** 光って いる 物（光って いなければ null）。cells ＝ 光る 窓と なくなった 窓の あとの マス、left ＝ のこりの コマ（hover の 間は null） */
  glow: GlowInfo | null;
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
  previewDrag(dx: number, dy: number): { angle: number; pitch: number } | null;
  previewWheel(dx: number, dy: number): { angle: number; pitch: number } | null;
  hover(id: string | null): void;
  buildNow(number: number, at: Vec3): HouseView | null;
  houses(): HouseView[];
  blockAt(x: number, y: number, z: number): CellInfo;
  renaming(): ReturnType<HouseSystem['renaming']>;
}

type HookSystem = Pick<HouseSystem, 'architects' | 'talkTo' | 'menu' | 'press' | 'deposit' | 'withdraw' | 'state' | 'editor' | 'editing' | 'edit' | 'need' | 'blueprints' | 'preview' | 'previewDrag' | 'previewWheel' | 'hover' | 'buildNow' | 'houses' | 'blockAt' | 'renaming'>;

export function createHouseHook(sys: HookSystem): HouseHook {
  const editor = (): EditorInfo | null => {
    if (!sys.editing()) return null;
    const c = sys.editor;
    const s = c.s;
    const sel = c.selected();
    const mode = previewModeOf(s.step);
    const v = mode === null ? null : sys.preview.info(mode);
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
      preview: mode !== null && v ? { mode, roof: mode === 'outside', angle: v.yaw, pitch: v.elev, touched: v.touched, wait: v.wait, builds: v.builds, glow: v.glow } : null,
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
    previewDrag: (dx, dy) => sys.previewDrag(dx, dy),
    previewWheel: (dx, dy) => sys.previewWheel(dx, dy),
    hover: (id) => sys.hover(id),
    buildNow: (number, at) => sys.buildNow(number, at),
    houses: () => sys.houses(),
    blockAt: (x, y, z) => sys.blockAt(x, y, z),
    renaming: () => sys.renaming(),
  };
}
