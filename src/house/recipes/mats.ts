// HOUSE-2A（#364）①「そと」・あかりの 材料（仕様 §4.1。同じ 形の むら・おしろ・こうざんは どれも 同じ 材料）。DOM・three なし。
// いつもの 物（たいら・き・しょうじ・いえの と・ちょうちん）は HOUSE-1 §4.1 の まま。「なし」は レシピ なしの 材料（下の 表）。
import type { ItemId } from '../../contracts';
import { DEFAULT_KIND, LIGHT_KIND_SUISHO, WINDOW_FORM_SUISHO, splitKind, type DecoKind, type DoorKind, type LightKind, type RoofKind, type WallKind, type WindowKind } from './kinds';

/** 材料を 数える 家の 形（EditorState の 一部） */
export interface MatShape {
  w: number;
  d: number;
  windows: number;
  roof: RoofKind;
  wall: WallKind;
  windowKind: WindowKind;
  door: DoorKind;
  deco: readonly DecoKind[];
  light: LightKind;
}

export type Mats = Map<ItemId, number>;
const add = (m: Mats, item: ItemId, n: number): void => {
  if (n > 0) m.set(item, (m.get(item) ?? 0) + n);
};

/** はなだんの はな（3 いろ あわせて 1 行。この id で 数え、「ある」は 3 いろの 合計。materials.ts） */
export const FLOWER_ROW: ItemId = 'flower_y';
/** はなの 3 いろ（ある ＝ 3 つの 合計。つかう ときは 手前から） */
export const FLOWER_IDS: readonly ItemId[] = ['flower_y', 'flower_o', 'flower_p'];
/** 材料の 数え方（1 か所）: はな（FLOWER_ROW）は 3 いろの 合計、ほかは そのまま。countOf ＝ 1 つの アイテムの 数。つくる の 計画・つくれる マーク・材料の 点が 同じ 数え方を 使う */
export function materialCount(item: ItemId, countOf: (item: ItemId) => number): number {
  return item === FLOWER_ROW ? FLOWER_IDS.reduce((n, f) => n + countOf(f), 0) : countOf(item);
}

/**
 * 手で つくる とき の 材料（HOUSE-2C §2.6。エディターでは 材料 0 の 2 つ〔たいらの やね・いえの と〕だけ。「つくる」の 作り方〔craft/houseCraft.ts〕が 読む）。
 * たいらの やね: き 1 → 1 マス。いえの と: き 2 → 1 こ（2 マス）
 */
export const HAND_MATS = {
  house_roof: { item: 'log' as ItemId, count: 1 },
  house_door: { item: 'log' as ItemId, count: 2 },
} as const satisfies Record<string, { item: ItemId; count: number }>;

/** 材料の 数（数は ここに 1 か所。単位は 下の コメント） */
const MATS = {
  /** かべ なし: 4 すみの 柱 ＝ 4 本 × 3 段（き） */
  pillarLog: 12,
  /** てつの と: てつの かたまり 2 */
  doorTetsuIron: 2,
  /** レンガの えんとつ: レンガ 8 */
  chimneyBrick: 8,
  /** のれん: ぬの 2 */
  norenCloth: 2,
  /** きんの しゃちほこ: きん 2 */
  shachiKin: 2,
  /** ほたるいしの あかり: ほたるいし 1（すいしょう ランプ も ほたるいし 1 ＋ すいしょう 2） */
  lampHotaru: 1,
  lampCrystal: 2,
} as const;

type WallForm = 'shikkui' | 'renga' | 'ishi';
type RoofForm = 'sankaku' | 'kawara' | 'wara' | 'kin';
/** かべの 形 → 材料（P こ。き の かわり。しっくい・レンガ・いし） */
const WALL_ITEM: Readonly<Record<WallForm, ItemId>> = { shikkui: 'shikkui', renga: 'brick', ishi: 'stone' };
/** やねの 形 → [材料, P を 何で わるか]（かわら P・き P÷2・くさ P・きん P÷4） */
const ROOF_MATS: Readonly<Record<RoofForm, readonly [ItemId, number]>> = { kawara: ['kawara', 1], sankaku: ['log', 2], wara: ['grass', 1], kin: ['kin', 4] };

/** 外まわり 1 周（P）＝ 2×(よこ＋たて)＋4（HOUSE-1 §4.1。4 の 倍数） */
const perimeter = (w: number, d: number): number => 2 * (w + d) + 4;

/** かべ・やね・まど・と・かざり・あかり の 材料を m に 足す（ゆか〔いし〕と 家具は 呼ぶ 側） */
export function exteriorMats(s: MatShape, m: Mats): void {
  const P = perimeter(s.w, s.d);
  const n = s.windows;
  const wallUp = s.wall !== 'none';
  const roofUp = s.roof !== 'none';

  // かべ（き P の かわり）
  if (s.wall === 'none') add(m, 'log', MATS.pillarLog);
  else if (s.wall === 'ki') add(m, 'log', P);
  else add(m, WALL_ITEM[splitKind(s.wall).form as WallForm], P);
  // やね（たいら・なし は 0）
  if (s.roof !== 'none' && s.roof !== 'flat') {
    const [item, div] = ROOF_MATS[splitKind(s.roof).form as RoofForm];
    add(m, item, P / div);
  }
  // まど（かべが ないと 建たない）
  if (wallUp && s.windowKind !== 'none') {
    if (s.windowKind === DEFAULT_KIND.window) add(m, 'paper', n); // いつもの しょうじ
    else if (splitKind(s.windowKind).form === WINDOW_FORM_SUISHO) add(m, 'crystal', n);
    else { add(m, 'paper', n); add(m, 'log', n); } // まるい しょうじ
  }
  // と
  if (s.door !== 'ie') add(m, 'iron_ingot', MATS.doorTetsuIron);
  // かざり
  for (const k of s.deco) {
    const form = splitKind(k).form;
    if (form === 'entotsu' && roofUp) add(m, 'brick', MATS.chimneyBrick);
    else if (form === 'noren') add(m, 'cloth', MATS.norenCloth);
    else if (form === 'hanadan' && wallUp) { add(m, 'log', n); add(m, FLOWER_ROW, n); }
    else if (form === 'shachi' && roofUp) add(m, 'kin', MATS.shachiKin);
  }
  // あかり
  if (s.light === 'hotaru') add(m, 'hotaruishi', MATS.lampHotaru);
  if (s.light === LIGHT_KIND_SUISHO) { add(m, 'crystal', MATS.lampCrystal); add(m, 'hotaruishi', MATS.lampHotaru); }
}
