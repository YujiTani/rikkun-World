import { COUNTRY_KINDS, countryAt, countryCell, takePath, type CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';
import { findSpacing, floraOfColumn, plantsInRect, type PlacedPlant } from './placement';
import { clearingsInRect, spacingAt, type Clearing, type SpacingLevel } from './spacing';
import { COUNTRY_TABLE, countryRow, type CountryRow } from './countryTable';
import { spawnOf } from './terrain';

/**
 * window.__rikkun.biome（VOX-I §8.1）。国の場所を ゲームに聞く。読みこんでいない所でも 答える（生成の計算だけ）。
 *   at(x, z)               → { kind, cx, cz, e, mountain }
 *   here()                 → キャラの足もとの at
 *   find(kind, from?)      → from（なければ スタート）から いちばん近い その国の点 { x, z }
 *   take.path(cx, cz)      → たけやぶ の升目の 道のマス { x, z }[]
 * COUNTRY-1 §8（国の表・見つけた国）:
 *   countries()            → 国の表 12 行 { kind, name, yomi, boss, yokai }[]
 *   country(kind)          → その 1 行
 *   found()                → 見つけた kind の並び（見つけた順）
 *   setFound(kinds)        → 並びを 入れる（記録と実績を しずかに そろえる。harappa は 足さない）
 *   current()              → 今の国の kind（なければ null）
 *   quiet(on)              → しずかモード（on の間は「入った」の判定を しない）
 * FLORA-75 §9（くさ・のばな・間隔のきまり）:
 *   plants(x0, z0, x1, z1) → 四角の中の 木・はな・すすき・たけ・くさ・のばな { type, x, y, z }[]（間隔のきまりの あと）
 *   flora(cx, cz)          → その列の { kusa, nobana, tris }
 *   clearings(x0, z0, x1, z1) → あき地の まん中と 半径 { x, z, r }[]
 *   spacing(x, z)          → { level: 'wide' | 'normal' | 'narrow', v }
 *   findSpacing(level, { from?, kind? }) → その段の 場所（まわり 3×3 列が ぜんぶ その段）。4096 以内に なければ null
 */
export interface BiomeHook {
  countries(): CountryRow[];
  country(kind: CountryKind): CountryRow;
  found(): string[];
  setFound(kinds: readonly string[]): void;
  current(): string | null;
  quiet(on: boolean): void;
  at(x: number, z: number): ReturnType<typeof countryAt>;
  here(): ReturnType<typeof countryAt>;
  find(kind: CountryKind, from?: { x: number; z: number }): { x: number; z: number };
  take: { path(cx: number, cz: number): { x: number; z: number }[] };
  plants(x0: number, z0: number, x1: number, z1: number): PlacedPlant[];
  flora(cx: number, cz: number): { kusa: number; nobana: number; tris: number };
  clearings(x0: number, z0: number, x1: number, z1: number): Clearing[];
  spacing(x: number, z: number): { level: SpacingLevel; v: number };
  findSpacing(level: SpacingLevel, opts?: { from?: { x: number; z: number }; kind?: CountryKind }): { x: number; z: number } | null;
}

/** 升目を渦まきに ひろげて いちばん近い点をさがす（山は 1 つの点を 4 升目が 分けあう） */
export function findCountry(seed: number, kind: CountryKind, from: { x: number; z: number }): { x: number; z: number } {
  if (!COUNTRY_KINDS.includes(kind)) throw new Error(`unknown country kind: ${kind}`);
  const cell = C.biome.cell;
  const i0 = Math.floor((from.x - C.anchor.x) / cell);
  const j0 = Math.floor((from.z - C.anchor.z) / cell);
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  // 升目 r ふくろ先の点は 少なくとも (r − 1) × cell はなれている
  for (let r = 0; r <= 400; r++) {
    if (best !== null && (r - 2) * cell > bestD) break;
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        const c = countryCell(seed, i, j);
        if (c.kind !== kind) continue;
        const d = Math.hypot(c.px - from.x, c.pz - from.z);
        if (d < bestD) {
          bestD = d;
          best = { x: c.px, z: c.pz };
        }
      }
    }
  }
  if (best === null) throw new Error(`country not found: ${kind}`);
  return best;
}

/** 見つけた国の係（つなぎ込みが わたす。COUNTRY-1 §8） */
export interface BiomeCountryPort {
  found(): string[];
  setFound(kinds: readonly string[]): void;
  current(): string | null;
  quiet(on: boolean): void;
}

const copyRow = (r: CountryRow): CountryRow => ({ ...r, yokai: { ...r.yokai } });

export function createBiomeHook(opts: { seed: number; player: () => { x: number; z: number }; countries?: BiomeCountryPort }): BiomeHook {
  const { seed } = opts;
  const port: BiomeCountryPort = opts.countries ?? { found: () => [], setFound: () => {}, current: () => null, quiet: () => {} };
  return {
    countries: () => COUNTRY_TABLE.map(copyRow),
    country: (kind) => {
      const r = countryRow(kind);
      if (!r) throw new Error(`unknown country kind: ${kind}`);
      return copyRow(r);
    },
    found: () => port.found(),
    setFound: (kinds) => port.setFound(kinds),
    current: () => port.current(),
    quiet: (on) => port.quiet(on),
    at: (x, z) => countryAt(seed, x, z),
    here: () => {
      const p = opts.player();
      return countryAt(seed, Math.floor(p.x), Math.floor(p.z));
    },
    find: (kind, from) => {
      const sp = spawnOf(seed);
      return findCountry(seed, kind, from ?? { x: sp.x, z: sp.z });
    },
    take: { path: (cx, cz) => takePath(seed, cx, cz) },
    plants: (x0, z0, x1, z1) => plantsInRect(seed, x0, z0, x1, z1),
    flora: (cx, cz) => floraOfColumn(seed, cx, cz),
    clearings: (x0, z0, x1, z1) => clearingsInRect(seed, x0, z0, x1, z1),
    spacing: (x, z) => spacingAt(seed, x, z),
    findSpacing: (level, o) => findSpacing(seed, level, o),
  };
}
