/**
 * #308 gashaBig.ts を 分けた もの: コアを たたかれた ときの ふり落とし（予兆 → 遠くへ とばす → 体の 外へ 出きるまで 押す）と、
 * とどめの 一撃で 遠くへ はじく 動き。予兆の 間は コアが ゆれて 半透明で 無敵（画面の ゆれは 呼ぶ 側）。
 */
import type { BigActor } from './gashaBigActor';
import type { BigModel } from './gashaBigTypes';
import type { GashaBigDeps } from './gashaBigDeps';
import { TUNE as T } from './gashaBigTuning';

export interface CoreThrowEnv {
  actor(): BigActor | null;
  model(): BigModel | null;
  /** いまの 体の 向き（ラジアン） */
  yaw(): number;
  reduced(): boolean;
  deps: Pick<GashaBigDeps, 'player' | 'setPlayerVelocity' | 'hurt' | 'onCoreWarn' | 'onCoreThrow' | 'carryPlayer' | 'nudgePlayer'>;
}

export class CoreThrow {
  /** 横に おし出す 残りの 秒（0 = 押していない） */
  left = 0;
  /** 横に おし出す 速さ(ふつうは コアの ふり落とし。とどめの 一撃では 大きく) */
  speed = T.core.throwOff.speed;
  readonly dir = { x: 0, z: 0 };
  /** コアの ふり落としで、体の 外へ 出きるまで 押しつづける(経過の 秒・押しつづける 印) */
  total = 0;
  out = false;
  // コアを たたかれた: まず 予兆（大きな 音・画面の ゆれ・コアが ゆれて 半透明で 無敵。プレイヤーは 動ける）→ 風の 音と ともに 遠くへ とばされる（カメラが 1 回転）
  warnLeft = 0;
  private warnClock = 0;
  spinLeft = 0;
  private spinDone = 0;

  constructor(private readonly env: CoreThrowEnv) {}

  /** コアを たたかれた（予兆を はじめる）。予兆の 間 か 押している 間は 受けつけない */
  readonly throwOff = (): void => {
    if (this.warnLeft > 0 || this.left > 0) return;
    this.warnLeft = T.core.throwOff.warnSec; this.warnClock = 0;
    this.env.deps.onCoreWarn?.();
  };

  /** 入力を 止める 間か */
  blocked(): boolean { return this.left > 0 || this.spinLeft > 0; }

  /** とどめの 一撃で はじく（向き x, z・速さ・秒）。体の 外へ 出きるまで 押す 印は 立てない */
  knock(x: number, z: number, speed: number, sec: number): void {
    this.dir.x = x; this.dir.z = z;
    this.speed = speed;
    this.left = sec; this.out = false;
  }

  /** ぜんぶ 止める（片づけ・遠くへ いった とき） */
  clear(): void {
    this.left = 0; this.warnLeft = 0; this.spinLeft = 0; this.out = false;
  }

  private launch(): void {
    const { deps } = this.env, actor = this.env.actor();
    const K = T.core.throwOff;
    if (!actor || !deps.setPlayerVelocity) return;
    const i = actor.model.hits.findIndex((h) => h.name === 'core');
    const b = i >= 0 ? actor.boxList[i] : undefined;
    if (!b) return;
    const p = deps.player();
    if (Math.hypot(p.x - b.c[0], p.y - b.c[1], p.z - b.c[2]) > K.range) return;
    if (p.y < b.c[1] - K.minBelow) return; // 地面から 弓で 撃って いる 人（小さな 穴から ねらう）は 体の 上に いないので とばさない
    // ワープは しない(オーナー 20:19)。コア → プレイヤーの 向き(水平)へ、その場から 放射状に とばす。体の 外へ 出きるまで 押しつづける
    let dx = p.x - b.c[0], dz = p.z - b.c[2];
    const d = Math.hypot(dx, dz);
    const yaw = this.env.yaw();
    if (d < 0.3) { dx = -Math.sin(yaw); dz = -Math.cos(yaw); } else { dx /= d; dz /= d; } // コアの 真上・真下なら 体の うしろへ
    deps.setPlayerVelocity({ x: 0, y: K.up, z: 0 }); // 横の 速さは ゲームが 入力から 毎コマ きめる ので、横は 下で 毎コマ ずらす
    this.dir.x = dx; this.dir.z = dz;
    this.speed = K.speed;
    this.left = K.blockSec;
    this.total = 0; this.out = true;
    if (!this.env.reduced() && K.spinTurns > 0) { this.spinLeft = K.spinSec; this.spinDone = 0; }
    if (K.damage > 0) deps.hurt?.(K.damage, { x: b.c[0], y: b.c[1], z: b.c[2] });
    deps.onCoreThrow?.();
    // 着地ダメージは ふつうに 入る（足袋・間欠泉の 守りは そのまま）
  }

  /** プレイヤー(足もと p)の 体・頭の まわり pad ブロックに 体の 固い マスが あるか(体の 外へ 出きって いないか) */
  private insideBody(p: { x: number; y: number; z: number }, pad: number): boolean {
    const actor = this.env.actor();
    if (!actor) return false;
    const r = Math.max(0.5, pad);
    for (const dy of [0.2, 1.5]) for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      if (actor.solid(Math.floor(p.x + ox), Math.floor(p.y + dy), Math.floor(p.z + oz))) return true;
    }
    return false;
  }

  /** 予兆（コアの ゆれ）と 1 回転（カメラ）の 1 コマ */
  stepWarn(dt: number): void {
    const K = T.core.throwOff;
    const model = this.env.model();
    if (this.warnLeft > 0) {
      this.warnLeft -= dt; this.warnClock += dt;
      if (model) {
        const j = K.warnJitter, t = this.warnClock * 38;
        model.setCoreFx(j * Math.sin(t * 1.7), j * Math.sin(t * 2.3 + 1), j * Math.sin(t * 1.3 + 2), 1 + 0.12 * Math.sin(t), K.warnAlpha * (0.8 + 0.2 * Math.sin(t * 0.9)));
      }
      if (this.warnLeft <= 0) { model?.setCoreFx(0, 0, 0, 1, 1); this.launch(); }
    }
    if (this.spinLeft > 0) {
      const step = Math.min(dt, this.spinLeft), d = (360 * K.spinTurns * step) / K.spinSec;
      this.spinLeft -= step; this.spinDone += d;
      this.env.deps.carryPlayer?.(0, 0, 0, d);
    }
  }

  /** 遠くへ とばす 間の 押し出し（体の 外へ 出きるまで 押しつづける） */
  stepPush(dt: number): void {
    const { deps } = this.env;
    if (this.left > 0) {
      this.left -= dt; this.total += dt;
      deps.nudgePlayer?.(this.dir.x * this.speed * dt, this.dir.z * this.speed * dt);
      // コアの ふり落とし: まだ 体の 箱の 中・すぐ そばなら、外へ 出きる まで(上限 maxSec)押しつづける
      if (this.left <= 0) {
        if (this.out && this.env.actor() && this.total < T.core.throwOff.maxSec && this.insideBody(deps.player(), T.core.throwOff.clearPad)) this.left = dt;
        else this.out = false;
      }
    }
  }
}
