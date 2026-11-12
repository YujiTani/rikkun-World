import type { Vec3 } from '../contracts';
import type { HouseView } from './book';
import type { CellInfo } from './cell';
import type { DecoKind, DoorKind, LightKind, RoofKind, Rot, Size, Step, WallKind, WindowKind } from './editor/tuning';
import type { Part } from './recipes/kinds';
import { furnitureProblems, originOf, windowCells, type PlaceProblem, type WindowCell } from './editor/model';
import type { Confirm, Flash } from './editor/controller';
import type { ArchitectInfo } from './manager';
import type { GlowInfo } from './preview/glow';
import { previewModeOf } from './preview/port';
import type { SeatInfo } from './seat';
import type { Who } from './whoPort';
import type { HouseSystem } from './system';
import type { HouseMenuState } from './talk';

/**
 * 窓口 `window.__rikkun.house`（HOUSE-1A・1B。仕様 docs/design/HOUSE-1.md §6.1。テスト用）。
 *   architects()    読みこまれて いる 建築士さん { id, x, y, z, first, busy }（x・y・z は 足もと）
 *   talk(id)        右クリックで 話すのと 同じ
 *   menu()          { open, page: 'top' | 'editor' | 'need' | null, bubble, buttons: { id, enabled }[] }
 *   press(id, arg?) メニュー・エディターの ボタンを 押す（close は どの ページでも 全部 とじる）
 *   legacyKura()    前の セーブ〔1D まで〕の くらの 物の うち まだ かえして いない 分 { アイテムid: 数 }（なければ null。1E: くらは ない）
 *   editor()        エディターの 今の 形（開いて いない とき null）
 *   edit(op)        エディターを 窓口から 動かす（できたら true。開いて いない とき false）
 *   need(source?)   ひつような もの { item, need, have, short, bonus }[]（have ＝ もちもの ＋ 近くの たんす。1E）
 *   blueprints()    持ち物の せっけいず { slot, number, name, w, d, windows, windowKind, roof, furniture, light }[]
 *   previewDrag(dx, dy) / previewWheel(dx, dy)   見本の 上で ドラッグ／wheel した のと 同じ。今の { angle, pitch }（見本が 出て いなければ null）
 *   hover(id | null)    ボタンに マウスを のせた／はなした のと 同じ（光るのは windowsDown・windowsUp・windowKind と、ポップアップの しゅるいの ボタン〔その ばしょ〕。ばしょ・しゅるいの ボタンは 12 コマで ヘルプ）
 * 2A（#364）:
 *   recipes()       { learned, fresh, all, nextPick }（おぼえた 順の レシピの id・「あたらしい！」が のこる レシピ・表の ぜんぶ・今 使ったら おぼえる 物〔ぜんぶ おぼえて いれば null〕）
 *   recipeKinds(id) そのレシピで 出る ボタンの id の 列（例 roof_kawara → roof-kawara_mura・roof-kawara_shiro・roof-kawara_kozan）
 *   learn(id)       レシピを おぼえる（テスト用の 近道。まだの 物だけ true。テロップ・音つき。ゲームの 中の 道は read だけ）
 *   found(at, who?) 手に 入れた（宝箱の わく・まきもの。3.3 版）: who の 持ち物に まきもの 1 まい（入らなければ 足もとへ）。おぼえない。はじめてなら 使い方の テロップ
 *   read(who?)      手に もって 右クリック 1 回の 本体: who の まきものを 1 まい へらして 1 つ おぼえる（持って いなければ false）。ぜんぶ おぼえた あとは かみ 3 まい
 *   recipeBand()    おぼえた テロップ { text, ticksLeft }（なければ null）
 *   editor() の 2A: popup・popupRows・hoverTip・marks・roof・wall・windowKind・door・deco・light
 * 1D（#341）:
 *   seat()          座って いる／おふろに 入って いる あいだだけ { kind: 'sit' | 'bath', block, position }。立つと null
 * 1C PR-1（#340）:
 *   buildNow(number, at)  せっけいずから 家を その場に 建てる（at ＝ 外の 箱の 北西の すみの 床の 高さ）。知らない 番号は null
 *   houses()        戸で おぼえた 記録 { id, name, number, outer, door, doorOpen }[]
 *   blockAt(x, y, z) { id, item, dir }（ほると 手に 入る アイテム・家具の 向き）
 *   renaming()      名前の 画面で 作って いる { id, name }（ほかの ページでは null）
 * 1C PR-2（#340）:
 *   level()         みずもり { base: {x,y,z} | null, cells: {x,z,state:'high'|'low'|'ok'}[] }（持って いて base から 16 マス 以内の 間だけ cells）
 *   sites()         上空の 視点の 間の 置ける 場所 {x,y,z}[]（外の 箱の 北西の すみ・床の 段）。ほかの 間は []
 *   cursor()        上空の 視点の わく { x, z, ok, confirm, screen:{x,y} }（ほかの 間は null）
 *   building()      建築中の 家 { name, w, d, progress, leftTicks, leftText, at }（なければ null）
 *   firstBonus()    まだ 1 けんも 建て はじめて いない
 *   celebrate()     { confetti: 紙ふぶきの 回数, banner: { text, ticksLeft } | null }
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
  /** 見本に 出して いる 家具の 数（赤い 家具は 出さない。1E） */
  furniture: number;
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
  wall: WallKind;
  door: DoorKind;
  deco: DecoKind[];
  /** ① の ポップアップ（開いて いる ばしょ。なければ null） */
  popup: Part | null;
  /** ポップアップの 行ごとの ボタンの id（上から。開いて いない ときは []） */
  popupRows: string[][];
  /** 名前の ヘルプ（のせて 12 コマで 出る。なければ null）。置き場所は 画面が 決める */
  hoverTip: { id: string; lines: string[] } | null;
  /** 「あたらしい！」の 印が ついた ボタンの id（しゅるいの ボタン ＋ 印の のこった ばしょの `part-<ばしょ>`） */
  marks: string[];
  windowCells: WindowCell[];
  /** 置いた 順。x・z ＝ 今の 形の 左上（保存と 同じ）、origin ＝ もとの マス、bad ＝ 赤い わけ（ふつうは null。1E） */
  furniture: Array<{ kind: string; x: number; z: number; rot: Rot; origin: { x: number; z: number }; bad: PlaceProblem | null }>;
  /** えらんで いる 家具。i ＝ furniture の 番号、x・z ＝ もとの マス（1E） */
  selected: { i: number; x: number; z: number } | null;
  /** 赤く 光らせた 家具（まだ 光らせて いなければ null。1E） */
  flash: Flash | null;
  light: LightKind;
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
  legacyKura(): Record<string, number> | null;
  editor(): EditorInfo | null;
  edit(op: unknown): boolean;
  need(source?: number): ReturnType<HouseSystem['need']>;
  blueprints(): ReturnType<HouseSystem['blueprints']>;
  previewDrag(dx: number, dy: number): { angle: number; pitch: number } | null;
  previewWheel(dx: number, dy: number): { angle: number; pitch: number } | null;
  hover(id: string | null): void;
  recipes(): ReturnType<HouseSystem['recipes']['view']>;
  recipeKinds(id: string): string[];
  learn(id: string): boolean;
  found(at: { x: number; y: number; z: number }, who?: Who): void;
  read(who?: Who): boolean;
  recipeBand(): { text: string; ticksLeft: number } | null;
  buildNow(number: number, at: Vec3): HouseView | null;
  houses(): HouseView[];
  blockAt(x: number, y: number, z: number): CellInfo;
  /** HOUSE-2C: 場所の しゅるいの id（`kawara_shiro`。置いた 記録 → 家の 記録 → むら。案の ある 形の ブロックで なければ null） */
  lookOf(x: number, y: number, z: number): string | null;
  /** HOUSE-2C: 手で 置いた ときの 記録（案・向き。なければ null） */
  placedLook(x: number, y: number, z: number): { style: string; facing: string } | null;
  renaming(): ReturnType<HouseSystem['renaming']>;
  /** 1D（#341）: 座って いる／おふろに 入って いる あいだだけ { kind: 'sit' | 'bath', block, position }。立つと null */
  seat(): SeatInfo | null;
  level(): ReturnType<HouseSystem['level']>;
  sites(): ReturnType<HouseSystem['sites']>;
  cursor(): ReturnType<HouseSystem['cursor']>;
  building(): ReturnType<HouseSystem['building']>;
  firstBonus(): boolean;
  celebrate(): ReturnType<HouseSystem['celebrate']>;
}

type HookSystem = Pick<HouseSystem, 'architects' | 'talkTo' | 'menu' | 'press' | 'legacyKura' | 'editor' | 'editing' | 'edit' | 'need' | 'blueprints' | 'preview' | 'previewDrag' | 'previewWheel' | 'hover' | 'recipes' | 'recipeKinds' | 'hoverTip' | 'buildNow' | 'houses' | 'blockAt' | 'lookOf' | 'placedLook' | 'renaming' | 'level' | 'sites' | 'cursor' | 'building' | 'firstBonus' | 'celebrate'>;

export function createHouseHook(sys: HookSystem, seat: { seat(): SeatInfo | null } = { seat: () => null }): HouseHook {
  const editor = (): EditorInfo | null => {
    if (!sys.editing()) return null;
    const c = sys.editor;
    const s = c.s;
    const sel = c.selected();
    const at = c.sel.placed;
    const bads = furnitureProblems(s);
    const mode = previewModeOf(s.step);
    const v = mode === null ? null : sys.preview.info(mode);
    return {
      step: s.step,
      size: { w: s.w, d: s.d },
      windows: s.windows,
      windowMax: c.windowMax(),
      windowKind: s.windowKind,
      roof: s.roof,
      wall: s.wall,
      door: s.door,
      deco: [...s.deco],
      popup: c.popup,
      popupRows: c.popupRows(),
      hoverTip: sys.hoverTip(),
      marks: c.recipes.marks(),
      windowCells: windowCells(s),
      furniture: s.furniture.map((p, i) => ({ kind: p.kind, x: p.x, z: p.z, rot: p.rot, origin: originOf(p), bad: bads[i] ?? null })),
      selected: sel && at !== null ? { i: at, ...originOf(sel) } : null,
      flash: c.flash ? { items: [...c.flash.items], seq: c.flash.seq } : null,
      light: s.light,
      name: { front: s.name.front, back: s.name.back },
      canUndo: c.canUndo(),
      canRedo: c.canRedo(),
      confirm: c.confirm,
      preview: mode !== null && v ? { mode, roof: mode === 'outside', angle: v.yaw, pitch: v.elev, touched: v.touched, wait: v.wait, builds: v.builds, furniture: v.furniture, glow: v.glow } : null,
    };
  };
  return {
    architects: () => sys.architects(),
    talk: (id) => void sys.talkTo(String(id)),
    menu: () => sys.menu(),
    press: (id, arg) => sys.press(id, arg),
    legacyKura: () => sys.legacyKura(),
    editor,
    edit: (op) => sys.edit(op),
    need: (source) => sys.need(source),
    blueprints: () => sys.blueprints(),
    previewDrag: (dx, dy) => sys.previewDrag(dx, dy),
    previewWheel: (dx, dy) => sys.previewWheel(dx, dy),
    hover: (id) => sys.hover(id),
    recipes: () => sys.recipes.view(),
    recipeKinds: (id) => sys.recipeKinds(id),
    learn: (id) => sys.recipes.learn(id),
    found: (_at, who) => sys.recipes.found(who), // 場所は 使わない（3.3 版: どの 坑道かは レシピに 関係しない）
    read: (who) => sys.recipes.read(who),
    recipeBand: () => sys.recipes.band(),
    buildNow: (number, at) => sys.buildNow(number, at),
    houses: () => sys.houses(),
    blockAt: (x, y, z) => sys.blockAt(x, y, z),
    lookOf: (x, y, z) => sys.lookOf(x, y, z),
    placedLook: (x, y, z) => sys.placedLook(x, y, z),
    renaming: () => sys.renaming(),
    seat: () => seat.seat(),
    level: () => sys.level(),
    sites: () => sys.sites(),
    cursor: () => sys.cursor(),
    building: () => sys.building(),
    firstBonus: () => sys.firstBonus(),
    celebrate: () => sys.celebrate(),
  };
}
