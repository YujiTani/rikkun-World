import { SEA_Y, WILD_BLOCK } from '../../contracts';
import { takePath, type CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';
import { iwayama, momiji, tengu, yuki } from './countryMountain';
import { cheb, flatness, FEATURE_TUNE, groundAt, isSea, range, rnd, site, MOUNTAIN_TUNE, type CountryFeature, type Ctx, type FeatureSite, type PlacedBlock } from './countryKit';
import { bambooRawHit, plantsOfChunk } from './plants';
import { terrainFor, type Terrain } from './terrain';

export { FEATURE_TUNE, FEATURE_TYPES, type CountryFeature, type FeatureSite, type FeatureType, type PlacedBlock } from './countryKit';

/**
 * 国だけの物 その 1（VOX-I-4a #187。docs/design/VOX-I.md §2.3・§8.3）。
 * 置く場所は (シード, 升目 cx, cz, type) の乱数だけで決まる → 作る順・ほかの列に 関係しない。ブロックは 作らない（場所だけ。
 * 世界に 置くのは countryFeatureBlocks.ts が チャンクごとに する）。読みこんでいない所でも 答える。
 * 6 種: はたけあと・きのこの わ（もり）・ひまわり・かいがら・たけのこ・つきみの いわ。
 * あとの PR（4b・4c）の 種類は 表 FEATURE_TYPES・OWNER・BUILDERS に 足す。
 */

const B = C.biome;

/** 国 → その 国の 物の 基準の マスが 点から 離れる 最大（チェビシェフ）。四角に かからない 升目は 計算しない（ふるい）。置く 物が ない 国は 0 */
const KIND_REACH = {
  harappa: FEATURE_TUNE.reach.hatakeato,
  mori: FEATURE_TUNE.reach.kinokoNoWa,
  ookina: 0,
  hana: FEATURE_TUNE.reach.himawari,
  sunahama: FEATURE_TUNE.kaigara.search + 16,
  susuki: FEATURE_TUNE.reach.tsukimiIwa,
  take: FEATURE_TUNE.reach.takenoko,
  kappa: 0,
  iwayama: Math.max(MOUNTAIN_TUNE.suisho.reach, 40), // 40 = 目じるし（石ぞう・いしの とりい）の さがす はんい
  tengu: MOUNTAIN_TUNE.summitReach + Math.max(MOUNTAIN_TUNE.fallback.touro, MOUNTAIN_TUNE.kaidan.startGap, 34), // 34 = 目じるし（お堂・やぐら・頂上から いどまで）の さがす はんい // 頂上（点から 6）＋ とうろうの さがす はんい 3 ／ かいだんの はじまり 2
  momiji: MOUNTAIN_TUNE.summitReach + MOUNTAIN_TUNE.fallback.oomomiji + 30, // 30 = 目じるし（あずまや・広場の とりいと ほこら・すその いど。頂上から 34）の ぶん // 頂上 ＋ おおもみじの さがす はんい 6
  yuki: MOUNTAIN_TUNE.summitReach + MOUNTAIN_TUNE.fallback.yukidaruma,
} as const satisfies Record<CountryKind, number>;

/** 国 → 物の 足もと（foot の 四角）が 基準の マスから はなれる ぶんの さらなる のび。かいだんの 道が すそまで のびる てんぐの やまだけ 大きい（道の 長さ 上限 ＋ はば） */
const KIND_EXTENT = {
  harappa: 0, mori: 0, ookina: 0, hana: 0, sunahama: 0, susuki: 0, take: 0, kappa: 0, iwayama: 0, momiji: 0, yuki: 0,
  tengu: MOUNTAIN_TUNE.kaidan.maxSteps + MOUNTAIN_TUNE.kaidan.width,
} as const satisfies Record<CountryKind, number>;
/** 足もとの 四角の 半分の 大きさの 上限（つきみの いわ・きのこの わ 7×7 の 半分 3 ＋ よゆう）。基準の マスの 数との ちがい */
const FOOT_HALF = 6; // 目じるし（とりい 11 など）の 半分 5 ＋ よゆう。ひろげても 探す はんいが 広がるだけで 結果は かわらない
const kinds = Object.keys(KIND_REACH) as CountryKind[];
/** 基準の マスの 最大の きょり／足もとの 四角まで 入れた 最大の きょり（升目を 見る はばを きめる） */
const REACH_MAX = Math.max(...kinds.map((k) => KIND_REACH[k]));
const REACH_FOOT_MAX = Math.max(...kinds.map((k) => KIND_REACH[k] + FOOT_HALF + KIND_EXTENT[k]));

// ------------------------------------------------------------------ 1 種ずつ

/** はたけあと: 4×4 が ほぼ 平ら。上を ひくい 方に そろえて つち にし、やせいの やさいを 3〜4 本 */
function hatakeato(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.hatakeato;
  const R = FEATURE_TUNE.reach.hatakeato;
  for (let k = 0; k < FEATURE_TUNE.tries.hatakeato; k++) {
    const x0 = c.px + range(rnd(c, 'hatakeato', 2 * k), -R, R - K.size + 1);
    const z0 = c.pz + range(rnd(c, 'hatakeato', 2 * k + 1), -R, R - K.size + 1);
    if (isSea(c, x0, z0) || flatness(c.T, x0, z0, K.size) > K.flat) continue;
    const hs: number[] = [];
    let ok = true;
    for (let dz = 0; dz < K.size && ok; dz++) for (let dx = 0; dx < K.size && ok; dx++) {
      const h = groundAt(c, x0 + dx, z0 + dz, 'grass', C.strata.landFrom, FEATURE_TUNE.farmClearWild); // はたけあと = やせいの やさいを 持つ
      if (h < 0) ok = false;
      hs.push(h);
    }
    if (!ok) continue;
    const lo = Math.min(...hs);
    const blocks: PlacedBlock[] = [];
    const cells: { x: number; z: number }[] = [];
    hs.forEach((h, n) => {
      const x = x0 + (n % K.size);
      const z = z0 + Math.floor(n / K.size);
      if (h > lo) blocks.push({ x, y: h, z, id: 'air' }); // 高い 方の 上の くさは とる（上が ひくい 方に そろう）
      blocks.push({ x, y: lo, z, id: 'dirt' });
      cells.push({ x, z });
    });
    // やさい: マスを 乱数で ならべかえて 先頭から 3〜4 本（種類も 乱数）
    const order = cells.map((p, n) => ({ p, r: rnd(c, 'hatakeato', 1000 + n) })).sort((a, b) => a.r - b.r);
    const veg = Object.values(WILD_BLOCK);
    const n = range(rnd(c, 'hatakeato', 999), K.veg[0], K.veg[1]);
    for (let q = 0; q < n; q++) blocks.push({ x: order[q]!.p.x, y: lo + 1, z: order[q]!.p.z, id: veg[Math.floor(rnd(c, 'hatakeato', 2000 + q) * veg.length)]! });
    return [site(c, 'hatakeato', x0 + 1, lo + 1, z0 + 1, blocks, [x0, z0, x0 + K.size - 1, z0 + K.size - 1])];
  }
  return [];
}

/** きのこの わ: 7×7 が ほぼ 平ら。まん中から 半径 3 の 8 か所（たて・よこ 3 と ななめ 2,2）の 地面の 上に きのこ 6〜8 本 */
function kinokoNoWa(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.kinoko;
  const R = FEATURE_TUNE.reach.kinokoNoWa;
  const half = (K.size - 1) / 2;
  const ring: readonly (readonly [number, number])[] = [[K.ring, 0], [-K.ring, 0], [0, K.ring], [0, -K.ring], [2, 2], [2, -2], [-2, 2], [-2, -2]];
  for (let k = 0; k < FEATURE_TUNE.tries.kinokoNoWa; k++) {
    const mx = c.px + range(rnd(c, 'kinokoNoWa', 2 * k), -R, R);
    const mz = c.pz + range(rnd(c, 'kinokoNoWa', 2 * k + 1), -R, R);
    if (isSea(c, mx, mz) || flatness(c.T, mx - half, mz - half, K.size) > K.flat) continue;
    const hc = groundAt(c, mx, mz, 'grass');
    if (hc < 0) continue;
    const spots = ring.map(([dx, dz]) => ({ x: mx + dx, z: mz + dz })).map((p) => ({ ...p, h: groundAt(c, p.x, p.z, 'grass') })).filter((p) => p.h >= 0);
    const want = range(rnd(c, 'kinokoNoWa', 999), K.count[0], K.count[1]);
    if (spots.length < K.count[0]) continue;
    const pick = spots.map((p, n) => ({ p, r: rnd(c, 'kinokoNoWa', 1000 + n) })).sort((a, b) => a.r - b.r).slice(0, want);
    const blocks: PlacedBlock[] = pick.map(({ p }) => ({ x: p.x, y: p.h + 1, z: p.z, id: 'kinoko' }));
    return [site(c, 'kinokoNoWa', mx, hc + 1, mz, blocks, [mx - half, mz - half, mx + half, mz + half])];
  }
  return [];
}

/** ひまわり: 地面が くさ・上が あいている・まわり 3×3 が ほぼ 平ら。どうし 4 以上 はなす。1 升目に 3〜5（見つかった 数だけ） */
function himawari(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.himawari;
  const R = FEATURE_TUNE.reach.himawari;
  const out: FeatureSite[] = [];
  const want = range(rnd(c, 'himawari', 999), K.count[0], K.count[1]);
  for (let k = 0; k < FEATURE_TUNE.tries.himawari && out.length < want; k++) {
    const x = c.px + range(rnd(c, 'himawari', 2 * k), -R, R);
    const z = c.pz + range(rnd(c, 'himawari', 2 * k + 1), -R, R);
    if (out.some((s) => cheb(s.x, s.z, x, z) < K.gap)) continue;
    if (isSea(c, x, z) || flatness(c.T, x - 1, z - 1, 3) > K.flat) continue;
    const h = groundAt(c, x, z, 'grass');
    if (h < 0) continue;
    out.push(site(c, 'himawari', x, h + 1, z, [{ x, y: h + 1, z, id: 'himawari' }, { x, y: h + 2, z, id: 'himawari_top' }], [x, z, x, z]));
  }
  return out;
}

/** かいがら: 1 列（16×16）に 2〜4 こ。すなの 上（海から +1〜+7）。列は まん中が その 升目の 列だけ（となりの 升目と かさならない） */
function kaigara(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.kaigara;
  const out: FeatureSite[] = [];
  for (let kz = (c.pz - K.search) >> 4; kz <= (c.pz + K.search) >> 4; kz++) {
    for (let kx = (c.px - K.search) >> 4; kx <= (c.px + K.search) >> 4; kx++) {
      const a = c.T.map.countryAt(kx * 16 + 8, kz * 16 + 8);
      if (a.kind !== c.kind || a.cx !== c.i || a.cz !== c.j) continue;
      if (isSea(c, kx * 16 + 8, kz * 16 + 8, K.above[0]) && isSea(c, kx * 16, kz * 16, K.above[0]) && isSea(c, kx * 16 + 15, kz * 16 + 15, K.above[0])) continue; // 列が 3 点とも 海なら とばす
      const colNo = (kz + 1000) * 4001 + (kx + 1000); // 乱数の 番号を 列ごとに わける
      const want = range(rnd(c, 'kaigara', colNo * 100 + 99), K.perColumn[0], K.perColumn[1]);
      const mine: FeatureSite[] = [];
      for (let k = 0; k < FEATURE_TUNE.tries.kaigara && mine.length < want; k++) {
        const x = kx * 16 + Math.floor(rnd(c, 'kaigara', colNo * 100 + 2 * k) * 16);
        const z = kz * 16 + Math.floor(rnd(c, 'kaigara', colNo * 100 + 2 * k + 1) * 16);
        if (mine.some((s) => s.x === x && s.z === z)) continue;
        const h = groundAt(c, x, z, 'sand', K.above[0]);
        if (h < 0 || h > SEA_Y + K.above[1]) continue;
        mine.push(site(c, 'kaigara', x, h + 1, z, [{ x, y: h + 1, z, id: 'kaigara' }], [x, z, x, z]));
      }
      out.push(...mine);
    }
  }
  return out;
}

/** たけのこ: 道の マスの うち、まわり 5×5 の たけが 多い 所（やぶの おく）。どうし 8 以上 はなす。1 升目に 1〜3（見つかった 数だけ） */
function takenoko(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.takenoko;
  // 陸の マスだけ のこす（海の 升目は ここで 空に なり、たけの しらべを しない）
  const path = takePath(c.T.seed, c.i, c.j).filter((p) => cheb(p.x, p.z, c.px, c.pz) <= FEATURE_TUNE.reach.takenoko && !isSea(c, p.x, p.z));
  if (path.length === 0) return [];
  const half = (K.window - 1) / 2;
  const key = (x: number, z: number): number => (x + 100000) * 200003 + (z + 100000);
  // ① 安い ふるい: たけの こうほ（乱数だけ）が 5×5 に 多い 順に 上から K.verify こ（どうし 近すぎない）
  const rough = path
    .map((p, n) => {
      let score = 0;
      for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) if (bambooRawHit(c.T.seed, p.x + dx, p.z + dz)) score++;
      return { p, n, score };
    })
    .sort((a, b) => b.score - a.score || a.n - b.n);
  const near: typeof rough = [];
  for (const r of rough) {
    if (near.length >= K.verify) break;
    if (near.every((u) => cheb(u.p.x, u.p.z, r.p.x, r.p.z) >= K.gap)) near.push(r);
  }
  // ② 本当の たけ（間隔・地形の あと）を 数える（その 5×5 の まわりの 列だけ 読む）
  const bamboo = new Set<number>();
  const seen = new Set<number>();
  for (const { p } of near) {
    for (let kz = (p.z - half) >> 4; kz <= (p.z + half) >> 4; kz++) {
      for (let kx = (p.x - half) >> 4; kx <= (p.x + half) >> 4; kx++) {
        const ck = key(kx, kz);
        if (seen.has(ck)) continue;
        seen.add(ck);
        for (const q of plantsOfChunk(c.T, kx, kz)) if (q.height > 1) bamboo.add(key(q.x, q.z)); // 高さ 4〜7 = たけ（はな・すすきは 1）
      }
    }
  }
  const start = Math.floor(rnd(c, 'takenoko', 0) * path.length);
  const cand: { x: number; z: number; h: number; score: number; order: number }[] = [];
  for (const { p, n } of near) {
    let score = 0;
    for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) if (bamboo.has(key(p.x + dx, p.z + dz))) score++;
    if (score < K.minBamboo) continue;
    const h = groundAt(c, p.x, p.z, 'grass');
    if (h >= 0) cand.push({ x: p.x, z: p.z, h, score, order: (n + path.length - start) % path.length });
  }
  cand.sort((a, b) => b.score - a.score || a.order - b.order);
  const want = range(rnd(c, 'takenoko', 1), K.count[0], K.count[1]);
  const out: FeatureSite[] = [];
  for (const p of cand) {
    if (out.length >= want) break;
    if (out.some((s) => cheb(s.x, s.z, p.x, p.z) < K.gap)) continue;
    out.push(site(c, 'takenoko', p.x, p.h + 1, p.z, [{ x: p.x, y: p.h + 1, z: p.z, id: 'takenoko' }], [p.x, p.z, p.x, p.z]));
  }
  return out;
}

/** つきみの いわ: 7×7 が ほぼ 平ら（3 以下）。いしの まるい 山（直径 5〜7・高さ 3〜4）。まん中の 地面の 上から つむ */
function tsukimiIwa(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.tsukimi;
  const R = FEATURE_TUNE.reach.tsukimiIwa;
  const half = (K.size - 1) / 2;
  for (let k = 0; k < FEATURE_TUNE.tries.tsukimiIwa; k++) {
    const mx = c.px + range(rnd(c, 'tsukimiIwa', 2 * k), -R, R);
    const mz = c.pz + range(rnd(c, 'tsukimiIwa', 2 * k + 1), -R, R);
    if (isSea(c, mx, mz) || flatness(c.T, mx - half, mz - half, K.size) > K.flat) continue;
    const hc = groundAt(c, mx, mz, 'grass');
    if (hc < 0) continue;
    const d = range(rnd(c, 'tsukimiIwa', 999), K.diameter[0], K.diameter[1]);
    const top = range(rnd(c, 'tsukimiIwa', 998), K.height[0], K.height[1]);
    const rr = d / 2 + 0.5; // 山の 半径（ふちで 高さ 0）
    const blocks: PlacedBlock[] = [];
    let ok = true;
    for (let dz = -half; dz <= half && ok; dz++) {
      for (let dx = -half; dx <= half && ok; dx++) {
        const q = (dx * dx + dz * dz) / (rr * rr);
        if (q >= 1) continue;
        const ht = Math.round(top * (1 - q));
        if (ht < 1) continue;
        const h = groundAt(c, mx + dx, mz + dz, 'grass');
        if (h < 0) {
          ok = false;
          break;
        }
        for (let y = h + 1; y <= hc + ht; y++) blocks.push({ x: mx + dx, y, z: mz + dz, id: 'stone' });
      }
    }
    if (!ok) continue;
    return [site(c, 'tsukimiIwa', mx, hc + 1, mz, blocks, [mx - half, mz - half, mx + half, mz + half])];
  }
  return [];
}

/** 国 → 置く 物を さがす 関数（その 国に 置く 物が なければ null）。足し忘れは 型エラー */
const BUILDERS = {
  harappa: hatakeato,
  mori: kinokoNoWa,
  ookina: null, // 4c: ぬしの木・うろ
  hana: himawari,
  sunahama: kaigara, // 4c: しま
  susuki: tsukimiIwa,
  take: takenoko,
  kappa: null, // 4c: はすの は
  iwayama,
  tengu,
  momiji,
  yuki,
} as const satisfies Record<CountryKind, ((c: Ctx) => FeatureSite[]) | null>;

// ------------------------------------------------------------------ 窓口

const MAX_CELLS = 600;
const memo = new WeakMap<Terrain, Map<number, FeatureSite[]>>();

/** 升目 (i, j) に 置く 物（覚える。Terrain を 作りなおすと 覚えも 空）。山は 2×2 の 左上の 升目だけが 持つ */
export function sitesOfCell(T: Terrain, i: number, j: number): FeatureSite[] {
  let m = memo.get(T);
  if (!m) memo.set(T, (m = new Map()));
  const key = (i + 50000) * 100003 + (j + 50000);
  const hit = m.get(key);
  if (hit) return hit;
  const cell = T.map.cell(i, j);
  const build = cell.startForced || (cell.mountain && (cell.i !== i || cell.j !== j)) ? null : BUILDERS[cell.kind];
  const out = build ? build({ T, i: cell.i, j: cell.j, px: cell.px, pz: cell.pz, kind: cell.kind }) : [];
  if (m.size >= MAX_CELLS) m.delete(m.keys().next().value as number);
  m.set(key, out);
  return out;
}

/** 升目の 範囲を 見て、reach(kind) 以内に 点が ある 升目の 物を 集める。mode = 'base' なら 基準の マスが 四角に 入る 物、'foot' なら 足もとの 四角が 四角に かかる 物 */
function sitesIn(seed: number, x0: number, z0: number, x1: number, z1: number, mode: 'base' | 'foot'): FeatureSite[] {
  const T = terrainFor(seed);
  const extra = mode === 'foot' ? 1 : 0;
  const R = extra === 1 ? REACH_FOOT_MAX : REACH_MAX;
  const cell = B.cell;
  const out: FeatureSite[] = [];
  // 升目 i の 点は [i × cell + pointMin, i × cell + pointMin + pointSpan)。山の 点は 2×2 の まん中（左上の 升目から 1 升目ぶん 右）→ 1 升目 ひろく 見る
  const i0 = Math.floor((x0 - R - B.pointMin - B.pointSpan - C.anchor.x) / cell) - 1;
  const i1 = Math.floor((x1 + R - B.pointMin - C.anchor.x) / cell);
  const j0 = Math.floor((z0 - R - B.pointMin - B.pointSpan - C.anchor.z) / cell) - 1;
  const j1 = Math.floor((z1 + R - B.pointMin - C.anchor.z) / cell);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cl = T.map.cell(i, j);
      if (cl.mountain && (cl.i !== i || cl.j !== j)) continue; // 山は 左上の 升目で 1 回だけ
      const r = KIND_REACH[cl.kind];
      if (r === 0) continue;
      const rr = r + extra * (FOOT_HALF + KIND_EXTENT[cl.kind]);
      if (cl.px + rr < x0 || cl.px - rr > x1 || cl.pz + rr < z0 || cl.pz - rr > z1) continue;
      for (const s of sitesOfCell(T, i, j)) {
        const f = s.foot;
        const hit = mode === 'base' ? s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1 : f[2] >= x0 && f[0] <= x1 && f[3] >= z0 && f[1] <= z1;
        if (hit) out.push(s);
      }
    }
  }
  return out;
}

/** 四角 [x0, x1] × [z0, z1]（ふくむ）の 基準の マスが 入る 物 */
export function featureSitesInRect(seed: number, x0: number, z0: number, x1: number, z1: number): FeatureSite[] {
  return sitesIn(seed, x0, z0, x1, z1, 'base');
}

/** 四角 [x0, x1] × [z0, z1]（ふくむ）に 足もとが かかる 物（チャンクの 生成が 使う。かいだんは 基準の マスから 遠くまで のびる） */
export function featureSitesTouching(seed: number, x0: number, z0: number, x1: number, z1: number): FeatureSite[] {
  return sitesIn(seed, x0, z0, x1, z1, 'foot');
}

/** window.__rikkun.biome.features: 四角の 中の 国だけの 物（VOX-I §8.3）。生成と 同じ 場所 */
export function featuresInRect(seed: number, x0: number, z0: number, x1: number, z1: number): CountryFeature[] {
  return featureSitesInRect(seed, x0, z0, x1, z1).map(({ type, cx, cz, x, y, z }) => ({ type, cx, cz, x, y, z }));
}

/** かいだんの 道（床の ブロックの 場所。頂上がわの はしから すそへ 1 歩ずつ、1 歩に 2 マス）。かいだん 以外・ない 時は 空 */
export function kaidanPath(seed: number, f: CountryFeature): { x: number; y: number; z: number }[] {
  if (f.type !== 'kaidan') return [];
  const s = sitesOfCell(terrainFor(seed), f.cx, f.cz).find((q) => q.type === 'kaidan' && q.x === f.x && q.z === f.z);
  return s?.path ? s.path.map((p) => ({ ...p })) : [];
}
