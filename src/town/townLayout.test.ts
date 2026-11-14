import { describe, expect, it } from 'vitest';
import { CANAL, SURF, at, buildLayout, inLocal } from './townLayout';
import { TOWN } from './townTuning';

/**
 * 街の 形（ローカル座標）のユニット。AC39（用水路の 形）・AC40（12 マス）・AC38 の 形の 分（奥の 列の 手前は ぜんぶ 石がき）・あきち・石どうろう。
 * 数は ぜんぶ townTuning の 表から 読む。
 */
const N = TOWN.size;
const L = buildLayout();
const cells = (pred: (k: number) => boolean): number[] => Array.from({ length: N * N }, (_, k) => k).filter(pred);
const walkCells = cells((k) => L.canal[k] === CANAL.walk);
const waterCells = cells((k) => L.canal[k] === CANAL.water);
const canalCells = cells((k) => L.canal[k] !== CANAL.none);
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const uv = (k: number): { u: number; v: number } => ({ u: k % N, v: Math.floor(k / N) });

function bfs(sources: number[], pass: (k: number) => boolean): Map<number, number> {
  const dist = new Map<number, number>(sources.map((k) => [k, 0]));
  const q = [...sources];
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    const { u, v } = uv(k);
    for (const [du, dv] of D4) {
      if (!inLocal(u + du, v + dv)) continue;
      const nk = at(u + du, v + dv);
      if (dist.has(nk) || !pass(nk)) continue;
      dist.set(nk, dist.get(k)! + 1);
      q.push(nk);
    }
  }
  return dist;
}

describe('AC39 用水路の 形（ローカル）', () => {
  it('歩ける 所（walk）は ぜんぶ 4 方向で 1 つに つながる（水の すじが ふみ板で 切れても）', () => {
    const reach = bfs([walkCells[0]!], (k) => L.canal[k] === CANAL.walk);
    expect(reach.size).toBe(walkCells.length);
  });

  it('水と 通り道に わかれ、水の ふかさ 1 の マスが ある・水の となりは 通り道（はば 1 以上）', () => {
    expect(waterCells.length).toBeGreaterThan(0);
    for (const k of waterCells) {
      const { u, v } = uv(k);
      const n = D4.filter(([du, dv]) => L.canal[at(u + du, v + dv)] === CANAL.walk).length;
      expect(n, `水 (${u}, ${v}) の となりに 通り道`).toBeGreaterThan(0);
    }
  });

  it('みぞの 内がわの はば: 奥 5・西 5・手前 4（表を 読む）', () => {
    const colV = (u: number): number => cells((k) => uv(k).u === u && L.canal[k] !== CANAL.none && uv(k).v < TOWN.layout.northV + TOWN.canal.widthNorth + 3).length;
    expect(colV(TOWN.layout.northUMin + 5)).toBe(TOWN.canal.widthNorth);
    const rowU = (v: number): number => cells((k) => uv(k).v === v && L.canal[k] !== CANAL.none && uv(k).u < TOWN.layout.westU + TOWN.canal.widthWest + 3).length;
    expect(rowU(TOWN.layout.northV + 4 + 20)).toBe(TOWN.canal.widthWest);
    const colF = (u: number): number => cells((k) => uv(k).u === u && L.canal[k] !== CANAL.none && uv(k).v > TOWN.layout.frontV - 3).length;
    expect(colF(TOWN.layout.westU + 20)).toBe(TOWN.canal.widthFront);
  });

  it('みぞの 上の ふちには 石の てすり（橋と 石段の 口 いがい）。橋・石段の 口には ない', () => {
    // 用水路の となりの 道の マスで てすりが ないのは、橋の はば・石段の きりこみ だけ
    for (let k = 0; k < N * N; k++) {
      if (L.canal[k] !== CANAL.none) continue;
      const { u, v } = uv(k);
      const nearCanal = D4.some(([du, dv]) => inLocal(u + du, v + dv) && L.canal[at(u + du, v + dv)] !== CANAL.none);
      if (!nearCanal) continue;
      const inBridgeEdge = L.bridges.some((b) => u >= b.u0 - 1 && u <= b.u1 + 1 && v >= b.v0 - 1 && v <= b.v1 + 1);
      const inStair = L.notch[k] > 0 || L.stairs.some((s) => s.cells.some((c) => c.u === u && c.v === v));
      if (inBridgeEdge || inStair) expect(L.rail[k], `(${u}, ${v}) は 橋か 石段の 口`).toBe(0);
      else expect(L.rail[k], `(${u}, ${v}) に てすり`).toBe(1);
    }
  });

  it('石段は はば 2・上の 口が ある・数は 上限 以下（表）。石段は 橋と かさならない', () => {
    expect(L.stairs.length).toBeGreaterThan(0);
    expect(L.stairs.length).toBeLessThanOrEqual(TOWN.canal.stairMax);
    for (const s of L.stairs) {
      expect(s.cells.length).toBe(TOWN.canal.stairWidth);
      expect(L.canal[at(s.bottom.u, s.bottom.v)], '石段の 下は 通り道').toBe(CANAL.walk);
      expect(L.surf[at(s.top.u, s.top.v)] === SURF.ground || L.surf[at(s.top.u, s.top.v)] === SURF.paveB).toBe(true);
      expect(L.bridge[at(s.top.u, s.top.v)]).toBe(0);
    }
  });
});

describe('AC40 12 マス', () => {
  it('底の どの マス（水も 通り道も）からも 底だけを 歩いて 石段の bottom まで 12 歩 以内', () => {
    const d = bfs(L.stairs.map((s) => at(s.bottom.u, s.bottom.v)), (k) => L.canal[k] !== CANAL.none);
    expect(d.size, '底の ぜんぶが 石段に つながる').toBe(canalCells.length);
    let worst = 0;
    for (const k of canalCells) worst = Math.max(worst, d.get(k) ?? 999);
    expect(worst).toBeLessThanOrEqual(TOWN.canal.stairReachMax);
  });
});

describe('AC38 奥の 列の 形', () => {
  it('奥の 列の 手前がわは ぜんぶ 用水路（橋の 所は 橋）で 石がきに なって いる', () => {
    const T = L.terrace;
    for (let u = T.u0; u <= T.u1; u++) {
      const front = at(u, T.v1 + 1);
      const onBridge = L.bridge[front] === 1;
      expect(L.canal[front] !== CANAL.none || onBridge, `u ${u} の 手前は 用水路か 橋`).toBe(true);
    }
    expect(L.bridges.filter((b) => b.v0 === TOWN.layout.northV).length, '奥の 橋は 3 本').toBe(3);
  });
});

describe('あきち・ひろば・石どうろう', () => {
  it('あきち 3 区画: 12×12・たがいに 重ならず・用水路と 重ならず・街の はんいの 中', () => {
    expect(L.lots.length).toBe(TOWN.lots.count);
    for (const [i, r] of L.lots.entries()) {
      expect(r.u1 - r.u0 + 1).toBe(TOWN.lots.size);
      expect(r.v1 - r.v0 + 1).toBe(TOWN.lots.size);
      expect(r.u0 >= 0 && r.v0 >= 0 && r.u1 < N && r.v1 < N).toBe(true);
      for (let v = r.v0; v <= r.v1; v++) for (let u = r.u0; u <= r.u1; u++) {
        expect(L.canal[at(u, v)]).toBe(CANAL.none);
        expect(L.surf[at(u, v)]).toBe(SURF.lot);
      }
      for (const o of L.lots.slice(i + 1)) expect(r.v1 < o.v0 || o.v1 < r.v0 || r.u1 < o.u0 || o.u1 < r.u0).toBe(true);
    }
  });

  it('ひろばは 32×32 で まん中。石だたみ 3 しゅるいが まざる', () => {
    const P = L.plaza;
    expect(P.u1 - P.u0 + 1).toBe(TOWN.plaza.size);
    const kinds = new Set<number>();
    for (let v = P.v0; v <= P.v1; v++) for (let u = P.u0; u <= P.u1; u++) kinds.add(L.surf[at(u, v)]!);
    expect([...kinds].sort()).toEqual([SURF.paveA, SURF.paveB, SURF.paveC]);
    expect(Math.abs(L.fountain.u - N / 2) <= 2 && Math.abs(L.fountain.v - N / 2) <= 2).toBe(true);
  });

  it('石どうろう 48 こ・門の 前を のぞいて となりどうしが 8 マス 以下', () => {
    expect(L.toro.length).toBe(TOWN.toro.ringCount - TOWN.toro.skipNearGate);
    const near = L.toro.filter((p) => Math.hypot(p.u - L.gate.u, p.v - L.gate.v) < 12).length;
    expect(near).toBeLessThanOrEqual(2);
  });
});
