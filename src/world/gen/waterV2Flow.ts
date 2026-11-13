import { SEA_Y } from '../../contracts';
import type { Ground } from './waterV2Kit';
import { WATER_TUNE as T } from './waterV2Table';
import type { Steps } from './waterV2Steps';

/**
 * 川の みちしるべ: 山の すその 平地（または 海）から、まわりの 地面を Dijkstra で ひろげて 「ここから 行くと あと どれだけ」を 全部の 列に 書く。
 * 川は この 数が 小さくなる 向きへ すすむ ので、くぼ地や 尾根で 行きどまりに ならず 遠くても すそへ とどく。
 * 山 1 つに 1 回（結果は 山ごとに 覚える）。マスの 数の 上限は FLOW.maxCells。
 */

const FLOW = T.flow;

export type FlowField = (x: number, z: number) => number;

/** 4 方向 */
const DX = [1, -1, 0, 0] as const;
const DZ = [0, 0, 1, -1] as const;

/** 小さい 順に とりだす 山（距離, 場所）。配列 2 本で 持つ */
class Heap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= k) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  /** いちばん 小さい 場所を とりだす（距離は out[0] に） */
  pop(out: number[]): number {
    const { keys, vals } = this;
    const k0 = keys[0]!;
    const v0 = vals[0]!;
    const k = keys.pop()!;
    const v = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
        if (keys[c]! >= k) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    out[0] = k0;
    return v0;
  }
}

/** 1 マス a から となりの b へ 水が 流れる 道の ねだん。通れなければ Infinity。上りは ほる 深さに 比例して 高い */
function stepCost(ga: number, gb: number): number {
  const up = gb - ga;
  if (up > FLOW.maxCut) return Infinity; // ほりすぎ
  if (-up > T.river.maxDrop) return Infinity; // 深く 落ちる がけ（小さな 滝でも こえられない）
  if (up > 0) return 1 + FLOW.cutCost * up;
  return 1 + FLOW.dropCost * -up;
}

/**
 * みちしるべを 作る。center の まわり radius（チェビシェフ）だけ。goal(x, z) = 川の ゴール（すその 平地・海）、blocked = 通れない 列
 * 返す 関数は、範囲の 外・通れない 列・たどりつけない 列で Infinity。
 */
/** 何マス ごとに 1 回 yield しながら 作る（#187。止まり方で 結果は かわらない。runSteps で 一気に 進めても よい） */
export function* flowFieldSteps(g: Ground, cx: number, cz: number, radius: number, goal: (x: number, z: number) => boolean, blocked: (x: number, z: number) => boolean): Steps<FlowField> {
  const W = 2 * radius + 1;
  const x0 = cx - radius;
  const z0 = cz - radius;
  const dist = new Float32Array(W * W).fill(Infinity);
  const heap = new Heap();
  const gr = new Int16Array(W * W);
  for (let i = 0; i < W * W; i++) {
    if (i % FLOW.sliceRead === 0) yield;
    const x = x0 + (i % W);
    const z = z0 + Math.floor(i / W);
    const h = g(x, z);
    gr[i] = h;
    if (h >= 0 && !blocked(x, z) && (goal(x, z) || h <= SEA_Y + 1)) {
      dist[i] = 0;
      heap.push(0, i);
    }
  }
  const out = [0];
  let budget = FLOW.maxCells;
  let slice = 0;
  while (heap.size > 0 && budget-- > 0) {
    if (++slice % FLOW.slicePop === 0) yield;
    const i = heap.pop(out);
    const d = out[0]!;
    if (d > dist[i]!) continue;
    const x = i % W;
    const z = Math.floor(i / W);
    // i に 流れこむ となり a（a → i）の ねだんで ひろげる
    for (let k = 0; k < 4; k++) {
      const ax = x + DX[k]!;
      const az = z + DZ[k]!;
      if (ax < 0 || az < 0 || ax >= W || az >= W) continue;
      const a = az * W + ax;
      const ga = gr[a]!;
      if (ga < 0 || blocked(x0 + ax, z0 + az)) continue;
      const nd = d + stepCost(ga, gr[i]!);
      if (nd < dist[a]!) {
        dist[a] = nd;
        heap.push(nd, a);
      }
    }
  }
  return (x, z) => {
    const ix = x - x0;
    const iz = z - z0;
    if (ix < 0 || iz < 0 || ix >= W || iz >= W) return Infinity;
    return dist[iz * W + ix]!;
  };
}
