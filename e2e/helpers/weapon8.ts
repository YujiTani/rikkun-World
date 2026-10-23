import { expect, type Page } from '@playwright/test';
import { markLegend, type LegendEvent } from './legend';
import type { Vec3 } from './blade';

/**
 * WEAPON-8（風神剣の ためわざ「らせんの かぜ」・ため中の 手もとの 光・ため音・速さバフの アイコン。docs/design/WEAPON-8.md §7）の E2E 用の 道具。
 * 数（F・半径・ダメージ・色）は 決め打ちせず ゲーム（window.__rikkun）に 聞く:
 * `legend.state()`・`legend.events()`・`legend.waves()`・`legend.debris()`・`legend.chargeFx()`・`legend.chargeSound()`・
 * `player.handPos()`・`ui.buffs()`・`combat.sounds()`・`renderStats()`。
 * 実装の 前は 窓口（`legend.chargeFx` ほか）が ない ので、`expectW8Hook` で 赤に なる。
 * F の 数え方: `chargeRun8(page, down)` で i = 0 〜 down − 1 が ためF 1 〜 down、i = down が わざの F1（= ためF の はなす ステップ）。
 * つまり わざの F は 記録の i = down + F − 1。`fIndex(down, F)` で 引く。
 */

export interface ChargeFx {
  phase: 'off' | 'gather' | 'full';
  palette: 'fujin' | 'raijin' | 'niji' | null;
  alpha: number;
  particles: number;
  /** 0 なし・2 光りはじめの 1 ステップ・1 そのあと（またたく） */
  hand: number;
  handCore: number;
  handRing: number;
  F: number;
  center: Vec3 | null;
  chest: Vec3 | null;
  screen: { x: number; y: number } | null;
}

export interface ChargeSound {
  rise: 'off' | 'on' | 'fading';
  hold: 'off' | 'on' | 'fading';
}

export interface BuffRow {
  id: 'speed';
  item: string;
  mul: number;
  shown: boolean;
  scale: number;
  opacity: number;
}

export interface WaveRow {
  id: number;
  kind: 'wave' | 'spiral';
  position: Vec3;
  dir: Vec3;
  traveled: number;
  age: number;
  spin: number;
  drawPos: Vec3;
  face: number | null;
  bodyAlpha: number | null;
  backAlpha: number | null;
}

export interface W8Step {
  tick: number;
  move: string | null;
  moveF: number;
  /** このステップで 新しく 出た legend の 出来事 */
  events: LegendEvent[];
  /** このステップで 新しく 鳴った 音 */
  sounds: string[];
  fx: ChargeFx;
  /** `player.handPos()`（剣を 持つ 手） */
  hand: { world: Vec3; screen: { x: number; y: number } | null };
  snd: ChargeSound;
  buffs: BuffRow[];
  /** DOM の `[data-buff="speed"]` の 数 */
  buffDom: number;
  waves: WaveRow[];
  debris: { alive: number; ground: string | null; smoke: number } | null;
  /** 地面の ねらい（雷神剣の わ）が 出ているか */
  aimOn: boolean;
  hp: Record<number, number>;
  pos: Vec3;
  bladeF: number;
  bladeTech: string | null;
  /** perf = true の ときだけ */
  calls?: number;
  triangles?: number;
  points?: number;
  geometries?: number;
  textures?: number;
}

/** 窓口が あるか（実装の 前は ここで 落ちる） */
export async function expectW8Hook(page: Page): Promise<void> {
  const miss = await page.evaluate(() => {
    const h = window.__rikkun! as any;
    const need: [string, unknown][] = [
      ['legend.chargeFx', h.legend?.chargeFx],
      ['legend.chargeSound', h.legend?.chargeSound],
      ['legend.debris', h.legend?.debris],
      ['player.handPos', h.player?.handPos],
      ['ui.buffs', h.ui?.buffs],
    ];
    return need.filter(([, f]) => typeof f !== 'function').map(([n]) => n);
  });
  expect(miss, `window.__rikkun に まだ ない 窓口（仕様書 WEAPON-8 §7）: ${miss.join('、')}`).toEqual([]);
}

/**
 * n ステップ 1 ステップずつ きろくする。before は 各ステップの「前」の 動き（文字の 関数 `(h, i) => {}`）。perf = true で 描画回数も。
 * every = k なら 描いて 数えるのは k ステップに 1 回と 最後だけ（描くのは SwiftShader で 重い。#269）。
 * 出ては 消える物も 1 回は 描かれるので、捨てわすれ（ジオメトリの ふえ）は 見のがさない。数が 入るのは 描いた ステップだけ。
 */
export async function rec8(page: Page, n: number, before?: string, perf = false, every = 1): Promise<W8Step[]> {
  return page.evaluate(
    ({ n, before, perf, every }) => {
      const h = window.__rikkun! as any;
      const b = before ? (0, eval)(before) : null;
      const out: any[] = [];
      for (let i = 0; i < n; i++) {
        if (b) b(h, i);
        // はかる とき（perf）は 時刻を 固定（空の 太陽・星・高い 所の 動きものが 揺れて 描画の 基準が ぶれない ように）
        if (perf && (window as any).__w8Time != null) {
          h.time.set((window as any).__w8Time);
        }
        h.step(1);
        // 空の 鳥や どうぶつ（SkinnedMesh・Points）が 出入りして 描画の 基準が ぶれない ように、描く 直前に かたづける
        if (perf) h.animals.clear();
        const st = h.legend.state();
        const ev = h.legend.events();
        const seen = (window as any).__legendSeen ?? 0;
        (window as any).__legendSeen = ev.length;
        const bl = h.blade.state();
        const hp: Record<number, number> = {};
        for (const y of h.yokai.list()) hp[y.id] = y.hp;
        const p = h.player.get().position;
        const row: any = {
          tick: h.tick(),
          move: st.move,
          moveF: st.moveF,
          events: JSON.parse(JSON.stringify(ev.slice(seen))),
          sounds: h.combat.sounds(),
          fx: JSON.parse(JSON.stringify(h.legend.chargeFx())),
          hand: JSON.parse(JSON.stringify(h.player.handPos())),
          snd: JSON.parse(JSON.stringify(h.legend.chargeSound())),
          buffs: JSON.parse(JSON.stringify(h.ui.buffs())),
          buffDom: document.querySelectorAll('[data-buff="speed"]').length,
          waves: JSON.parse(JSON.stringify(h.legend.waves())),
          debris: JSON.parse(JSON.stringify(h.legend.debris())),
          aimOn: !!st.aim,
          hp,
          pos: { x: p.x, y: p.y, z: p.z },
          bladeF: bl.frame,
          bladeTech: bl.tech,
        };
        if (perf && (i % every === 0 || i === n - 1)) {
          const rs = h.renderStats();
          row.calls = rs.drawCalls;
          row.triangles = rs.triangles;
          row.points = rs.points;
          row.geometries = rs.geometries;
          row.textures = rs.textures;
        }
        out.push(row);
      }
      return out;
    },
    { n, before, perf, every },
  ) as Promise<W8Step[]>;
}

/**
 * 左クリックを 押して down ステップ 押しつづけ、i = down に はなし（= わざの F1）、さらに after ステップ きろくする。戻りは down + 1 + after こ。
 * `extra` は 各ステップの 前に 足す 文（h・i が 使える）。
 */
export function chargeRun8(page: Page, down: number, after = 0, extra = '', perf = false, every = 1): Promise<W8Step[]> {
  return rec8(page, down + 1 + after, `(h, i) => { if (i === 0) h.input.press('primary'); if (i === ${down}) h.input.release('primary'); ${extra} }`, perf, every);
}

/** 押した ステップから down ステップ 押しつづける（はなさない）。戻りは down こ（i = ためF − 1） */
export function holdRun8(page: Page, down: number, extra = '', perf = false): Promise<W8Step[]> {
  return rec8(page, down, `(h, i) => { if (i === 0) h.input.press('primary'); ${extra} }`, perf);
}

/** わざの F（はなした ステップ = 1）が 記録の 何番目か（down = 押していた ステップ数） */
export const fIndex = (down: number, F: number): number => down + F - 1;

export const evOf = (rec: W8Step[], type: string): LegendEvent[] => rec.flatMap((s) => s.events).filter((e) => e.type === type);
export const evIndex = (rec: W8Step[], type: string): number => rec.findIndex((s) => s.events.some((e) => e.type === type));
export const soundsOf = (rec: W8Step[]): string[] => rec.flatMap((s) => s.sounds);

/** 草の 地面を 前 0〜zFar の 帯に しく（床 floorY の 一番 上を 草に する）。メッシュの 読みこみが 落ちつくまで 待つ */
export async function grassFloor(page: Page, floorY: number, zFar = 20): Promise<void> {
  await page.evaluate(
    ({ y, zFar }) => {
      const h = window.__rikkun as any;
      h.world.fill(14, y, 20 - zFar, 26, y, 26, 'grass');
      h.step(1);
      for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
      h.step(30);
    },
    { y: floorY, zFar },
  );
}

/** もとの 描画回数・三角形（何も 出ていない とき）。世界の 読みこみが 落ちつくまで 進めてから はかる */
export async function baseStats(page: Page): Promise<{ calls: number; triangles: number; points: number; geometries: number; textures: number }> {
  await markLegend(page);
  return page.evaluate(() => {
    const h = window.__rikkun as any;
    (window as any).__w8Time = 20000; // 昼の まんなか（rec8 の perf も 同じ 時刻に 固定）
    h.time.set(20000);
    h.animals.clear();
    h.step(1);
    for (let n = 0; (h.world.lightPending() > 0 || h.world.meshStats().pending > 0) && n < 3000; n++) h.step(1);
    for (let i = 0; i < 60; i++) { h.time.set(20000); h.step(1); h.animals.clear(); }
    h.time.set(20000);
    const rs = h.renderStats();
    return { calls: rs.drawCalls, triangles: rs.triangles, points: rs.points ?? NaN, geometries: rs.geometries, textures: rs.textures };
  });
}

/** 立ち直す: ためや わざを おわらせ、起点を 今に そろえる（妖怪・ブロックは そのまま） */
export async function settle8(page: Page, n = 130): Promise<void> {
  await page.evaluate((n) => {
    const h = window.__rikkun! as any;
    h.input.releaseAll();
    const t = (window as any).__w8Time;
    if (t == null) h.step(n);
    else for (let i = 0; i < n; i++) { h.time.set(t); h.step(1); h.animals.clear(); } // はかる 場面では 時刻を 固定したまま 落ちつかせる
  }, n);
  await markLegend(page);
}
