/**
 * #293 試作: 攻撃 5「自分に 落雷」の 動き（画面・DOM・three には さわらない。ユニットテストで 動かせる）。
 *  Thunder    … タイムライン（指さし・雷雲 → 指に 落雷 → 体を 電気が 走る（＋まわりに 落雷）→ 手を おろす → 終わり）。手の 上がり・雲の 暗さ・遠くの 光・電気の 強さも ここ。
 *  StrikeField… がしゃどくろの まわりに つぎつぎ 落ちる 雷（落ちる 所の 予告つき。場所は シード付き）。
 *  BodyShock  … 電気が 走って いる 間、体に 触れて いる 人への ダメージの 間かく。
 *  touchBody  … プレイヤーが 体に 触れて いるか（足の 下・横・あたま）。
 * 数は gashaBigTuning.ts の thunder。描画は gashaBigThunderFx.ts、つなぎは gashaBig.ts の stepThunder。
 */
import { TUNE as T } from './gashaBigTuning';
import { mulberry, type LandInfo, type V3 } from './gashaBigEruption';

export type ThunderPhase = 'idle' | 'point' | 'strike' | 'shock' | 'recover' | 'done';

export interface ThunderEvent {
  /** この コマで 雷が 指へ 落ちはじめた（雷の 絵・音） */
  strike?: boolean;
  /** この コマで 雷が 指に 着いた（電気が はじまる・まわりの 落雷が はじまる） */
  land?: boolean;
  /** この コマで 電気が おわった */
  shockEnd?: boolean;
}

const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));
const smooth = (k: number): number => { const t = clamp01(k); return t * t * (3 - 2 * t); };

export class Thunder {
  phase: ThunderPhase = 'idle';
  /** いまの 局面に なって からの 秒 */
  t = 0;
  /** 左手を 上げた 度合い 0〜1（頭も 上を 向く） */
  raise = 0;
  /** 雷雲の 度合い 0〜1（空が 暗い） */
  cloud = 0;
  /** 指の 光 0〜1（落雷の 前に たまる） */
  glow = 0;
  /** 体を 走る 電気の 強さ 0〜1 */
  elec = 0;
  /** 遠くの 光 0〜1（光った 瞬間 1、すぐ 消える） */
  flash = 0;
  private rnd: () => number = mulberry(1);
  private flashIn = 0;

  get done(): boolean { return this.phase === 'done'; }
  /** 体に 触れた 人に ダメージが 入る 間 */
  get live(): boolean { return this.phase === 'shock' && this.elec > 0.3; }

  /** ぜんぶ もとに もどす（中断された とき） */
  reset(): void { this.phase = 'idle'; this.t = 0; this.raise = this.cloud = this.glow = this.elec = this.flash = 0; }

  start(ordinal: number): void {
    this.phase = 'point'; this.t = 0;
    this.raise = this.cloud = this.glow = this.elec = this.flash = 0;
    this.rnd = mulberry((0x7a11 + Math.imul(ordinal, 4099)) >>> 0);
    this.flashIn = this.nextFlash();
  }

  private nextFlash(): number {
    const [a, b] = T.thunder.flashEverySec;
    return a + this.rnd() * (b - a);
  }

  update(dt: number): ThunderEvent {
    const K = T.thunder, ev: ThunderEvent = {};
    if (this.phase === 'idle' || this.phase === 'done') return ev;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt / 0.4);
    if (this.phase === 'point' && this.t >= K.pointSec) { this.phase = 'strike'; this.t -= K.pointSec; ev.strike = true; }
    if (this.phase === 'strike' && this.t >= K.strikeSec) { this.phase = 'shock'; this.t -= K.strikeSec; ev.land = true; this.flash = 1; }
    if (this.phase === 'shock' && this.t >= K.shockSec) { this.phase = 'recover'; this.t -= K.shockSec; ev.shockEnd = true; }
    if (this.phase === 'recover' && this.t >= K.recoverSec) { this.phase = 'done'; this.t = 0; }
    switch (this.phase) {
      case 'point':
        this.raise = smooth(this.t / Math.max(1e-3, K.raiseSec));
        this.cloud = smooth(this.t / Math.max(1e-3, K.cloudSec));
        this.glow = smooth((this.t - (K.pointSec - 1.2)) / 1.2);
        this.elec = 0;
        break;
      case 'strike':
        this.raise = 1; this.cloud = 1; this.glow = 1; this.elec = 0;
        break;
      case 'shock':
        this.raise = 1; this.cloud = 1;
        this.glow = 1 - smooth(this.t / 0.4);
        this.elec = Math.min(smooth(this.t / 0.15), smooth((K.shockSec - this.t) / 0.7));
        break;
      case 'recover':
        this.raise = 1 - smooth(this.t / Math.max(1e-3, K.recoverSec * 0.8));
        this.cloud = 1 - smooth(this.t / Math.max(1e-3, K.recoverSec));
        this.glow = 0; this.elec = 0;
        break;
      default:
        this.raise = this.cloud = this.glow = this.elec = 0;
    }
    // 遠くの 光: 雲が ある 程度 暗く なって から、ときどき
    if (this.cloud > 0.25 && this.phase !== 'done') {
      this.flashIn -= dt;
      if (this.flashIn <= 0) { this.flash = 1; this.flashIn = this.nextFlash(); }
    }
    return ev;
  }
}

export interface Strike {
  /** この 回の 何本目か（雷の 絵の 形を きめる） */
  id: number;
  x: number; y: number; z: number;
  /** がしゃどくろの 体の 上に 落ちる */
  body: boolean;
  /** 落ちる 瞬間 からの 秒（予告の 間は 負） */
  t: number;
  /** 落ちる 時刻（StrikeField の 時計） */
  hitAt: number;
  hit?: boolean;
}

export interface StrikeCtx {
  /** がしゃどくろの まんなか */
  center: V3;
  /** プレイヤー（足もと） */
  player: V3;
  landAt: (x: number, z: number) => LandInfo;
}

type Kind = 'near' | 'aim' | 'far';

/** まわりに 落ちる 雷。begin で 数と 時刻と 種類を きめ、update で 予告 → 落雷 → のこり を 進める */
export class StrikeField {
  list: Strike[] = [];
  active = false;
  /** この 回に 落ちた 数 */
  hitCount = 0;
  private rnd: () => number = mulberry(1);
  private times: number[] = [];
  private kinds: Kind[] = [];
  private clock = 0;
  private spawned = 0;

  begin(ordinal: number): void {
    const K = T.thunder.around;
    this.rnd = mulberry((K.seed + Math.imul(ordinal, 7919)) >>> 0);
    this.list = []; this.clock = 0; this.spawned = 0; this.hitCount = 0; this.active = true;
    this.times = [];
    for (let i = 0; i < K.count; i++) this.times.push(K.warnSec + ((i + this.rnd()) / K.count) * K.spanSec);
    const near = Math.round(K.count * K.nearShare), aim = Math.round(K.count * K.aimShare);
    this.kinds = [];
    for (let i = 0; i < K.count; i++) this.kinds.push(i < near ? 'near' : i < near + aim ? 'aim' : 'far');
    for (let i = this.kinds.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [this.kinds[i], this.kinds[j]] = [this.kinds[j]!, this.kinds[i]!]; }
  }

  /** 予告の 強さ 0〜1（warnSec 前から 出て、落ちる 瞬間 1） */
  warn(s: Strike): number { return clamp01((s.t + T.thunder.around.warnSec) / Math.max(1e-3, T.thunder.around.warnSec)); }

  /** 時間を 進める。この コマで 落ちた 雷を 返す */
  update(dt: number, c: StrikeCtx): { hits: Strike[] } {
    const K = T.thunder.around, hits: Strike[] = [];
    if (!this.active) return { hits };
    this.clock += dt;
    while (this.spawned < K.count && this.times[this.spawned]! - K.warnSec <= this.clock) {
      const i = this.spawned++;
      const a = this.rnd() * Math.PI * 2, u = this.rnd(), v = this.rnd();
      if (this.list.length >= K.maxActive) continue;
      const kind = this.kinds[i]!;
      let x: number, z: number;
      if (kind === 'near') { const r = Math.sqrt(u) * K.nearMax; x = c.center.x + Math.cos(a) * r; z = c.center.z + Math.sin(a) * r; }
      else if (kind === 'aim') { const r = Math.sqrt(u) * K.aimJitter; x = c.player.x + Math.cos(a) * r; z = c.player.z + Math.sin(a) * r; }
      else { const r = Math.sqrt(K.rMin * K.rMin + v * (K.rMax * K.rMax - K.rMin * K.rMin)); x = c.center.x + Math.cos(a) * r; z = c.center.z + Math.sin(a) * r; }
      const info = c.landAt(x, z);
      this.list.push({ id: i, x, y: info.y, z, body: info.body, t: 0, hitAt: this.times[i]! });
    }
    let w = 0;
    for (const s of this.list) {
      s.t = this.clock - s.hitAt;
      if (!s.hit && s.t >= 0) { s.hit = true; hits.push(s); this.hitCount++; }
      if (s.t < K.keepSec) this.list[w++] = s;
    }
    this.list.length = w;
    if (this.spawned >= K.count && this.list.length === 0) this.active = false;
    return { hits };
  }

  /** プレイヤー（足もと p）が その 落雷の 半径に いるか */
  inStrike(s: Strike, p: V3): boolean {
    const K = T.thunder.around;
    return Math.hypot(p.x - s.x, p.z - s.z) <= K.radius && p.y - s.y >= -K.yBelow && p.y - s.y <= K.yAbove;
  }

  clear(): void { this.list = []; this.active = false; this.spawned = 0; }
}

/** 電気が 走って いる 間、触れて いる 人への ダメージ。触れた とき すぐ 1 回、あとは everySec ごと */
export class BodyShock {
  private cool = 0;
  step(dt: number, live: boolean, touching: boolean): number {
    const K = T.thunder.body;
    this.cool = Math.max(0, this.cool - dt);
    if (!live || !touching || this.cool > 0) return 0;
    this.cool = K.everySec;
    return K.damage;
  }
  reset(): void { this.cool = 0; }
}

/** プレイヤー（足もと p）が 体に 触れて いるか: 足の すぐ 下（2 マス。actor.boxUnder と おなじ）と、足・腰・あたまの 高さで まわり margin の 中に 体の マスが あれば */
export function touchBody(solid: (i: number, j: number, k: number) => boolean, p: V3, margin: number): boolean {
  const ix = Math.floor(p.x), iz = Math.floor(p.z), under = Math.floor(p.y + 0.02) - 1;
  if (solid(ix, under, iz) || solid(ix, under - 1, iz)) return true;
  for (const h of [0.1, 0.9, 1.7]) {
    const j = Math.floor(p.y + h);
    for (const [dx, dz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]] as const) {
      if (solid(Math.floor(p.x + dx), j, Math.floor(p.z + dz))) return true;
    }
  }
  return false;
}
