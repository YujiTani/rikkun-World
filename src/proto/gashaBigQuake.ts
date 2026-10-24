/**
 * #293 試作: アースクエイクの 間の 体の ゆれ（オーナー 2026-10-24）。のっている 人を 一定の 間かくで 横向き（ランダムな 向き）に ゆさぶる。
 * 自動では ふり落とさない: 歩いて 踏んばれば のこれる・足場の はしだと 落ちる。肩より 上・下 など 体の どこでも おなじ。ジャンプ中（地面に ない）は 押されない。
 * 画面には さわらない（ユニットテストで 動かせる）。数は gashaBigTuning.ts の slam2.quake。
 */
import { TUNE as T } from './gashaBigTuning';

export interface QuakeDeps {
  /** 体の 上に のっているか */
  isRider(): boolean;
  /** 足が 地面（体の 上を ふくむ）に ついて いるか。ジャンプ中は false */
  onGround(): boolean;
  /** 横へ ずらす（nudgePlayer） */
  nudge(dx: number, dz: number): void;
  /** 押しが はじまった（効果音の 用） */
  onPush?(): void;
}

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class BodyQuake {
  /** ゆれの のこり（秒）。0 = ゆれて いない */
  left = 0;
  /** 押しの のこり（秒）と 向き */
  private pushLeft = 0;
  private dirX = 0;
  private dirZ = 1;
  private clock = 0;
  private rnd: () => number;

  constructor(private readonly d: QuakeDeps, seed: number = T.slam2.quake.seed) { this.rnd = makeRnd(seed); }

  get active(): boolean { return this.left > 0; }

  /** ゆれを はじめる（打撃の コマ）。最初の 押しは すぐ */
  start(): void { this.left = T.slam2.quake.sec; this.clock = 0; this.pushLeft = 0; }
  stop(): void { this.left = 0; this.pushLeft = 0; }

  step(dt: number): void {
    const K = T.slam2.quake;
    if (this.left <= 0) return;
    this.left = Math.max(0, this.left - dt);
    // 押しの はじまり: 間かくごと。ジャンプ中や のって いない ときは 見おくる（その 押しは なし）
    if (this.clock <= 0) {
      this.clock += K.pushIntervalSec;
      if (this.d.isRider() && this.d.onGround()) {
        const a = this.rnd() * Math.PI * 2;
        this.dirX = Math.cos(a); this.dirZ = Math.sin(a);
        this.pushLeft = Math.max(1e-3, K.pushSec);
        this.d.onPush?.();
      } else this.pushLeft = 0;
    }
    this.clock -= dt;
    if (this.pushLeft > 0) {
      // 押しの 途中で ジャンプ / 降りたら そこで 止める
      if (!this.d.isRider() || !this.d.onGround()) { this.pushLeft = 0; }
      else {
        const part = Math.min(dt, this.pushLeft);
        const dist = K.pushDist * (part / Math.max(1e-3, K.pushSec));
        this.d.nudge(this.dirX * dist, this.dirZ * dist);
        this.pushLeft -= part;
      }
    }
  }
}
