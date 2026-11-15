import { describe, expect, it } from 'vitest';
import { PLAYER_DEFAULTS } from '../player/config';
import { ATHLETIC } from './townAthletic';
import { townBuildingCells } from './townBuildings';

/** アスレチック（§2.15・AC47）: 表から「スタートから ゴールまで ジャンプで つながる」を しらべる。当たりは ブロック 1 マス */

const cells = townBuildingCells();
const solid = new Set(cells.map((c) => `${c.u},${c.v},${c.dy}`));
const has = (u: number, v: number, dy: number): boolean => dy < 0 ? true : solid.has(`${u},${v},${dy}`);

/** その 列で 立てる 高さ（足もとの 下に ブロック・頭の 上 2 マスが あいている） */
function levels(u: number, v: number): number[] {
  const out: number[] = [];
  for (let dy = -1; dy < 12; dy++) if (has(u, v, dy) && !has(u, v, dy + 1) && !has(u, v, dy + 2)) out.push(dy + 1);
  return out;
}
const columnTop = (u: number, v: number): number => {
  let t = 0;
  for (let dy = 0; dy < 12; dy++) if (has(u, v, dy)) t = dy + 1;
  return t;
};

/** 空中に いる 時間（秒）: 高さ J まで 上がって、足もとが dh だけ 高い 所に おりる まで */
const J = PLAYER_DEFAULTS.jumpHeight;
const G = PLAYER_DEFAULTS.gravity;
const airTime = (dh: number): number => Math.sqrt((2 * J) / G) + Math.sqrt((2 * Math.max(0, J - dh)) / G);
/** あき（空いた マスの 数）の 上限: 歩く はやさ × 空中の 時間 から 足の はばの ぶんを ひく */
const maxGap = (dh: number): number => Math.floor(PLAYER_DEFAULTS.walkSpeed * airTime(dh));
const maxRise = Math.floor(J);

type Node = { u: number; v: number; h: number };
const key = (n: Node): string => `${n.u},${n.v},${n.h}`;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** となりへ 歩く・1〜2 マス あけて ジャンプ・下へ おりる（落下で 体力は へらない）の 辺 */
function next(n: Node): Node[] {
  const out: Node[] = [];
  for (const [du, dv] of DIRS) {
    for (let d = 1; d <= 3; d++) {
      const u = n.u + du * d;
      const v = n.v + dv * d;
      const F = ATHLETIC.fence;
      if (u < F.u0 || u > F.u1 || v < F.v0 || v > F.v1) continue; // かこいの 外は しらべない
      for (const h of levels(u, v)) {
        const dh = h - n.h;
        if (dh > maxRise) continue;
        if (dh < -6) continue; // 6 マスより 高い ところから 直接は おりない
        let open = true; // おりる 先の 上が ふさがって いたら おりられない（やぐらの 下など）
        for (let dy = h; dy <= n.h + 1 && dh < 0; dy++) if (has(u, v, dy)) open = false;
        if (!open) continue;
        if (d === 1) { out.push({ u, v, h }); continue; }
        if (d - 1 > maxGap(Math.max(0, dh))) continue;
        let clear = true;
        for (let k = 1; k < d; k++) if (columnTop(n.u + du * k, n.v + dv * k) > n.h) clear = false;
        if (clear) out.push({ u, v, h });
      }
    }
  }
  return out;
}

function reach(from: Node): Set<string> {
  const seen = new Set<string>([key(from)]);
  const q: Node[] = [from];
  while (q.length) {
    const n = q.shift()!;
    for (const m of next(n)) if (!seen.has(key(m))) { seen.add(key(m)); q.push(m); }
  }
  return seen;
}

describe('アスレチック', () => {
  it('数: くい 12 以上・とび石 4 以上・やぐら 2 ＋ ゴール・つり橋の ゆか 5 以上・すべり台の だん', () => {
    const n = (id: string): number => cells.filter((c) => c.id === id).length;
    const stakes = new Set(cells.filter((c) => c.id === 'town_kui').map((c) => `${c.u},${c.v}`));
    expect(stakes.size).toBeGreaterThanOrEqual(12);
    expect(ATHLETIC.stones.length).toBeGreaterThanOrEqual(4);
    expect(ATHLETIC.stakes.length).toBe(12);
    expect(n('town_taiko')).toBeGreaterThanOrEqual(2); // ゴール 1 ＋ 道場 1
    expect(ATHLETIC.bridge.v1 - ATHLETIC.bridge.v0 + 1).toBeGreaterThanOrEqual(5);
    expect(ATHLETIC.slide.length).toBeGreaterThanOrEqual(3);
  });

  it('ジャンプの 数は 設定から 読む: 高さ 1 まで・あきは 1 マス（高さ 1 の 差）〜 2 マス（ひらたい）', () => {
    expect(maxRise).toBe(1);
    expect(maxGap(1)).toBeGreaterThanOrEqual(1);
    expect(maxGap(0)).toBeGreaterThanOrEqual(2);
  });

  it('スタートから ゴールまで ジャンプで つながる（くい → 丸太 → 石段 → やぐら → つり橋 → やぐら → すべり台 → とび石 → ゴール）', () => {
    const r = reach(ATHLETIC.start);
    expect(r.has(key(ATHLETIC.goal)), 'ゴール').toBe(true);
    // とちゅうの めじるし: 12 本めの くい・丸太の はし・やぐら 2 つ・すべり台の 先・とび石の 先
    const must: Node[] = [
      { u: 83, v: 66, h: 2 },
      { u: 88, v: 66, h: 2 },
      { u: 92, v: 67, h: 5 },
      { u: 92, v: 75, h: 5 },
      { u: 96, v: 75, h: 2 },
      { u: 84, v: 81, h: 1 },
    ];
    for (const m of must) expect(r.has(key(m)), key(m)).toBe(true);
  });

  it('くいの 列は 1 本ずつ たどれる（となりの くいと 1 マスの あき・高さの 差は 1 まで）', () => {
    const s = ATHLETIC.stakes;
    for (let i = 1; i < s.length; i++) {
      const [u0, v0, h0] = s[i - 1]!;
      const [u1, v1, h1] = s[i]!;
      const gap = Math.abs(u1 - u0) + Math.abs(v1 - v0) - 1;
      expect(gap, `くい ${i}`).toBeGreaterThanOrEqual(1);
      expect(gap, `くい ${i}`).toBeLessThanOrEqual(2);
      expect(Math.abs(h1 - h0), `くい ${i} の 高さ`).toBeLessThanOrEqual(1);
    }
  });

  it('落ちても やりなおせる: かこいの 中で 立てる どの 場所からも スタートの 地面へ もどれる', () => {
    const F = ATHLETIC.fence;
    const start = key(ATHLETIC.start);
    const nodes: Node[] = [];
    for (let v = F.v0 + 1; v < F.v1; v++) for (let u = F.u0 + 1; u < F.u1; u++) for (const h of levels(u, v)) if (h <= 5) nodes.push({ u, v, h });
    const back = new Map<string, string[]>();
    for (const n of nodes) for (const m of next(n)) {
      const a = back.get(key(m)) ?? [];
      a.push(key(n));
      back.set(key(m), a);
    }
    const seen = new Set<string>([start]);
    const q = [start];
    while (q.length) for (const p of back.get(q.shift()!) ?? []) if (!seen.has(p)) { seen.add(p); q.push(p); }
    const fwd = reach(ATHLETIC.start); // スタートから 行ける 場所（あみの 下の すき間など 入れない 所は のぞく）
    const lost = nodes.filter((n) => fwd.has(key(n)) && !seen.has(key(n))).map(key);
    expect(nodes.filter((n) => fwd.has(key(n))).length).toBeGreaterThan(100);
    expect(lost).toEqual([]);
  });
});
