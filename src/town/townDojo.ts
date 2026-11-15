import { Builder, T, WALL_MIX, hash3 } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: ものしりさんの 道場の 置き方の 表（見本 `town/art/v5/proto/dojo.py`。東の 列・奥。ローカル座標 u ＝ 西→東・v ＝ 奥→手前）。
 * 白かべに 朱の 柱の ひろい 1 部屋（巻物の たなと 地図）。小さな 2 だんの かわら屋根。前に えんがわ、さらに 板ばりの けいこ場（白い 線の わ）。
 * 深い 緑の のぼりと「どうじょう」の かんばん。ものしりさん（人）は 別の 作業。
 */
const J = {
  /** 本ぶくの かべ・ゆか（u・v）。かべは 外わく、中が 1 部屋 */
  hall: { u0: 74, u1: 91, v0: 26, v1: 34 },
  /** 下の 屋根（ひさしを 2 マス 出す）。高さは 外から 中へ 1/3 マスずつ 上がり、5 で とまる */
  roof: { u0: 72, u1: 93, v0: 24, v1: 36, baseT: 13, maxRise: 5 },
  /** 上の 小さな 屋根の 本ぶく（下の 屋根の たいらな 所の 上）と その 屋根 */
  upper: { u0: 77, u1: 88, v0: 29, v1: 31, wallDy0: 6, wallDy1: 7, roofU0: 76, roofU1: 89, roofV0: 28, roofV1: 32 },
  /** 柱の u（前と うしろの 列） */
  posts: [74, 79, 86, 91],
  /** 入り口（前の かべ v 34）: u 80〜85 が あく。両はしの 2 マスは しょうじ */
  door: { u0: 80, u1: 85 },
  /** えんがわ（v 35〜36・ゆか dy 0）と 石段 */
  engawa: { v0: 35, v1: 36, stepsV: 37, stepsU0: 80, stepsU1: 85 },
  /** えんがわの 柱（前の 列 v 36） */
  engawaPosts: [74, 78, 87, 91],
  /** かんばん「どうじょう」（えんがわの はりの 下。v 36・dy 3）と 両はしの ふた */
  sign: { v: 36, dy: 3, u0: 80, ids: ['sign_do', 'sign_u', 'sign_jig', 'sign_xyo', 'sign_u'], caps: [79, 85] },
  /** けいこ場（板ばり・v 37〜46）。白い 線の わ（ふち） */
  yard: { u0: 72, u1: 93, v0: 37, v1: 46, ring: { u0: 76, u1: 89, v0: 38, v1: 45 } },
  /** 立ち位置の 印・ちかい まと（6 マス）・とおい まと（16 マス）。v 44 の 列 */
  range: { v: 44, mark: 73, near: 79, far: 89 },
  /** 門（けいこ場の 前 v 47）: u 81〜84 が あく。両がわに 柱・のぼり・石どうろう */
  gate: { v: 47, u0: 81, u1: 84 },
} as const;

export function buildDojo(b: Builder): void {
  const H = J.hall;
  const R = J.roof;
  const U = J.upper;
  const E = J.engawa;
  const Y = J.yard;
  const wall = (u: number, v: number, dy: number): string => T(WALL_MIX[hash3(u, v, dy) % 4]!);
  // 土台と ゆか: 石づみの 土台・中は たたみ・えんがわは 板
  b.fill(H.u0, H.v0, 0, H.u1, H.v1, 0, (u, v) => wall(u, v, 0));
  b.fill(H.u0 + 1, H.v0 + 1, 0, H.u1 - 1, H.v1 - 1, 0, T('tatami'));
  b.fill(H.u0, E.v0, 0, H.u1, E.v1, 0, T('yukaita'));
  b.fill(J.engawa.stepsU0, E.stepsV, 0, J.engawa.stepsU1, E.stepsV, 0, T('ishidan'));
  // かべ: 白かべ（しっくい）。四すみと 柱の 列は 朱の 柱
  b.fill(H.u0 + 1, H.v0, 1, H.u1 - 1, H.v0, 3, T('shikkui'));
  b.fill(H.u0 + 1, H.v1, 1, H.u1 - 1, H.v1, 3, T('shikkui'));
  for (const u of [H.u0, H.u1]) b.fill(u, H.v0 + 1, 1, u, H.v1 - 1, 3, T('shikkui'));
  for (const u of J.posts) for (const v of [H.v0, H.v1]) b.fill(u, v, 1, u, v, 3, T('shubashira'));
  for (const u of [H.u0, H.u1]) b.fill(u, 30, 1, u, 30, 3, T('shubashira'));
  for (const u of [H.u0 + 2, H.u1 - 2]) b.put(u, H.v0, 2, T('koushimado'));
  b.put(H.u0, 28, 2, T('koushimado'));
  b.put(H.u0, 32, 2, T('koushimado'));
  b.put(H.u1, 28, 2, T('koushimado'));
  b.put(H.u1, 32, 2, T('koushimado'));
  // 入り口（大きな 戸）: 4 マスが あき、両はしは しょうじの 戸
  b.clear(J.door.u0, H.v1, 1, J.door.u1, H.v1, 3);
  for (const u of [J.door.u0, J.door.u1]) b.fill(u, H.v1, 1, u, H.v1, 3, T('shoji'));
  b.clear(J.door.u0 + 1, H.v1, 1, J.door.u1 - 1, H.v1, 3);
  b.fill(J.door.u0 - 1, H.v1, 1, J.door.u0 - 1, H.v1, 3, T('shubashira'));
  b.fill(J.door.u1 + 1, H.v1, 1, J.door.u1 + 1, H.v1, 3, T('shubashira'));
  // 前の かべの 木刀かけ
  for (const u of [76, 89]) b.put(u, H.v1, 2, T('bokuto_kake'));
  // えんがわの 柱・てすり・かんばん（はりの 下）
  for (const u of J.engawaPosts) b.fill(u, E.v1, 1, u, E.v1, 3, T('shubashira'));
  for (let u = H.u0 + 1; u < J.sign.caps[0]; u++) if (!(J.engawaPosts as readonly number[]).includes(u)) b.put(u, E.v1, 1, T('tesuri'));
  for (let u = J.sign.caps[1] + 1; u < H.u1; u++) if (!(J.engawaPosts as readonly number[]).includes(u)) b.put(u, E.v1, 1, T('tesuri'));
  J.sign.ids.forEach((id, i) => b.put(J.sign.u0 + i, J.sign.v, J.sign.dy, T(id)));
  for (const u of J.sign.caps) b.put(u, J.sign.v, J.sign.dy, T('sign_end_g'));
  b.put(J.sign.caps[0], E.v1, 1, T('tesuri'));
  b.put(J.sign.caps[1], E.v1, 1, T('tesuri'));
  // わらにんぎょう（えんがわに 3 つ）
  for (const u of [76, 78, 89]) b.put(u, E.v0, 1, T('wara_ningyo'));
  // 中: 巻物の たな・地図・あんどん
  for (let u = H.u0 + 2; u <= H.u1 - 2; u++) if (u < 81 || u > 84) b.put(u, H.v0 + 1, 1, T('hon_maki_t'));
  for (let u = 81; u <= 84; u++) b.put(u, H.v0, 2, T('chizu'));
  for (const u of [H.u0 + 1, H.u1 - 1]) for (let v = 28; v <= 32; v++) b.put(u, v, 1, T('hon_maki_t'));
  for (const u of [78, 87]) b.put(u, 30, 3, T('tsuri_andon'));
  // 下の 屋根: 外から 中へ 1/3 マスずつ 上がる。かべの 上は すきまを ふさぐ
  const isWall = (u: number, v: number): boolean => u >= H.u0 && u <= H.u1 && v >= H.v0 && v <= H.v1 && (u === H.u0 || u === H.u1 || v === H.v0 || v === H.v1);
  for (let v = R.v0; v <= R.v1; v++) {
    for (let u = R.u0; u <= R.u1; u++) {
      const t = R.baseT + Math.min(J.roof.maxRise, u - R.u0, R.u1 - u, v - R.v0, R.v1 - v);
      const k = (t - 1) % 3;
      if (isWall(u, v) && k > 0) b.put(u, v, Math.floor((t - 1) / 3), T(k === 1 ? 'kawara_fill_mid' : 'kawara_fill_hi'));
      else b.roof(u, v, t);
    }
  }
  // 上の 小さな 本ぶく（白かべ・朱の 柱・窓）と 上の 屋根（むね）
  b.fill(U.u0, U.v0, U.wallDy0, U.u1, U.v0, U.wallDy1, T('shikkui'));
  b.fill(U.u0, U.v1, U.wallDy0, U.u1, U.v1, U.wallDy1, T('shikkui'));
  b.fill(U.u0, U.v0 + 1, U.wallDy0, U.u0, U.v1 - 1, U.wallDy1, T('shikkui'));
  b.fill(U.u1, U.v0 + 1, U.wallDy0, U.u1, U.v1 - 1, U.wallDy1, T('shikkui'));
  for (const u of [U.u0, 80, 85, U.u1]) for (const v of [U.v0, U.v1]) b.fill(u, v, U.wallDy0, u, v, U.wallDy1, T('shubashira'));
  for (const u of [82, 83]) b.put(u, U.v1, U.wallDy1, T('koushimado'));
  for (let v = U.roofV0; v <= U.roofV1; v++) {
    const t = 25 + Math.min(2, 2 - Math.abs(30 - v));
    for (let u = U.roofU0; u <= U.roofU1; u++) {
      const k = (t - 1) % 3;
      const [wu0, wu1, wv0, wv1]: number[] = [U.u0, U.u1, U.v0, U.v1];
      const over = u >= wu0 && u <= wu1 && v >= wv0 && v <= wv1 && (u === wu0 || u === wu1 || v === wv0 || v === wv1);
      if (over && k > 0) b.put(u, v, Math.floor((t - 1) / 3), T(k === 1 ? 'kawara_fill_mid' : 'kawara_fill_hi'));
      else b.roof(u, v, t);
    }
  }
  b.fill(U.roofU0, 30, 9, U.roofU1, 30, 9, T('munegawara'));
  // けいこ場: 板ばり（地面と 同じ 高さ）・白い 線の わ・立ち位置の 印
  b.fill(Y.u0, Y.v0, -1, Y.u1, Y.v1, -1, T('yukaita'));
  const g = Y.ring;
  for (let u = g.u0; u <= g.u1; u++) for (const v of [g.v0, g.v1]) b.put(u, v, -1, T('shikkui'));
  for (let v = g.v0; v <= g.v1; v++) for (const u of [g.u0, g.u1]) b.put(u, v, -1, T('shikkui'));
  b.put(J.range.mark, J.range.v, -1, T('shiroishi'));
  b.put(J.range.near, J.range.v, 0, T('mato'));
  b.put(J.range.far, J.range.v, 0, T('mato'));
  for (const u of [78, 83, 88]) b.put(u, 41, 0, T('wara_ningyo'));
  b.put(Y.u1 - 1, 39, 0, T('taiko'));
  // 木の さく（2 だん）と 門（柱・みどりの のぼり・石どうろう）
  for (let u = Y.u0; u <= Y.u1; u++) if (u < J.gate.u0 || u > J.gate.u1) b.fill(u, J.gate.v, 0, u, J.gate.v, 1, T('tesuri'));
  for (const u of [Y.u0, Y.u1]) b.fill(u, Y.v0, 0, u, Y.v1, 1, T('tesuri'));
  for (const u of [J.gate.u0 - 1, J.gate.u1 + 1]) b.fill(u, J.gate.v, 0, u, J.gate.v, 2, T('shubashira'));
  for (const u of [J.gate.u0 - 2, J.gate.u1 + 2]) b.fill(u, J.gate.v, 0, u, J.gate.v, 1, T('noboru_g'));
  for (const u of [J.gate.u0 - 3, J.gate.u1 + 3]) b.put(u, J.gate.v, 0, T('toro_mini'));
}
