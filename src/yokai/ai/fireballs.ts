import * as THREE from 'three';
import type { PlayerCombat, VoxelWorld, W2Settings, YokaiKind, YokaiState } from '../../contracts';
import type { Chochin, Fireball } from '../models/chochin';
import { boxesOf, playerBox } from './body';
import { AI_CONST } from './config';
import type { Ent, LiveFireball, YokaiField } from './entity';
import type { YokaiEvents } from './events';
import { aabbOverlap, obbBounds, type Aabb, type OBox } from './geometry';
import type { YokaiHurt } from './hurt';
import type { BurstFx } from './effects';
import type { FireballView, YokaiManagerOptions } from './managerTypes';
import { askParry } from './parry';
import type { YokaiReeler } from './reeler';

const tmpBox: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpBox2: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpVec = new THREE.Vector3();

interface FireballDeps {
  world: VoxelWorld;
  f: YokaiField;
  combat: Pick<PlayerCombat, 'damage'>;
  events: Pick<YokaiEvents, 'emit' | 'tick' | 'cues'>;
  /** dome・onDomeErase・parry・onParryEvent を 使うときに 読む */
  opts: Pick<YokaiManagerOptions, 'dome' | 'onDomeErase' | 'parry' | 'onParryEvent'>;
  settings: Pick<W2Settings, 'reflectFireball'>;
  hurt: Pick<YokaiHurt, 'hurtYokai'>;
  reeler: Pick<YokaiReeler, 'applyStagger'>;
  burst: Pick<BurstFx, 'spawn'>;
}

/**
 * 火の玉の係: ちょうちんが出した火の玉を 妖怪から離して管理する（ちょうちんが消えても飛びつづける）、
 * 飛ぶ・当たる・消える、パリィ・はね返し（WEAPON-5）。
 */
export class YokaiFireballs {
  private fireballs: LiveFireball[] = [];
  private fireballSeq = 0;
  private freeFireballs: Fireball[] = [];
  private readonly boxList: OBox[] = [];

  constructor(private readonly d: FireballDeps) {}

  /** ちょうちんが出した火の玉を、妖怪から離して管理する（ちょうちんが消えても飛びつづける） */
  take(e: Ent): void {
    const model = e.model as Chochin;
    const idx = model.fireballs.findIndex((f) => f.alive && f.traveled === 0);
    if (idx < 0) return;
    const fb = model.fireballs.splice(idx, 1)[0]!;
    this.fireballs.push({ id: ++this.fireballSeq, fb, owner: e.id, damage: e.attack, reflected: false });
    const spare = this.freeFireballs.pop();
    if (spare) model.fireballs.push(spare);
  }

  private kill(f: LiveFireball, withBurst: boolean): void {
    f.fb.alive = false;
    f.fb.group.visible = false;
    if (withBurst) this.d.burst.spawn(f.fb.position.x, f.fb.position.y, f.fb.position.z);
    this.freeFireballs.push(f.fb);
  }

  /** 全部 すぐ 消す（イベントは出さない） */
  clear(): void {
    for (const f of this.fireballs) this.kill(f, false);
    this.fireballs = [];
  }

  tick(dt: number): void {
    if (this.fireballs.length === 0) return;
    const { world, f: field, combat, events, opts } = this.d;
    const pb = playerBox(field, tmpBox);
    const keep: LiveFireball[] = [];
    const half = AI_CONST.fireballBox / 2;
    const dome = opts.dome?.() ?? null;
    for (const f of this.fireballs) {
      f.fb.update(dt);
      const p = f.fb.position;
      const kind: YokaiKind = 'chochin';
      let end = false;
      let hitPlayer = false;
      if (!f.fb.alive) {
        end = true; // 8 ブロックで消えた
      } else if (
        !world.isLoaded(p.x, p.z) || p.y < 0 || p.y >= world.size.y
      ) {
        end = true;
      } else if (world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
        end = true;
      } else if (dome && !f.reflected /* はね返した 弾は プレイヤーの 物なので ドームでも 消さない */ && Math.hypot(p.x - dome.x, p.y - dome.y, p.z - dome.z) <= dome.r) {
        // WEAPON-9: ドームに ふれた 弾は 消える（ダメージ 0）
        end = true;
        opts.onDomeErase?.(f.id);
      } else {
        tmpBox2.minX = p.x - half;
        tmpBox2.maxX = p.x + half;
        tmpBox2.minY = p.y - half;
        tmpBox2.maxY = p.y + half;
        tmpBox2.minZ = p.z - half;
        tmpBox2.maxZ = p.z + half;
        if (f.reflected) {
          // はね返した 火の玉: 妖怪に 当たる（プレイヤーには もう 当たらない）
          if (this.reflectedHit(f, tmpBox2)) end = true;
        } else if (aabbOverlap(tmpBox2, pb)) {
          // WEAPON-5: 受けの間なら はね返す（火の玉は のこる）。おしいは 半分で 消える
          const v = askParry(opts.parry, field, 'fireball', f.owner, { x: p.x, y: p.y, z: p.z }, f.damage);
          if (v?.result === 'success') {
            this.reflectOne(f);
          } else {
            hitPlayer = true;
            end = true;
            if (combat.damage(v?.result === 'early' ? v.amount : f.damage, kind, { x: p.x, y: p.y, z: p.z }, 'ball')) events.cues.hurt.push(f.owner);
          }
        }
      }
      if (end) {
        events.emit({ type: 'fireballEnd', tick: events.tick(), position: { x: p.x, y: p.y, z: p.z }, hitPlayer });
        this.kill(f, true);
      } else {
        keep.push(f);
      }
    }
    this.fireballs = keep;
  }

  /** テスト用: いま飛んでいる火の玉の数（はね返した分も 数える） */
  count(): number {
    return this.fireballs.length;
  }

  /** テスト窓口 `yokai.fireballList()`: 飛んでいる 火の玉（コピー） */
  list(): FireballView[] {
    return this.fireballs.map((f) => ({
      position: { x: f.fb.position.x, y: f.fb.position.y, z: f.fb.position.z },
      dir: { x: f.fb.dir.x, y: f.fb.dir.y, z: f.fb.dir.z },
      speed: f.fb.speed,
      reflected: f.reflected,
      owner: f.owner,
    }));
  }

  /** index 番めの 火の玉を はね返す。できたら true（もう はね返した・消えた 火の玉は false） */
  reflect(index: number): boolean {
    const f = this.fireballs[index];
    if (!f || f.reflected || !f.fb.alive) return false;
    this.reflectOne(f);
    return true;
  }

  /** 投げた ちょうちんの 当たりの箱の まん中へ（そのときの 位置。追いかけない）。いなければ 来た向きの 逆 */
  private reflectOne(f: LiveFireball): void {
    const fb = f.fb;
    const owner = this.d.f.ents.find((q) => q.id === f.owner);
    let dx = -fb.dir.x;
    let dy = -fb.dir.y;
    let dz = -fb.dir.z;
    if (owner && owner.state !== 'dying' && owner.state !== 'leaving' && !owner.remove) {
      const tx = owner.x - fb.position.x;
      const ty = owner.y + owner.dims.height / 2 - fb.position.y;
      const tz = owner.z - fb.position.z;
      if (Math.hypot(tx, ty, tz) > 1e-6) {
        dx = tx;
        dy = ty;
        dz = tz;
      }
    }
    const rf = this.d.settings.reflectFireball;
    fb.reflect(tmpVec.set(dx, dy, dz), rf.speed, rf.range);
    f.reflected = true;
  }

  /** はね返した 火の玉 f(box = 火の玉の 箱) が 妖怪に 当たったか。当たったら ダメージ・よろけ。 */
  private reflectedHit(f: LiveFireball, fbBox: Aabb): boolean {
    for (const e of this.d.f.ents) {
      if (e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.remove) continue;
      for (const b of boxesOf(e, this.boxList)) {
        if (!aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox), fbBox)) continue;
        const p = f.fb.position;
        const amount = f.damage * this.d.settings.reflectFireball.damageMul;
        const dealt = this.d.hurt.hurtYokai(e.id, amount, { x: p.x, y: p.y, z: p.z }, undefined, 'reflect');
        this.d.opts.onParryEvent?.({ type: 'reflectHit', yokaiId: e.id, damage: dealt });
        if ((e.state as YokaiState) !== 'dying') this.d.reeler.applyStagger(e.id, 'reflect');
        return true;
      }
    }
    return false;
  }
}
