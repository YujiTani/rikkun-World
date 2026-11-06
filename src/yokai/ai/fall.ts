import type { VoxelWorld } from '../../contracts';
import { fallDamage } from '../../combat/config';
import { bodyInWall } from '../../world/wall';
import { YOKAI_STATS } from '../stats';
import { KIND_TRAITS } from '../traits';
import { boxFreeAt } from './body';
import { AI_CONST, KIND_AI, type YokaiConfig } from './config';
import type { YokaiDefeat } from './defeat';
import { DEG, HEAVY_G, type Ent } from './entity';
import type { YokaiEvents } from './events';
import type { YokaiPresenter } from './presenter';
import { flySurface, settleGround } from './terrain';
import { isDeepWater } from '../../world/blocks/water';

interface FallDeps {
  world: VoxelWorld;
  config: Pick<YokaiConfig, 'safeFallHeight' | 'fallDamagePerBlock' | 'waterSpeedMul'>;
  events: Pick<YokaiEvents, 'emit' | 'tick'>;
  marks: Pick<YokaiPresenter, 'showMarks'>;
  reward: Pick<YokaiDefeat, 'defeat'>;
}

/**
 * 落下と水の係: 足もとを地面に合わせる（のぼる・落ちる・浮く）、うきあがる、落下ダメージ、みず の中の速さ。
 */
export class YokaiFall {
  constructor(private readonly d: FallDeps) {}

  /** 足もとの高さを地面に合わせる（のぼる・落ちる。ちょうちんは地面や水面から浮く） */
  settle(e: Ent, dt: number): void {
    const ai = e.dims;
    if (ai.flies) {
      const s = flySurface(this.d.world, e.x, e.z, e.y);
      if (s === null) return;
      // WEAPON-5: AI を 止めた ちょうちん（テスト用）は 置いた 高さより 下へは おりない
      const d = (e.ai ? s : Math.max(s, e.homeY)) - e.y;
      const step = AI_CONST.hoverRate * dt;
      e.y += Math.abs(d) <= step ? d : Math.sign(d) * step;
      return;
    }
    const t = settleGround(this.d.world, e.x, e.z, e.y, ai);
    if (t > e.y + 1e-6) {
      e.y = Math.min(t, e.y + AI_CONST.riseRate * dt);
      e.vy = 0;
      e.fallFrom = NaN;
    } else if (e.y > t + 1e-6) {
      if (Number.isNaN(e.fallFrom)) {
        e.fallFrom = e.y;
        // 虹の はじき中は ふわふわ せず（ゆれて 横へ ずれない）いきおいよく 落ちる
        e.floating = !e.airSafe && KIND_TRAITS[e.kind].floatsDown && e.y - t >= AI_CONST.floatMinDrop - 1e-6;
        e.swayStep = 0;
      }
      if (e.floating) this.sway(e, dt);
      // 虹の はじき中（airSafe）は 上がりと おなじ 重力で はやく 落ちる
      const g = e.airSafe ? HEAVY_G : 25;
      e.vy = Math.min(e.floating ? AI_CONST.floatFallSpeed : e.airSafe ? 2 * HEAVY_G : 25, e.vy + g * dt);
      e.y = Math.max(t, e.y - e.vy * dt);
      if (e.y <= t) {
        e.vy = 0;
        this.land(e, t);
      }
    } else {
      e.vy = 0;
      if (!Number.isNaN(e.fallFrom)) this.land(e, t);
    }
  }

  /** ゆらゆら落ちる妖怪（からかさ）: 落ち葉のように 横にゆれてかたむく。ゆれた先が かべ・みず なら ずれない */
  private sway(e: Ent, dt: number): void {
    const { world } = this.d;
    const w = (Math.PI * 2) / AI_CONST.floatSwayPeriod;
    const t0 = e.swayStep * dt;
    e.swayStep++;
    const t1 = e.swayStep * dt;
    e.model.fallTilt = AI_CONST.floatTiltDeg * DEG * Math.cos(w * t1);
    const d = AI_CONST.floatSwayAmp * (Math.sin(w * t1) - Math.sin(w * t0));
    const nx = e.x + Math.cos(e.yaw) * d;
    const nz = e.z + Math.sin(e.yaw) * d;
    const ai = e.dims;
    const r = ai.radius;
    if (!bodyInWall(nx, nz, r, AI_CONST.edgeMargin)) return;
    if (!world.isLoaded(Math.floor(nx), Math.floor(nz))) return;
    if (!boxFreeAt(world, nx - r, e.y + 0.05, nz - r, nx + r, e.y + ai.height, nz + r)) return;
    const g = settleGround(world, nx, nz, e.y, ai);
    if (!Number.isFinite(g) || isDeepWater(world.getBlock(Math.floor(nx), Math.floor(g), Math.floor(nz)))) return;
    e.x = nx;
    e.z = nz;
  }

  /** 体（足もと か 腰）が みず のマスにあるか */
  private inWater(e: Ent): boolean {
    const { world } = this.d;
    const ix = Math.floor(e.x);
    const iz = Math.floor(e.z);
    return isDeepWater(world.getBlock(ix, Math.floor(e.y + 1e-6), iz)) || isDeepWater(world.getBlock(ix, Math.floor(e.y + 0.9), iz));
  }

  /** 歩く速さ（みず の中は ×waterSpeedMul） */
  speedOf(e: Ent): number {
    let s = YOKAI_STATS[e.kind].speed * e.speedMul;
    if (!KIND_AI[e.kind].flies && this.inWater(e)) s *= this.d.config.waterSpeedMul;
    if (e.stone > 0) s *= 1 - (1 - AI_CONST.stoneSlowMin) * e.stone;
    return s;
  }

  /** 地面に着いた。落ちた高さに応じて落下ダメージ（みず に着いたら 0）。倒れてもドロップ・経験値なし */
  private land(e: Ent, ground: number): void {
    const { world, config, events } = this.d;
    const from = e.fallFrom;
    e.fallFrom = NaN;
    if (e.airSafe) {
      e.airSafe = false;
      return;
    }
    if (e.floating || KIND_TRAITS[e.kind].floatsDown) {
      e.floating = false;
      e.model.fallTilt = 0;
      return;
    }
    if (Number.isNaN(from) || !Number.isFinite(ground)) return;
    if (isDeepWater(world.getBlock(Math.floor(e.x), Math.floor(ground), Math.floor(e.z)))) return;
    const dmg = fallDamage(from - ground, config.safeFallHeight, config.fallDamagePerBlock);
    if (dmg <= 0) return;
    e.hp = Math.max(0, e.hp - dmg);
    this.d.marks.showMarks(e);
    if (e.hp <= 0) {
      this.d.reward.defeat(e, false);
      return;
    }
    e.model.hit();
    events.emit({ type: 'hurt', tick: events.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } });
  }

  /** 虹の はじきが おわり（押す・うきあがるが 0）、地面に いる（または とぶ 妖怪）なら airSafe を 必ず 戻す（land を 通らない 道: 天井・のぼる・とぶ 妖怪） */
  endAirSafe(e: Ent): void {
    if (!e.airSafe || e.knockLeft > 0 || e.knockUpV > 0) return;
    if (e.dims.flies || e.y <= settleGround(this.d.world, e.x, e.z, e.y, e.dims) + 1e-6) e.airSafe = false;
  }

  /** 上への 初速で うきあがる。うきあがっている あいだ true（その ステップ は 地面あわせ を しない） */
  rise(e: Ent, dt: number): boolean {
    if (e.knockUpV <= 0) return false;
    const ny = e.y + e.knockUpV * dt;
    e.knockUpV -= (e.airSafe ? HEAVY_G : 25) * dt;
    const r = e.dims.radius;
    const blocked = !boxFreeAt(this.d.world, e.x - r, ny + e.dims.height - 0.05, e.z - r, e.x + r, ny + e.dims.height, e.z + r);
    if (e.knockUpV <= 0 || blocked) {
      e.knockUpV = 0;
      e.vy = 0;
      return false;
    }
    e.y = ny;
    return true;
  }
}
