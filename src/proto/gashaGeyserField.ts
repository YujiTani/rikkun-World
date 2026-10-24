/**
 * #293 試作（開発サーバーだけ）: 間欠泉の しくみ（three.js なし。見た目は gashaGeyser.ts）。
 *
 * ・間欠泉は ワールドの ブロック `geyser_dirt`（かんけつせんの つち）の 上に たつ。ブロックを 置けば どこでも 柱が たち、
 *   掘れば 柱は 消えて ブロックは 持ち物に 入る。たて・よこに くっついた ブロックが cells × cells の 四角（高さも そろう）なら 1 本の 柱、
 *   そうでなければ 1 マスずつ 柱。ブロックは 保存の しくみに のる（ワールドの ブロックだから）。柱の 場所は 読みこんだ 列を 数えて きめる。
 * ・がしゃどくろを 置いた とき、肩の 下の 2 本を すぐ かえはじめる（ひびが 入って crackSec で 間欠泉の つちに なる）。
 * ・あとは 一定の 間かくで、体の 中心から 半径 spawn.radius の 地表の くさ・つちを ランダム（シード付き）に cells × cells で 1 か所ずつ かえる。
 *   数えるのは 半径の 中の 間欠泉の つち（4 つで 1 本）＋ かわる 途中。maxGroups に なったら 作らない。掘って へれば また 作る。
 * ・柱に 入ると 真上へ 打ち上がる。上から 落ちて 入ったら そっと おりる。柱の 中と 着地までは 落下ダメージなし（setNoFall）。
 *   かわる 途中の 場所は まだ 打ち上げない。
 * 純粋な 計算は ここに 切りはなして あり、gashaGeyser.test.ts / gashaGeyserField.test.ts で 確かめる。
 */
import { TUNE as T } from './gashaBigTuning';
import { groupsOf, pickSpot, type SpawnProbe } from './gashaGeyserSpawn';

export interface GeyserSpec {
  /** 柱の 北西の かどの マス（x0, z0）。柱は x0 〜 x0 + w、z0 〜 z0 + d */
  x0: number;
  z0: number;
  w: number;
  d: number;
  /** 柱の 根元（立つ 面の 高さ = 間欠泉の つちの 上） */
  ground: number;
  /** 柱の 上の はし（世界の 高さ） */
  top: number;
  /** わき出す 時間（シミュレーションの 秒） */
  born: number;
  /** 1 本の くり返しの 長さ（秒）。なければ 調整表の 合計（riseSec + holdSec + shrinkSec） */
  cycle?: number;
}

export interface GeyserPlaceArgs {
  /** からだの 中心（地面の 高さ）と 向き（ラジアン。three の rotation.y）・もとの 座標 → ブロックの 拡大 */
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

type Tune = typeof T.geyser;

export function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** からだの 向きで 回した 世界の 場所（local = ブロック。x = 左、z = 前） */
export function worldOf(a: GeyserPlaceArgs, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
  return { x: a.x + lx * c + lz * s, z: a.z - lx * s + lz * c };
}

/** 置いた とき すぐ かえはじめる 肩の 下の 2 本（左・右）。柱の 上は 身長の 基準（y + height）にそろえる */
export function planShoulders(a: GeyserPlaceArgs, tune: Tune = T.geyser): { x0: number; z0: number; cells: number; top: number }[] {
  const c = tune.cells;
  return [1, -1].map((s) => {
    const p = worldOf(a, s * tune.shoulderX * a.scale, tune.shoulderZ * a.scale);
    return { x0: Math.round(p.x - c / 2), z0: Math.round(p.z - c / 2), cells: c, top: a.y + tune.height };
  });
}

/** 場所から きまる 0〜1 の 数（シードなし。1 本ごとの ずれに 使う） */
export function hash01(x: number, z: number, salt = 0): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663) ^ Math.imul(salt | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 調整表の 1 本の くり返しの 長さ（ふき出す + そのまま + 小さくなる） */
export const nominalCycle = (tune: Tune = T.geyser): number => tune.riseSec + tune.holdSec + tune.shrinkSec;

/** 1 本ごとの くり返しの 長さ（±cycleJitter。場所から きまる） */
export function cycleOf(x0: number, z0: number, tune: Tune = T.geyser): number {
  return nominalCycle(tune) * (1 + tune.cycleJitter * (hash01(x0, z0, 1) * 2 - 1));
}

/** 柱の 見た目の 時間の 流れ: age（わき出してからの 秒）→ 状態と 高さの 割合（0〜1。visualHeight に かける）。
 *  ふき出す（riseSec）→ そのまま（holdSec。長さの ずれは ここで 合わせる）→ 小さくなる（shrinkSec）→ また ふき出す。打ち上げは この 割合に よらない */
export function geyserPhase(age: number, cycle: number = nominalCycle(), tune: Tune = T.geyser): { state: 'wait' | 'rising' | 'up' | 'shrinking'; frac: number; since: number } {
  if (age < 0) return { state: 'wait', frac: 0, since: 0 };
  const c = age % cycle;
  const hold = Math.max(0, cycle - tune.riseSec - tune.shrinkSec);
  const f0 = age < cycle ? 0 : tune.shrinkTo;
  if (c < tune.riseSec) { const p = c / Math.max(1e-6, tune.riseSec); return { state: 'rising', frac: f0 + (1 - f0) * (1 - (1 - p) * (1 - p)), since: c }; }
  if (c < tune.riseSec + hold) return { state: 'up', frac: 1, since: c };
  const p = (c - tune.riseSec - hold) / Math.max(1e-6, tune.shrinkSec);
  return { state: 'shrinking', frac: 1 + (tune.shrinkTo - 1) * Math.min(1, p), since: c };
}

/** 柱の 中か（足もとの 場所 x, y, z。柱の 根元の すこし 下から 上の はしまで） */
export function inColumn(g: GeyserSpec, x: number, y: number, z: number): boolean {
  return x >= g.x0 && x < g.x0 + g.w && z >= g.z0 && z < g.z0 + g.d && y >= g.ground - 0.6 && y <= g.top;
}

/** 柱の 中での 上向きの 速さ: 落ちて いたら まず slowFall まで ゆるめ、launchAccel で launchSpeed まで 上がる */
export function liftStep(vy: number, dt: number, tune: Tune = T.geyser): number {
  const v = vy < -tune.slowFall ? -tune.slowFall : vy;
  return Math.min(tune.launchSpeed, v + tune.launchAccel * dt);
}

/** 柱の 上の ろうと: 打ち上げの いちばん 高い ところ（柱の 上 + 4）より 上から、中心から この 水平きょり いない なら すいこむ（なければ null） */
export function funnelRadius(g: { top: number; w: number; d: number }, y: number, tune: Tune = T.geyser): number | null {
  if (y < g.top + tune.funnelFrom || y > g.top + tune.funnelHeight) return null;
  return Math.max(g.w, g.d) / 2 + Math.min(tune.funnelMax, tune.funnelSlope * (y - g.top));
}

/** 柱の 上へ とび出したあとの 高さ（重力 gravity）: 柱の 上 + v² / 2g */
export function apexOf(g: { top: number }, gravity = 28, tune: Tune = T.geyser): number {
  return g.top + (tune.launchSpeed * tune.launchSpeed) / (2 * gravity);
}

/** ひびの 段（1〜stages）。進み p は 0〜1。段は とびとびに ふえる */
export function crackStage(p: number, stages: number): number {
  return Math.min(stages, Math.max(1, Math.floor(p * stages) + 1));
}

export interface GeyserInfo {
  x0: number;
  z0: number;
  /** 柱の はば（x 方向）・おくゆき（z 方向）。cells は はば（むかしの 名前） */
  cells: number;
  w: number;
  d: number;
  ground: number;
  top: number;
  /** 中心 */
  x: number;
  z: number;
  /** wait = わく 前、rising = 伸びて いる、up = 立っている、cracking = ひびが 入って かわって いる 途中（まだ 打ち上げない） */
  state: 'wait' | 'rising' | 'up' | 'shrinking' | 'cracking';
  /** 柱の 見た目の 高さの 割合（0〜1。visualHeight に かける）／かわる 途中は 進み（0〜1） */
  grow: number;
  /** 柱の 見た目の 上の はし（世界の 高さ。ground + visualHeight × grow）。打ち上げる 高さ（top）は かわらない */
  visTop: number;
  /** かわる 途中の ひびの 段（1〜crackStages）。それ以外は 0 */
  stage: number;
}

export interface Pending {
  x0: number;
  z0: number;
  w: number;
  d: number;
  cells: { x: number; y: number; z: number }[];
  t: number;
  dur: number;
  /** 柱の 上を この 高さに そろえる（肩の 下の 2 本）。なければ 地面 + height */
  top: number | null;
}

export interface FieldDeps {
  /** 地面の いちばん 上の ブロックの 高さ */
  groundY(x: number, z: number): number;
  blockAt(x: number, y: number, z: number): string;
  setBlock(x: number, y: number, z: number, id: 'geyser_dirt'): boolean;
  /** 自分が 作った つちを もとの ブロックに もどす(片づけ)。なければ もどさない */
  restoreBlock?(x: number, y: number, z: number, id: string): boolean;
  /** 読みこんで いる 列の 間欠泉の つちを ぜんぶ 渡す */
  scanBlocks(found: (x: number, y: number, z: number) => void): void;
  /** がしゃどくろの 体の 当たり（固い マス） */
  bodySolid(x: number, y: number, z: number): boolean;
  /** がしゃどくろの 体の 中心（なければ null） */
  centre(): { x: number; z: number } | null;
  /** プレイヤーの いま（足もと の 位置、速さ、地面に のって いるか） */
  body(): { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; onGround?: boolean };
  setVelocity(v: { x: number; y: number; z: number }): void;
  /** 水平に すこし 寄せる（ブロック） */
  nudge(dx: number, dz: number): void;
  /** 落下ダメージを 受けない（combat の noFall に 重ねる） */
  setNoFall(on: boolean): void;
}

interface Cell { x: number; y: number; z: number; born: number }

/** 柱を 立てる つちの 数の 上限（それ以上は 遠い ものから 見ない） */
export const MAX_CELLS = 160;
/** つちを 数えなおす 間かく（ステップ） */
const RESCAN_TICKS = 15;
const BLOCK = 'geyser_dirt';

const key = (x: number, z: number): string => `${x},${z}`;

export class GeyserField {
  t = 0;
  /** 柱の 形が かわる たびに ふえる（見た目の 作りなおし 用） */
  version = 0;
  private cells = new Map<string, Cell>();
  /** 自分が 作った つち(もとの ブロックつき)。片づけで もどす。プレイヤーが 置いた つちは 入らない */
  private made = new Map<string, { x: number; y: number; z: number; prev: string }>();
  private tops = new Map<string, number>();
  private specList: GeyserSpec[] = [];
  private pend: Pending[] = [];
  private placed = false;
  private full = false;
  private cool = 0;
  private tick = 0;
  private rnd = makeRnd(T.geyser.seed);
  private rndSpawn = makeRnd(T.geyser.spawn.seed);
  private assisted = false;
  private assistedT = 0;
  private noFallNow = false;
  private sinking: string | null = null;
  /** 片づけた あと（place() まで 何もしない） */
  private dormant = false;

  constructor(private readonly d: FieldDeps) {}

  /** 片づけて あって、place() を まっている */
  sleeping(): boolean { return this.dormant; }
  specs(): readonly GeyserSpec[] { return this.specList; }
  pending(): readonly Pending[] { return this.pend; }

  /** がしゃどくろを 置いた: 肩の 下の 2 本を かえはじめ、ランダムの はじめの 間かくを 数えなおす。ワールドの つちは そのまま */
  place(a: GeyserPlaceArgs): void {
    this.placed = true;
    this.dormant = false;
    this.pend = [];
    this.t = 0;
    const R = T.geyser;
    this.cool = this.range(R.spawn.firstSec);
    for (const p of planShoulders(a, R)) this.start(p.x0, p.z0, R.spawn.crackSec, p.top, false);
    this.rescan();
    this.rebuild(); // 置く前から ある つちも すぐ 柱に する
    this.version++;
  }

  /** テスト・手で 間欠泉に かえる（x, z の マスから cells × cells）。すでに ある・かわる 途中なら false */
  spawnAt(x: number, z: number, sec?: number): boolean {
    return this.start(Math.floor(x), Math.floor(z), sec ?? T.geyser.spawn.crackSec, null, true);
  }

  /** 間欠泉の 数（半径の 中の つち ÷ 4 を 切り上げ ＋ かわる 途中） */
  groupCount(): number {
    const c = this.d.centre();
    const R = T.geyser;
    let n = 0;
    if (c) for (const v of this.cells.values()) if (Math.hypot(v.x + 0.5 - c.x, v.z + 0.5 - c.z) <= R.spawn.radius + R.cells) n++;
    return groupsOf(n, R.cells) + this.pend.length;
  }

  info(): GeyserInfo[] {
    const R = T.geyser;
    const out: GeyserInfo[] = this.specList.map((g) => {
      const ph = geyserPhase(this.t - g.born, g.cycle, R);
      return {
        x0: g.x0, z0: g.z0, cells: g.w, w: g.w, d: g.d, ground: g.ground, top: g.top, x: g.x0 + g.w / 2, z: g.z0 + g.d / 2,
        state: ph.state, grow: ph.frac, visTop: g.ground + R.visualHeight * ph.frac, stage: 0,
      };
    });
    for (const p of this.pend) {
      const prog = Math.min(1, p.t / Math.max(1e-6, p.dur));
      const y = p.cells[0]!.y + 1;
      out.push({
        x0: p.x0, z0: p.z0, cells: p.w, w: p.w, d: p.d, ground: y, top: p.top ?? y + R.height, visTop: y, x: p.x0 + p.w / 2, z: p.z0 + p.d / 2,
        state: 'cracking', grow: prog, stage: crackStage(prog, R.spawn.crackStages),
      });
    }
    return out;
  }

  /** 1 ステップ（dt 秒） */
  step(dt: number): void {
    if (this.dormant) return;
    this.t += dt;
    this.tick++;
    let changed = false;
    for (const [k, c] of this.cells) {
      if (this.d.blockAt(c.x, c.y, c.z) !== BLOCK) { this.cells.delete(k); this.tops.delete(k); changed = true; }
    }
    if (this.tick % RESCAN_TICKS === 0 && this.rescan()) changed = true;
    if (changed) this.rebuild();
    if (this.placed) this.spawnStep(dt);
    this.pendStep(dt);
    this.physics(dt);
  }

  // ---------------------------------------------------------------- かえる
  private range(r: readonly [number, number]): number {
    return r[0] + (r[1] - r[0]) * this.rndSpawn();
  }

  private spawnStep(dt: number): void {
    const R = T.geyser, S = R.spawn;
    const c = this.d.centre();
    if (!c) return;
    if (this.groupCount() >= S.maxGroups) {
      // 3 本の あいだは 作らない。掘って へったら、そこから 1 つぶんの 間かくを おいて また 作る
      if (!this.full) { this.full = true; this.cool = this.range(S.intervalSec); }
      return;
    }
    this.full = false;
    this.cool -= dt;
    if (this.cool > 0) return;
    const taken = new Set<string>();
    for (const v of this.cells.values()) taken.add(key(v.x, v.z));
    for (const p of this.pend) for (const q of p.cells) taken.add(key(q.x, q.z));
    const probe: SpawnProbe = {
      surfaceY: (x, z) => this.d.groundY(x, z),
      blockAt: (x, y, z) => this.d.blockAt(x, y, z),
      bodySolid: (x, y, z) => this.d.bodySolid(x, y, z),
      taken: (x, z) => taken.has(key(x, z)),
    };
    const spot = pickSpot(this.rndSpawn, c.x, c.z, R.cells, probe, S);
    if (!spot) { this.cool = S.retrySec; return; }
    this.start(spot.x0, spot.z0, S.crackSec, null, false);
    this.cool = this.range(S.intervalSec);
  }

  /** cells × cells マスを かえはじめる。ひびの 間は 打ち上げない */
  private start(x0: number, z0: number, sec: number, top: number | null, forceAny: boolean): boolean {
    const n = T.geyser.cells;
    const cells: Pending['cells'] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = x0 + i, z = z0 + j, y = this.d.groundY(x, z);
      const id = this.d.blockAt(x, y, z);
      if (id === 'air' || id === 'outside' || id === BLOCK || id === 'water') return false;
      if (!forceAny && id !== 'grass' && id !== 'dirt') return false;
      const k = key(x, z);
      if (this.cells.has(k) || this.pend.some((p) => p.cells.some((q) => q.x === x && q.z === z))) return false;
      cells.push({ x, y, z });
    }
    const p: Pending = { x0, z0, w: n, d: n, cells, t: 0, dur: sec, top };
    if (sec <= 0) this.finish(p); else this.pend.push(p);
    this.version++;
    return true;
  }

  private pendStep(dt: number): void {
    if (!this.pend.length) return;
    const left: Pending[] = [];
    for (const p of this.pend) {
      p.t += dt;
      if (p.t >= p.dur) this.finish(p); else left.push(p);
    }
    if (left.length !== this.pend.length) { this.pend = left; this.version++; }
  }

  /** ひびが いっぱいに なった: つちが かわって いなければ 間欠泉の つちに する */
  private finish(p: Pending): void {
    for (const q of p.cells) {
      const id = this.d.blockAt(q.x, q.y, q.z);
      if (id === 'air' || id === 'outside' || id === 'water' || id === BLOCK) return; // 掘られた・かわった: やめる
    }
    for (const q of p.cells) {
      const prev = this.d.blockAt(q.x, q.y, q.z);
      this.d.setBlock(q.x, q.y, q.z, BLOCK);
      const k = key(q.x, q.z);
      this.made.set(`${q.x},${q.y},${q.z}`, { x: q.x, y: q.y, z: q.z, prev });
      this.cells.set(k, { x: q.x, y: q.y, z: q.z, born: this.t + T.geyser.delaySec[0] + hash01(p.x0, p.z0, 3) * T.geyser.staggerSec });
      if (p.top !== null) this.tops.set(k, p.top);
    }
    this.rebuild();
  }

  // ---------------------------------------------------------------- 数える
  /** 読みこんだ 列の 間欠泉の つちを 数えなおす。ふえた・へった 場合は true */
  private rescan(): boolean {
    const found: Cell[] = [];
    const c0 = this.d.centre(), maxR = T.geyser.rescanRadius;
    this.d.scanBlocks((x, y, z) => {
      if (c0 && Math.hypot(x + 0.5 - c0.x, z + 0.5 - c0.z) > maxR) return; // ボスから 遠い つちは 見ない(前の ボスの のこり・遠くの 置いた つち)
      const above = this.d.blockAt(x, y + 1, z);
      if (above === BLOCK || (above !== 'air' && !isNonSolid(above))) return; // 上に かたい ものが ある（つみ上げた したの つち）
      found.push({ x, y, z, born: 0 });
    });
    if (found.length > MAX_CELLS) {
      const b = this.d.body().position;
      found.sort((p, q) => Math.hypot(p.x - b.x, p.z - b.z) - Math.hypot(q.x - b.x, q.z - b.z));
      found.length = MAX_CELLS;
    }
    let changed = false;
    const seen = new Set<string>();
    for (const f of found) {
      const k = key(f.x, f.z);
      seen.add(k);
      const old = this.cells.get(k);
      if (!old || old.y !== f.y) {
        const [a, b] = T.geyser.delaySec;
        this.cells.set(k, { x: f.x, y: f.y, z: f.z, born: this.t + a + (b - a) * this.rnd() });
        changed = true;
      }
    }
    for (const k of [...this.cells.keys()]) if (!seen.has(k)) { this.cells.delete(k); this.tops.delete(k); changed = true; }
    return changed;
  }

  /** つちの あつまりから 柱を つくる（四角で 高さが そろえば 1 本、そうでなければ 1 マスずつ） */
  private rebuild(): void {
    const R = T.geyser;
    const done = new Set<string>();
    const specs: GeyserSpec[] = [];
    for (const [k0, c0] of this.cells) {
      if (done.has(k0)) continue;
      const group: Cell[] = [];
      const q = [c0];
      done.add(k0);
      while (q.length) {
        const c = q.pop()!;
        group.push(c);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const k = key(c.x + dx, c.z + dz);
          const n = this.cells.get(k);
          if (n && !done.has(k)) { done.add(k); q.push(n); }
        }
      }
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const c of group) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); z0 = Math.min(z0, c.z); z1 = Math.max(z1, c.z); }
      const w = x1 - x0 + 1, d = z1 - z0 + 1;
      const flat = group.every((c) => c.y === group[0]!.y);
      const parts: Cell[][] = group.length === w * d && flat ? [group] : group.map((c) => [c]);
      for (const part of parts) {
        let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity, born = Infinity, top: number | null = null, y = -Infinity;
        for (const c of part) {
          px0 = Math.min(px0, c.x); px1 = Math.max(px1, c.x); pz0 = Math.min(pz0, c.z); pz1 = Math.max(pz1, c.z);
          born = Math.min(born, c.born); y = Math.max(y, c.y);
          const t = this.tops.get(key(c.x, c.z));
          if (t !== undefined) top = t;
        }
        specs.push({
          x0: px0, z0: pz0, w: px1 - px0 + 1, d: pz1 - pz0 + 1, ground: y + 1, top: top ?? y + 1 + R.height,
          born, cycle: cycleOf(px0, pz0, R),
        });
      }
    }
    this.specList = specs;
    this.version++;
  }

  // ---------------------------------------------------------------- プレイヤー
  private setNoFall(on: boolean): void {
    if (on === this.noFallNow) return;
    this.noFallNow = on;
    this.d.setNoFall(on);
  }

  private physics(dt: number): void {
    if (!this.specList.length && !this.assisted) return;
    const R = T.geyser;
    const b = this.d.body(), p = b.position, vel = b.velocity;
    let inside = false;
    let vy = vel.y;
    const reach = R.funnelMax + 2;
    for (const g of this.specList) {
      if (this.t - g.born < R.riseSec * 0.3) continue; // まだ わき出して いない
      const cx = g.x0 + g.w / 2, cz = g.z0 + g.d / 2, half = Math.max(g.w, g.d) / 2;
      if (Math.abs(p.x - cx) > half + reach || Math.abs(p.z - cz) > half + reach) continue;
      const gk = key(g.x0, g.z0);
      if (inColumn(g, p.x, p.y, p.z)) {
        inside = true;
        // 柱の 上の ほうから 落ちて きた ときは 打ち上げず、ゆっくり おりる（下まで ついて 柱を でるまで）
        if (this.sinking === null && p.y > g.top - R.sinkBelowTop && vel.y < 0) this.sinking = gk;
        if (this.sinking === gk) {
          vy = Math.max(vy, -R.slowFall);
          this.d.setVelocity({ x: vel.x, y: vy, z: vel.z });
          break;
        }
        vy = liftStep(vy, dt, R);
        // 柱の 上の はしの すこし 下までは 水の 柱から 横に でられない（まっすぐ 上へ。上の はしを こえたら 自由に 動ける）
        if (p.y < g.top - R.holdBelowTop) {
          const m = R.holdMargin;
          const lo = g.x0 + Math.min(m, g.w / 2), hi = g.x0 + g.w - Math.min(m, g.w / 2), lz = g.z0 + Math.min(m, g.d / 2), hz = g.z0 + g.d - Math.min(m, g.d / 2);
          const nx = Math.min(hi, Math.max(lo, p.x)) - p.x, nz = Math.min(hz, Math.max(lz, p.z)) - p.z;
          if (nx !== 0 || nz !== 0) this.d.nudge(nx, nz);
        }
        break;
      }
      const fr = vel.y < 0 ? funnelRadius(g, p.y, R) : null; // 落ちて いる ときだけ（のぼりの ときは じゃましない）
      if (fr !== null) {
        const dx = cx - p.x, dz = cz - p.z, dist = Math.hypot(dx, dz);
        if (dist < fr && dist > 0.05) {
          // 水平の 速さは 入力で 毎ステップ 上書きされる ので、位置を 直接 すこし 寄せる
          const st = Math.min(dist, R.funnelPull * dt);
          this.d.nudge((dx / dist) * st, (dz / dist) * st);
          this.assisted = true; this.assistedT = 0;
        }
      }
    }
    if (this.sinking !== null && !this.specList.some((g) => key(g.x0, g.z0) === this.sinking && inColumn(g, p.x, p.y, p.z))) this.sinking = null;
    if (inside) {
      this.assisted = true; this.assistedT = 0;
      if (this.sinking === null) this.d.setVelocity({ x: vel.x, y: vy, z: vel.z });
    }
    // 柱から 出たあと 地面に 着く（または 時間ぎれ）まで 落下ダメージなし
    if (this.assisted && !inside) {
      this.assistedT += dt;
      if (b.onGround === true && this.assistedT > 0.1) this.assisted = false;
      else if (this.assistedT > R.assistMaxSec) this.assisted = false;
    }
    this.setNoFall(R.noFallInColumn && (inside || this.assisted));
  }

  /** がしゃどくろを 片づけた: 間欠泉を ぜんぶ 止めて 見た目を 消す（ワールドの つちは 動かない ただの ブロックとして のこる）。次の place() まで 何もしない */
  dismiss(): void {
    // 自分が 作った つちを もとの ブロックに もどす(掘られた・かわった ところは さわらない)
    if (this.d.restoreBlock) for (const m of this.made.values()) if (this.d.blockAt(m.x, m.y, m.z) === BLOCK) this.d.restoreBlock(m.x, m.y, m.z, m.prev);
    this.made.clear();
    this.dormant = true;
    this.placed = false;
    this.cells.clear(); this.tops.clear();
    this.specList = [];
    this.pend = [];
    this.full = false;
    this.version++;
    this.reset();
  }

  /** 柱の 上に いる 人の 守りを やめる（片づけ） */
  reset(): void {
    this.assisted = false;
    this.sinking = null;
    this.setNoFall(false);
  }
}

/** 空気 いがいで 固くない ブロック（くさ・はな・たいまつ など。柱の 中に あっても よい） */
function isNonSolid(id: string): boolean {
  return id === 'torch' || id === 'start_torch' || id === 'kusa' || id === 'susuki' || id === 'nobana' || id.startsWith('flower_');
}
