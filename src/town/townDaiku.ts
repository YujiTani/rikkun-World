import { Builder, T, hash3 } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: だいくさんの こやの 置き方の 表（見本 `town/art/v5/proto/daiku2.py`。u ＝ 見本の x ＋ 53、v ＝ 見本の z ＋ 1、dy ＝ 見本の y）。
 * 前が 大きく あいた 木の 作業小屋。屋根は 板ぶき（3 色）の かたながれ（うしろが 高く 前が 低い・1 ブロックで 1/3 下がる）。
 * 左に まきの 山と まきわり台・材木、右に 作りかけの 家の ほねぐみ。人（だいくさん）は 別の 作業。
 */
const D = {
  /** こやの ゆか・かべの はんい（u・v） */
  u0: 53,
  u1: 64,
  v0: 1,
  v1: 8,
  /** うしろの かべの 高さ（dy 1〜backDy） */
  backDy: 6,
  /** 屋根の 板の 上の 高さ（1/3 ブロック 単位）: T ＝ roofBase − v（v 0〜10） */
  roofBase: 23,
  roofV0: 0,
  roofV1: 10,
  /** 前の はり（dy）と 柱の u */
  beamDy: 3,
  posts: [53, 58, 59, 64],
  /** かんばん（v 10・dy 4 の 下。左から だ・い・く） */
  sign: { v: 9, dy: 3, u0: 57, ids: ['sign_da', 'sign_i', 'sign_ku'] },
  /** 作りかけの 家の ほねぐみ: u 66〜70（はば 5）・v 3〜6、柱の 高さ dy 1〜4・三角は dy 5〜6 */
  frame: { u0: 66, u1: 70, v0: 3, v1: 6, topDy: 4 },
} as const;

/** こやの 建築士さんの 立つ 所（作業台の 前。u・v は 見本の 数。作業台は v 5・前は v が 大きい 方）。向きは こやの 前（v が 大きい 方。人を むかえる 向き） */
export const DAIKU_STAND = { u: 57, v: 6 } as const;

export function buildDaiku(b: Builder): void {
  const { u0, u1, v0, v1 } = D;
  const roofT = (v: number): number => D.roofBase - v;
  const roofDy = (v: number): number => Math.floor((roofT(v) - 1) / 3);
  // ゆか（板と 木くず）と 前の 石の しきい
  b.fill(u0, v0, 0, u1, v1, 0, (u, v) => T(hash3(u, v, 11) % 4 === 0 ? 'yukaita' : 'shiraki'));
  b.fill(u0 - 1, v1 + 1, 0, u1 + 1, v1 + 1, 0, T('yukaita'));
  // うしろの かべ（高い・どうぐ かけ）と 両がわの かべ（屋根に そって 低くなる）
  b.fill(u0, v0, 1, u1, v0, D.backDy, T('shiraki'));
  b.fill(u0 + 1, v0, 2, u1 - 1, v0, 3, T('dougu_kabe'));
  for (const u of [u0, u1]) {
    for (let v = v0; v <= v1; v++) b.fill(u, v, 1, u, v, roofDy(v) - 1, T('shiraki'));
    for (const v of [3, 6]) b.put(u, v, 2, T('dougu_kabe'));
    b.put(u, 4, 1, T('tsuta_kabe'));
  }
  // 前の 柱と はり（まん中は あいている）
  for (const u of D.posts) b.fill(u, v1, 1, u, v1, D.beamDy - 1, T('shirakibashira'));
  b.fill(u0, v1, D.beamDy, u1, v1, D.beamDy, T('shirakibashira'));
  // 屋根: いたぶき（ところどころ くろかわら）。うしろ v0 が いちばん 高い
  for (let v: number = D.roofV0; v <= D.roofV1; v++) {
    const wallAt: number[] = [u0, u1];
    if (v === v1) for (let u = u0; u <= u1; u++) wallAt.push(u);
    b.roofRow(u0 - 1, u1 + 1, v, roofT(v), wallAt, ['itaw', 'itaw', 'itaw_b', 'itaw_b', 'itaw_c']);
  }
  // 作業台（家の もけいと かんな）・はこ・あんどん
  b.fill(56, 5, 1, 60, 5, 1, T('yukaita'));
  b.put(57, 5, 2, T('ie_mokei'));
  b.put(59, 5, 2, T('hako'));
  b.put(55, 3, 1, T('hako'));
  b.put(55, 4, 1, T('hako'));
  b.put(62, 3, 1, T('taru'));
  b.put(62, 6, 1, T('hako'));
  for (const [u, v] of [[55, 4], [62, 4], [58, 7]] as const) b.put(u, v, 3, T('tsuri_andon'));
  // あい色の のれん（かんばんの よこ・前の はりの 下）
  for (const u of [54, 55, 61, 62, 63]) b.put(u, D.sign.v, D.sign.dy, `${T('noren_hang_ai')}@v+`);
  // かんばん「だいく」（前の はりの 下の さげ板）
  D.sign.ids.forEach((id, i) => b.put(D.sign.u0 + i, D.sign.v, D.sign.dy, T(id)));
  for (const u of [D.sign.u0 - 1, D.sign.u0 + D.sign.ids.length]) b.put(u, D.sign.v, D.sign.dy, T('sign_end_d')); // 両はしの ふた
  // 左の 庭（前から よく 見える）: 丸太の 山・まきの 山・まきわり台（おの）
  b.fill(47, 3, 0, 52, 9, 0, T('yukaita'));
  for (const [u, v, dy] of [[47, 4, 1], [48, 4, 1], [47, 4, 2], [47, 6, 1], [48, 6, 1], [48, 6, 2]] as const) b.put(u, v, dy, T('maruta_yama'));
  for (const [u, v, dy] of [[50, 6, 1], [51, 6, 1], [50, 6, 2], [50, 7, 1], [51, 7, 1], [50, 8, 1]] as const) b.put(u, v, dy, T('maki_yama'));
  b.put(52, 8, 1, T('warikodai'));
  b.put(48, 8, 1, T('maruta_yama'));
  // 右: 作りかけの 家の ほねぐみ（明るい 木の 細い 柱と はりだけ・かべなし・屋根の 三角つき）
  const F = D.frame;
  b.fill(F.u0 - 1, F.v0 - 1, 0, F.u1 + 1, F.v1 + 1, 0, T('yukaita'));
  for (const [u, v] of [[F.u0, F.v0], [F.u1, F.v0], [F.u0, F.v1], [F.u1, F.v1]] as const) b.fill(u, v, 1, u, v, F.topDy, T('waku_hashira'));
  for (const dy of [2, F.topDy]) {
    for (const v of [F.v0, F.v1]) b.fill(F.u0 + 1, v, dy, F.u1 - 1, v, dy, T('waku_hari_x'));
    for (const u of [F.u0, F.u1]) b.fill(u, F.v0 + 1, dy, u, F.v1 - 1, dy, T('waku_hari_z'));
  }
  // 屋根の 三角（手前と おくの 面）: 小さな 柱で 階だんの 形・てっぺんに むねの はり
  const mid = (F.u0 + F.u1) / 2;
  for (const v of [F.v0, F.v1]) {
    b.put(mid - 1, v, F.topDy + 1, T('waku_hashira'));
    b.put(mid + 1, v, F.topDy + 1, T('waku_hashira'));
    b.put(mid, v, F.topDy + 1, T('waku_hashira'));
    b.put(mid, v, F.topDy + 2, T('waku_hashira'));
  }
  b.fill(mid, F.v0 + 1, F.topDy + 2, mid, F.v1 - 1, F.topDy + 2, T('waku_hari_z'));
  b.put(F.u1 + 2, F.v1 + 1, 1, T('maruta_yama'));
  b.put(F.u1 + 2, F.v0, 1, T('hako'));
  // 竹（右はしの うしろ）
  for (const [u, v, h] of [[73, 0, 6], [74, 1, 7]] as const) b.fill(u, v, 0, u, v, h - 1, T('take'));
}
