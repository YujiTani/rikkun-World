import { Builder, T, WALL_MIX, hash3, type BuildingCell } from './townBuilder';
import { buildAthletic } from './townAthletic';
import { buildDaiku } from './townDaiku';
import { buildDojo } from './townDojo';
import { buildGate } from './townGate';
import { buildShops } from './townShops';
import { buildYatai } from './townYatai';
import { buildKajiya } from './townKajiya';
import { at } from './townLayout';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1B-2 試作: 建物・ふんすいの 置き方の 表（ローカル座標 u ＝ 西→東・v ＝ 奥→手前・dy ＝ 地面の 上の ブロックの 数 0〜）。
 * 見本 `town/art/v5/proto/yorozuya.py`（よろずや）・`plaza.py`（ふんすい）の 箱を、1 ブロックの 小物に 直して ならべた 物。
 * 数は ぜんぶ ここ。世界への 書きこみ（向きの 直し・番号）は townWrite.ts。同じ 表から いつも 同じ 並び（乱数は ハッシュ）。
 * 置く ブロックの 名前に「@u+」「@v-」が ついて いたら 街の 向きに あわせて 4 向きから えらぶ（水の まく）。「@u」「@v」は よこ・たての 2 向き（ベンチ）。
 */

/** よろずやの 置き場所（街の 奥の 列・西。u ＝ 見本の x ＋ 3、v ＝ 見本の z） */
const YOROZUYA = {
  /** 土台（石づみ）: u 3〜20・v 1〜10 */
  base: { u0: 3, u1: 20, v0: 1, v1: 10 },
  /** 店の 中（ゆか）: u 5〜14・v 3〜8、前の しきい v 9 */
  shop: { u0: 5, u1: 14, v0: 3, v1: 8 },
  /** 朱の はしらの u（前の 列 v 9） */
  pillars: [4, 7, 12, 15],
  /** 屋根の むねの v・はば（u） */
  ridgeV: 5,
  roofU: { u0: 3, u1: 16 },
  /** くら（なまこかべ）: u 16〜19・v 3〜8 */
  kura: { u0: 16, u1: 19, v0: 3, v1: 8 },
  /** 店先（地面の 高さ）の 品を ならべる 四角（u0, v0, u1, v1, 品の 数の わりあい 1/n） */
  yards: [
    { u0: 3, v0: 12, u1: 7, v1: 15, every: 3 },
    { u0: 12, v0: 12, u1: 20, v1: 15, every: 3 },
    { u0: 3, v0: 16, u1: 20, v1: 16, every: 5 },
  ],
  /** ひらがな かんばん（v 12・dy 5。左から） */
  sign: { v: 12, dy: 5, u0: 7, ids: ['sign_end', 'sign_yo', 'sign_ro', 'sign_zu', 'sign_ya', 'sign_end'] },
} as const;

/** 店先の 品（むしろの 上）。ばらばらな 寄せ集め */
const YARD_ITEMS = ['tsubo_b_m', 'ningyo_b_m', 'kago_m', 'kasa_m', 'tsubo_b_m', 'kago_m'] as const;
/** たなの 品 */
const SHELF_ITEMS = ['tsubo_a_t', 'tsubo_b_t', 'ningyo_a_t', 'hon_maki_t'] as const;
/** 台の 上の 品 */
const COUNTER_ITEMS = ['tsubo_a', 'tsubo_b', 'ningyo_a', 'ningyo_b', 'hon_maki', 'kago', 'kasa'] as const;
/** 石だたみ（地面の 高さの 1 つ 下 ＝ 地面を 石に かえる）。店の 前（間口 ＋ 左右 1 マス・手前へ 4 マス）と 奥の 列の 建物の 前 */
const PAVE = { terraceU0: 2, terraceU1: 74, v0: 11, v1: 14 } as const;
function paving(b: Builder): void {
  for (let v = PAVE.v0; v <= PAVE.v1; v++) for (let u = PAVE.terraceU0; u <= PAVE.terraceU1; u++) b.put(u, v, -1, T(['ishidatami_a', 'ishidatami_b', 'ishidatami_c'][hash3(u, v, 4) % 3]!));
}

function yorozuya(b: Builder): void {
  const Y = YOROZUYA;
  const B = Y.base;
  // 土台 dy 0: 石づみ（ふちに 色むら）＋ 店の ゆか ＋ 前の しきい ＋ 店先の 石の 段
  b.fill(B.u0, B.v0, 0, B.u1, B.v1, 0, (u, v) => T(u === B.u0 || u === B.u1 || v === B.v1 ? WALL_MIX[hash3(u, v, 1) % 4]! : 'ishizumi'));
  b.fill(Y.shop.u0, Y.shop.v0, 0, Y.shop.u1, Y.shop.v1, 0, T('yukaita'));
  b.fill(4, 9, 0, 15, 9, 0, T('yukaita'));
  b.fill(8, 11, 0, 11, 11, 0, 'stone_usuita_shita');
  // 1 階 dy 1〜3: おくの かべ・両がわの かべ・前の 朱の はしら と はり
  b.fill(4, 2, 1, 15, 2, 3, T('koitabari'));
  b.fill(4, 3, 1, 4, 8, 3, T('itabari'));
  b.fill(15, 3, 1, 15, 8, 3, T('itabari'));
  for (const u of Y.pillars) {
    b.put(u, 9, 1, T('ishizumi')); // 柱の 足もとの 石の 段
    b.fill(u, 9, 2, u, 9, 4, T('shubashira'));
  }
  b.fill(5, 9, 4, 6, 9, 4, T('hashira'));
  b.fill(8, 9, 4, 11, 9, 4, T('hashira'));
  b.fill(13, 9, 4, 14, 9, 4, T('hashira'));
  b.fill(5, 9, 1, 6, 9, 1, T('koitabari'));
  b.fill(5, 9, 2, 6, 9, 3, T('akakoushi'));
  b.fill(8, 9, 3, 11, 9, 3, T('noren_ai'));
  // たな（おく と 左右）に 品を ぎっしり
  const shelf = (u: number, v: number, dy: number): string => T(SHELF_ITEMS[hash3(u, v, dy) % SHELF_ITEMS.length]!);
  b.fill(5, 3, 1, 14, 3, 3, shelf);
  b.fill(5, 4, 1, 5, 8, 3, shelf);
  b.fill(14, 4, 1, 14, 8, 3, shelf);
  // おおばこと 床の つぼ
  b.fill(9, 4, 1, 10, 4, 1, T('takara'));
  for (const [u, v, id] of [[7, 5, 'pot_big'], [12, 5, 'tsubo_b_m'], [7, 7, 'kago_m'], [11, 7, 'tsubo_b_m'], [12, 8, 'kasa_m'], [7, 8, 'ningyo_b_m'], [10, 8, 'kago_m']] as const) b.put(u, v, 1, T(id));
  // 左の 店先の だい（こけし・だるま）と 右の 店先の だい（ひさしの 下）
  b.fill(5, 10, 1, 6, 10, 1, T('yukaita'));
  b.fill(12, 10, 1, 14, 10, 1, T('yukaita'));
  b.fill(5, 10, 2, 6, 10, 2, (u, v) => T(COUNTER_ITEMS[hash3(u, v, 2) % COUNTER_ITEMS.length]!));
  b.fill(12, 10, 2, 14, 10, 2, (u, v) => T(COUNTER_ITEMS[hash3(u, v, 3) % COUNTER_ITEMS.length]!));
  b.fill(12, 10, 3, 14, 10, 3, 'town_shima_hi'); // 朱と 白の しまの ひさし（前へ さがる）
  b.fill(12, 11, 3, 15, 11, 3, 'town_shima_mid');
  b.fill(12, 12, 3, 15, 12, 3, 'town_shima_lo');
  b.fill(15, 10, 3, 15, 10, 3, 'town_shima_hi');
  // 1 階の 軒（かわらの ひさし）。2 階の 下から 前へ 3 まい さがる
  for (const [v, t] of [[9, 18], [10, 17], [11, 16]] as const) b.roofRow(3, 16, v, t);
  // 2 階 dy 5〜7: しっくいの かたまり・はしら・こうし窓・しょうじ・てすり と はち
  b.fill(4, 3, 5, 15, 8, 7, T('shikkui'));
  for (const u of Y.pillars) b.fill(u, 8, 5, u, 8, 7, T('hashira'));
  b.fill(5, 7, 6, 6, 7, 7, T('koitabari'));
  b.fill(13, 7, 6, 14, 7, 7, T('koitabari'));
  b.fill(5, 8, 6, 6, 8, 7, T('koushimado'));
  b.fill(13, 8, 6, 14, 8, 7, T('koushimado'));
  b.fill(8, 8, 6, 11, 8, 7, T('shoji'));
  b.put(8, 9, 6, T('hachiue'));
  b.put(9, 9, 6, T('ishi_tesuri'));
  b.put(10, 9, 6, T('ishi_tesuri'));
  b.put(11, 9, 6, T('hachiue'));
  // 主屋根 dy 8〜: むね v 5 と 前後の 下り（1 ブロックごとに 1/3 ブロック さがる）。両はしに おにがわら
  const R = Y.roofU;
  b.fill(R.u0, Y.ridgeV, 9, R.u1, Y.ridgeV, 9, T('munegawara'));
  for (const [d, t] of [[1, 27], [2, 26], [3, 25], [4, 24], [5, 23]] as const) {
    b.roofRow(R.u0, R.u1, Y.ridgeV + d, t, [4, 15]);
    b.roofRow(R.u0, R.u1, Y.ridgeV - d, t, [4, 15]);
  }
  for (const u of [R.u0, R.u1]) b.put(u, Y.ridgeV, 10, T('munegawara'));
  // やぐら（3 段目）: しっくいの 箱・こうし窓・小さな 屋根・屋根の たからばこ
  b.fill(8, 4, 9, 11, 6, 11, T('shikkui'));
  b.fill(9, 6, 11, 10, 6, 11, T('koushimado'));
  b.fill(9, 4, 11, 10, 4, 11, T('koushimado'));
  b.fill(9, 5, 11, 10, 5, 11, T('koitabari')); // こうしの 後ろは 暗い 色
  b.fill(7, 5, 12, 12, 5, 12, T('munegawara'));
  for (const [d, t] of [[1, 37], [2, 36]] as const) {
    b.roofRow(7, 12, 5 + d, t);
    b.roofRow(7, 12, 5 - d, t);
  }
  for (const u of [7, 12]) b.put(u, 5, 13, T('munegawara'));
  b.fill(9, 5, 13, 10, 5, 13, T('takara'));
  // くら（右）: なまこかべ・白かべ・戸・窓・かわらの 屋根
  const K = Y.kura;
  b.fill(K.u0, K.v0, 1, K.u1, K.v1, 2, T('namakokabe'));
  b.fill(K.u0, K.v0, 3, K.u1, K.v1, 5, T('kurakabe'));
  b.fill(17, K.v1, 1, 18, K.v1, 2, T('koitabari'));
  b.fill(17, K.v1, 4, 18, K.v1, 4, T('koushimado'));
  b.fill(17, K.v1 - 1, 4, 18, K.v1 - 1, 4, T('koitabari'));
  b.fill(K.u0 + 1, 5, 7, K.u1 + 1, 5, 7, T('munegawara'));
  for (const [d, t] of [[1, 21], [2, 20], [3, 19], [4, 18], [5, 17]] as const) {
    b.roofRow(K.u0 + 1, K.u1 + 1, 5 + d, t, [K.u1]);
    if (d <= 4) b.roofRow(K.u0 + 1, K.u1 + 1, 5 - d, t, [K.u1]);
  }
  // くら前の たる
  b.fill(16, 9, 1, 18, 9, 1, T('taru'));
  // 店先（地面の 高さ）: 石どうろう 2・はちうえ 2・品
  for (const u of [6, 13]) {
    b.put(u, 11, 0, T('ishizumi'));
    b.put(u, 11, 1, T('toro_mini'));
  }
  b.put(7, 11, 0, T('hachiue'));
  b.put(12, 11, 0, T('hachiue'));
  for (const y of Y.yards) {
    for (let v = y.v0; v <= y.v1; v++) {
      for (let u = y.u0; u <= y.u1; u++) {
        if (hash3(u, v, 9) % y.every !== 0) continue;
        if (b.cells.has((0 * 128 + v) * 128 + u)) continue;
        b.put(u, v, 0, T(YARD_ITEMS[hash3(u, v, 11) % YARD_ITEMS.length]!));
      }
    }
  }
  // かんばん「よろずや」（ひさしの 前に つるす）
  Y.sign.ids.forEach((id, i) => b.put(Y.sign.u0 + i, Y.sign.v, Y.sign.dy, T(id)));
  // かんばんを ささえる はしら 2 ほん・つりさげる あんどん（店の 中 3・前の はし 2）
  for (const u of [Y.sign.u0 - 1, Y.sign.u0 + Y.sign.ids.length]) b.fill(u, Y.sign.v, 0, u, Y.sign.v, 4, 'log_hashira');
  for (const [u, v] of [[6, 5], [9, 6], [13, 5], [3, 9], [16, 9]] as const) b.put(u, v, 3, T('tsuri_andon'));
  // 竹（右の はし）
  for (const [u, v, h] of [[22, 2, 6], [23, 3, 7], [22, 4, 5]] as const) b.fill(u, v, 0, u, v, h - 1, T('take'));
}

/** ふんすい: まん中（街の まん中の マス）に 池・4 だんの 塔・水の まく・あかり 6・ベンチ 4・はな 4 */
function fountain(b: Builder): void {
  const c = TOWN.size / 2;
  const ring = (du: number, dv: number): number => Math.max(Math.abs(du), Math.abs(dv));
  const cut = (du: number, dv: number): boolean => Math.abs(du) === 5 && Math.abs(dv) === 5;
  for (let dv = -6; dv <= 6; dv++) {
    for (let du = -6; du <= 6; du++) {
      const r = ring(du, dv);
      if (r === 6) b.put(c + du, c + dv, 0, T('fuchi'));
      else if (cut(du, dv)) b.put(c + du, c + dv, 0, T('hanabatake'));
      else if (r >= 4) {
        const h = hash3(du, dv, 5) % 9;
        b.put(c + du, c + dv, 0, T(h === 0 ? 'ike_hasu' : h === 1 ? 'ike_koi' : 'ike'));
      }
    }
  }
  // 塔: 7×7・5×5・3×3・1×1（だんの ふちは 水の だん。中は 白い 石）
  for (let tier = 1; tier <= 3; tier++) {
    const half = 4 - tier;
    for (let dv = -half; dv <= half; dv++) for (let du = -half; du <= half; du++) b.put(c + du, c + dv, tier - 1, T(ring(du, dv) === half ? 'tier_top' : 'shiroishi'));
  }
  b.put(c, c, 3, T('fountain_top'));
  // 段を 落ちる 水の まく: 4 方向 × 4 だん。まくの マスから 塔の ほうへ 向く 向き（@u+ など）
  const side: readonly (readonly [number, number, string])[] = [[0, 1, '@v-'], [0, -1, '@v+'], [1, 0, '@u-'], [-1, 0, '@u+']];
  for (const [sx, sv, mark] of side) {
    for (let tier = 0; tier <= 3; tier++) {
      const dist = 4 - tier;
      b.put(c + sx * dist, c + sv * dist, tier, T(tier === 0 ? `ike_taki${mark}` : `taki${mark}`));
    }
  }
  // あかり 6・ベンチ 4（よこ向き 2 マス）・はなの 数は 上の 四すみ
  for (const [du, dv] of [[-6, -2], [6, -2], [-6, 2], [6, 2], [0, -6], [0, 6]] as const) b.put(c + du, c + dv, 1, T('toro_mini'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [8, 9]) b.put(c + sx * k, c + sz * 7, 0, `${T('bench')}@u`);
}

/** ひろばの あかり 4（§4.5「ひろば 4」）と はちうえ: ひろばの 四すみ ちかく。石の 台の 上に 石どうろう、となりに はちうえ */
const PLAZA_LAMPS = { offset: 13, pots: [[1, 0], [0, 1]] } as const;
function plazaProps(b: Builder): void {
  const c = TOWN.size / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const u = c + sx * PLAZA_LAMPS.offset;
      const v = c + sz * PLAZA_LAMPS.offset;
      b.put(u, v, 0, T('ishizumi'));
      b.put(u, v, 1, T('toro_mini'));
      for (const [du, dv] of PLAZA_LAMPS.pots) b.put(u - sx * du, v - sz * dv, 0, T('hachiue'));
    }
  }
}

let cache: readonly BuildingCell[] | null = null;
/** 建物・ふんすいの 表（ぜんぶ）。同じ 表から いつも 同じ 並び */
export function townBuildingCells(): readonly BuildingCell[] {
  if (cache === null) {
    const b = new Builder();
    paving(b);
    yorozuya(b);
    buildKajiya(b);
    buildDaiku(b);
    buildDojo(b);
    buildAthletic(b);
    buildYatai(b);
    buildShops(b);
    buildGate(b);
    fountain(b);
    plazaProps(b);
    cache = [...b.cells.values()];
  }
  return cache;
}

/** 列（ローカルの マス）ごとに まとめる: at(u, v) → [{dy, id}] */
export function townBuildingColumns(): ReadonlyMap<number, readonly { dy: number; id: string }[]> {
  const m = new Map<number, { dy: number; id: string }[]>();
  for (const c of townBuildingCells()) {
    const k = at(c.u, c.v);
    let a = m.get(k);
    if (!a) m.set(k, (a = []));
    a.push({ dy: c.dy, id: c.id });
  }
  return m;
}
