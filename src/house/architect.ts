import { createRng, hashInts, type Rng } from '../world/gen/random';
import { ARCHITECT_WORK } from './build/tuning';
import { ARCHITECT_BODY, Footing, standY, type HouseWorld } from './ground';

/**
 * 建築士さん 1 人（HOUSE-1A。docs/design/HOUSE-1.md §2.2・AC4・AC40）。
 * 体力は ない（たたかれても 消えない・たおれない。「おっとっと」と よろけるだけ）。妖怪の ねらいにも ならない（妖怪は 一覧に 持たない）。
 * 自分の 場所（home）から 横 WANDER_RADIUS マス以内を ゆっくり ぶらぶら。話しかけられると その場で こちらを 向いて うなずく。
 * 乱数は 場所と シードで 決まる（同じ 世界なら 同じ 動き）。1 ステップ = 1/60 秒。DOM・three なし。
 */

/** うなずきの 長さ（ステップ）。頭は 20 コマ、体は 2 コマ おくれて 22 で おわる（docs/art/design/06-housing.md §19.4） */
export const NOD_STEPS = 22;
/** おっとっとの 長さ（コマ。かたむく 3 → よろける 9 → もどる 12） */
const WOBBLE_STEPS = 24;
/** ぶらぶらする 半径。仕様は 3 マス以内。余裕を とって 2.5 */
export const WANDER_RADIUS = 2.5;
/** ねらう 箱（足もとから）: 半幅・高さ。右クリックで 話しかける とき、これに 当てる */
export const ARCHITECT_HIT = { hw: 0.45, h: 1.7 } as const;

/** 歩く はやさ（マス / ステップ）。1 歩 20 コマで 歩幅 0.35 マス ぐらい（ゆっくり） */
const WALK_SPEED = 0.0175;
/** 向きを かえる はやさ（ラジアン / ステップ） */
const TURN_RATE = 0.12;
/** 歩きはじめる とき、進む 向きと これ以内に 向いて から 歩く（ラジアン） */
const FACE_OK = 0.5;
/** 立ちどまる 長さ（ステップ）: 最小・ばらつき */
const WAIT_MIN = 90;
const WAIT_SPAN = 150;
/** 出てきた ばかり・話し おわった あとに 歩きださない 長さ（最小・ばらつき） */
const SETTLE_MIN = 60;
const SETTLE_SPAN = 120;
/** 目的地は 自分の 場所から この きょり 以上 はなれた 点を えらぶ */
const TARGET_MIN = 0.8;
/** 歩幅の 位相が 半周（1 歩）するまでの ステップ */
const GAIT_HALF = 20;
/** 地面の 高さが かわった とき の 追いかけ（1 ステップに 上は 0.18、下は 0.35 マスまで） */
const RISE = 0.18;
const FALL = 0.35;
/** 足もとが 立てない まま これだけ たつと 自分の 列の 地面に あわせ直す */
const STUCK_STEPS = 30;
/** 建築中の とんかち（HOUSE-1C PR-2。数は build/tuning.ts の ARCHITECT_WORK） */
const WORK = ARCHITECT_WORK;

/** ぶらぶらしても 体の 四すみが とどく はんい（home から マス）。この 中の 列の 足もとを おぼえて おく */
const FOOT_REACH = WANDER_RADIUS + ARCHITECT_BODY.radius;

export type ArchitectState = 'idle' | 'walk' | 'talk';

export interface ArchitectInit {
  id: string;
  first: boolean;
  /** 足もと（マスの まん中）。ここが home */
  x: number;
  y: number;
  z: number;
  seed: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Architect {
  readonly id: string;
  readonly first: boolean;
  /** 自分の 場所（ぶらぶらする まん中）。建築で 戸の 前に うつる と かわる（relocate） */
  homeX: number;
  homeZ: number;
  /** 足もと */
  x: number;
  y: number;
  z: number;
  /** 向き（ラジアン。0 = 北 = −z。atan2(dx, −dz)） */
  yaw = 0;
  state: ArchitectState = 'idle';
  /** 歩幅の 位相（ラジアン。1 歩 = π、GAIT_HALF ステップ）と 強さ 0〜1（止まると 0 へ） */
  gait = 0;
  gaitAmp = 0;
  /** うなずきの コマ（0〜NOD_STEPS）。うなずいて いなければ −1 */
  nod = -1;
  /** おっとっとの コマ（0〜WOBBLE_STEPS）。なければ −1。向き wobbleDir（かたむく 方向のラジアン） */
  wobble = -1;
  wobbleDir = 0;
  /** 建築中（HOUSE-1C PR-2）か。建築中は 1 秒ごとに とんかちを ふる（hammer = ふる コマ。ふって いなければ −1）。完成の ばんざい（cheer = コマ。なければ −1） */
  busy = false;
  hammer = -1;
  cheer = -1;

  private readonly rng: Rng;
  /** 足もとの しらべの おぼえ書き（立って いる 間・歩く 間・行き先を えらぶ 時も 世界を 読まない。`groundChanged` で かわった ことを 知らされる） */
  private foot: Footing;
  private wait: number;
  /** 建築中: 次の とんかちまでの ステップ・うちおろす コマに なった（takeHit で 読む） */
  private swingClock = 0;
  private hitNow = false;
  private tx = 0;
  private tz = 0;
  private stuck = 0;
  /** 話している 相手の 足もと（update に わたされなければ 話しかけられた ときの 場所を 向く） */
  private lookX = 0;
  private lookZ = 0;

  constructor(o: ArchitectInit) {
    this.id = o.id;
    this.first = o.first;
    this.homeX = o.x;
    this.homeZ = o.z;
    this.x = o.x;
    this.y = o.y;
    this.z = o.z;
    this.rng = createRng(hashInts(o.seed, Math.floor(o.x * 2), Math.floor(o.z * 2), 0x4b1d));
    this.foot = new Footing(Math.floor(o.x - FOOT_REACH), Math.floor(o.z - FOOT_REACH), Math.floor(o.x + FOOT_REACH), Math.floor(o.z + FOOT_REACH));
    this.wait = SETTLE_MIN + Math.floor(this.rng() * SETTLE_SPAN);
  }

  /** 建築で 場所を うつす: 足もと (x, y, z) へ。ここが あたらしい 自分の 場所（ぶらぶらの まん中）。足もとの おぼえ書きも 作りなおす */
  relocate(x: number, y: number, z: number): void {
    this.homeX = x;
    this.homeZ = z;
    this.x = x;
    this.y = y;
    this.z = z;
    this.foot = new Footing(Math.floor(x - FOOT_REACH), Math.floor(z - FOOT_REACH), Math.floor(x + FOOT_REACH), Math.floor(z + FOOT_REACH));
    this.state = this.state === 'talk' ? 'talk' : 'idle';
    this.wait = SETTLE_MIN;
    this.hammer = -1;
    this.swingClock = 0;
  }

  /** 建築中か そうで ないかを きめる（建築中は とんかちを ふる） */
  setBusy(on: boolean): void {
    this.busy = on;
    if (!on) this.hammer = -1;
    this.swingClock = 0;
  }

  /** 完成の ばんざい（腕を 上げて はねる） */
  startCheer(): void {
    this.cheer = 0;
  }

  /** とんかちを うちおろした コマだった か（読むと 消える。音を 鳴らす 側が 読む） */
  takeHit(): boolean {
    const h = this.hitNow;
    this.hitNow = false;
    return h;
  }

  /** 話しかけられた: その場で 止まって こちら（px, pz）を 向き、うなずく。もう 話して いれば 何もしない */
  beginTalk(px: number, pz: number): void {
    if (this.state === 'talk') return;
    this.state = 'talk';
    this.nod = 0;
    this.lookX = px;
    this.lookZ = pz;
  }

  /** うなずきが おわったか（NOD_STEPS コマ たった） */
  nodDone(): boolean {
    return this.state === 'talk' && this.nod >= NOD_STEPS;
  }

  /** 話し おわり。すこし 立ちどまってから また ぶらぶら */
  endTalk(): void {
    if (this.state !== 'talk') return;
    this.state = 'idle';
    this.nod = -1;
    this.wait = SETTLE_MIN + Math.floor(this.rng() * SETTLE_SPAN);
  }

  /** たたかれた（from = たたいた 人の 足もと）。体力は ない。おっとっとと 反対へ かたむくだけ */
  hit(fromX: number, fromZ: number): void {
    this.wobble = 0;
    this.wobbleDir = Math.atan2(this.x - fromX, -(this.z - fromZ));
  }

  /** 列 (x0, z0)〜(x1, z1) の ブロックが かわった（置いた・ほった）。足もとに かかれば 次の ステップで しらべなおして 高さを あわせる */
  groundChanged(x0: number, z0: number, x1 = x0, z1 = z0): void {
    this.foot.touch(x0, z0, x1, z1);
  }

  /** 1 ステップ。look = 話しかけた 人の 足もと（話している 間 こちらを 向く） */
  update(world: HouseWorld, look?: { x: number; z: number }): void {
    this.followGround(world);
    if (this.wobble >= 0) {
      this.wobble++;
      if (this.wobble > WOBBLE_STEPS) this.wobble = -1;
    }
    if (this.cheer >= 0 && ++this.cheer > WORK.cheerFrames) this.cheer = -1;
    if (this.state === 'talk') {
      this.hammer = -1;
      this.updateTalk(look);
    } else if (this.state === 'walk') this.updateWalk(world);
    else {
      this.updateHammer();
      if (this.hammer < 0) this.updateIdle(world);
    }
    const moving = this.state === 'walk';
    this.gaitAmp += ((moving ? 1 : 0) - this.gaitAmp) * 0.2;
    if (moving || this.gaitAmp > 0.02) this.gait = (this.gait + Math.PI / GAIT_HALF) % (Math.PI * 2);
  }

  // ------------------------------------------------------------ 中の 動き

  private updateTalk(look?: { x: number; z: number }): void {
    if (look) {
      this.lookX = look.x;
      this.lookZ = look.z;
    }
    this.turnTo(Math.atan2(this.lookX - this.x, -(this.lookZ - this.z)));
    if (this.nod >= 0 && this.nod < NOD_STEPS) this.nod++;
  }

  /** 建築中の とんかち: 立って いる 間だけ 1 秒に 1 回。うちおろす コマで hitNow が 立つ */
  private updateHammer(): void {
    if (!this.busy) {
      this.hammer = -1;
      return;
    }
    if (this.hammer < 0) {
      if (++this.swingClock >= WORK.hammerEvery) {
        this.swingClock = 0;
        this.hammer = 0;
      }
      return;
    }
    this.hammer++;
    if (this.hammer === WORK.hammerHitFrame) this.hitNow = true;
    if (this.hammer > WORK.hammerFrames) this.hammer = -1;
  }

  private updateIdle(world: HouseWorld): void {
    if (--this.wait > 0) return;
    if (this.pickTarget(world)) this.state = 'walk';
    else this.wait = WAIT_MIN + Math.floor(this.rng() * WAIT_SPAN);
  }

  private updateWalk(world: HouseWorld): void {
    const dx = this.tx - this.x;
    const dz = this.tz - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) {
      this.stopWalking();
      return;
    }
    const heading = Math.atan2(dx, -dz);
    this.turnTo(heading);
    if (Math.abs(wrap(heading - this.yaw)) > FACE_OK) return; // まず 向きを あわせる
    const step = Math.min(WALK_SPEED, dist);
    const nx = this.x + (dx / dist) * step;
    const nz = this.z + (dz / dist) * step;
    // 世界が かわって（ブロックを 置かれて など）通れなく なったら そこで 止まる（かわった ことは `groundChanged` で 知る）
    if (this.foot.stand(world, nx, nz, this.y) === null) {
      this.stopWalking();
      return;
    }
    this.x = nx;
    this.z = nz;
    if (step >= dist) this.stopWalking();
  }

  private stopWalking(): void {
    this.state = 'idle';
    this.wait = WAIT_MIN + Math.floor(this.rng() * WAIT_SPAN);
  }

  /** 行き先を えらぶ。まっすぐ 行ける 点を 何回か ためす。見つかったら true */
  private pickTarget(world: HouseWorld): boolean {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = this.rng() * Math.PI * 2;
      const r = TARGET_MIN + this.rng() * (WANDER_RADIUS - TARGET_MIN);
      const tx = this.homeX + Math.sin(ang) * r;
      const tz = this.homeZ - Math.cos(ang) * r;
      if (this.pathOk(world, tx, tz)) {
        this.tx = tx;
        this.tz = tz;
        return true;
      }
    }
    return false;
  }

  /** いまの 場所から (tx, tz) まで まっすぐ、ずっと 立てて 段差も 登れる・おりられる か */
  private pathOk(world: HouseWorld, tx: number, tz: number): boolean {
    const len = Math.hypot(tx - this.x, tz - this.z);
    const n = Math.max(1, Math.ceil(len / 0.2));
    let y = this.y;
    for (let i = 1; i <= n; i++) {
      const gy = this.foot.stand(world, this.x + ((tx - this.x) * i) / n, this.z + ((tz - this.z) * i) / n, y);
      if (gy === null) return false;
      y = gy;
    }
    return true;
  }

  private turnTo(target: number): void {
    const d = wrap(target - this.yaw);
    this.yaw = wrap(this.yaw + Math.max(-TURN_RATE, Math.min(TURN_RATE, d)));
  }

  /** 足もとの 地面の 高さに あわせる（なめらかに）。地面が 立てない 形に かわって 長く たったら 自分の 列に あわせ直す */
  private followGround(world: HouseWorld): void {
    const gy = this.foot.stand(world, this.x, this.z, this.y);
    if (gy === null) {
      if (++this.stuck >= STUCK_STEPS) {
        const here = standY(world, Math.floor(this.x), Math.floor(this.z));
        if (here !== null) this.y = here;
        this.stuck = 0;
      }
      return;
    }
    this.stuck = 0;
    const d = gy - this.y;
    this.y = Math.abs(d) < 0.01 ? gy : this.y + Math.max(-FALL, Math.min(RISE, d));
  }
}
