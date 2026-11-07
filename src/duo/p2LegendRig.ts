/**
 * COOP-1 4d-2 のユニットテスト用: 2P 用の わざ `createP2Legend`（src/duo/p2Legend.ts）を 1 ステップずつ 動かす 道具（テスト専用）。
 * 1P の 部品や 世界の にせものは p2LegendKit.ts（こちらは p2Legend を 読まない ので、実装の 前でも 1P 側の テストは 動く）。
 */
import type { ItemId, YokaiInfo } from '../contracts';
import type { ImpactLevel } from '../fx/impact';
import type { LegendLoopHandle, LegendLoopName, LegendStepCtx } from '../legend/LegendSystem';
import type { WaveView3D } from '../legend/WaveSystem';
import { S, baseCtx, camSpy, fakeYokai, makeWorld, POS, wearing } from './p2LegendKit';
import { createP2Legend, type P2BladeNow } from './p2Legend';
import { DUO_TUNING } from './tuning';

export const IDLE_BLADE: P2BladeNow = { item: null, tech: null, phase: 'idle', frame: 0, startup: 0, dirDeg: 0 };

export interface P2Opts {
  list?: YokaiInfo[];
  arms?: ItemId | null;
  /** 2P の カメラの ふだんの きょり（既定 DUO_TUNING.cameraSplit） */
  base?: number;
  item: ItemId;
  power?: number | null;
  /** 2P の カメラの 口の かわり（本物の P2CamFx を わたす とき） */
  camFx?: { setDistance(d: number | null): void };
  /** 2P の カメラ（真空波の 絵の 向き face を きめる。P2LegendDeps.view） */
  view?: () => WaveView3D | null;
  /** 続く 音の にせもの（loopSpy()） */
  loops?: ReturnType<typeof loopSpy>;
}

/** 続く 音の にせもの: 始めた 名前と、止められた 名前を きろくする（P2Legend.dispose の ユニット用） */
export function loopSpy() {
  const started: Array<{ name: string; stopped: number }> = [];
  return {
    started,
    loop: (name: LegendLoopName): LegendLoopHandle => {
      const h = { name: name as string, stopped: 0 };
      started.push(h);
      return { stop: () => void (h.stopped += 1) };
    },
    spiralSound: (): LegendLoopHandle => {
      const h = { name: 'spiralWind', stopped: 0 };
      started.push(h);
      return { stop: () => void (h.stopped += 1) };
    },
    /** 始めた のに まだ 止めて いない 音 */
    running: () => started.filter((h) => h.stopped === 0).map((h) => h.name),
  };
}

/** 2P 用 わざを 組んで 1 ステップずつ 動かす */
export function makeP2(o: P2Opts) {
  const world = makeWorld();
  const y = fakeYokai(o.list ?? []);
  const wears: number[] = [];
  const levels: ImpactLevel[] = [];
  const cam = camSpy();
  let tick = 0;
  let item = o.item;
  const p2 = createP2Legend({
    world,
    yokai: () => y.world,
    settings: S,
    tick: () => tick,
    armor: wearing(o.arms ?? null),
    wear: (n) => wears.push(n),
    camFx: o.camFx ?? cam,
    impact: { hit: (l) => levels.push(l) },
    baseDistance: () => o.base ?? DUO_TUNING.cameraSplit,
    position: () => POS,
    seed: 1,
    ...(o.view ? { view: o.view } : {}),
    ...(o.loops ? { loop: o.loops.loop, spiralSound: o.loops.spiralSound } : {}),
  });
  const ctx = (c: Partial<LegendStepCtx> = {}): LegendStepCtx => ({ ...baseCtx(item, o.power ?? 10), ...c });
  /** 1 ステップ: 入力（legend.step）→ 毎ステップの まとめ（p2.step）。blade は 刀の 今の ようす */
  const step = (c: Partial<LegendStepCtx> = {}, blade: Partial<P2BladeNow> = {}) => {
    tick += 1;
    const r = p2.legend.step(ctx(c));
    const events = p2.step({ ...IDLE_BLADE, item, ...blade });
    return { r, events };
  };
  return { p2, y, wears, levels, cam, world, step, setItem: (i: ItemId) => (item = i), tick: () => tick };
}
export type P2Rig = ReturnType<typeof makeP2>;

