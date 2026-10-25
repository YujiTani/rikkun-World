/**
 * #293 試作: 攻撃 4「口から 火山噴火」の 動き（画面・DOM・three には さわらない。ユニットテストで 動かせる）。
 *  Eruption  … タイムライン（吸いこみ → 噴火 → 灰が 降る（首が もどる）→ 終わり）。首の 上向き・火柱・風の 強さも ここ。
 *  MeteorRain … 口から 放射状に とぶ 隕石（着地は ランダム＋一部 ねらい。噴火ごとに ちがう 並び）・予告の 輪の 強さ・着地点から 飛び散る 火の 粉。
 *  inBlast    … 隕石の 落下範囲（着地点の まわり radius）に いるか。
 *  Embers     … 隕石・火の 粉が 落ちた 所の 燃え残り（しばらく のこる。触れて いる 間 ドットダメージ）。
 *  burnPlants … 落ちた 点の まわりの 植物ブロックを 燃やして 消す。
 *  craterCells … 着地点の 小さな 穴（こわす マス）。
 * 数は gashaBigTuning.ts の eruption。描画は gashaBigEruptFx.ts、つなぎは gashaBig.ts の stepEruption。
 */
import { TUNE as T } from './gashaBigTuning';

export interface V3 { x: number; y: number; z: number }

export type EruptPhase = 'idle' | 'inhale' | 'erupt' | 'hold' | 'rain' | 'done';

const smooth = (k: number): number => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };

export interface EruptEvent {
  /** この コマで 火柱が 立った（隕石を とばしはじめる） */
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

  /** hold = true: 火柱が おわっても 上を 向いた まま とまる('hold')。灰は 降る。少女への 切りかえの 姿勢(FIX-BRIEF-2 §4) */
  hold = false;

  start(hold = false): void { this.phase = 'inhale'; this.t = 0; this.pitch = this.column = this.wind = 0; this.hold = hold; }

  update(dt: number): EruptEvent {
    const K = T.eruption, ev: EruptEvent = {};
    if (this.phase === 'idle' || this.phase === 'done' || this.phase === 'hold') return ev;
    this.t += dt;
    if (this.phase === 'inhale') {
      this.pitch = smooth(this.t / Math.max(1e-3, K.inhaleSec));
      this.wind = Math.min(1, this.t / Math.max(1e-3, K.inhaleSec));
      if (this.t >= K.inhaleSec) { this.phase = 'erupt'; this.t -= K.inhaleSec; this.wind = 0; this.pitch = 1; ev.eruptStart = true; }
    }
    if (this.phase === 'erupt') {
      this.pitch = 1;
      this.column = Math.min(smooth(this.t / 0.3), smooth((K.eruptSec - this.t) / 0.5));
      if (this.t >= K.eruptSec) { this.phase = this.hold ? 'hold' : 'rain'; this.t -= K.eruptSec; this.column = 0; ev.eruptEnd = true; this.pitch = 1; }
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

/** とんで いる 隕石・火の 粉（どちらも 弾道: 出発点 → 着地点を むすぶ 線に 山なりの 高さを たす） */
export interface Flyer {
  sx: number; sy: number; sz: number;
  lx: number; ly: number; lz: number;
  body: boolean;
  /** とび はじめてからの 秒 */
  t: number;
  flight: number;
  apex: number;
}

/** 隕石（火を まとった 岩）。aimed = プレイヤーを ねらった もの */
export interface Meteor extends Flyer { id: number; aimed: boolean }
/** 着地点から 飛び散る 火の 粉。落ちた 所に 燃えかす */
export interface Spark extends Flyer { /** 飛び散らせた 隕石の id */ from: number }
/** 着地した 隕石の 記録（この 噴火の ぶん。テスト・デバッグ用） */
export interface Impact { id: number; x: number; y: number; z: number; body: boolean; aimed: boolean; sparks: number }

/** 弾道の 時刻 t の 位置（t は 0〜flight。はみ出しは 端に） */
export function flyerAt(a: Flyer, t: number, out: V3): V3 {
  const u = Math.max(0, Math.min(1, t / a.flight));
  out.x = a.sx + (a.lx - a.sx) * u; out.z = a.sz + (a.lz - a.sz) * u;
  out.y = a.sy + (a.ly - a.sy) * u + 4 * a.apex * u * (1 - u);
  return out;
}

/** 落下範囲: 足もと p が 着地点（x, y, z）の 範囲（水平 radius・高さ hitYTol）の 中か */
export function inBlast(x: number, y: number, z: number, p: V3): boolean {
  const K = T.eruption.meteor;
  return Math.hypot(p.x - x, p.z - z) <= K.radius && Math.abs(p.y - y) <= K.hitYTol;
}

/**
 * 隕石の 雨。口から 放射状に とばし（一部は 口の 近く = 体の 上、一部は プレイヤーの まわりを ねらう）、着地すると 火の 粉を 放射状に 飛び散らす。
 * 乱数は シード（+ 噴火の 回数）つき。同じ 入力なら 同じ 並び。
 */
export class MeteorRain {
  meteors: Meteor[] = [];
  sparks: Spark[] = [];
  /** この 噴火で 着地した 隕石の 記録 */
  impacts: Impact[] = [];
  /** 着地した 隕石の 数（この 噴火の 合計） */
  landedCount = 0;
  /** とばした 隕石の 数（この 噴火の 合計） */
  spawned = 0;
  /** ねらった 隕石の 数（この 噴火の 合計） */
  aimedCount = 0;
  /** 飛び散った 火の 粉の 数・落ちた 数（この 噴火の 合計） */
  sparkCount = 0;
  sparkLanded = 0;
  private rnd: () => number = mulberry(1);
  private times: number[] = [];
  private clock = 0;
  active = false;

  /** true = 少女への 切りかえの 噴火: ねらわず、プレイヤーの まわり finaleSafe には 落とさない */
  finale = false;

  /** 噴火を はじめる。ordinal = その ゲームでの 何回目の 噴火か（毎回 ちがう 並びに する）。finale = 少女への 切りかえの 噴火 */
  begin(ordinal: number, finale = false): void {
    const K = T.eruption.meteor;
    this.finale = finale;
    this.rnd = mulberry((K.seed + Math.imul(ordinal, 7919)) >>> 0);
    this.meteors = []; this.sparks = []; this.impacts = [];
    this.landedCount = 0; this.spawned = 0; this.aimedCount = 0; this.sparkCount = 0; this.sparkLanded = 0; this.clock = 0; this.active = true;
    this.times = [];
    for (let i = 0; i < K.count; i++) this.times.push(((i + this.rnd()) / K.count) * K.spawnSec);
  }

  /** 着地点を えらぶ（口から 放射状。一部は 口の 近く・一部は aim の まわり） */
  private pick(mouth: V3, aim: V3 | null | undefined): { x: number; z: number; aimed: boolean } {
    const K = T.eruption.meteor;
    const roll = this.rnd();
    if (this.finale) {
      // 切りかえの 噴火: ねらわない。プレイヤーの まわり finaleSafe の 中に 落ちる ものは えらび なおす（数回まで。だめなら 外へ おしだす）
      for (let i = 0; i < 8; i++) {
        const q = this.spread(mouth);
        if (!aim || Math.hypot(q.x - aim.x, q.z - aim.z) > K.finaleSafe) return q;
      }
      const q = this.spread(mouth), d = Math.hypot(q.x - aim!.x, q.z - aim!.z), k = (K.finaleSafe + 0.5) / Math.max(1e-6, d);
      return d > 1e-6 ? { x: aim!.x + (q.x - aim!.x) * k, z: aim!.z + (q.z - aim!.z) * k, aimed: false } : { x: aim!.x + K.finaleSafe + 0.5, z: aim!.z, aimed: false };
    }
    if (aim && roll < K.aimShare && Math.hypot(aim.x - mouth.x, aim.z - mouth.z) <= K.aimMaxDist) {
      const a = this.rnd() * Math.PI * 2, r = K.aimSpread * Math.sqrt(this.rnd());
      let x = aim.x + Math.cos(a) * r, z = aim.z + Math.sin(a) * r;
      const d = Math.hypot(x - mouth.x, z - mouth.z);
      if (d < K.rMin) { const k = K.rMin / Math.max(1e-6, d); x = mouth.x + (x - mouth.x) * k; z = mouth.z + (z - mouth.z) * k; } // 口の 真下には 落とさない
      return { x, z, aimed: true };
    }
    return this.spread(mouth);
  }

  /** 口から 放射状の ランダムな 着地点（一部は 口の 近く = 体の 上） */
  private spread(mouth: V3): { x: number; z: number; aimed: boolean } {
    const K = T.eruption.meteor;
    const a = this.rnd() * Math.PI * 2;
    const rTop = this.rnd() < K.nearShare ? Math.max(K.rMin, K.nearMax) : K.rMax; // 一部は 口の 近く（体の 上）に 落とす
    const r = Math.sqrt(K.rMin * K.rMin + this.rnd() * (rTop * rTop - K.rMin * K.rMin));
    return { x: mouth.x + Math.cos(a) * r, z: mouth.z + Math.sin(a) * r, aimed: false };
  }

  /** 着地した 隕石の まわりへ 火の 粉を 放射状に（数は splash.min〜max） */
  private splash(m: Meteor, landAt: (x: number, z: number) => LandInfo, landedNow: Spark[]): number {
    const S = T.eruption.splash;
    const n = S.min + Math.floor(this.rnd() * (S.max - S.min + 1));
    const base = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2 + (this.rnd() - 0.5) * (Math.PI / n);
      const r = S.rMin + this.rnd() * (S.rMax - S.rMin);
      const lx = m.lx + Math.cos(a) * r, lz = m.lz + Math.sin(a) * r;
      const info = landAt(lx, lz);
      const s: Spark = {
        from: m.id, sx: m.lx, sy: m.ly + 0.4, sz: m.lz, lx, ly: info.y, lz, body: info.body, t: 0,
        flight: S.flightMin + this.rnd() * (S.flightMax - S.flightMin), apex: S.apexMin + this.rnd() * (S.apexMax - S.apexMin),
      };
      this.sparkCount++;
      if (this.sparks.length >= S.maxFlying) { s.t = s.flight; landedNow.push(s); this.sparkLanded++; } // 多すぎる ときは その場で 落ちた ことに
      else this.sparks.push(s);
    }
    return n;
  }

  /**
   * 進める。mouth = 口の 世界の 位置、landAt = 着地点の 面を 調べる、aim = プレイヤーの 足もと（ねらう。なければ ねらわない）。
   * この コマで とんだ 隕石・着地した 隕石・落ちた 火の 粉を 返す
   */
  update(dt: number, mouth: V3, landAt: (x: number, z: number) => LandInfo, aim?: V3 | null): { landed: Meteor[]; launched: Meteor[]; sparkLanded: Spark[] } {
    const K = T.eruption.meteor, landed: Meteor[] = [], launched: Meteor[] = [], sparkLanded: Spark[] = [];
    if (!this.active) return { landed, launched, sparkLanded };
    this.clock += dt;
    let n = 0;
    while (this.spawned < K.count && this.times[this.spawned]! <= this.clock && this.meteors.length < K.maxFlying && n < K.maxLaunchPerFrame) {
      const pk = this.pick(mouth, aim);
      const info = landAt(pk.x, pk.z);
      const m: Meteor = {
        id: this.spawned, aimed: pk.aimed,
        sx: mouth.x, sy: mouth.y, sz: mouth.z, lx: pk.x, ly: info.y, lz: pk.z, body: info.body, t: 0,
        flight: K.flightMin + this.rnd() * (K.flightMax - K.flightMin), apex: K.apexMin + this.rnd() * (K.apexMax - K.apexMin),
      };
      if (m.aimed) this.aimedCount++;
      this.meteors.push(m); launched.push(m); this.spawned++; n++;
    }
    // 火の 粉（先に 進める: この コマで 生まれた ものは 次の コマから とぶ）
    let w = 0;
    for (const s of this.sparks) {
      s.t += dt;
      if (s.t >= s.flight) { sparkLanded.push(s); this.sparkLanded++; } else this.sparks[w++] = s;
    }
    this.sparks.length = w;
    w = 0;
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= m.flight) {
        landed.push(m); this.landedCount++;
        const k = this.splash(m, landAt, sparkLanded);
        this.impacts.push({ id: m.id, x: m.lx, y: m.ly, z: m.lz, body: m.body, aimed: m.aimed, sparks: k });
      } else this.meteors[w++] = m;
    }
    this.meteors.length = w;
    if (this.spawned >= K.count && this.meteors.length === 0 && this.sparks.length === 0) this.active = false;
    return { landed, launched, sparkLanded };
  }

  /** いまの 位置 */
  position(a: Flyer, out: V3): V3 { return flyerAt(a, a.t, out); }

  /** 予告の 輪の 強さ 0〜1（warnSec 前から 出て、着地で 1） */
  warn(a: Flyer): number {
    const left = a.flight - a.t, W = T.eruption.meteor.warnSec;
    return left >= W ? 0 : Math.max(0, Math.min(1, 1 - left / W));
  }

  /** 止める（片づけ） */
  stop(): void { this.active = false; this.meteors = []; this.sparks = []; }
}

/** 燃えかす。from = どの 隕石の もの か（着地点・飛び散った 火の 粉。テスト・デバッグ用。なければ -1） */
export interface Ember { id: number; x: number; y: number; z: number; age: number; body: boolean; from: number }

export class Embers {
  list: Ember[] = [];
  /** ならびや 場所が かわる たびに ふえる（描く 側が こげ跡を 書きなおす か 決める） */
  version = 0;
  private cool = 0;
  private serial = 0;

  /** 燃えかすの 場所を 外で かえた（穴の 底へ おろした など） */
  moved(): void { this.version++; }

  add(x: number, y: number, z: number, body: boolean, from = -1): Ember {
    const K = T.eruption.ember;
    if (this.list.length >= K.max) this.list.shift();
    const e: Ember = { id: this.serial++, x, y, z, age: 0, body, from };
    this.list.push(e);
    this.version++;
    return e;
  }

  update(dt: number): void {
    const sec = T.eruption.ember.sec;
    let w = 0;
    for (const e of this.list) { e.age += dt; if (e.age < sec) this.list[w++] = e; }
    if (w !== this.list.length) this.version++;
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

  /** 当たった 燃えかすを 消す（殴る・刀を 当てる）。消した ものを 返す */
  douse(hit: (e: Ember) => boolean): Ember[] {
    const gone: Ember[] = [];
    let w = 0;
    for (const e of this.list) { if (hit(e)) gone.push(e); else this.list[w++] = e; }
    this.list.length = w;
    if (gone.length) this.version++;
    return gone;
  }

  clear(): void { this.list.length = 0; this.cool = 0; this.version++; }
}

/** 隕石・火の 粉が 落ちた 点（x, y, z）の まわり burnRadius の 植物ブロックを 空気に する。近い 順に 最大 burnMax 個。消した マスを 返す */
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

/**
 * 着地点の 小さな 穴: 着地点（x, z）から 水平 crater.radius の マスの、立つ 面（y）の すぐ 下から crater.depth だんを、近い 順に 最大 crater.max マス。
 * こわして よいかは canBreak（ぬりかべと おなじ きまり）に 加えて、調整表 crater.blocks の 名簿（自然の 地面だけ。家・チェスト・扉・置いた ブロックは こわさない）。こわした マスを 返す
 */
export function craterCells(
  x: number, y: number, z: number,
  blockAt: (x: number, y: number, z: number) => string, canBreak: (block: string, y: number) => boolean, setAir: (x: number, y: number, z: number) => boolean,
): { x: number; y: number; z: number; from: string }[] {
  const C = T.eruption.crater, R = C.radius, out: { x: number; y: number; z: number; from: string }[] = [], natural = new Set(C.blocks);
  if (!(R > 0) || C.depth <= 0 || C.max <= 0) return out;
  const top = Math.floor(y + 1e-6) - 1, cells: { x: number; z: number; d: number }[] = [];
  for (let ix = Math.floor(x - R); ix <= Math.floor(x + R); ix++) for (let iz = Math.floor(z - R); iz <= Math.floor(z + R); iz++) {
    const d = Math.hypot(ix + 0.5 - x, iz + 0.5 - z);
    if (d <= R) cells.push({ x: ix, z: iz, d });
  }
  cells.sort((a, b) => a.d - b.d);
  for (const c of cells) {
    for (let j = 0; j < C.depth && out.length < C.max; j++) {
      const iy = top - j, b = blockAt(c.x, iy, c.z);
      if (!natural.has(b) || !canBreak(b, iy)) break;
      if (setAir(c.x, iy, c.z)) out.push({ x: c.x, y: iy, z: c.z, from: b });
    }
    if (out.length >= C.max) break;
  }
  return out;
}
