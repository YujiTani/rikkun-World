import { Builder, T, WALL_MIX, hash3 } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: かじやの 置き方の 表（見本 `town/art/v5/proto/kajiya2.py`。u ＝ 見本の x ＋ 31、v ＝ 見本の z、dy ＝ 見本の y）。
 * 低い 平屋根の 作業場から、石づみの 大きな 炉と 太い えんとつが つき出る（炉が 主役）。両がわに 板ぶきの そで小屋。屋根は 平ら（よろずやの かわらの 屋根と ちがう）。
 * 人（かじやさん）と けむり（エフェクト）は 別の 作業。えんとつは 口だけ。
 */
const K = {
  /** 作業場の 土台と 柱の はんい（u・v）。かべの 高さ dy 1〜3・屋根（平らな ゆか）は dy 4・さくは dy 5 */
  u0: 33,
  u1: 42,
  v0: 1,
  v1: 8,
  deck: { floorDy: 4, parapetDy: 5 },
  /** 炉（石づみ・下が ひろく 上が すぼまる）: v 4〜6（口は v 6）。だん 1（dy 1〜2）u 35〜41（はば 7）・だん 2（dy 3〜4）u 36〜40・だん 3（dy 5〜6）u 37〜39（v 4〜5） */
  furnace: { v0: 4, v1: 6, tiers: [{ u0: 35, u1: 41, dy0: 1, dy1: 2 }, { u0: 36, u1: 40, dy0: 3, dy1: 4 }, { u0: 37, u1: 39, dy0: 5, dy1: 6 }] },
  /** 火の 口: はば 3（u 37〜39）・高さ 2（dy 1〜2）。おく（v 4）まで 火が 光る。口の 上に 黒い 鉄の ひさし（dy 3・u 36〜40） */
  mouth: { u0: 37, u1: 39, glowU: 38 },
  /** えんとつ: はば 3（u 37〜39）・v 4〜5。dy 7〜9 が 石・dy 10 が 口。屋根（さく dy 5）より 5 マス 上 */
  chimney: { u0: 37, u1: 39, v0: 4, v1: 5, dyTop: 10 },
  /** ひらがな かんばん（えんとつの 前の 面 v 6・dy 8。左から か・じ・や） */
  sign: { v: 6, dy: 8, u0: 37, ids: ['sign_ka', 'sign_ji', 'sign_ya_k'] },
  /** 左右の そで小屋（u0〜u1・v 4〜9。屋根 dy 3） */
  sheds: [
    { u0: 29, u1: 32, outer: 29 },
    { u0: 43, u1: 46, outer: 46 },
  ],
} as const;

/** えんとつの 場所（けむりの 出る 所。townPlan が 読む） */
export const KAJIYA_CHIMNEY = K.chimney;

export function buildKajiya(b: Builder): void {
  const { u0, u1, v0, v1 } = K;
  const D = K.deck;
  const F = K.furnace;
  // 土台 dy 0: 石づみ（まだら）・中の 石だたみの ゆか・前の 石段 2 だん
  b.fill(u0, v0, 0, u1, v1, 0, (u, v) => T(WALL_MIX[hash3(u, v, 7) % 4]!));
  b.fill(u0 + 1, v0 + 1, 0, u1 - 1, v1, 0, (u, v) => T(hash3(u, v, 8) % 3 === 0 ? 'ishidatami_c' : 'koishizumi'));
  b.fill(35, 9, 0, 40, 9, 0, T('ishidan'));
  b.fill(35, 10, 0, 40, 10, 0, 'stone_usuita_shita');
  // 四すみの 石の はしら dy 1〜3
  for (const [u, v] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]] as const) b.fill(u, v, 1, u, v, 3, (_, __, dy) => T(WALL_MIX[hash3(u, v, dy) % 4]!));
  // おくの かべ（下は 石・上は 木）と 両がわの かべ（下は 石・上に 刀と おの）。前（v 8）は 大きく あいて はりだけ
  b.fill(u0 + 1, v0, 1, u1 - 1, v0, 2, (u, _, dy) => T(WALL_MIX[hash3(u, 1, dy) % 4]!));
  b.fill(u0 + 1, v0, 3, u1 - 1, v0, 3, T('shubashira'));
  for (const u of [u0, u1]) {
    b.fill(u, 2, 1, u, 7, 2, (_, v, dy) => T(WALL_MIX[hash3(u, v, dy) % 4]!));
    b.fill(u, 2, 3, u, 7, 3, (_, v) => T(v % 2 === 1 ? 'buki_kabe' : 'itabari'));
  }
  b.fill(u0 + 1, v1, 3, u1 - 1, v1, 3, T('shubashira'));
  // 平らな 屋根（はり・ゆか）と 低い さく
  b.fill(u0, v0, D.floorDy, u1, v1, D.floorDy, T('yukaita'));
  for (let u = u0; u <= u1; u++) for (const v of [v0, v1]) b.put(u, v, D.floorDy, T('shubashira'));
  for (let v = v0; v <= v1; v++) for (const u of [u0, u1]) b.put(u, v, D.floorDy, T('shubashira'));
  // 炉の 前は はりと ふちを 外して 石づみの 炉が よく 見えるように する
  b.clear(F.tiers[1].u0, v1 - 1, D.floorDy, F.tiers[1].u1, v1, D.floorDy);
  b.clear(F.tiers[1].u0, v1, 3, F.tiers[1].u1, v1, 3);
  // さくは うしろと 両がわだけ（前は あけて 炉が 見える）
  for (let u = u0; u <= u1; u++) b.put(u, v0, D.parapetDy, T('shubashira'));
  for (let v = v0; v < v1; v++) for (const u of [u0, u1]) b.put(u, v, D.parapetDy, T('shubashira'));
  // 炉（石づみ・3 だん）。屋根を つきぬけて 高く そびえる
  // 下の だんは 黒っぽい 石（引きしめ）・上の 2 だんは 赤れんが（ところどころ 黒い 石）
  F.tiers.forEach((t, i) => b.fill(t.u0, F.v0, t.dy0, t.u1, i === 2 ? F.v1 - 1 : F.v1, t.dy1, (u, v, dy) => T(i === 0 ? (hash3(u, v, dy + 3) % 3 === 0 ? 'ishizumi' : 'koishizumi') : hash3(u, v, dy) % 5 === 0 ? 'koishizumi' : 'akarenga')));
  // 火の 口（はば 3・高さ 2）: 口の 中は くう・おくの 火は 光る・ゆかは 石だたみ
  const M = K.mouth;
  b.clear(M.u0, F.v0 + 1, 1, M.u1, F.v1, 2);
  b.fill(M.u0, F.v0, 1, M.u1, F.v0, 2, T('hi_k'));
  b.put(M.glowU, F.v0, 2, T('hi'));
  b.fill(M.u0, F.v0 + 1, 1, M.u1, F.v0 + 1, 1, T('hi_k'));
  b.fill(M.u0, F.v1, 0, M.u1, F.v1, 0, T('koishizumi'));
  // 口の 上の 黒い 鉄の ひさし
  b.fill(M.u0 - 1, F.v1, 3, M.u1 + 1, F.v1, 3, T('tetsu_hisashi'));
  // えんとつ（太い・高い）と 口
  const C = K.chimney;
  b.fill(C.u0, C.v0, 7, C.u1, C.v1, C.dyTop - 1, (u, v, dy) => T(hash3(u, v, dy) % 6 === 0 ? 'koishizumi' : 'akarenga'));
  b.fill(C.u0, C.v0, C.dyTop, C.u1, C.v1, C.dyTop, T('entotsu_kuchi'));
  // 屋根の 物: たる・はこ・はちうえ
  b.put(34, 3, D.parapetDy, T('taru'));
  b.put(34, 5, D.parapetDy, T('hako'));
  b.put(34, 6, D.parapetDy, T('hako'));
  b.put(41, 7, D.parapetDy, T('hachiue'));
  b.put(41, 2, D.parapetDy, T('hachiue'));
  // かんばん「かじや」（屋根の さくの 前）
  K.sign.ids.forEach((id, i) => b.put(K.sign.u0 + i, K.sign.v, K.sign.dy, T(id)));
  for (const u of [K.sign.u0 - 1, K.sign.u0 + K.sign.ids.length]) b.put(u, K.sign.v, K.sign.dy, T('sign_end_k')); // 両はしの ふた（よこから 見ても 字が かさならない）
  // 入り口の のぼり（オレンジ・かなとこの しるし）と くさりの あんどん
  for (const u of [u0, u1]) {
    b.fill(u, 9, 1, u, 9, 3, T('noboru_aka'));
    b.put(u, 9, 4, T('shubashira'));
  }
  for (const u of [u0 - 1, u1 + 1]) b.put(u, 9, 4, T('tsuri_andon'));
  // ふいご・かなとこ 2・水おけ
  b.put(34, 4, 1, T('fuigo'));
  b.put(36, 7, 1, T('kanatoko_aka'));
  b.put(40, 7, 1, T('kanatoko_aka'));
  b.fill(34, 6, 1, 34, 7, 1, T('mizuoke'));
  // 左右の そで小屋: 石の ゆか・板の かべ・うすい 板ぶきの 屋根（dy 3）
  for (const s of K.sheds) {
    b.fill(s.u0, 4, 0, s.u1, 9, 0, (u, v) => T(WALL_MIX[hash3(u, v, 5) % 4]!));
    b.fill(s.u0, 4, 1, s.u1, 4, 2, T('shubashira')); // うしろ
    b.fill(s.outer, 5, 1, s.outer, 9, 2, T('shubashira')); // そと
    b.fill(s.outer === s.u0 ? s.u1 : s.u0, 9, 1, s.outer === s.u0 ? s.u1 : s.u0, 9, 2, T('shubashira')); // 前の はしら（うちがわ）
    b.fill(s.u0, 4, 3, s.u1, 9, 3, T('shima_lo')); // 朱の しまの ひさし
    // 赤い のれん（前の ふち v 9・dy 3。はしらの ある 列は あけない）
    for (let u = s.u0; u <= s.u1; u++) b.put(u, 9, 3, `${T('noren_hang_aka')}@v+`);
  }
  b.put(30, 8, 1, T('taru'));
  b.put(31, 6, 1, T('hako'));
  b.fill(44, 5, 1, 45, 5, 1, T('yukaita'));
  b.put(44, 5, 2, T('hako'));
  b.put(45, 5, 2, T('maki_yama'));
  for (const u of [44, 45, 46]) b.put(u, 7, 1, T('hako'));
  // 竹
  for (const [u, v, h] of [[28, 0, 6], [27, 1, 5], [47, 0, 7]] as const) b.fill(u, v, 0, u, v, h - 1, T('take'));
}
