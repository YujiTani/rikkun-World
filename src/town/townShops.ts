import { Builder, T } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: ひろばの 奥の かざりの 町家（まちや）2 けん・おちゃや 1 けんと、ひろばの かざりの やたい 2 つの 置き方の 表（ローカル座標 u ＝ 西→東・v ＝ 奥→手前）。
 * どれも 入れない（戸は しまった 形・中は から）。人も いない。店ごとに 形・色・のれん・置き物を かえる（コピーに しない。細かい 作りこみは 門だけ の きまり）。
 * あかり・ベンチは 足さない（数の 上限は townBuildings.test.ts）。置き場所の 表は SHOP_SITES（town.info() も これを 読む）。
 */
export const SHOP_SITES = {
  /** 町家 A: 白い しっくいの 2 かいだて。黒がわらの 寄せむね（かべ u 43〜49・v 24〜26。屋根は 前へ 1 マス）。石段の 口（u 42・56）の あかり・のぼりに かさならない よう よこへは はみ出さない */
  machiyaA: { u0: 43, u1: 49, v0: 24, v1: 26, door: { u: 47, v: 27 } },
  /** おちゃや: ひくい 平屋・かやぶきの 屋根・あい色の のれんと ひさし（かべ u 51〜55・v 24〜26） */
  ochaya: { u0: 51, u1: 55, v0: 24, v1: 26, door: { u: 53.5, v: 27 } },
  /** 町家 B: せまくて 高い 3 かいだて・あおい かわらの とんがり屋根（かべ u 60〜64・v 24〜26）。石段の 口（u 59・65）の あいだ */
  machiyaB: { u0: 60, u1: 64, v0: 24, v1: 26, door: { u: 62.5, v: 27 } },
  /** かざりの やたい 1（おめん）: ひろばの 西。うしろ u 35・前 u 37（東向き）・v 46〜50 */
  decoA: { u0: 35, u1: 37, v0: 46, v1: 50, front: { u: 38, v: 48 } },
  /** かざりの やたい 2（こま・ふうりん）: ひろばの 東。うしろ u 64・前 u 62（西向き）・v 47〜49 */
  decoB: { u0: 62, u1: 64, v0: 47, v1: 49, front: { u: 61, v: 48 } },
} as const;

interface Rect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** 四角を 1 マスずつ すぼめながら 重ねる ぼうし屋根（dy から 上へ）。さいごの 1 まいは top に する */
function hipRoof(b: Builder, r: Rect, dy: number, id: string, top: string = id): void {
  let k = 0;
  for (let u0 = r.u0, v0 = r.v0, u1 = r.u1, v1 = r.v1; u0 <= u1 && v0 <= v1; u0++, v0++, u1--, v1--, k++) {
    const last = u0 + 1 > u1 - 1 || v0 + 1 > v1 - 1;
    b.fill(u0, v0, dy + k, u1, v1, dy + k, last ? top : id);
  }
}

/** かべの 外わく（四辺。中は から） */
function shell(b: Builder, r: Rect, dy0: number, dy1: number, pick: (u: number, v: number, dy: number) => string): void {
  for (let v = r.v0; v <= r.v1; v++) for (let u = r.u0; u <= r.u1; u++) if (u === r.u0 || u === r.u1 || v === r.v0 || v === r.v1) b.fill(u, v, dy0, u, v, dy1, pick);
}

/** 町家 A: 白い しっくいの 2 かいだて。1 かいは 黒い こうし、2 かいに 小さな まど。朱の のれん・うえきばち・雨水の たる。黒がわらの 寄せむね */
function machiyaA(b: Builder): void {
  const S = SHOP_SITES.machiyaA;
  const front = S.v1;
  shell(b, S, 0, 4, (u, v, dy) => (v === front ? (dy <= 1 ? T('koushimado') : T('shikkui')) : u === S.u0 || u === S.u1 ? T('tsuchikabe') : T('shikkui')));
  // 前の かべ: 戸（しまった 板戸）と 2 かいの まど・1 かいと 2 かいの あいだの かわらの ひさし
  b.fill(46, front, 0, 47, front, 1, T('koitabari'));
  for (const u of [44, 48]) b.put(u, front, 3, T('koushimado'));
  b.fill(S.u0, front + 1, 2, S.u1, front + 1, 2, (u) => T(u % 3 === 0 ? 'kawara_ao_lo' : 'kawara_kuro_lo'));
  // のれんは 戸の 前（朱）。うえきばち 2・たる 1・かさ 1
  b.fill(46, front + 1, 1, 47, front + 1, 1, T('noren_shu'));
  for (const u of [S.u0, S.u1]) b.put(u, front + 1, 0, T('hachiue'));
  b.put(44, front + 1, 0, T('taru'));
  b.put(48, front + 1, 0, T('kasa_m'));
  // 寄せむね: 黒がわらを 重ねる（屋根は 前へ 1 マス。よこへは はみ出さない）
  hipRoof(b, { u0: S.u0, v0: S.v0, u1: S.u1, v1: front + 1 }, 5, T('kurokawara'), T('munegawara'));
}

/** おちゃや: つちかべの 平屋に かやぶきの ぼうし屋根。しょうじの 戸（しまって いる）・あい色の のれんと しまの ひさし・赤い かさ・つぼ */
function ochaya(b: Builder): void {
  const S = SHOP_SITES.ochaya;
  const front = S.v1;
  shell(b, S, 0, 2, (_u, v, dy) => (v === front && dy <= 1 ? T('shoji') : T('tsuchikabe')));
  for (const u of [S.u0, 53, S.u1]) b.fill(u, front, 0, u, front, 2, T('hashira'));
  // 前の ひさし（あい色の しましま）と のれん
  b.fill(S.u0, front + 1, 2, S.u1, front + 1, 2, T('shimahisashi_ai'));
  for (const u of [S.u0, S.u1]) b.fill(u, front + 1, 0, u, front + 1, 1, T('hashira'));
  for (const u of [52, 54]) b.put(u, front + 1, 1, T('noren_ai'));
  b.put(53, front + 1, 0, T('hako'));
  b.put(52, front + 1, 0, T('tsubo_a'));
  b.put(54, front + 1, 0, T('kasa_m'));
  hipRoof(b, { u0: S.u0, v0: S.v0, u1: S.u1, v1: front + 1 }, 3, T('kayabuki'));
}

/** 町家 B: 3 かいだての せまい 家。赤い こうしの 戸・つちかべ・あい色の のれん・まど。あおい かわらの とんがり屋根 */
function machiyaB(b: Builder): void {
  const S = SHOP_SITES.machiyaB;
  const front = S.v1;
  shell(b, S, 0, 7, (u, v, dy) => (v === front && dy <= 1 && u !== 62 ? T('akakoushi') : dy === 2 || dy === 5 ? T('koitabari') : T('tsuchikabe')));
  b.fill(62, front, 0, 62, front, 1, T('koitabari'));
  for (const u of [61, 63]) b.fill(u, front, 3, u, front, 4, T('shoji'));
  b.put(62, front, 6, T('koushimado'));
  b.put(62, front + 1, 1, T('noren_ai'));
  for (const u of [S.u0, S.u1]) b.put(u, front + 1, 0, T('pot_big'));
  b.put(61, front + 1, 0, T('kago_m'));
  b.put(63, front + 1, 0, T('ningyo_a'));
  hipRoof(b, { u0: S.u0, v0: S.v0, u1: S.u1, v1: front + 1 }, 8, T('aokawara'), T('munegawara'));
}

/** かざりの やたい 1（おめん）: 東向き。あい色の しましまの 平らな ひさし・うしろの たなに おめんと 人形・前の はこの 上に かさと つぼ・竹の 柱 */
function decoA(b: Builder): void {
  const S = SHOP_SITES.decoA;
  for (const v of [S.v0, S.v1]) for (const u of [S.u0, S.u1]) b.fill(u, v, 0, u, v, 2, T('take'));
  for (const v of [S.v0 + 1, S.v0 + 3]) b.put(S.u0, v, 0, T('omen'));
  b.put(S.u0, S.v0 + 2, 0, T('ningyo_a_t'));
  b.fill(S.u1, S.v0 + 1, 0, S.u1, S.v1 - 1, 0, T('hako'));
  b.put(S.u1, S.v0 + 1, 1, T('tsubo_b_t'));
  b.put(S.u1, S.v0 + 2, 1, T('kasa_m'));
  b.fill(S.u0, S.v0, 3, S.u1 + 1, S.v1, 3, T('shimahisashi_ai'));
}

/** かざりの やたい 2（こま・ふうりん）: 西向き。朱と 黄の しまが 交ごに ならぶ ひさし（まん中が 高い）・前の はこの 上に ふうりん・うしろの たな・かご */
function decoB(b: Builder): void {
  const S = SHOP_SITES.decoB;
  for (const v of [S.v0, S.v1]) for (const u of [S.u0, S.u1]) b.fill(u, v, 0, u, v, 2, T('take'));
  for (let v = S.v0; v <= S.v1; v++) for (let u = S.u0 - 1; u <= S.u1; u++) b.put(u, v, 3 + (v === S.v0 + 1 ? 1 : 0), T(v % 2 === 0 ? 'shimahisashi_shu' : 'shimahisashi_ki'));
  b.put(S.u0, S.v0 + 1, 0, T('hako'));
  b.put(S.u0, S.v0 + 1, 1, T('furin'));
  for (const v of [S.v0, S.v1]) b.put(S.u0 - 1, v, 0, T('kago_m'));
  for (let v = S.v0 + 1; v <= S.v1 - 1; v++) b.put(S.u1, v, 0, T(v % 2 === 0 ? 'tsubo_a_t' : 'ningyo_a_t'));
}

export function buildShops(b: Builder): void {
  machiyaA(b);
  ochaya(b);
  machiyaB(b);
  decoA(b);
  decoB(b);
}
