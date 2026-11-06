import type * as THREE from 'three';
import type { YokaiSwim } from '../../content/yokai/types';
import type { PlayerCombat, VoxelWorld } from '../../contracts';
import type { Rng } from '../../world/gen/random';
import { InkCloud } from '../models/takoInk';
import type { TakoHachimaki } from '../models/tako_hachimaki';
import { AI_CONST } from './config';
import { DT, type Ent, type SwimState, type YokaiField } from './entity';
import type { YokaiEvents } from './events';
import { angleDiff, yawToward } from './geometry';
import { swimOf, swimTarget } from './swimTerrain';
import { isDeepWater } from '../../world/blocks/water';

/** 秒 → ステップ（1/60 秒） */
const steps = (sec: number): number => Math.round(sec * 60);
/** 向きの ためしの 順（先頭から 試す。曲がる ほうを あとに） */
const TURN_TRIES = [0, 1, -1, 2, -2, 3, -3, 4] as const;
/** 上下に 水面へ 合わせる 速さ（ブロック/秒） */
const VERTICAL_SPEED = 2;
/** すみの けむりを 同時に 持つ 数（2 体 × 余裕） */
const CLOUD_POOL = 4;
/** 道すじを 調べる 間かく（ブロック） */
const PROBE_STEP = 0.25;
/** 口の 位置（体の 前 / 足もとから）。試作 octoD の 口 */
const MOUTH_FORWARD = 0.85;
const MOUTH_UP = 1.0;

interface SwimDeps {
  world: VoxelWorld;
  f: YokaiField;
  combat: Pick<PlayerCombat, 'damage' | 'dead'>;
  events: Pick<YokaiEvents, 'emit' | 'tick' | 'cues'>;
  /** すみの けむりを 置く 世界の 入れ物 */
  group: THREE.Group;
  rng: Rng;
}

/**
 * およぐ 係（TAKO-1）: はやく すすむ → とまる の くり返し、近づくと すみを はいて にげる、たたかれると ぺちん。
 * 水の 中だけ（swimTerrain.ts）。画面を 暗くする 黒い 板の こさ（inkDim）も ここで 決める。
 */
export class YokaiSwimmer {
  private readonly clouds: { cloud: InkCloud; sw: YokaiSwim }[] = [];
  private dim = 0;
  private dimSpec: YokaiSwim | null = null;
  private spits = 0;

  constructor(private readonly d: SwimDeps) {}

  private init(e: Ent): SwimState {
    return {
      mode: 'cycle',
      cycleStep: 0,
      heading: e.yaw,
      modeLeft: 0,
      inkCool: 0,
      slapLeft: -1,
      slapCool: 0,
      lastHp: e.hp,
      dry: 0,
      fleeX: 0,
      fleeZ: 0,
    };
  }

  /** 1 体の 1 ステップ（AI が 動く 妖怪だけ） */
  tick(e: Ent): void {
    const sw = swimOf(e);
    if (!sw) return;
    const s = (e.swim ??= this.init(e));
    const { f, combat } = this.d;
    const m = e.model as TakoHachimaki;
    e.age++;
    if (s.inkCool > 0) s.inkCool--;
    if (s.slapCool > 0) s.slapCool--;
    this.watchSlap(e, s, sw, m);

    // 体が 水の 外: とまって 待ち、3 秒で けむりを 出して 消える（ドロップ・経験値なし）
    if (!this.bodyCellIsWater(e)) {
      if (++s.dry >= steps(sw.dryLeaveSeconds)) this.leave(e);
      return;
    }
    s.dry = 0;
    this.settleY(e, sw);

    const near = !combat.dead() && this.gapToPlayer(e) <= sw.inkRange;

    if (s.mode === 'cycle' && near && s.inkCool <= 0) {
      s.mode = 'charge';
      s.modeLeft = steps(sw.inkChargeSeconds);
    }
    if (s.mode === 'charge') {
      this.turnToward(e, sw, yawToward(f.px - e.x, f.pz - e.z), 2);
      m.inkCharge = 1 - s.modeLeft / steps(sw.inkChargeSeconds);
      if (--s.modeLeft <= 0) this.spit(e, s, sw, m);
      return;
    }
    if (s.mode === 'flee') {
      this.fleeTick(e, s, sw, m);
      return;
    }
    this.cycleTick(e, s, sw, m);
  }

  /** はやく すすむ → とまる。とまる 間に 次の 向きを きめて、向きを かえる */
  private cycleTick(e: Ent, s: SwimState, sw: YokaiSwim, m: TakoHachimaki): void {
    const goN = steps(sw.goSeconds);
    const total = goN + steps(sw.restSeconds);
    if (s.cycleStep === goN) s.heading = this.pickHeading(e, sw);
    if (s.cycleStep < goN) {
      this.turnToward(e, sw, s.heading, 1);
      this.move(e, sw, Math.sin(e.yaw), -Math.cos(e.yaw), sw.goSpeed * e.speedMul * DT);
      m.drive('go', s.cycleStep * DT, Math.sin((Math.PI * (s.cycleStep + 1)) / goN));
    } else {
      this.turnToward(e, sw, s.heading, 1);
      m.drive('rest', (s.cycleStep - goN) * DT, 0);
    }
    s.cycleStep = (s.cycleStep + 1) % total;
  }

  private fleeTick(e: Ent, s: SwimState, sw: YokaiSwim, m: TakoHachimaki): void {
    const dist = sw.fleeSpeed * e.speedMul * DT;
    if (this.move(e, sw, s.fleeX, s.fleeZ, dist) <= 0) {
      // 行けない: 向きを 45 度ずつ かえて さがす
      for (const k of TURN_TRIES) {
        if (k === 0) continue;
        const a = Math.atan2(s.fleeZ, s.fleeX) + (k * Math.PI) / 4;
        if (this.move(e, sw, Math.cos(a), Math.sin(a), dist) > 0) {
          s.fleeX = Math.cos(a);
          s.fleeZ = Math.sin(a);
          break;
        }
      }
    }
    m.drive('go', (steps(sw.fleeSeconds) - s.modeLeft) * DT, 1);
    if (--s.modeLeft <= 0) {
      s.mode = 'cycle';
      s.cycleStep = steps(sw.goSeconds); // とまる ところから（向きを きめなおす）
    }
  }

  /** すみを はく: 口の 前に けむりを 置き、りっくんから はなれる 向きへ にげはじめる */
  private spit(e: Ent, s: SwimState, sw: YokaiSwim, m: TakoHachimaki): void {
    const { f } = this.d;
    const fx = Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    const cloud = this.takeCloud(sw);
    cloud.start(e.x + fx * MOUTH_FORWARD, e.y + MOUTH_UP, e.z + fz * MOUTH_FORWARD, fx, fz, 37 + 101 * this.spits++);
    this.dimSpec = sw;
    m.inkCharge = 0;
    m.inkAge = 0;
    s.inkCool = steps(sw.inkCooldownSeconds);
    let ax = e.x - f.px;
    let az = e.z - f.pz;
    const len = Math.hypot(ax, az);
    if (len < 1e-6) {
      ax = -fx;
      az = -fz;
    } else {
      ax /= len;
      az /= len;
    }
    s.fleeX = ax;
    s.fleeZ = az;
    s.mode = 'flee';
    s.modeLeft = steps(sw.fleeSeconds);
  }

  private takeCloud(sw: YokaiSwim): InkCloud {
    let pick = this.clouds.find((c) => !c.cloud.active);
    if (!pick && this.clouds.length < CLOUD_POOL) {
      pick = { cloud: new InkCloud(sw.inkRadius, sw.inkLifeSeconds, sw.inkFadeSeconds), sw };
      this.d.group.add(pick.cloud.group);
      this.clouds.push(pick);
    }
    if (!pick) pick = this.clouds.reduce((a, b) => (b.cloud.age > a.cloud.age ? b : a));
    return pick.cloud;
  }

  /** たたかれたら 0.3 秒 あとに ぺちん（1.5 秒に 1 回まで）。とどく 距離の 外なら 空ぶり */
  private watchSlap(e: Ent, s: SwimState, sw: YokaiSwim, m: TakoHachimaki): void {
    const { combat, events } = this.d;
    if (e.hp < s.lastHp - 1e-9 && s.slapLeft < 0 && s.slapCool <= 0) s.slapLeft = steps(sw.slapDelaySeconds);
    s.lastHp = e.hp;
    if (s.slapLeft < 0 || --s.slapLeft > 0) return;
    s.slapLeft = -1;
    s.slapCool = steps(sw.slapCooldownSeconds);
    m.slapT = 0;
    const hit = this.gapToPlayer(e) <= sw.slapReach && !combat.dead();
    const pos = { x: e.x, y: e.y + MOUTH_UP, z: e.z };
    events.emit({ type: 'attackStart', tick: events.tick(), id: e.id, kind: e.kind });
    events.emit({ type: 'attackHit', tick: events.tick(), id: e.id, kind: e.kind, hitPlayer: hit, position: pos });
    if (hit && combat.damage(sw.slapDamage, e.kind, { x: e.x, y: e.y, z: e.z })) events.cues.hurt.push(e.id);
  }

  /** りっくんの 体と タコの 体の きょり: よこは 足もとどうし、たては 体の 箱の すきま（かさなって いれば 0） */
  private gapToPlayer(e: Ent): number {
    const { f } = this.d;
    const above = f.py - (e.y + e.dims.height);
    const below = e.y - (f.py + AI_CONST.playerHeight);
    return Math.hypot(f.px - e.x, Math.max(0, above, below), f.pz - e.z);
  }

  private bodyCellIsWater(e: Ent): boolean {
    return isDeepWater(this.d.world.getBlock(Math.floor(e.x), Math.floor(e.y + e.dims.height / 2), Math.floor(e.z)));
  }

  /** 水面に 合わせて 上下に 少しずつ 動く（水が ふえ・へった とき） */
  private settleY(e: Ent, sw: YokaiSwim): void {
    const ny = swimTarget(this.d.world, e.dims, sw, e.x, e.z, e.y, VERTICAL_SPEED * DT);
    if (!Number.isNaN(ny)) e.y = ny;
  }

  /** 体が 水の 外に なった: けむりを 出して 消える（leaving と 同じ 消え方。ドロップ・経験値なし） */
  private leave(e: Ent): void {
    const { events } = this.d;
    e.state = 'leaving';
    e.model.die();
    events.emit({ type: 'leave', tick: events.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z } });
  }

  /** 向きを 少しずつ かえる（rate 倍の 速さ） */
  private turnToward(e: Ent, sw: YokaiSwim, want: number, rate: number): void {
    const maxTurn = ((sw.turnDegPerSec * Math.PI) / 180) * DT * rate;
    const diff = angleDiff(e.yaw, want);
    e.yaw += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
  }

  /** (dirx, dirz) へ dist だけ すすむ。水の 外へ はみ出す ときは 軸ごとに ずらす。すすんだ 距離を 返す */
  move(e: Ent, sw: YokaiSwim, dirx: number, dirz: number, dist: number): number {
    const maxDy = VERTICAL_SPEED * DT;
    const go = (x: number, z: number): boolean => {
      const ny = swimTarget(this.d.world, e.dims, sw, x, z, e.y, maxDy);
      if (Number.isNaN(ny)) return false;
      e.x = x;
      e.z = z;
      e.y = ny;
      return true;
    };
    const nx = e.x + dirx * dist;
    const nz = e.z + dirz * dist;
    if (go(nx, nz)) return dist;
    if (Math.abs(dirx) > 1e-6 && go(nx, e.z)) return Math.abs(dirx * dist);
    if (Math.abs(dirz) > 1e-6 && go(e.x, nz)) return Math.abs(dirz * dist);
    return 0;
  }

  /** 次に すすむ 向き: 今の 向きから 少しずらして、全部 すすめる 向きを 先に 見つける（なければ いちばん 長く すすめる 向き） */
  private pickHeading(e: Ent, sw: YokaiSwim): number {
    const len = sw.goSpeed * sw.goSeconds * e.speedMul;
    const base = e.yaw + (this.d.rng() * 2 - 1) * (Math.PI / 2);
    let best = base;
    let bestRun = -1;
    for (const k of TURN_TRIES) {
      const yaw = base + (k * Math.PI) / 4;
      const run = this.freeRun(e, sw, yaw, len);
      if (run >= len - 1e-6) return yaw;
      if (run > bestRun) {
        bestRun = run;
        best = yaw;
      }
    }
    return best;
  }

  /** その 向きに どれだけ すすめるか（調べるだけ。動かない） */
  private freeRun(e: Ent, sw: YokaiSwim, yaw: number, len: number): number {
    const dx = Math.sin(yaw);
    const dz = -Math.cos(yaw);
    let y = e.y;
    let run = 0;
    for (let d = PROBE_STEP; d <= len + 1e-6; d += PROBE_STEP) {
      const ny = swimTarget(this.d.world, e.dims, sw, e.x + dx * d, e.z + dz * d, y, (VERTICAL_SPEED * PROBE_STEP) / sw.goSpeed);
      if (Number.isNaN(ny)) break;
      y = ny;
      run = d;
    }
    return run;
  }

  // ---------------------------------------------------------------- けむり・画面の 暗さ

  /** 毎ステップ 1 回: けむりを すすめ、りっくんの 目が けむりの 中なら 暗さを 上げ、外なら 下げる */
  tickWorld(): void {
    const { f } = this.d;
    let inside = false;
    for (const c of this.clouds) {
      c.cloud.step(DT);
      if (!c.cloud.active) continue;
      const p = c.cloud.center();
      if (Math.hypot(f.px - p.x, f.py + AI_CONST.playerEye - p.y, f.pz - p.z) <= c.sw.inkRadius) inside = true;
    }
    const sp = this.dimSpec;
    if (!sp) return;
    this.dim = inside ? Math.min(sp.dimAlpha, this.dim + sp.dimAlpha / DIM_RISE_STEPS) : Math.max(0, this.dim - sp.dimAlpha / steps(sp.dimFadeOutSeconds));
  }

  /** 画面を 暗くする 黒い 板の こさ（0〜1） */
  inkDim(): number {
    return this.dim;
  }

  /** テスト用: いま 出ている けむり（中心・半径・はいてからの 秒） */
  cloudList(): { x: number; y: number; z: number; radius: number; age: number }[] {
    return this.clouds.filter((c) => c.cloud.active).map((c) => ({ x: c.cloud.center().x, y: c.cloud.center().y, z: c.cloud.center().z, radius: c.sw.inkRadius, age: c.cloud.age }));
  }

  /** けむりを ぜんぶ 消す（clear）・画面の 暗さも 0 に */
  clear(): void {
    for (const c of this.clouds) c.cloud.dispose();
    this.clouds.length = 0;
    this.dim = 0;
    this.dimSpec = null;
  }
}

/** 暗さが 上がりきるまで（ステップ。じわっと） */
const DIM_RISE_STEPS = 10;
