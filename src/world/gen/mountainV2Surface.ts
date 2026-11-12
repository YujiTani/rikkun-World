import { SEA_Y, type BlockId } from '../../contracts';
import type { CountryKind } from './config';
import { subSeed, valueNoise } from './random';
import { V2_ROCK, V2_SNOW, V2_SURFACE, type MountainKind } from './mountainV2Table';

/**
 * ?mountain=v2: 山の 地面の 材料（形とは べつの 層）。かたむきで かえる。
 * となりの列との高さの差が steep 以上 = 岩、ゆるい・平らな所 = くさ。
 * rockFrom より 上は ゆるい面でも 岩（まわり flatR マスが 平らな 広い 所だけ くさ）。
 * 雪の ある 山（snowFrom）は 雪が まだらに のこる（snowRaw。上ほど 多い・平らな 所は のこる・かたまりで のこる）。
 * 岩は 高さの 帯（ほぼ 水平）と たての すじで いし・つち・せきたん を まぜる（v2RockBlock。新しいブロックは 足さない）。
 * heightAt = (x, z) の 生成の高さ（山の形 ＋ 自然地形）
 */

/** 岩はだの 地面の いちばん上に なる ブロック（いし・つち・せきたん） */
export const V2_ROCK_TOPS: ReadonlySet<BlockId> = new Set<BlockId>(['stone', 'dirt', 'coal_ore']);

/** 岩はだの ブロック（y = 高さ。帯は y で きまる = ほぼ 水平の しま。たての すじは よわい） */
export function v2RockBlock(seed: number, x: number, y: number, z: number): BlockId {
  const R = V2_ROCK;
  const band = valueNoise(subSeed(seed, 917), y, 0.5, R.bandScale);
  const vert = valueNoise(subSeed(seed, 916), x, z, R.vertScale);
  const n = 0.5 + (R.bandMix * band + (1 - R.bandMix) * vert - 0.5) * R.gain;
  const half = 0.16;
  return n > 0.5 + half ? 'dirt' : n < 0.5 - half ? 'coal_ore' : 'stone';
}

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 雪が のこる かくりつ（高さ e = 雪の線から。V2_SNOW.curve の 折れ線） */
function snowP(e: number): number {
  const C = V2_SNOW.curve;
  if (e <= C[0]![0]) return 0;
  for (let i = 1; i < C.length; i++) {
    const [e1, p1] = C[i]!;
    if (e <= e1) {
      const [e0, p0] = C[i - 1]!;
      return p0 + ((p1 - p0) * (e - e0)) / (e1 - e0);
    }
  }
  return C[C.length - 1]![1];
}

const DIR8 = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

/** 1 列の「雪の 元の 判定」（となりの 結果は 見ない）。h(X, Z) = 高さ（まわりを ふくむ） */
function snowRaw(seed: number, S: (typeof V2_SURFACE)[MountainKind], X: number, Z: number, h: (x: number, z: number) => number): boolean {
  const N = V2_SNOW;
  const hc = h(X, Z);
  const line = S.snowFrom + (valueNoise(subSeed(seed, 918), X, Z, N.lineScale) - 0.5) * 2 * N.lineWobble;
  const e = hc - SEA_Y - line;
  if (e <= V2_SNOW.curve[0]![0]) return false;
  const hx1 = h(X + 1, Z);
  const hx0 = h(X - 1, Z);
  const hz1 = h(X, Z + 1);
  const hz0 = h(X, Z - 1);
  const steep = Math.max(Math.abs(hx1 - hc), Math.abs(hx0 - hc), Math.abs(hz1 - hc), Math.abs(hz0 - hc));
  // がけの 足もと（となりが steepSnow 以上 高い）は 岩。段の ふち・てっぺん（となりが 低い だけ）の 平らな 上面には 雪が のる
  if (Math.max(hx1, hx0, hz1, hz0) - hc >= S.steepSnow) return false;
  // 坂の 向き（8 方位）: 長く のばす 向き。ほぼ 平らなら 向きなし
  const B = N.slopeBase;
  const gx = h(X + B, Z) - h(X - B, Z);
  const gz = h(X, Z + B) - h(X, Z - B);
  let along = X;
  let across = Z;
  if (Math.hypot(gx, gz) >= N.slopeMin * 2 * B) {
    const [fx, fz] = DIR8[(Math.round(Math.atan2(gz, gx) / (Math.PI / 4)) + 8) % 8]!;
    along = (X * fx + Z * fz) / N.stretch;
    across = -X * fz + Z * fx;
  }
  const big = valueNoise(subSeed(seed, 919), along, across, N.bigScale);
  const fine = valueNoise(subSeed(seed, 920), along, across, N.fineScale);
  const n = smooth(0.25, 0.75, N.bigMix * big + (1 - N.bigMix) * fine);
  const curve = (hx1 + hx0 + hz1 + hz0) / 4 - hc;
  let cond = steep === 0 ? N.flat : 0;
  if (curve > N.bumpAt) cond += N.hollow;
  else if (curve < -N.bumpAt) cond -= N.bump;
  return n < snowP(e) + cond;
}

const NEAR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
type Raw = (x: number, z: number) => boolean;

/** 1 回め: 元の 判定の となりを 見て、小さな 点・あなを ならす（となりの「結果」でなく「元の 判定」だけを 見る） */
function snowStage1(raw: Raw, X: number, Z: number): boolean {
  let near = 0;
  for (const [dx, dz] of NEAR4) if (raw(X + dx, Z + dz)) near++;
  return raw(X, Z) ? near >= V2_SNOW.minWhite : near === 4;
}

/** 2 回め: 1 回めの 結果の ぽつんと 1 マス・1 マスの あなを さらに ならす（これも 作る 順に よらない） */
function snowFinal(raw: Raw, X: number, Z: number): boolean {
  let near = 0;
  for (const [dx, dz] of NEAR4) if (snowStage1(raw, X + dx, Z + dz)) near++;
  return snowStage1(raw, X, Z) ? near >= 1 : near === 4;
}

export function v2TopBlock(seed: number, kind: CountryKind, x: number, z: number, h: number, heightAt: (x: number, z: number) => number): BlockId {
  const S = V2_SURFACE[kind as MountainKind];
  const rel = h - SEA_Y;
  // となりの 高さは この 列の まわり（半径 4 マス）だけ ためて 使いまわす
  const cache = new Map<number, number>();
  const hAt = (X: number, Z: number): number => {
    if (X === x && Z === z) return h;
    const key = (X - x + 4) * 9 + (Z - z + 4);
    let v = cache.get(key);
    if (v === undefined) {
      v = heightAt(X, Z);
      cache.set(key, v);
    }
    return v;
  };
  let steep = 0;
  for (let k = 0; k < 4; k++) steep = Math.max(steep, Math.abs(hAt(x + (k === 0 ? 1 : k === 1 ? -1 : 0), z + (k === 2 ? 1 : k === 3 ? -1 : 0)) - h));
  const patchy = S.snowFrom < 900;
  if (patchy) {
    if (rel - S.snowFrom > V2_SNOW.curve[0]![0] - V2_SNOW.lineWobble - V2_SNOW.farBelow) {
      const memo = new Map<number, boolean>();
      const raw: Raw = (X, Z) => {
        const key = (X - x + 4) * 9 + (Z - z + 4);
        let v = memo.get(key);
        if (v === undefined) {
          v = snowRaw(seed, S, X, Z, hAt);
          memo.set(key, v);
        }
        return v;
      };
      if (snowFinal(raw, x, z)) return 'snow';
    }
    // 雪が のこらない 所: 高い 所は 岩、低い 所は くさ（ゆるい 所）
    if (steep >= S.steepSnow || rel - S.snowFrom >= V2_SNOW.rockFrom) return v2RockBlock(seed, x, h, z);
  }
  let rock = steep >= S.steep;
  if (!rock && !patchy && rel >= S.rockFrom) {
    for (let k = 0; k < 4 && !rock; k++) rock = Math.abs(hAt(x + (k === 0 ? S.flatR : k === 1 ? -S.flatR : 0), z + (k === 2 ? S.flatR : k === 3 ? -S.flatR : 0)) - h) > 1;
  }
  return rock ? v2RockBlock(seed, x, h, z) : 'grass';
}
