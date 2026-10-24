/**
 * #293 試作: 攻撃 4「口から 火山噴火」の 動き（画面・DOM・three には さわらない。ユニットテストで 動かせる）。
 *  Eruption  … タイムライン（吸いこみ → 噴火 → 灰が 降る（首が もどる）→ 終わり）。首の 上向き・火柱・風の 強さも ここ。
 *  AshRain   … 口から 放射状に とぶ 灰（着地は ランダム。噴火ごとに ちがう 並び）・予告の 影の 強さ。
 *  Embers    … 落ちた 灰の 燃え残り（しばらく のこる。触れて いる 間 ドットダメージ）。
 *  burnPlants … 灰が 落ちた 点の まわりの 植物ブロックを 燃やして 消す。
 * 数は gashaBigTuning.ts の eruption。描画は gashaBigEruptFx.ts、つなぎは gashaBig.ts の stepEruption。
 */
import { TUNE as T } from './gashaBigTuning';

export interface V3 { x: number; y: number; z: number }

export type EruptPhase = 'idle' | 'inhale' | 'erupt' | 'rain' | 'done';

const smooth = (k: number): number => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };

export interface EruptEvent {
  /** この コマで 火柱が 立った（灰を とばしはじめる） */
  eruptStart?: boolean;
  /** この コマで 火柱が おわった */
  eruptEnd?: boolean;
}

export class Eruption {
  phase: EruptPhase = 'idle';
  /** いまの 局面に なって からの 秒 */
  t = 0;
  /** 首の 上向き 0〜1（吸いこみで ゆっくり 上がり、噴火の 間は 1、そのあと もどる） */
  pitch = 0;
  /** 火柱の 強さ 0〜1 */
  column = 0;
  /** 風の すじの 強さ 0〜1（吸いこみの 間だけ） */
  wind = 0;

  get done(): boolean { return this.phase === 'done'; }

  start(): void { this.phase = 'inhale'; this.t = 0; this.pitch = this.column = this.wind = 0; }

  update(dt: number): EruptEvent {
    const K = T.eruption, ev: EruptEvent = {};
    if (this.phase === 'idle' || this.phase === 'done') return ev;
    this.t += dt;
    if (this.phase === 'inhale') {
      this.pitch = smooth(this.t / Math.max(1e-3, K.inhaleSec));
      this.wind = Math.min(1, this.t / Math.max(1e-3, K.inhaleSec));
      if (this.t >= K.inhaleSec) { this.phase = 'erupt'; this.t -= K.inhaleSec; this.wind = 0; this.pitch = 1; ev.eruptStart = true; }
    }
    if (this.phase === 'erupt') {
      this.pitch = 1;
      this.column = Math.min(smooth(this.t / 0.3), smooth((K.eruptSec - this.t) / 0.5));
      if (this.t >= K.eruptSec) { this.phase = 'rain'; this.t -= K.eruptSec; this.column = 0; ev.eruptEnd = true; }
    }
    if (this.phase === 'rain') {
      this.pitch = 1 - smooth(this.t / Math.max(1e-3, K.recoverSec));
      if (this.t >= K.rainSec) { this.phase = 'done'; this.pitch = 0; }
    }
    return ev;
  }
}

/** 乱数（シード つき） */
export function mulberry(s: number): () => number {
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LandInfo {
  /** 着地する 面の 高さ（足が のる 面） */
  y: number;
  /** がしゃどくろの 体の 上に 落ちる */
  body: boolean;
}

export interface Ash {
  sx: number; sy: number; sz: number;
  lx: number; ly: number; lz: number;
  body: boolean;
  /** とび はじめてからの 秒 */
  t: number;
  flight: number;
  apex: number;
}

export class AshRain {
  ashes: Ash[] = [];
  /** 着地した 数（この 噴火の 合計） */
  landedCount = 0;
  /** とばした 数（この 噴火の 合計） */
  spawned = 0;
  private rnd: () => number = mulberry(1);
  private times: number[] = [];
  private clock = 0;
  active = false;

  /** 噴火を はじめる。ordinal = その ゲームでの 何回目の 噴火か（毎回 ちがう 並びに する） */
  begin(ordinal: number): void {
    const K = T.eruption.ash;
    this.rnd = mulberry((K.seed + Math.imul(ordinal, 7919)) >>> 0);
    this.ashes = []; this.landedCount = 0; this.spawned = 0; this.clock = 0; this.active = true;
    this.times = [];
    for (let i = 0; i < K.count; i++) this.times.push(((i + this.rnd()) / K.count) * K.spawnSec);
  }

  /** 灰を 進める。mouth = 口の 世界の 位置、landAt = 着地点の 面を 調べる。着地した 灰を 返す */
  update(dt: number, mouth: V3, landAt: (x: number, z: number) => LandInfo): { landed: Ash[]; launched: Ash[] } {
    const K = T.eruption.ash, landed: Ash[] = [], launched: Ash[] = [];
    if (!this.active) return { landed, launched };
    this.clock += dt;
    while (this.spawned < K.count && this.times[this.spawned]! <= this.clock && this.ashes.length < K.maxFlying) {
      const a = this.rnd() * Math.PI * 2;
      const rTop = this.rnd() < K.nearShare ? Math.max(K.rMin, K.nearMax) : K.rMax; // 一部は 口の 近く（体の 上）に 落とす
      const r = Math.sqrt(K.rMin * K.rMin + this.rnd() * (rTop * rTop - K.rMin * K.rMin));
      const lx = mouth.x + Math.cos(a) * r, lz = mouth.z + Math.sin(a) * r;
      const info = landAt(lx, lz);
      const ash: Ash = {
        sx: mouth.x, sy: mouth.y, sz: mouth.z, lx, ly: info.y, lz, body: info.body, t: 0,
        flight: K.flightMin + this.rnd() * (K.flightMax - K.flightMin), apex: K.apexMin + this.rnd() * (K.apexMax - K.apexMin),
      };
      this.ashes.push(ash); launched.push(ash); this.spawned++;
    }
    let w = 0;
    for (const a of this.ashes) {
      a.t += dt;
      if (a.t >= a.flight) { landed.push(a); this.landedCount++; } else this.ashes[w++] = a;
    }
    this.ashes.length = w;
    if (this.spawned >= K.count && this.ashes.length === 0) this.active = false;
    return { landed, launched };
  }

  /** いまの 位置（口 → 着地点を むすぶ 線の 上に、山なりの 高さを たす） */
  position(a: Ash, out: V3): V3 {
    const u = Math.min(1, a.t / a.flight);
    out.x = a.sx + (a.lx - a.sx) * u; out.z = a.sz + (a.lz - a.sz) * u;
    out.y = a.sy + (a.ly - a.sy) * u + 4 * a.apex * u * (1 - u);
    return out;
  }

  /** 予告の 影の 強さ 0〜1（warnSec 前から 出て、着地で 1） */
  warn(a: Ash): number {
    const left = a.flight - a.t, W = T.eruption.ash.warnSec;
    return left >= W ? 0 : Math.max(0, Math.min(1, 1 - left / W));
  }
}

export interface Ember { x: number; y: number; z: number; age: number; body: boolean }

export class Embers {
  list: Ember[] = [];
  private cool = 0;

  add(x: number, y: number, z: number, body: boolean): Ember {
    const K = T.eruption.ember;
    if (this.list.length >= K.max) this.list.shift();
    const e: Ember = { x, y, z, age: 0, body };
    this.list.push(e);
    return e;
  }

  update(dt: number): void {
    const sec = T.eruption.ember.sec;
    let w = 0;
    for (const e of this.list) { e.age += dt; if (e.age < sec) this.list[w++] = e; }
    this.list.length = w;
  }

  /** プレイヤー（足もと p）が 燃えかすに 触れて いる か */
  touching(p: V3): boolean {
    const K = T.eruption.ember;
    for (const e of this.list) if (Math.hypot(e.x - p.x, e.z - p.z) <= K.radius && Math.abs(e.y - p.y) <= K.yTol) return true;
    return false;
  }

  /** 触れて いる 間 dotEverySec ごとに 1 回 ダメージ。この コマで 与える ダメージ（なければ 0） */
  step(dt: number, p: V3): number {
    const K = T.eruption.ember;
    this.cool = Math.max(0, this.cool - dt);
    if (!this.touching(p)) return 0;
    if (this.cool > 0) return 0;
    this.cool = K.dotEverySec;
    return K.dotDamage;
  }

  clear(): void { this.list.length = 0; this.cool = 0; }
}

/** 灰が 落ちた 点（x, y, z）の まわり burnRadius の 植物ブロックを 空気に する。近い 順に 最大 burnMax 個。消した マスを 返す */
export function burnPlants(
  x: number, y: number, z: number,
  blockAt: (x: number, y: number, z: number) => string, setAir: (x: number, y: number, z: number) => boolean,
): V3[] {
  const K = T.eruption, R = K.burnRadius, found: { c: V3; d: number }[] = [];
  const set = new Set(K.plants);
  for (let ix = Math.floor(x - R); ix <= Math.floor(x + R); ix++) {
    for (let iy = Math.floor(y - R) - 1; iy <= Math.floor(y + R); iy++) {
      for (let iz = Math.floor(z - R); iz <= Math.floor(z + R); iz++) {
        const d = Math.hypot(ix + 0.5 - x, iy + 0.5 - y, iz + 0.5 - z);
        if (d <= R && set.has(blockAt(ix, iy, iz))) found.push({ c: { x: ix, y: iy, z: iz }, d });
      }
    }
  }
  found.sort((a, b) => a.d - b.d);
  const done: V3[] = [];
  for (const f of found.slice(0, K.burnMax)) if (setAir(f.c.x, f.c.y, f.c.z)) done.push(f.c);
  return done;
}
