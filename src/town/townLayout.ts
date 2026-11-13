import { TOWN } from './townTuning';

/**
 * TOWN-1 1B-1: 街の 形（ローカル座標 u ＝ 西→東・v ＝ 奥→手前。0〜99）。世界の 高さ・向きには 関係しない（どの シードでも 同じ 形）。
 * 世界への うつし（向き・高さ）は townPlan.ts。ここは 面の しゅるい・用水路・橋・石段・てすり・あきち・石どうろうの 場所だけ 決める。
 */

const N = TOWN.size;
export const at = (u: number, v: number): number => v * N + u;
export const inLocal = (u: number, v: number): boolean => u >= 0 && v >= 0 && u < N && v < N;

/** 面の しゅるい（地面の 上の いちばん 上） */
export const SURF = {
  /** 街の 地面（つち） */
  ground: 0,
  /** 石だたみ（3 しゅるい: 1・2・3） */
  paveA: 1,
  paveB: 2,
  paveC: 3,
  /** あきち（ふつうの つち。ほれる・おける） */
  lot: 4,
  /** 奥の 列（高さ +1） */
  terrace: 5,
} as const;

/** 用水路の 底の しゅるい */
export const CANAL = { none: 0, walk: 1, water: 2 } as const;

export interface Rect {
  u0: number;
  v0: number;
  /** ふくむ */
  u1: number;
  v1: number;
}

export interface Stair {
  /** 底の 通り道で 石段の すぐ 前の マス（歩いて 12 マス 以内 の 目じるし） */
  bottom: { u: number; v: number };
  /** 上の 口（地面の マス） */
  top: { u: number; v: number };
  /** のぼる 向き（岸の ほうへ。単位ベクトル） */
  dir: { du: number; dv: number };
  /** 石段の 2 マス ぶん（はばの 向きの 2 つ） */
  cells: { u: number; v: number }[];
}

export interface Layout {
  surf: Uint8Array;
  canal: Uint8Array;
  /** 橋の ふみ板（地面と 同じ 高さ）が かかる 用水路の マス */
  bridge: Uint8Array;
  /** 石段に きりこむ マスの だん（1〜stairCut。0 ＝ きりこまない） */
  notch: Uint8Array;
  /** 石の てすりが 立つ マス（用水路の ふち） */
  rail: Uint8Array;
  /** 用水路の かべの 石（底の 上まで ぜんぶ 石づみに する 列） */
  wall: Uint8Array;
  bridges: Rect[];
  stairs: Stair[];
  lots: Rect[];
  terrace: Rect;
  plaza: Rect;
  /** 街の まん中の マス（ふんすいの 場所） */
  fountain: { u: number; v: number };
  /** おふだで もどる マス（ふんすいの 前 = 門の がわの 2 マス 前） */
  plazaStand: { u: number; v: number };
  /** 門の まん中の マス（手前の ふち） */
  gate: { u: number; v: number };
  /** ふちの 石どうろう（ふちの マス） */
  toro: { u: number; v: number }[];
}

interface Seg {
  /** 'u' ＝ 長さの 向きが u（奥・手前の みぞ）、'v' ＝ 長さの 向きが v（西の みぞ） */
  axis: 'u' | 'v';
  aMin: number;
  aMax: number;
  cMin: number;
  cMax: number;
  /** 石段の きりこむ 向き（横ぎりの 向き。+1 ＝ c が ふえる 向き） */
  side: 1 | -1;
  bridges: readonly number[];
}

/** 用水路の 3 本（奥・西・手前）。奥 5・西 5・手前 4 は §4.5c */
function segments(): Seg[] {
  const L = TOWN.layout;
  const C = TOWN.canal;
  return [
    { axis: 'u', aMin: L.northUMin, aMax: L.northUMax, cMin: L.northV, cMax: L.northV + C.widthNorth - 1, side: 1, bridges: L.bridgesNorth },
    { axis: 'v', aMin: L.northV, aMax: L.frontV + C.widthFront - 1, cMin: L.westU, cMax: L.westU + C.widthWest - 1, side: -1, bridges: L.bridgesWest },
    { axis: 'u', aMin: L.westU, aMax: L.frontUMax, cMin: L.frontV, cMax: L.frontV + C.widthFront - 1, side: -1, bridges: L.bridgesFront },
  ];
}

const cellOf = (s: Seg, a: number, c: number): { u: number; v: number } => (s.axis === 'u' ? { u: a, v: c } : { u: c, v: a });

/** 石段 1 つ ぶんの マス */
function makeStair(s: Seg, a: number): Stair {
  const C = TOWN.canal;
  const edgeC = s.side === 1 ? s.cMax : s.cMin;
  const dirC = s.side;
  const w = (k: number): { u: number; v: number } => cellOf(s, a + k, edgeC);
  const step = (k: number, n: number): { u: number; v: number } => cellOf(s, a + k, edgeC + dirC * n);
  const dir = s.axis === 'u' ? { du: 0, dv: dirC } : { du: dirC, dv: 0 };
  const cells = Array.from({ length: C.stairWidth }, (_, k) => step(k, 1));
  return { bottom: w(0), top: step(0, C.stairCut + 1), dir, cells };
}

export function buildLayout(): Layout {
  const surf = new Uint8Array(N * N).fill(SURF.ground);
  const canal = new Uint8Array(N * N);
  const bridge = new Uint8Array(N * N);
  const notch = new Uint8Array(N * N);
  const rail = new Uint8Array(N * N);
  const wall = new Uint8Array(N * N);
  const C = TOWN.canal;
  const T = TOWN.terrace;
  const L = TOWN.layout;
  const segs = segments();

  // 奥の 列（石がきの 上）
  const terrace: Rect = { u0: L.northUMin, v0: 0, u1: T.width - 1, v1: T.depth - 1 };
  for (let v = terrace.v0; v <= terrace.v1; v++) for (let u = terrace.u0; u <= terrace.u1; u++) surf[at(u, v)] = SURF.terrace;

  // ひろば（まん中の 石だたみ）。3 しゅるいを まぜる
  const half = TOWN.plaza.size / 2;
  const mid = N / 2;
  const plaza: Rect = { u0: mid - half, v0: mid - half, u1: mid + half - 1, v1: mid + half - 1 };
  for (let v = plaza.v0; v <= plaza.v1; v++) {
    for (let u = plaza.u0; u <= plaza.u1; u++) {
      const h = (Math.imul(u, 73856093) ^ Math.imul(v, 19349663)) >>> 0;
      surf[at(u, v)] = h % 7 < 3 ? SURF.paveA : h % 7 < 5 ? SURF.paveB : SURF.paveC;
    }
  }
  // 門から ひろばへの 道（はば 3。石だたみ B）
  const g = { u: mid, v: N - 1 };
  const rw = TOWN.roadWidth;
  for (let v = plaza.v1 + 1; v < N; v++) for (let u = g.u - Math.floor(rw / 2); u <= g.u + Math.floor(rw / 2); u++) surf[at(u, v)] = SURF.paveB;

  // あきち 3 区画（西の 列）
  const lots: Rect[] = [];
  for (let k = 0; k < TOWN.lots.count; k++) {
    const v0 = TOWN.lots.v + k * (TOWN.lots.size + TOWN.lots.gap);
    const r: Rect = { u0: TOWN.lots.u, v0, u1: TOWN.lots.u + TOWN.lots.size - 1, v1: v0 + TOWN.lots.size - 1 };
    lots.push(r);
    for (let v = r.v0; v <= r.v1; v++) for (let u = r.u0; u <= r.u1; u++) surf[at(u, v)] = SURF.lot;
  }

  // 用水路: 3 本を 重ねる。底は 水の すじ（c の まん中）と 両がわの 通り道
  // 水の すじは 「その 場所を ふくむ みぞ ぜんぶ」が 水と する マスだけ（まじわりの 所は 水が 切れて 通り道が つながる）
  const waterVotes = new Map<number, number>();
  const canalSet = new Set<number>();
  const hits = new Map<number, number>();
  for (const s of segs) {
    const waterC = s.cMin + Math.floor((s.cMax - s.cMin + 1 - C.waterWidth) / 2);
    for (let a = s.aMin; a <= s.aMax; a++) {
      for (let c = s.cMin; c <= s.cMax; c++) {
        const p = cellOf(s, a, c);
        const k = at(p.u, p.v);
        canalSet.add(k);
        hits.set(k, (hits.get(k) ?? 0) + 1);
        if (c >= waterC && c < waterC + C.waterWidth) waterVotes.set(k, (waterVotes.get(k) ?? 0) + 1);
      }
    }
  }
  const waterSet = new Set<number>([...waterVotes].filter(([k, n]) => n === hits.get(k)).map(([k]) => k));
  for (const k of canalSet) canal[k] = waterSet.has(k) ? CANAL.water : CANAL.walk;
  // 水の すじを 石の ふみ板で こえる: ある 間かくごと と 3 本の まじわる マス
  for (const s of segs) {
    const waterC = s.cMin + Math.floor((s.cMax - s.cMin + 1 - C.waterWidth) / 2);
    for (let a = s.aMin; a <= s.aMax; a++) {
      if ((a - s.aMin) % C.plankEvery !== Math.floor(C.plankEvery / 2)) continue;
      for (let c = waterC; c < waterC + C.waterWidth; c++) {
        const p = cellOf(s, a, c);
        canal[at(p.u, p.v)] = CANAL.walk;
      }
    }
  }
  // まじわり（奥の みぞと 西の みぞ・西の みぞと 手前の みぞ）の まん中は ふみ板
  for (const [u, v] of [[L.westU + 2, L.northV + 2], [L.westU + 2, L.frontV + 1]] as const) canal[at(u, v)] = CANAL.walk;
  // 水の すじが ふみ板で 切れた あとの 水の マスで 通り道に ふくまれない 孤立した 水は なし（水は すじ ぜんぶが つながって いなくて よい）

  // 橋: 用水路の はばを わたる ふみ板（地面と 同じ 高さ）。はば 3
  const bridges: Rect[] = [];
  for (const s of segs) {
    for (const b of s.bridges) {
      const a = cellOf(s, b, s.cMin);
      const z = cellOf(s, b + C.bridgeWidth - 1, s.cMax);
      bridges.push({ u0: Math.min(a.u, z.u), v0: Math.min(a.v, z.v), u1: Math.max(a.u, z.u), v1: Math.max(a.v, z.v) });
      for (let aa = b; aa < b + C.bridgeWidth; aa++) {
        for (let c = s.cMin; c <= s.cMax; c++) {
          const p = cellOf(s, aa, c);
          bridge[at(p.u, p.v)] = 1;
        }
      }
      // 橋の 両はしは 石だたみに する（道）
      for (const c of [s.cMin - 1, s.cMax + 1]) {
        for (let aa = b; aa < b + C.bridgeWidth; aa++) {
          const p = cellOf(s, aa, c);
          if (inLocal(p.u, p.v) && surf[at(p.u, p.v)] === SURF.ground) surf[at(p.u, p.v)] = SURF.paveB;
        }
      }
    }
  }

  // 石段: 岸に きりこむ（たて 4 だん ＋ 地面 1）。はばは 2
  const stairs: Stair[] = [];
  const blocked = (u: number, v: number): boolean =>
    !inLocal(u, v) || canalSet.has(at(u, v)) || surf[at(u, v)] === SURF.lot || (u >= plaza.u0 - 1 && u <= plaza.u1 + 1 && v >= plaza.v0 - 1 && v <= plaza.v1 + 1) || lots.some((r) => u >= r.u0 - 1 && u <= r.u1 + 1 && v >= r.v0 - 1 && v <= r.v1 + 1);
  // 候補: みぞの はしを のぞく 場所で、橋・ほかの みぞ・あきち・ひろばに かからない 所
  interface Cand { seg: Seg; a: number; cover: Set<number>; keys: number[] }
  const cands: Cand[] = [];
  for (const s of segs) {
    for (let a = s.aMin + 1; a + C.stairWidth - 1 <= s.aMax - 1; a++) {
      if (!s.bridges.every((b) => a + C.stairWidth - 1 < b - 1 || a > b + C.bridgeWidth)) continue;
      const edgeC = s.side === 1 ? s.cMax : s.cMin;
      const keys: number[] = [];
      let ok = true;
      for (let k = 0; k < C.stairWidth && ok; k++) for (let n = 1; n <= C.stairCut + 1; n++) {
        const p = cellOf(s, a + k, edgeC + s.side * n);
        if (blocked(p.u, p.v) || p.u < 1 || p.v < 1) { ok = false; break; }
        keys.push(at(p.u, p.v));
      }
      // 上り口の りょうわき（あかり・のぼり）の マスも 空いて いる こと
      for (const k of [-1, C.stairWidth]) {
        const p = cellOf(s, a + k, edgeC + s.side * (C.stairCut + 1));
        if (!inLocal(p.u, p.v) || canalSet.has(at(p.u, p.v)) || surf[at(p.u, p.v)] === SURF.lot) ok = false;
        else keys.push(at(p.u, p.v));
      }
      if (!ok) continue;
      // この 石段の 下の マス（bottom）から 底を 歩いて 12 歩 以内の マス
      const b0 = makeStair(s, a).bottom;
      const cover = new Set<number>([at(b0.u, b0.v)]);
      let frontier = [at(b0.u, b0.v)];
      for (let step = 0; step < C.stairReachMax && frontier.length > 0; step++) {
        const next: number[] = [];
        for (const k of frontier) {
          for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nu = (k % N) + du;
            const nv = Math.floor(k / N) + dv;
            if (!inLocal(nu, nv)) continue;
            const nk = at(nu, nv);
            if (canal[nk] === CANAL.none || cover.has(nk)) continue;
            cover.add(nk);
            next.push(nk);
          }
        }
        frontier = next;
      }
      cands.push({ seg: s, a, cover, keys });
    }
  }
  // ぜんぶの マスが 12 歩 以内に なるまで、いちばん たくさん あたらしく とどく 候補から えらぶ（ばらつき: 同じ なら はしに 近い 方）
  const uncovered = new Set<number>(canalSet);
  const chosen: Cand[] = [];
  const taken = new Set<number>();
  while (uncovered.size > 0 && chosen.length < C.stairMax * 2) {
    let best: Cand | null = null;
    let bestN = 0;
    for (const c of cands) {
      if (c.keys.some((k) => taken.has(k))) continue;
      let n = 0;
      for (const k of c.cover) if (uncovered.has(k)) n++;
      if (n > bestN) {
        bestN = n;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
    for (const k of best.keys) taken.add(k);
    for (const k of best.cover) uncovered.delete(k);
  }
  chosen.sort((x, y) => segs.indexOf(x.seg) - segs.indexOf(y.seg) || x.a - y.a);
  for (const c of chosen) {
    const s = c.seg;
    const st = makeStair(s, c.a);
    stairs.push(st);
    const edgeC = s.side === 1 ? s.cMax : s.cMin;
    for (let k = 0; k < C.stairWidth; k++) {
      for (let n = 1; n <= C.stairCut; n++) {
        const p = cellOf(s, c.a + k, edgeC + s.side * n);
        notch[at(p.u, p.v)] = n;
      }
    }
  }

  // 用水路の かべの 石づみ（みぞの まわり 1 マス）と てすり（みぞの 上の ふち。橋・石段の 口だけ あける）
  for (const k of canalSet) {
    const u = k % N;
    const v = Math.floor(k / N);
    for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nu = u + du;
      const nv = v + dv;
      if (!inLocal(nu, nv)) continue;
      const nk = at(nu, nv);
      if (canalSet.has(nk)) continue;
      wall[nk] = 1;
      if (notch[nk] === 0) rail[nk] = 1;
    }
  }
  // 橋の 両はしは てすりを あける（橋の 幅の ぶん）
  for (const b of bridges) {
    for (let v = b.v0 - 1; v <= b.v1 + 1; v++) for (let u = b.u0 - 1; u <= b.u1 + 1; u++) if (inLocal(u, v) && !canalSet.has(at(u, v))) rail[at(u, v)] = 0;
  }
  // 石段の 口の まわり（きりこんだ 側面は 石の かべ）
  for (const st of stairs) for (const c of st.cells) rail[at(c.u, c.v)] = 0;

  // ふちの 石どうろう: まわり 396 マスに ringCount 個、門の 前の 2 こを ぬく
  const ring: { u: number; v: number }[] = [];
  for (let u = 0; u < N; u++) ring.push({ u, v: 0 });
  for (let v = 1; v < N; v++) ring.push({ u: N - 1, v });
  for (let u = N - 2; u >= 0; u--) ring.push({ u, v: N - 1 });
  for (let v = N - 2; v >= 1; v--) ring.push({ u: 0, v });
  const toroAll = Array.from({ length: TOWN.toro.ringCount }, (_, k) => ring[Math.round((k * ring.length) / TOWN.toro.ringCount) % ring.length]!);
  const byGate = toroAll.map((p, i) => ({ i, d: Math.hypot(p.u - g.u, p.v - g.v) })).sort((a, b) => a.d - b.d);
  const skip = new Set(byGate.slice(0, TOWN.toro.skipNearGate).map((x) => x.i));
  const toro = toroAll.filter((_, i) => !skip.has(i));

  return {
    surf, canal, bridge, notch, rail, wall, bridges, stairs, lots, terrace, plaza,
    fountain: { u: mid, v: mid },
    plazaStand: { u: mid, v: mid + 8 },
    gate: g,
    toro,
  };
}
