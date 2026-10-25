import type { AnimalEvent, AnimalFxRecord, AnimalMark, AnimalView, CoopInfo, KitInfo, Vec3 } from '../contracts';
import { playAnimal, type AnimalSoundName } from './animalSounds';
import { ANIMAL_FX, TILE } from './animalFxConfig';
import { ease, headYOf, mix, rngOf } from './animalFxMath';
import type { AnimalFxCounts, BugFlight, MarkRow, Pending, Seen, ZzzRow } from './animalFxTypes';
import { headHeartsInto, type HeadHeart } from './animalHeadHearts';
import { AnimalParticles, type ParticleOut } from './animalParticles';
import type { SoundFx } from './sound';

export { ANIMAL_FX, TILE, TILE_COUNT } from './animalFxConfig';
export { headHeartProgress, headHeartsInto, type HeadHeart } from './animalHeadHearts';
export { AnimalParticles, type ParticleOut } from './animalParticles';
export type { AnimalFxCounts, BugFlight } from './animalFxTypes';

/**
 * LIVE-1（にわとり）の 音・つぶ・頭の 上の ハート（仕様 §3.3・§3.6・§3.7）。Three.js なし の 計算の 係。
 * 描くのは `src/animals/models/AnimalRenderer.ts`（`write()` で 1 つの Points に 書く）。
 * つなぎ込みは 毎ステップ: `fx.onEvents(animals.events())` → `fx.step(views, eye, animals.kits(), animals.coops())`（LIVE-2: こたつ・小屋 は 省略 できる）。
 * 乱数は シード つき（同じ 操作なら 同じ つぶ）。毎ステップ new しない。
 */
/** 小屋 の 子 の しるし: 大きい のは 20 ステップ まで、40 で 消える */
const POP_BIG = 20;
const POP_END = 40;
/** 土けむり の 上限 */
const DUST_MAX = 25;

const CONFETTI_COLORS = [0xe8553d, 0xf2b33d, 0x5fbf6a, 0x4a90d9, 0xf08fb4, 0xf28a2e] as const;

export interface AnimalFxDeps {
  sound: Pick<SoundFx, 'playTones'>;
  /** 「動きの 強さ」0〜1（0 で 紙ふぶき・はじけ・ジャンプの 高さを 止める。ハート 1 つ と 音は のこす）。なければ 1 */
  motion?: () => number;
  /** 頭の 上の ハートが 出る 近さ（設定 animalLookDist）。なければ 6 */
  lookDist?: () => number;
  /** おなかいっぱい の 全部 の 長さ（設定 animalFullTicks。しるし の 小ささ の 基準）。なければ 600 */
  fullTicks?: () => number;
  /** 乱数の シード（つぶの 場所） */
  seed?: number;
}

const RUSTLES = ['rustle', 'rustle2', 'rustle3'] as const;
const FLIGHT_SLOTS = 4;


export class AnimalFx {
  /** 鳴らした 音の 名前（テスト用。長くなりすぎない） */
  readonly played: AnimalSoundName[] = [];
  readonly particles = new AnimalParticles();
  /** とんで いる むし（描く 側が 読む。あみ を ふって 10〜30 ステップ） */
  readonly flights: BugFlight[] = [];
  private readonly counts: AnimalFxCounts = { hearts: 0, burst: 0, confetti: 0, puff: 0, sparkle: 0, leaf: 0, shell: 0, dust: 0 };
  private readonly rnd: () => number;
  private readonly heads: HeadHeart[] = [];
  private headN = 0;
  private readonly marks: MarkRow[] = [];
  private markN = 0;
  private pickId: number | null = null;
  private readonly zzzRows: ZzzRow[] = [];
  private zzzN = 0;
  /** 最後に かえる 動き が はじまった こたつ の 場所と ステップ（かえった 子 が まだ 見えない とき の つぶ の 場所） */
  private hatchAt = { x: 0, y: 0, z: 0, tick: -1e9 };
  /** 「かえる」の 音を 鳴らした ステップ（二重に ならさない） */
  private hatchDefaultAt = -1e9;
  private hatchedBefore = false;
  private machoBefore = false;
  private readonly seen = new Map<number, Seen>();
  /** 小屋 の 子 に なった ステップ（id → tick）。40 ステップ で 忘れる */
  private readonly homePops = new Map<number, number>();
  private readonly pending: Pending[] = [];
  private gen = 0;
  private tick = 0;
  private flutterThisStep = false;
  private rustleLast = -1;
  private readonly eye: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: AnimalFxDeps) {
    this.rnd = rngOf(d.seed ?? 65);
  }

  private motion(): number {
    return this.d.motion ? this.d.motion() : 1;
  }

  private snd(name: AnimalSoundName): void {
    playAnimal(this.d.sound, name);
    this.played.push(name);
    if (this.played.length > 64) this.played.shift();
  }

  // ---------------------------------------------------------------- 毎ステップ

  /** 1 ステップ。`views` = 今 見えている にわとり（`animals.forEachVisible`）、`eye` = プレイヤー の 位置 */
  step(views: readonly AnimalView[], eye: Vec3, kits: readonly KitInfo[] = [], coops: readonly CoopInfo[] = []): void {
    this.tick++;
    this.gen++;
    this.eye.x = eye.x;
    this.eye.y = eye.y;
    this.eye.z = eye.z;
    this.flutterThisStep = false;
    const gen = this.gen;
    const r2 = ANIMAL_FX.cluckRange * ANIMAL_FX.cluckRange;
    const fr2 = ANIMAL_FX.flutterRange * ANIMAL_FX.flutterRange;
    for (const v of views) {
      let s = this.seen.get(v.id);
      if (!s) {
        s = { x: 0, y: 0, z: 0, gen, flutterAt: -1e9 };
        this.seen.set(v.id, s);
      }
      s.x = v.x;
      s.y = v.y;
      s.z = v.z;
      s.gen = gen;
      const dx = v.x - eye.x;
      const dz = v.z - eye.z;
      // コッコッ: やせい だけ。300〜600 ステップに 1 回（にわとり ごとに ずらす）
      if (!v.friend && dx * dx + dz * dz <= r2) {
        const period = ANIMAL_FX.cluckMin + (mix(v.id, 11) % ANIMAL_FX.cluckSpan);
        const off = mix(v.id, 23) % period;
        if ((this.tick + off) % period === 0) this.snd('cluck');
      }
      // ぴよぴよ（LIVE-2）: ひよこ。`cluck` と 同じ 間隔 の きまり（ずらし かたは ちがう）
      if (v.stage === 'chick' && dx * dx + dz * dz <= r2) {
        const period = ANIMAL_FX.cluckMin + (mix(v.id, 37) % ANIMAL_FX.cluckSpan);
        const off = mix(v.id, 41) % period;
        if ((this.tick + off) % period === 0) this.snd('peep');
      }
      // すやすや（LIVE-2）: 近く で ねて いる 子 の いびき。いきの 1 しゅう（90）に 1 回
      if (v.state === 'sleep' && !v.carried && dx * dx + dz * dz <= ANIMAL_FX.sleepRange * ANIMAL_FX.sleepRange) {
        const off = mix(v.id, 53) % ANIMAL_FX.snoreGap;
        if ((this.tick + off) % ANIMAL_FX.snoreGap === 0) this.snd('sleep');
      }
      // パタパタ: おちる あいだ 16 ステップ に 1 回、近い とき だけ。1 ステップ に 1 回 まで。着地で 止まる
      if (v.fluttering && !v.carried) {
        if (!this.flutterThisStep && dx * dx + dz * dz <= fr2 && this.tick - s.flutterAt >= ANIMAL_FX.flutterGap) {
          this.snd('flutter');
          s.flutterAt = this.tick;
          this.flutterThisStep = true;
        }
      } else s.flutterAt = -1e9;
    }
    if (this.seen.size > views.length) for (const [id, s] of this.seen) if (s.gen !== gen) this.seen.delete(id);
    const dist = this.d.lookDist ? this.d.lookDist() : ANIMAL_FX.lookDist;
    this.headN = headHeartsInto(this.heads, views, eye, dist);
    this.collectMarks(views, eye);
    this.stepKits(kits, eye);
    this.stepCoops(coops, eye);
    this.stepFlights();
    this.runPending(); // とび出した ステップ の 経過は 0（次の ステップ から 動く）
    this.particles.step();
  }

  /** こたつ の ゆれ の 音（近く 8 マス だけ。じっと = なし、ときどき = 600 ステップ ごと、よく = 180 ごと の 頭 の 12 ステップ 目 から） */
  private stepKits(kits: readonly KitInfo[], eye: Vec3): void {
    const r2 = ANIMAL_FX.kitRange * ANIMAL_FX.kitRange;
    for (const k of kits) {
      if (k.egg === null || k.wobble === 0) continue;
      const dx = k.x + 0.5 - eye.x;
      const dz = k.z + 0.5 - eye.z;
      if (dx * dx + dz * dz > r2) continue;
      const period = k.wobble === 2 ? 180 : 600;
      if (k.left % period === 11) {
        this.snd('kitWobble');
        break; // 1 ステップ に 1 回 まで
      }
    }
  }

  /** 小屋: 金 の たまご が すばこ に ある あいだ、ときどき キラッ（ふんいき。数えない） */
  private stepCoops(coops: readonly CoopInfo[], eye: Vec3): void {
    if (this.motion() <= 0 || this.tick % ANIMAL_FX.goldCoopGap !== 0) return;
    for (const c of coops) {
      if (c.nest.gold <= 0) continue;
      const dx = c.x + 0.5 - eye.x;
      const dz = c.z + 0.5 - eye.z;
      if (dx * dx + dz * dz > ANIMAL_FX.cluckRange * ANIMAL_FX.cluckRange) continue;
      const a = this.rnd() * Math.PI * 2;
      this.particles.spawn(4, c.x + 0.5 + Math.cos(a) * 0.6, c.y + 0.6, c.z + 0.5 + Math.sin(a) * 0.6, 0, 0.35, 0, 30, 0.14, 0xffe27a);
    }
  }

  /** 頭の 上の しるし の 組（ハート／あしあと・おなかいっぱい）を 集める（§3.3） */
  private collectMarks(views: readonly AnimalView[], eye: Vec3): void {
    let n = 0;
    let z = 0;
    let targetRow = false;
    const md2 = ANIMAL_FX.markDist * ANIMAL_FX.markDist;
    for (const v of views) {
      if (v.carried) continue; // だっこ 中は 出さない（手の 中に ある）
      if (v.state === 'sleep') {
        let r = this.zzzRows[z];
        if (!r) r = this.zzzRows[z] = { id: 0, x: 0, y: 0, z: 0 };
        z++;
        r.id = v.id;
        r.x = v.x;
        r.y = v.y + headYOf(v);
        r.z = v.z;
      }
      let hearts = 0;
      for (let h = 0; h < this.headN; h++) if (this.heads[h].id === v.id) hearts = this.heads[h].filled;
      const dx = v.x - eye.x;
      const dz = v.z - eye.z;
      const near = dx * dx + dz * dz <= md2;
      const follow = v.follow ?? 0;
      const fullLeft = v.fullLeft ?? 0;
      const steps = v.friend && near && follow > 0 ? (follow > ANIMAL_FX.stepsHigh ? 3 : follow > ANIMAL_FX.stepsMid ? 2 : 1) : 0;
      const full = near && fullLeft > 0;
      const home = near && (v.homeFill ?? 0) > 0 ? Math.min(1, v.homeFill ?? 0) : 0;
      const popAge = near ? this.popAge(v.id) : -1;
      const pick = this.pickId !== null && v.id === this.pickId;
      // LIVE-4: ねらい の しるし（同時 に 1 行 まで。妖怪 の id）。「！」
      if (v.target !== undefined && !targetRow) {
        targetRow = true;
        const t = this.markRow(n++);
        t.id = v.target;
        t.machoTarget = true;
      }
      const bang = v.bang === true;
      if (hearts === 0 && steps === 0 && !full && home === 0 && popAge < 0 && !pick && !bang) continue;
      const m = this.markRow(n++);
      m.pick = pick;
      m.bang = bang;
      m.id = v.id;
      m.x = v.x;
      m.y = v.y;
      m.z = v.z;
      m.hearts = hearts;
      m.steps = steps;
      m.follow = follow;
      m.fullLeft = full ? fullLeft : 0;
      m.home = home;
      m.pop = popAge;
      m.headY = headYOf(v);
    }
    this.markN = n;
    this.zzzN = z;
  }

  /** しるし の 行 n を きれいに して 返す（使いまわし） */
  private markRow(n: number): MarkRow {
    let m = this.marks[n];
    if (!m) m = this.marks[n] = { id: 0, x: 0, y: 0, z: 0, hearts: 0, steps: 0, follow: 0, fullLeft: 0, home: 0, headY: ANIMAL_FX.headHeartY, pop: -1, pick: false, bang: false, machoTarget: false };
    m.id = 0;
    m.x = m.y = m.z = 0;
    m.hearts = 0;
    m.steps = 0;
    m.follow = 0;
    m.fullLeft = 0;
    m.home = 0;
    m.headY = ANIMAL_FX.headHeartY;
    m.pop = -1;
    m.pick = false;
    m.bang = false;
    m.machoTarget = false;
    return m;
  }

  /** 少し あとで 起きる もの（あみ を ふって 10 ステップ 目）を 流す */
  private runPending(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > this.tick) continue;
      this.pending.splice(i, 1);
      if (p.act === 'shell') this.shells(p);
      else if (p.act === 'hatchSnd') {
        this.snd('hatch');
        this.hatchDefaultAt = this.tick;
      } else this.swingDone(p);
    }
  }

  private swingDone(p: Pending): void {
    // はっぱ 4（とれても とれなくても）
    this.counts.leaf += ANIMAL_FX.leaf;
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    const cz = p.z + 0.5;
    for (let i = 0; i < ANIMAL_FX.leaf; i++) {
      const a = this.rnd() * Math.PI * 2;
      const g = this.rnd();
      this.particles.spawn(5, cx + Math.cos(a) * 0.5, cy + 0.3 + g * 0.3, cz + Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.9 + g * 0.6, Math.sin(a) * 0.5, 28 + Math.floor(g * 10), 0.13, g < 0.5 ? 0x6ea04a : 0x8cc152);
    }
    if (p.caught) {
      this.startFlight(cx, cy, cz);
      return;
    }
    // とれなかった: がさがさ（3 しゅるい から 直前と ちがう もの）
    let k = 0;
    if (this.rustleLast >= 0) {
      k = (this.rustleLast + 1 + Math.floor(this.rnd() * 2)) % RUSTLES.length;
    }
    this.rustleLast = k;
    this.snd(RUSTLES[k]);
    if (p.reason === 'empty') this.snd('animalHint'); // おやすみ の き は「おしい」
  }

  /** から の かけら 6（かえる 動き の ぽんっ で こたつ の 足もと に ころがる） */
  private shells(p: Pending): void {
    this.counts.shell += ANIMAL_FX.shell;
    if (this.motion() <= 0) return;
    for (let i = 0; i < ANIMAL_FX.shell; i++) {
      const a = (i / ANIMAL_FX.shell) * Math.PI * 2 + this.rnd();
      const sp = 0.8 + this.rnd() * 0.8;
      this.particles.spawn(6, p.x, p.y + 0.25, p.z, Math.cos(a) * sp, 1.6 + this.rnd(), Math.sin(a) * sp, 36 + Math.floor(this.rnd() * 10), 0.1, i % 3 === 2 ? 0xe2d6b8 : 0xf5ecd8);
    }
  }

  private startFlight(cx: number, cy: number, cz: number): void {
    if (this.motion() <= 0) return; // むし は すぐ 持ち物 へ（弧 を 止める）
    if (this.flights.length >= FLIGHT_SLOTS) this.flights.shift();
    // ねらった ブロック の プレイヤー がわ の 面 から ぴょん と 出る
    const dx = this.eye.x - cx;
    const dz = this.eye.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const sx = cx + (dx / len) * 0.55;
    const sz = cz + (dz / len) * 0.55;
    this.flights.push({ x: sx, y: cy, z: sz, yaw: Math.atan2(-dx, -dz), pitch: 0, scale: 0.4, curl: 0, age: 0, sx, sy: cy, sz });
  }

  private stepFlights(): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.age++;
      if (f.age >= ANIMAL_FX.bugFly) {
        this.flights.splice(i, 1);
        continue;
      }
      const t = f.age / ANIMAL_FX.bugFly;
      const k = ease(t);
      // 行き先 = プレイヤー の 胸（毎ステップ 読みなおす）
      const tx = this.eye.x;
      const ty = this.eye.y - 0.35;
      const tz = this.eye.z;
      const px = f.x;
      const py = f.y;
      const pz = f.z;
      f.x = f.sx + (tx - f.sx) * k;
      f.z = f.sz + (tz - f.sz) * k;
      f.y = f.sy + (ty - f.sy) * k + 0.55 * Math.sin(Math.PI * t); // 弧
      const mx = f.x - px;
      const mz = f.z - pz;
      if (mx * mx + mz * mz > 1e-8) f.yaw = Math.atan2(-mx, -mz); // 頭（−z）が すすむ 向き
      f.pitch = Math.atan2(f.y - py, Math.hypot(mx, mz) + 1e-4) * 0.6;
      f.scale = t < 0.2 ? 0.4 + 0.6 * ease(t / 0.2) : 1 - 0.35 * ease((t - 0.2) / 0.8);
      f.curl = 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6)); // 空中 で まるまる
    }
  }

  // ---------------------------------------------------------------- 出来事

  /** `animals.events()` を 流す（毎ステップ。1 つずつ 音・つぶに する） */
  onEvents(events: readonly AnimalEvent[]): void {
    for (const e of events) this.one(e);
  }

  private pop(id: number): void {
    this.counts.hearts++;
    const s = this.seen.get(id);
    if (s) this.particles.spawn(1, s.x, s.y + ANIMAL_FX.headHeartY + 0.1, s.z, 0, 0.9, 0, 40, 0.22, 0xffffff);
  }

  private burst(id: number, first: boolean): void {
    if (this.motion() <= 0) return;
    const n = first ? ANIMAL_FX.burstFirst : ANIMAL_FX.burstNext;
    this.counts.burst += n;
    const s = this.seen.get(id);
    if (!s) return;
    const a0 = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      this.particles.spawn(1, s.x, s.y + 0.55, s.z, Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4, 36, 0.2, 0xffffff);
    }
  }

  /** 子 の いる 場所（見えて いれば その 子、まだ なら かえる こたつ） */
  private whereIs(id: number): Vec3 | null {
    const s = this.seen.get(id);
    if (s) return s;
    return this.tick - this.hatchAt.tick <= 120 ? this.hatchAt : null;
  }

  private confetti(id: number): void {
    const s = this.whereIs(id);
    this.confettiAt(s);
  }

  private confettiAt(s: Vec3 | null): void {
    if (this.motion() <= 0) return;
    const n = ANIMAL_FX.confetti;
    this.counts.confetti += n;
    if (!s) return;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 0.8 + this.rnd() * 1.6;
      const up = 3 + this.rnd() * 2.2;
      const c = CONFETTI_COLORS[Math.floor(this.rnd() * CONFETTI_COLORS.length)];
      this.particles.spawn(2, s.x, s.y + 0.6, s.z, Math.cos(a) * sp, up, Math.sin(a) * sp, 60 + Math.floor(this.rnd() * 30), 0.09, c);
    }
  }

  private sparkleAt(x: number, y: number, z: number, n: number): void {
    this.counts.sparkle += n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd();
      this.particles.spawn(4, x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, 0, 0.5, 0, 30, 0.16, 0xffe27a);
    }
  }

  /** 小屋 の 子 に なって から の ステップ（40 いじょう・なって いない は -1） */
  private popAge(id: number): number {
    const t = this.homePops.get(id);
    if (t === undefined) return -1;
    const a = this.tick - t;
    if (a >= POP_END) {
      this.homePops.delete(id);
      return -1;
    }
    return a;
  }

  /**
   * `fx().homePop`: 小屋 の 子 に なった しるし の 大きさ の 段 0〜1。20 ステップ まで 1、40 で 0。
   * いちばん 新しい 子 の 値（なければ 0）
   */
  homePop(): number {
    let best = 0;
    for (const [id, t] of this.homePops) {
      const a = this.tick - t;
      if (a >= POP_END) {
        this.homePops.delete(id);
        continue;
      }
      best = Math.max(best, a < POP_BIG ? 1 : 1 - (a - POP_BIG) / (POP_END - POP_BIG));
    }
    return best;
  }

  /**
   * 置き物 を たいら に した 足もと の 土けむり（LIVE-2.1 §2.1）。`cols` = 計画 の `dust`（1 列 1 つ）。25 まで。
   * つなぎ込み が 置いた ステップ に 呼ぶ（`DigSystem.takeFlattenDust()`・`coopPlan().dust`）
   */
  flattenDust(cols: ReadonlyArray<{ x: number; y: number; z: number }>): void {
    const n = Math.min(cols.length, DUST_MAX);
    this.counts.dust += n;
    if (this.motion() <= 0) return;
    for (let i = 0; i < n; i++) {
      const c = cols[i]!;
      const a = this.rnd() * Math.PI * 2;
      this.particles.spawn(3, c.x + 0.5, c.y + 0.1, c.z + 0.5, Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3, 26, 0.3, 0xb8a27c);
    }
  }

  /** 音 を 1 つ 鳴らす（出来事 に ならない もの: こたつ に 入れた〈`kitPut`〉・小屋 を 置いた〈`coopPlace`〉。つなぎ込み が 呼ぶ） */
  play(name: AnimalSoundName): void {
    this.snd(name);
  }

  /** LIVE-4: パンチ が 当たった 星（ふつう = 白 の 小さな ポコッ 2 つ、きりあげ = 上 へ とぶ 星 3 つ。赤 は 使わない） */
  private punchStars(x: number, y: number, z: number, upper: boolean): void {
    const n = upper ? 3 : 2;
    this.counts.sparkle += n;
    if (this.motion() <= 0) return;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd();
      if (upper) this.particles.spawn(4, x + Math.cos(a) * 0.15, y, z + Math.sin(a) * 0.15, Math.cos(a) * 0.5, 3.2 + this.rnd(), Math.sin(a) * 0.5, 30, 0.16, i === 1 ? 0xffe27a : 0xffffff);
      else this.particles.spawn(4, x + Math.cos(a) * 0.1, y, z + Math.sin(a) * 0.1, Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9, 18, 0.12, i === 0 ? 0xffffff : 0xffe27a);
    }
  }

  private puff(p: Vec3, n: number = ANIMAL_FX.puffEach): void {
    this.counts.puff += n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd();
      this.particles.spawn(3, p.x + Math.cos(a) * 0.12, p.y + 0.25, p.z + Math.sin(a) * 0.12, Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35, 24, 0.3, 0xf4f1ea);
    }
  }

  private one(e: AnimalEvent): void {
    // LIVE-2.1: なげる／当たる
    if (e.type === 'toss') {
      this.snd('toss');
      return;
    }
    if (e.type === 'bonk') {
      this.snd('bonk');
      if (this.motion() > 0) this.puff({ x: e.x, y: e.y - 0.2, z: e.z }, 2);
      else this.counts.puff += 2;
      return;
    }
    switch (e.type) {
      case 'feed':
        this.snd('feed');
        this.pop(e.id);
        break;
      case 'friend':
        this.snd(e.first ? 'friendFirst' : 'friend');
        this.burst(e.id, e.first);
        if (e.first) this.confetti(e.id);
        break;
      case 'pet':
        // やせいを なでた だけ では ここでは 音を 出さない（合図の 音は `hint`）
        if (e.friend) {
          this.snd('petAnimal');
          this.pop(e.id);
        }
        break;
      case 'egg':
        if (e.gold === true) {
          // 金 の たまご: 毎回 おおきく（きらきら ＋ ファンファーレ・紙ふぶき 60・キラッ 8）
          this.snd('goldenEgg');
          this.confettiAt({ x: e.x, y: e.y - 0.1, z: e.z });
          this.sparkleAt(e.x, e.y + 0.35, e.z, ANIMAL_FX.goldSparkle);
          break;
        }
        this.snd('egg');
        this.counts.sparkle += ANIMAL_FX.sparkle;
        for (let i = 0; i < ANIMAL_FX.sparkle; i++) {
          const a = (i / ANIMAL_FX.sparkle) * Math.PI * 2 + this.rnd();
          this.particles.spawn(4, e.x + Math.cos(a) * 0.18, e.y + 0.35, e.z + Math.sin(a) * 0.18, 0, 0.5, 0, 30, 0.16, 0xffe27a);
        }
        break;
      case 'warp':
        this.snd('warp');
        this.puff(e.from);
        this.puff(e.to);
        break;
      case 'hint':
        this.snd('animalHint');
        break;
      // ---- 版 3.2
      case 'full':
        this.snd('animalFull');
        break;
      case 'followEnd': {
        this.snd('followEnd');
        const s = this.seen.get(e.id);
        if (s) this.puff(s, ANIMAL_FX.puffFollowEnd);
        else this.counts.puff += ANIMAL_FX.puffFollowEnd;
        break;
      }
      case 'carry':
        this.snd('carryUp');
        break;
      case 'putDown':
        this.snd('carryDown');
        break;
      case 'swing':
        // 押した ステップ に ひゅっ。はっぱ・がさがさ・むし の とび出し は 10 ステップ 目（ふりぬいた とき）
        this.snd('netSwing');
        this.pending.push({ at: this.tick + ANIMAL_FX.bugPop, x: Math.floor(e.x), y: Math.floor(e.y), z: Math.floor(e.z), caught: e.caught, reason: e.reason });
        break;
      case 'bugCatch':
        this.snd('bugCatch');
        this.counts.sparkle += ANIMAL_FX.sparkleBug;
        for (let i = 0; i < ANIMAL_FX.sparkleBug; i++) {
          const a = (i / ANIMAL_FX.sparkleBug) * Math.PI * 2 + this.rnd();
          this.particles.spawn(4, this.eye.x + Math.cos(a) * 0.3, this.eye.y - 0.45, this.eye.z + Math.sin(a) * 0.3, 0, 0.4, 0, 26, 0.12, 0xffe27a);
        }
        break;
      // ---- LIVE-2
      case 'hatchStart':
        // ぽんっ の 20 ステップ 目 に から の かけら。音は 次の ステップ（同じ ステップ の `hatch` が 先に 決めて いたら それ）
        this.hatchAt = { x: e.x + 0.5, y: e.y, z: e.z + 0.5, tick: this.tick };
        this.pending.push({ at: this.tick + ANIMAL_FX.shellAt, x: e.x + 0.5, y: e.y, z: e.z + 0.5, caught: false, reason: 'miss', act: 'shell' });
        this.pending.push({ at: this.tick + 1, x: 0, y: 0, z: 0, caught: false, reason: 'miss', act: 'hatchSnd' });
        break;
      case 'hatch': {
        const first = e.first ?? !this.hatchedBefore;
        const firstMacho = e.breed === 'macho' && !this.machoBefore;
        this.hatchedBefore = true;
        if (e.breed === 'macho') this.machoBefore = true;
        // 予約 して いた ふつう の 音 は とりけす
        for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].act === 'hatchSnd') this.pending.splice(i, 1);
        const alreadyNormal = this.tick - this.hatchDefaultAt <= 90;
        if (first) this.snd('hatchFirst');
        else if (e.breed === 'macho') this.snd('hatchMacho');
        else if (!alreadyNormal) this.snd('hatch');
        if (first || firstMacho) this.confetti(e.id);
        if (e.gold) this.sparkleAt(this.hatchAt.x, this.hatchAt.y + 0.4, this.hatchAt.z, ANIMAL_FX.goldSparkle);
        break;
      }
      case 'home': {
        this.snd('home');
        this.homePops.set(e.id, this.tick);
        this.counts.hearts += ANIMAL_FX.homeHearts;
        const s = this.seen.get(e.id);
        if (s) {
          for (let i = 0; i < ANIMAL_FX.homeHearts; i++) {
            const a = (i / ANIMAL_FX.homeHearts) * Math.PI * 2 + this.rnd();
            this.particles.spawn(1, s.x + Math.cos(a) * 0.2, s.y + 0.55, s.z + Math.sin(a) * 0.2, Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3, 40, 0.22, 0xffffff);
          }
        }
        break;
      }
      case 'grow': {
        // はじめて: ファンファーレ ＋ 紙ふぶき。2 わ目 から: オルゴール 3 音 ＋ キラッ 8
        this.snd(e.first ? 'growFirst' : 'grow');
        if (e.first) this.confetti(e.id);
        else {
          const s = this.seen.get(e.id);
          if (s) this.sparkleAt(s.x, s.y + 0.6, s.z, ANIMAL_FX.growSparkle);
          else this.counts.sparkle += ANIMAL_FX.growSparkle;
        }
        break;
      }
      case 'coopCollect':
        if (e.egg + e.gold > 0) {
          this.snd('collect'); // 音の 名前は いつも collect（仕様）。多い とき は ころころ の つづき を 重ねる
          if (e.egg + e.gold >= ANIMAL_FX.collectMany) this.snd('collectMany');
        }
        break;
      // ---- GOLD-1
      case 'harapanFeed': {
        // 2 回 ジャンプ は A（'cheer' 40）。ハート 8 こ が ふわっ（なでる の ハート の つぶ を 数 だけ ふやして 使い回す）
        this.snd('harapanFeed');
        const s = this.seen.get(e.id);
        const n = ANIMAL_FX.harapanHearts;
        this.counts.hearts += n;
        if (s) {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + this.rnd();
            this.particles.spawn(1, s.x + Math.cos(a) * 0.25, s.y + ANIMAL_FX.headHeartY, s.z + Math.sin(a) * 0.25, Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3, 44, 0.22, 0xffffff);
          }
        }
        break;
      }
      case 'natsukiGold': {
        this.snd('natsukiGold');
        const s = this.seen.get(e.id);
        if (s) this.sparkleAt(s.x, s.y + 0.6, s.z, ANIMAL_FX.natsukiSparkle);
        else this.counts.sparkle += ANIMAL_FX.natsukiSparkle;
        break;
      }
      case 'natsukiReady':
        this.snd('natsukiReady');
        break;
      // ---- LIVE-3: とびら の 音 `coopDoor`（しまりきった・あがりきった）・一言 の 音 `itadakimasu`（1 回）。つぶ・紙ふぶき・ハート は 出さない
      case 'meatDoor':
        this.snd('coopDoor');
        break;
      case 'meatSay':
        this.snd('itadakimasu');
        break;
      case 'natsukiWait': // 合図 の 音 は `hint`（今 の animalHint）。こっち を 見て くび を かしげる のは A
      case 'meatStart':
      case 'meat':
        break;
      // ---- LIVE-4（§3.5）。ねらい の しるし・「！」・顔 は HTML〈`ui/machoMarks`〉。ここ は 音 と 星 の つぶ だけ
      case 'machoTarget':
        this.snd('machoGo');
        break;
      case 'machoPunch':
        this.snd(e.upper ? 'machoUpper' : 'machoPunch');
        this.punchStars(e.x, e.y, e.z, e.upper);
        break;
      case 'machoFlex':
        this.snd('machoFlex');
        break;
      case 'machoGiveUp':
      case 'machoKO':
        break;
      case 'growStart': // 動き だけ（音・つぶ は 大人 に なった とき）
      case 'roll': // ころん: 音は なし（ひよこ の パタパタ の 着地。からだ の うごき で 見せる）
      case 'coopLocked': // 音 `animalHint` は A が 合図 と いっしょに 出す
      case 'carryHint':
      case 'spawn':
      case 'remove':
        break;
    }
  }

  // ---------------------------------------------------------------- 窓口・描く 側へ

  /** `animals.fx()`: 出た つぶの 数 と、今 出ている 頭の 上の しるし（`marks`） */
  fx(): AnimalFxRecord {
    const marks: AnimalMark[] = [];
    for (let i = 0; i < this.markN; i++) {
      const m = this.marks[i];
      const row: AnimalMark = { id: m.id, full: m.fullLeft > 0 };
      if (m.hearts > 0) row.hearts = m.hearts;
      if (m.steps > 0) row.steps = m.steps;
      if (m.home > 0) row.home = m.home;
      if (this.pickId !== null && m.id === this.pickId) row.pick = true;
      if (m.bang) row.bang = true;
      if (m.machoTarget) {
        row.machoTarget = true;
        row.yokai = m.id;
      }
      marks.push(row);
    }
    return { ...this.counts, zzz: this.zzzN, marks, homePop: this.homePop() } as AnimalFxRecord;
  }

  /** LIVE-3: メニュー ページ 2 で えらんで いる 子（世界 の 頭 の 上 に ▼。null で 消す） */
  setPick(id: number | null): void {
    this.pickId = id;
  }

  /** いま ▼ を 出す 子 の id（描く 側 が 位置 を 探す） */
  pick(): number | null {
    return this.pickId;
  }

  /** `animals.fxReset()` */
  fxReset(): void {
    this.counts.hearts = 0;
    this.counts.burst = 0;
    this.counts.confetti = 0;
    this.counts.puff = 0;
    this.counts.sparkle = 0;
    this.counts.leaf = 0;
    this.counts.shell = 0;
    this.counts.dust = 0;
  }

  /**
   * 描く 配列に 書く（頭の 上の しるし → つぶ の 順）。`right` = カメラの 右（水平）の 向き。
   * しるし 1 組 = ハート 3 つ か あしあと 3 つ（あれば）＋ おなかいっぱい 1 つ。戻り値 = 書いた 数。
   */
  write(out: ParticleOut, cap: number, right: { x: number; z: number }): number {
    let n = 0;
    const len = Math.hypot(right.x, right.z) || 1;
    const rx = right.x / len;
    const rz = right.z / len;
    const gap = ANIMAL_FX.headHeartGap;
    const fullTicks = this.d.fullTicks ? this.d.fullTicks() : ANIMAL_FX.fullTicks;
    const put = (m: MarkRow, off: number, tile: number, size: number, shade: number): void => {
      const j = n * 3;
      out.pos[j] = m.x + rx * off;
      out.pos[j + 1] = m.y + m.headY;
      out.pos[j + 2] = m.z + rz * off;
      out.col[j] = out.col[j + 1] = out.col[j + 2] = shade;
      out.size[n] = size;
      out.tile[n] = tile;
      n++;
    };
    // のこり 1,800 以下 の あしあと は 60 ステップ で 1 しゅう、うすく → こく（0.56〜1.0。強い 点滅 に しない）
    const wave = 0.78 + 0.22 * Math.sin((2 * Math.PI * this.tick) / ANIMAL_FX.fadePeriod);
    for (let h = 0; h < this.markN; h++) {
      const m = this.marks[h];
      if (n + 5 > cap) break;
      const hasMain = m.hearts > 0 || m.steps > 0;
      if (m.hearts > 0) {
        for (let i = 0; i < ANIMAL_FX.headHearts; i++) put(m, (i - 1) * gap, i < m.hearts ? TILE.heartFull : TILE.heartEmpty, ANIMAL_FX.headHeartSize, 1);
      } else if (m.steps > 0) {
        const shade = m.follow <= ANIMAL_FX.stepsFade ? wave : 1;
        for (let i = 0; i < ANIMAL_FX.headHearts; i++) put(m, (i - 1) * gap, i < m.steps ? TILE.footFull : TILE.footEmpty, ANIMAL_FX.headHeartSize * 0.95, shade);
      }
      if (m.fullLeft > 0) {
        const k = Math.max(0, Math.min(1, m.fullLeft / fullTicks));
        put(m, hasMain ? 2 * gap : 0, TILE.belly, ANIMAL_FX.headHeartSize * (0.55 + 0.45 * k), 1);
      }
      if (m.pop >= 0) {
        // LIVE-2.1: 小屋 の 子 に なった しゅんかん。ふだん の 1.5 倍 で ぽんっ → 20 ステップ で ふつう → 40 で 消える
        const k = m.pop < POP_BIG ? 1.5 - 0.5 * (m.pop / POP_BIG) : 1;
        put(m, hasMain || m.fullLeft > 0 ? -2 * gap : 0, TILE.house3, ANIMAL_FX.headHeartSize * k, 1);
      } else if (m.home > 0) {
        // いえ の しるし: 小屋 に 入る とちゅう。3 だんかい（1/3・2/3・ぜんぶ）で うまる
        const tile = m.home >= 1 ? TILE.house3 : m.home >= 2 / 3 ? TILE.house2 : m.home >= 1 / 3 ? TILE.house1 : TILE.houseEmpty;
        put(m, hasMain || m.fullLeft > 0 ? -2 * gap : 0, tile, ANIMAL_FX.headHeartSize, 1);
      }
    }
    // Z: ねて いる あいだ 1 わ 1 つ。ゆっくり 上へ のぼって ちいさく きえる（80 ステップ で 1 しゅう）
    for (let i = 0; i < this.zzzN && n < cap; i++) {
      const r = this.zzzRows[i];
      const ph = ((this.tick + (r.id % 7) * 11) % 80) / 80;
      const j = n * 3;
      out.pos[j] = r.x + rx * (0.12 + 0.12 * ph);
      out.pos[j + 1] = r.y + 0.05 + 0.3 * ph;
      out.pos[j + 2] = r.z + rz * (0.12 + 0.12 * ph);
      out.col[j] = out.col[j + 1] = out.col[j + 2] = 1;
      out.size[n] = ANIMAL_FX.headHeartSize * 0.9 * Math.min(1, 0.4 + 2 * ph) * (ph > 0.7 ? 1 - (ph - 0.7) / 0.3 : 1);
      out.tile[n] = TILE.zzz;
      n++;
    }
    return this.particles.write(out, n, cap);
  }
}

