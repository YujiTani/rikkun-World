import { Frame, ShaftBuilder } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { Geo, Site } from './mineShaftSite';
import type { ShaftSide } from './mineShaftTypes';
import { build, commit, exitOf, type Hub, type Spec } from './mineSideBuild';
import type { Rng } from './random';

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 自然の ほらあなの 床〔立てる マス〕か（計算だけ） */
function caveFloor(G: Geo, x: number, y: number, z: number): boolean {
  return G.cave.airAt(x, y, z) && G.cave.airAt(x, y + 1, z) && !G.cave.airAt(x, y - 1, z) && y - 1 <= G.h(x, z);
}

interface Found {
  a: number;
  o: number;
  dy: number;
}

/** 出口 s がわの ほらあなの 床を さがす: 前へ a・横へ o・高さ dy */
export function scanFloors(G: Geo, hub: Hub, F: Frame, s: number): Found[] {
  const E = S.side;
  const { tx, tz, c1x, c1z, px, pz } = exitOf(F, hub, s);
  const y = hub.y;
  const found: Found[] = [];
  for (let a = E.aimMin; a <= E.aimMax; a += 2) {
    for (const o of E.aimLateral) {
      for (let dy = -E.jointStepMax; dy <= E.jointStepMax; dy++) {
        const fx = c1x + tx * a + px * o;
        const fz = c1z + tz * a + pz * o;
        if (!caveFloor(G, fx, y + dy, fz)) continue;
        // 1 段 下りる ときは 上も 空いて いる〔頭が ぶつからない〕
        if (dy === -1 && !(G.cave.airAt(fx, y + 1, fz) && G.cave.airAt(fx, y + 2, fz))) continue;
        // 先に 歩ける ひろがりが ある 床だけ〔となりの 4 マスの うち 2 つ いじょうが 床〕
        let nb = 0;
        for (const [ox, oz] of FOUR) if ([0, 1, -1].some((e) => caveFloor(G, fx + ox, y + dy + e, fz + oz))) nb++;
        if (nb >= 2) found.push({ a, o, dy });
      }
    }
  }
  return found;
}

export function* tryAimed(G: Geo, b: ShaftBuilder, hub: Hub, rng: Rng, F: Frame, region: { x0: number; z0: number } | null, site: Site, chestCells: ReadonlySet<number>, s: number, found: Found[]): Generator<void, ShaftSide | null> {
  const E = S.side;
  const { tx, tz, c1x, c1z, px, pz } = exitOf(F, hub, s);
  const y = hub.y;
  for (let t = 0; t < E.aimTries && found.length > 0; t++) {
    const f = found.splice(Math.floor(rng() * found.length), 1)[0]!;
    const m = Math.abs(f.dy) <= E.caveStep ? 0 : Math.abs(f.dy);
    const tail = m > 0 ? E.jointSize + m : 0;
    // 最後の leg の 向き d
    const lateral = Math.abs(f.o) >= 2;
    const d: [number, number] = lateral ? [px * Math.sign(f.o), pz * Math.sign(f.o)] : [tx, tz];
    const center: Spec['center'] = [];
    const corners: Spec['corners'] = [];
    const dirs: [number, number][] = [[tx, tz]];
    let n1: number;
    if (!lateral) {
      n1 = f.a - tail;
      if (n1 < E.legMin) continue;
    } else {
      n1 = f.a + 1;
      dirs.push(d);
    }
    for (let k = 0; k < n1; k++) center.push({ x: c1x + tx * k, z: c1z + tz * k, leg: 0 });
    if (lateral) {
      const nlat = Math.abs(f.o) - 1 - tail;
      if (nlat < 1) continue;
      corners.push({ x: c1x + tx * (n1 - 1), z: c1z + tz * (n1 - 1) });
      for (let j = 1; j <= nlat; j++) center.push({ x: c1x + tx * (n1 - 1) + d[0] * j, z: c1z + tz * (n1 - 1) + d[1] * j, leg: 1 });
    }
    const spec: Spec = { center, dirs, corners, end: m > 0 ? 'joint' : 'cave', stairs: m, stairSgn: f.dy > 0 ? 1 : -1 };
    if (center.some((c) => G.nearMouth(c.x, c.z, 3))) continue;
    yield; // 1 つ ためす ごとに ひと休み
    const c = build(G, b, hub, y, spec, F, region, site, chestCells, rng, s);
    if (c) return commit(b, hub, c, Math.min(E.lengthMax, Math.max(E.lengthMin, center.length + tail)), corners.length, s, F);
  }
  return null;
}
