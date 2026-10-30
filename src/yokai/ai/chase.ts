import type { PlayerCombat, VoxelWorld } from '../../contracts';
import { NINJA_GEAR } from '../../craft/config';
import type { Rng } from '../../world/gen/random';
import type { Rokurokubi } from '../models/rokurokubi';
import { YOKAI_STATS } from '../stats';
import { KIND_TRAITS } from '../traits';
import { syncTransform } from './body';
import { AI_CONST, KIND_AI, type YokaiConfig } from './config';
import { DEG, type Ent, type YokaiField } from './entity';
import type { YokaiEvents } from './events';
import { angleDiff, toLocalXZ, yawToward } from './geometry';
import type { YokaiManagerOptions } from './managerTypes';
import type { YokaiFall } from './fall';
import type { YokaiMover } from './mover';
import { findNeckRoute, type P3 } from './neckRoute';
import { SENSE, type KindSense } from './senseTuning';

const tmp = { x: 0, z: 0 };

interface ChaseDeps {
  world: Pick<VoxelWorld, 'isSolid'>;
  f: YokaiField;
  combat: Pick<PlayerCombat, 'dead'>;
  config: Pick<YokaiConfig, 'yokaiWander'>;
  events: Pick<YokaiEvents, 'emit' | 'tick'>;
  /** armor を 呼ぶときに 読む */
  opts: Pick<YokaiManagerOptions, 'armor'>;
  rng: Rng;
  mover: Pick<YokaiMover, 'walk'>;
  fall: Pick<YokaiFall, 'speedOf'>;
}

/**
 * 追いかけと向きの係: うろうろ・気づく・追いかける・あきらめる・さがす、向きを変える、攻撃を始める。
 * 毎ステップ 1 体ずつ think を呼ぶ。
 */
export class YokaiChaser {
  private readonly neckFrom: P3 = { x: 0, y: 0, z: 0 };
  private readonly neckTo: P3 = { x: 0, y: 0, z: 0 };
  private neckCorners: P3[] = [];

  constructor(private readonly d: ChaseDeps) {}

  setMotion(e: Ent, m: 'wait' | 'move'): void {
    if (e.motion === m || e.state === 'attack') return;
    e.motion = m;
    e.model.setMotion(m);
  }

  think(e: Ent, dt: number): void {
    const { f, combat } = this.d;
    e.age++;
    if (e.state !== 'attack' && e.cool > 0) e.cool--;
    const dx = f.px - e.x;
    const dz = f.pz - e.z;
    const dist = Math.hypot(dx, dz);
    const dy = f.py - e.y;
    const targetable = !combat.dead();
    const speed = this.d.fall.speedOf(e);
    let moved = 0;

    // 感知の 表（senseTuning.ts）。忍び装束を 着て いると「気づく」距離だけ 半分（防具の マスを 見るのは 距離が 近い ときだけ・1 回）
    const sense = SENSE.kinds[e.kind];

    switch (e.state) {
      case 'attack':
        return;
      case 'idle':
      case 'wander': {
        if (this.notices(sense, targetable, dy, dist)) {
          this.enterChase(e, dist);
          break;
        }
        moved = this.wanderTick(e, dt, speed);
        break;
      }
      case 'search': {
        if (this.notices(sense, targetable, dy, dist)) {
          this.enterChase(e, dist);
          break;
        }
        e.searchSteps++;
        const sdx = e.lastSeenX - e.x;
        const sdz = e.lastSeenZ - e.z;
        const sd = Math.hypot(sdx, sdz);
        if (sd < 0.7 || e.searchSteps >= AI_CONST.searchTicks) {
          this.toRest(e);
          break;
        }
        moved = this.moveToward(e, sdx / sd, sdz / sd, speed, dt);
        break;
      }
      default: {
        // chase / retreat
        moved = this.chaseTick(e, dt, dist, dy, targetable);
        break;
      }
    }
    this.setMotion(e, moved > 1e-5 ? 'move' : 'wait');
  }

  /** プレイヤーに 気づくか（高さの差・距離。忍び装束なら 距離が 半分） */
  private notices(sense: KindSense, targetable: boolean, dy: number, dist: number): boolean {
    if (!targetable || Math.abs(dy) > SENSE.sightDy || dist > sense.sight) return false;
    if (sense.shinobi && dist > sense.sight * SENSE.shinobiSightMul && this.d.opts.armor?.equipped('body') === NINJA_GEAR.body) return false;
    return true;
  }

  private toRest(e: Ent): void {
    e.state = 'idle';
    e.wandering = false;
    e.wanderLeft = AI_CONST.wanderRest[0] + Math.floor(this.d.rng() * (AI_CONST.wanderRest[1] - AI_CONST.wanderRest[0]));
  }

  private enterChase(e: Ent, dist: number): void {
    e.state = 'chase';
    e.bestDist = dist;
    e.lastProgress = this.d.f.steps;
  }

  private wanderTick(e: Ent, dt: number, speed: number): number {
    if (!this.d.config.yokaiWander) {
      e.state = 'idle';
      return 0;
    }
    e.wanderLeft--;
    if (e.wanderLeft <= 0) {
      if (e.wandering) {
        this.toRest(e);
      } else {
        e.wandering = true;
        e.state = 'wander';
        e.wanderYaw = this.d.rng() * Math.PI * 2;
        e.wanderLeft = AI_CONST.wanderWalk[0] + Math.floor(this.d.rng() * (AI_CONST.wanderWalk[1] - AI_CONST.wanderWalk[0]));
      }
    }
    if (!e.wandering) {
      e.state = 'idle';
      return 0;
    }
    const m = this.moveToward(e, Math.sin(e.wanderYaw), -Math.cos(e.wanderYaw), speed * AI_CONST.wanderSpeedRate, dt);
    if (m < 1e-6) {
      // 行けない: 向きを変えて休む
      this.toRest(e);
    }
    return m;
  }

  /** 向きをゆっくり変えながら、(dirx, dirz) の方へ進む。向いている方へしか進まない妖怪（ぬりかべ）は 向きがそろうまで 進まない。進んだ距離を返す */
  private moveToward(e: Ent, dirx: number, dirz: number, speed: number, dt: number): number {
    const want = yawToward(dirx, dirz);
    this.turn(e, want, dt);
    if (KIND_TRAITS[e.kind].walksFacing) {
      if (Math.abs(angleDiff(e.yaw, want)) > 30 * DEG) return 0;
      return this.d.mover.walk(e, Math.sin(e.yaw), -Math.cos(e.yaw), speed * dt);
    }
    return this.d.mover.walk(e, dirx, dirz, speed * dt);
  }

  private turn(e: Ent, want: number, dt: number): void {
    const maxTurn = KIND_AI[e.kind].turnDegPerSec * DEG * dt;
    const d = angleDiff(e.yaw, want);
    e.yaw += Math.abs(d) <= maxTurn ? d : Math.sign(d) * maxTurn;
  }

  private chaseTick(e: Ent, dt: number, dist: number, dy: number, targetable: boolean): number {
    const { f, mover } = this.d;
    if (!targetable || dist > SENSE.kinds[e.kind].giveUp || Math.abs(dy) > SENSE.sightDy * SENSE.giveUpDyMul) {
      this.lose(e);
      return 0;
    }
    e.lastSeenX = f.px;
    e.lastSeenZ = f.pz;
    const speed = this.d.fall.speedOf(e);
    const ux = dist > 1e-6 ? (f.px - e.x) / dist : 0;
    const uz = dist > 1e-6 ? (f.pz - e.z) / dist : -1;
    const canAttack = e.cool <= 0 && e.age >= AI_CONST.noAttackTicks && e.stone < AI_CONST.stoneNoAttack;
    let moved = 0;
    let hold = 0;
    switch (e.kind) {
      case 'karakasa': {
        hold = 1.5;
        if (canAttack && dist <= YOKAI_STATS.karakasa.reach + AI_CONST.attackPad && Math.abs(dy) <= 2.5 + AI_CONST.attackPadY) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'chochin': {
        hold = 4.3;
        if (e.state === 'retreat' ? dist < 4 : dist < 3) {
          e.state = 'retreat';
          this.turn(e, yawToward(ux, uz), dt);
          moved = mover.walk(e, -ux, -uz, speed * dt);
          return moved;
        }
        e.state = 'chase';
        if (canAttack && dist >= 4 && dist <= YOKAI_STATS.chochin.reach) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'nurikabe': {
        hold = 2.2;
        // 前 3・はば 2.6 の中にいるときだけ
        toLocalXZ(f.px - e.x, f.pz - e.z, e.yaw, tmp);
        const fwd = -tmp.z;
        if (canAttack && fwd > 0 && fwd <= YOKAI_STATS.nurikabe.reach && Math.abs(tmp.x) <= 1.3 + AI_CONST.attackPad && Math.abs(dy) <= 2.5 + AI_CONST.attackPadY) {
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'rokurokubi': {
        // ろくろくび
        hold = 5.5;
        if (dist < 2) {
          e.state = 'retreat';
          this.turn(e, yawToward(ux, uz), dt);
          moved = mover.walk(e, -ux, -uz, speed * dt);
          return moved;
        }
        e.state = 'chase';
        if (canAttack && dist <= YOKAI_STATS.rokurokubi.reach && this.planNeck(e)) {
          this.turn(e, yawToward(ux, uz), 1);
          this.startAttack(e);
          return 0;
        }
        if (dist > hold) moved = this.moveToward(e, ux, uz, speed, dt);
        else this.turn(e, yawToward(ux, uz), dt);
        break;
      }
      case 'tako_hachimaki':
        // およぐ 妖怪は ここに 来ない（YokaiManager が ai/swim.ts に まかせる）
        return 0;
      default: {
        const unreachable: never = e.kind;
        throw new Error(`chaseTick: 知らない妖怪 ${String(unreachable)}`);
      }
    }
    // 3 秒間 0.5 も近づけなかったらあきらめる（近づきたいとき だけ数える）
    if (dist > hold + 0.5) {
      if (dist < e.bestDist - AI_CONST.progressDist) {
        e.bestDist = dist;
        e.lastProgress = f.steps;
      } else if (f.steps - e.lastProgress >= AI_CONST.progressTicks) {
        this.lose(e);
        return 0;
      }
    } else {
      e.bestDist = dist;
      e.lastProgress = f.steps;
    }
    return moved;
  }

  private lose(e: Ent): void {
    e.state = 'search';
    e.searchSteps = 0;
    this.setMotion(e, 'wait');
  }

  /** 攻撃を始める（ねらう所を渡し、model に攻撃させ、はじまりの出来事を配る） */
  startAttack(e: Ent): void {
    // ねらう所（プレイヤーの足もと）を、妖怪から見た位置で渡す
    this.setAim(e);
    if (KIND_TRAITS[e.kind].longNeck) this.sendNeckRoute(e);
    this.setMotion(e, 'wait');
    e.state = 'attack';
    e.attackSteps = 0;
    syncTransform(e);
    e.model.attack();
    this.d.events.emit({ type: 'attackStart', tick: this.d.events.tick(), id: e.id, kind: e.kind });
  }

  /** ろくろくびの首が とどく道すじがあるか（あれば neckCorners に入れる）。まっすぐ通れなくても、2 回までの曲がりで行ければ OK */
  planNeck(e: Ent): boolean {
    const { f, world } = this.d;
    this.neckFrom.x = e.x;
    this.neckFrom.y = e.y + 1.0;
    this.neckFrom.z = e.z;
    this.neckTo.x = f.px;
    this.neckTo.y = f.py + 1.3;
    this.neckTo.z = f.pz;
    const r = findNeckRoute((x, y, z) => world.isSolid(x, y, z), this.neckFrom, this.neckTo, YOKAI_STATS.rokurokubi.reach);
    if (!r) return false;
    this.neckCorners = r;
    return true;
  }

  /** 曲がり角を、妖怪の向きで見た位置にして model へ渡す */
  private sendNeckRoute(e: Ent): void {
    const local: P3[] = [];
    for (const c of this.neckCorners) {
      toLocalXZ(c.x - e.x, c.z - e.z, e.yaw, tmp);
      local.push({ x: tmp.x, y: c.y - e.y, z: tmp.z });
    }
    (e.model as Rokurokubi).setNeckRoute(local);
  }

  private setAim(e: Ent): void {
    const { f } = this.d;
    toLocalXZ(f.px - e.x, f.pz - e.z, e.yaw, tmp);
    e.model.aim.set(tmp.x, f.py - e.y, tmp.z);
  }
}
