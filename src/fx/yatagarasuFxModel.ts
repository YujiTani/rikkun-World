import type { BowEvent, Vec3 } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';

/**
 * 八咫烏（LEGEND-4 PR2 §3.5・§3.7）の 見た目の 決まり。見た目だけ（当たりには かかわらない）。three なし。
 * - 金の 光（A2）: 八咫烏の 矢（`burst`）が 飛んで いる 間 矢の 先に ついて いく。同時に `boltMax` 本。
 * - むらさきの ほのお（B3）: `yataBurst` の 出来事の 点に `burstSteps` ステップ。同時に `burstMax` こ（古い 物から 消す）。ほのおの わの 半径は 当たりと 同じ `burstRadius`。
 * 「動きを へらす」では ほのおの 絵を 1 コマ（いちばん 大きい ところ）だけ 短く 出す。毎ステップ new しない。
 */
const Y = LEGEND4_TUNING.yatagarasu;
/** 金の 光の コマ数と 1 コマの ステップ数（30fps の 絵を 60 ステップで 2 ステップずつ） */
export const BOLT_FRAMES = 15;
const BOLT_STEPS_PER_FRAME = 2;
/** ほのおの コマ数（52 コマから 1 つ おき） */
export const BURST_FRAMES = 26;
/** 「動きを へらす」で 見せる コマ（輪が いちばん ひろがった ころ） */
const BURST_REDUCED_FRAME = 12;
/** 最後の この ステップ数で すうっと うすく なる */
const BURST_FADE_STEPS = 6;

export interface BoltIn {
  id: number;
  position: Vec3;
  velocity: Vec3;
  burst?: boolean;
}
interface Bolt {
  id: number;
  position: Vec3;
  dir: Vec3;
  frame: number;
}
interface Flame {
  id: number;
  position: Vec3;
  frame: number;
  opacity: number;
  /** はじまって から の ステップ */
  age: number;
}

export interface YataModel {
  step(arrows: readonly BoltIn[], events: readonly BowEvent[], reduced: boolean): void;
  bolts(): readonly Bolt[];
  flames(): readonly Flame[];
}

export function createYataModel(): YataModel {
  const boltList: Bolt[] = [];
  const flameList: Flame[] = [];
  let nextFlame = 1;
  let clock = 0;

  return {
    step(arrows, events, reduced) {
      clock++;
      // 金の 光: 飛んで いる 八咫烏の 矢（新しい 矢から boltMax 本）
      boltList.length = 0;
      for (let i = arrows.length - 1; i >= 0 && boltList.length < Y.boltMax; i--) {
        const a = arrows[i]!;
        if (a.burst !== true) continue;
        const sp = Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) || 1;
        let b = boltPool[boltList.length];
        if (!b) boltPool[boltList.length] = b = { id: 0, position: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, frame: 0 };
        b.id = a.id;
        b.position = a.position;
        b.dir.x = a.velocity.x / sp;
        b.dir.y = a.velocity.y / sp;
        b.dir.z = a.velocity.z / sp;
        b.frame = reduced ? 0 : Math.floor(clock / BOLT_STEPS_PER_FRAME) % BOLT_FRAMES;
        boltList.push(b);
      }
      // むらさきの ほのお
      for (const e of events) {
        if (e.type !== 'yataBurst') continue;
        if (flameList.length >= Y.burstMax) flameList.shift();
        flameList.push({ id: nextFlame++, position: { x: e.position.x, y: e.position.y, z: e.position.z }, frame: 0, opacity: 1, age: 0 });
      }
      let w = 0;
      for (const f of flameList) {
        f.age++;
        if (f.age > Y.burstSteps) continue;
        f.frame = reduced ? BURST_REDUCED_FRAME : Math.min(BURST_FRAMES - 1, Math.floor(((f.age - 1) / Y.burstSteps) * BURST_FRAMES));
        f.opacity = reduced ? 1 : Math.min(1, (Y.burstSteps - f.age + 1) / BURST_FADE_STEPS);
        flameList[w++] = f;
      }
      flameList.length = w;
    },
    bolts: () => boltList,
    flames: () => flameList,
  };
}

const boltPool: Bolt[] = [];
