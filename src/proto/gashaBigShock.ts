/**
 * #293 試作: 大きい がしゃどくろの 手が 地面を たたいた ときの 当たり（yuzu 2026-10-24）。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ・たたきつけ（slam）: その コマで 手の まわりに 打撃（小さい 半径。ジャンプ中でも 手の 高さ までは 当たる）。
 *    そこから 地面を 広がる 衝撃波の 輪（大きい 半径・大ダメージ）。輪の 前の ふちが 通った ときに 足が 地面に あれば 当たる（ジャンプで よけられる）。
 *  ・つきなおし（tap）: その コマで 手の まわりに 小さい 衝撃（ジャンプで よけられる）。
 *  ・当たると ダメージ（プレイヤーの combat.damage の 口）と ひるみ: 入力が きかない 時間・手から 外へ はじく・画面の ゆれ。
 *    ひるみは まだ ゲームに しくみが ない ので 試作だけ（入力を 止める 口は 呼ぶ 側が つなぐ: inputBlocked()）。
 * 数は gashaBigTuning.ts の slam・stagger。
 */
import { TUNE as T } from './gashaBigTuning';

export type ImpactKind = 'slam' | 'slam2' | 'tap';
type V3 = { x: number; y: number; z: number };

export interface ShockDeps {
  /** プレイヤーの 足もと */
  player(): V3;
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーが 地面に 立って いるか（なければ 足の 高さ だけで 決める） */
  onGround?(): boolean;
  /** ダメージ（当たったら true。むてき中 などは false） */
  hurt?(amount: number, from: V3): boolean;
  /** プレイヤーの 速さを かえる（はじく） */
  setPlayerVelocity?(v: V3): void;
  /**
   * SAMURAI-1 §4.4: 「とばされにくさ」の 倍率（0〜1。羽織 0.3。つなぎ込みが `() => knockbackMulOf(armor)` を わたす。なければ 1）。
   * 打撃・衝撃波・小さい 衝撃・払いの 横の 速さだけに かける（上への はね・ダメージ・ひるみは そのまま）
   */
  knockbackMul?(): number;
}

/** 手が 地面を たたいた 1 回（輪の 見た目も これを 読む） */
export interface Impact {
  kind: ImpactKind;
  x: number; y: number; z: number;
  /** たたいてから の 秒 */
  age: number;
  /** 輪の いまの 半径（ブロック） */
  r: number;
  /** 輪の いちばん 外の 半径 */
  maxR: number;
  /** 輪が もう プレイヤーに 当たった（または 当てない） */
  waveDone: boolean;
  /** 見た目が 消える まで の 秒 */
  life: number;
  /** 輪の 広がる 速さ（ブロック / 秒）・前の ふちの 太さ・当たる 足の 高さの 上限・ダメージ（slam と slam2 で ちがう） */
  speed: number; band: number; height: number; damage: number;
  /** 体の 前の 向き（slam2 の 半円の むき。長さ 1 の 水平） */
  fx: number; fz: number;
}

export type ShockHitKind = 'hit' | 'wave' | 'tap' | 'sweep';
export interface ShockHit { kind: ShockHitKind; amount: number; from: V3; ok: boolean; tick: number }

export class BigShock {
  /** 生きて いる たたき（見た目が 消えたら のぞく） */
  readonly impacts: Impact[] = [];
  /** 当たった 記録（新しい 順に 最大 16） */
  readonly hits: ShockHit[] = [];
  /** ひるみの のこり（秒）。0 より 大きい 間は 入力が きかない */
  staggerLeft = 0;
  /** さいごに はじいた 速さ */
  lastPush: V3 | null = null;
  /** 経過 秒（ゆれの もよう） */
  time = 0;
  private tick = 0;
  private readonly shakes: { amp: number; sec: number; age: number }[] = [];

  constructor(private readonly d: ShockDeps) {}

  /** 片づける: 当たりの 記録・ひるみ・ゆれを ぜんぶ 消す（体を しまう とき） */
  clear(): void {
    this.impacts.length = 0;
    this.hits.length = 0;
    this.shakes.length = 0;
    this.staggerLeft = 0;
    this.lastPush = null;
  }

  /** 入力を 止める か（ひるみ中） */
  inputBlocked(): boolean { return this.staggerLeft > 0; }

  /** いまの 画面の ゆれ（度） */
  get shakeNow(): number {
    let a = 0;
    for (const s of this.shakes) { const k = 1 - s.age / s.sec; if (k > 0) a += s.amp * k * k; }
    return a;
  }

  private dist(x: number, z: number): number { const p = this.d.player(); return Math.hypot(p.x - x, p.z - z); }

  /** 足が 地面に ある（ジャンプで はなれて いない） */
  private grounded(maxH: number = T.slam.waveHeight): boolean {
    const p = this.d.player();
    if (this.d.onGround && !this.d.onGround()) return false;
    return p.y - (this.d.groundY(Math.floor(p.x), Math.floor(p.z)) + 1) <= maxH;
  }

  private shake(amp: number, sec: number, x: number, z: number, range: number = T.slam.shakeRange): void {
    const k = Math.max(0, 1 - this.dist(x, z) / Math.max(1e-3, range));
    if (amp * k > 0) this.shakes.push({ amp: amp * k, sec: Math.max(1e-3, sec), age: 0 });
  }

  /** 手が 地面を たたいた（その コマの 当たりも ここで 見る） */
  add(kind: ImpactKind, x: number, y: number, z: number, facing?: { fx: number; fz: number }): Impact {
    const S = T.slam, Q = T.slam2;
    const slam = kind === 'slam', big = kind === 'slam2';
    const fl = facing ? Math.hypot(facing.fx, facing.fz) : 0;
    const imp: Impact = {
      kind, x, y, z, age: 0, r: 0, maxR: big ? Q.waveRadius : slam ? S.waveRadius : S.tapRadius, waveDone: false,
      life: big ? Math.max(Q.ringSec, Q.waveRadius / Math.max(1e-3, Q.waveSpeed)) : slam ? Math.max(S.ringSec, S.waveRadius / Math.max(1e-3, S.waveSpeed)) : S.tapRingSec,
      speed: big ? Q.waveSpeed : S.waveSpeed, band: big ? Q.waveBand : S.waveBand, height: big ? Q.waveHeight : S.waveHeight, damage: big ? Q.waveDamage : S.waveDamage,
      fx: fl > 1e-6 ? facing!.fx / fl : 0, fz: fl > 1e-6 ? facing!.fz / fl : 1,
    };
    this.impacts.push(imp);
    if (big) this.shake(Q.shakeDeg, Q.shakeSec, x, z, Q.shakeRange);
    else if (slam) this.shake(S.shakeDeg, S.shakeSec, x, z);
    else this.shake(S.tapShakeDeg, S.tapShakeSec, x, z);
    const p = this.d.player();
    const d = this.dist(x, z);
    if (big) {
      // 打撃: 予告の 半円（手の 落ちる 所が 中心・体の 反対の 前がわ）の 中。高く ジャンプ して いれば 当たらない
      const ahead = (p.x - x) * imp.fx + (p.z - z) * imp.fz;
      if (d <= Q.warnRadius && ahead >= 0 && p.y - y <= Q.hitHeight && p.y - y >= -1) {
        this.strike('hit', Q.hitDamage, imp, T.stagger.knockSpeed);
        imp.waveDone = true;
      }
    } else if (slam) {
      // 打撃: 手の 真下と まわり（手の 高さ まで）
      if (d <= S.hitRadius && p.y - y <= S.hitHeight && p.y - y >= -1) {
        this.strike('hit', S.hitDamage, imp, T.stagger.knockSpeed);
        imp.waveDone = true; // 打撃を 受けた 人には 輪は 当てない
      }
    } else {
      imp.r = S.tapRadius;
      imp.waveDone = true;
      if (d <= S.tapRadius && this.grounded()) this.strike('tap', S.tapDamage, imp, T.stagger.tapKnockSpeed);
    }
    return imp;
  }

  /** 払う 腕に 当たった（from = 腕の 当たった 所、dx, dz = はじく 向き（水平。長さ 1））。ダメージ・大きく はじく・ひるみ。当たったら true */
  sweepStrike(from: V3, dx: number, dz: number): boolean {
    const S = T.sweep, G = T.stagger;
    const ok = this.d.hurt ? this.d.hurt(S.damage, from) : true;
    this.hits.unshift({ kind: 'sweep', amount: S.damage, from, ok, tick: this.tick });
    if (this.hits.length > 16) this.hits.length = 16;
    if (!ok) return false;
    this.staggerLeft = Math.max(this.staggerLeft, S.staggerSec);
    const km = this.d.knockbackMul?.() ?? 1;
    this.lastPush = { x: dx * S.knockSpeed * km, y: S.knockUp, z: dz * S.knockSpeed * km };
    this.d.setPlayerVelocity?.(this.lastPush);
    this.shakes.push({ amp: S.shakeDeg, sec: Math.max(1e-3, G.shakeSec), age: 0 });
    return true;
  }

  private strike(kind: ShockHitKind, amount: number, imp: Impact, knock: number): void {
    const from = { x: imp.x, y: imp.y, z: imp.z };
    const ok = this.d.hurt ? this.d.hurt(amount, from) : true;
    this.hits.unshift({ kind, amount, from, ok, tick: this.tick });
    if (this.hits.length > 16) this.hits.length = 16;
    if (!ok) return;
    // ひるみ: 入力を 止める・手から 外へ はじく・画面を ゆらす
    const G = T.stagger;
    this.staggerLeft = Math.max(this.staggerLeft, G.sec);
    const p = this.d.player();
    let dx = p.x - imp.x, dz = p.z - imp.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) { dx = 1; dz = 0; } else { dx /= len; dz /= len; }
    const km = this.d.knockbackMul?.() ?? 1;
    this.lastPush = { x: dx * knock * km, y: G.knockUp, z: dz * knock * km };
    this.d.setPlayerVelocity?.(this.lastPush);
    this.shakes.push({ amp: G.shakeDeg, sec: Math.max(1e-3, G.shakeSec), age: 0 });
  }

  /** 1 コマ（輪を 広げて 当たりを 見る・ひるみと ゆれを へらす） */
  step(dt: number): void {
    this.tick++;
    this.time += dt;
    if (this.staggerLeft > 0) this.staggerLeft = Math.max(0, this.staggerLeft - dt);
    for (let i = this.shakes.length - 1; i >= 0; i--) { const s = this.shakes[i]!; s.age += dt; if (s.age >= s.sec) this.shakes.splice(i, 1); }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const m = this.impacts[i]!;
      m.age += dt;
      if (m.kind === 'slam' || m.kind === 'slam2') {
        const r0 = m.r;
        m.r = Math.min(m.maxR, m.r + m.speed * dt);
        if (!m.waveDone) {
          const d = this.dist(m.x, m.z);
          // 輪の 前の ふちが この コマで 通った（太さ band）
          if (d <= m.r && d >= r0 - m.band) {
            if (this.grounded(m.height)) { m.waveDone = true; this.strike('wave', m.damage, m, T.stagger.knockSpeed); }
          }
          if (m.r >= m.maxR && r0 >= m.maxR) m.waveDone = true;
        }
      }
      if (m.age >= m.life && m.waveDone) this.impacts.splice(i, 1);
    }
  }
}
