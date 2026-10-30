import type { PlayerCombat } from '../../contracts';
import { YOKAI_DEFS } from '../../content/yokai/registry';
import { KIND_TRAITS } from '../traits';
import { boxesOf, localOverlap, playerBox } from './body';
import { AI_CONST, type YokaiConfig } from './config';
import type { Ent, YokaiField } from './entity';
import type { YokaiEvents } from './events';
import { aabbOverlap, obbBounds, toWorldXZ, type Aabb, type OBox } from './geometry';
import type { YokaiFireballs } from './fireballs';
import type { YokaiManagerOptions } from './managerTypes';
import { askParry } from './parry';
import type { YokaiReeler } from './reeler';
import type { YokaiStone } from './stone';

const tmp = { x: 0, z: 0 };
const tmpBox: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const tmpBox2: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

interface ContactDeps {
  f: YokaiField;
  combat: Pick<PlayerCombat, 'damage' | 'dead'>;
  config: Pick<YokaiConfig, 'contactDamage'>;
  events: Pick<YokaiEvents, 'emit' | 'tick' | 'cues'>;
  /** parry を 呼ぶときに 読む */
  opts: Pick<YokaiManagerOptions, 'parry'>;
  reeler: Pick<YokaiReeler, 'applyStagger'>;
  stone: Pick<YokaiStone, 'crush'>;
  fireballs: Pick<YokaiFireballs, 'take'>;
}

/**
 * 攻撃と当たりの係: 妖怪の体にふれたダメージ、攻撃の当たり（パリィ・つぶす・火の玉を出す）。
 */
export class YokaiContact {
  private readonly boxList: OBox[] = [];

  constructor(private readonly d: ContactDeps) {}

  /** 妖怪の体（当たりの箱）にふれたら ダメージ。むてきのあいだは combat 側で はじかれる */
  contactTick(): void {
    const { f, combat, config, events } = this.d;
    const dmg = config.contactDamage;
    if (!(dmg > 0) || combat.dead()) return;
    const pb = playerBox(f, tmpBox);
    for (const e of f.ents) {
      if (KIND_TRAITS[e.kind].swims) continue; // およぐ 妖怪は 体当たりしない（ぺちんだけ）
      if (e.state === 'dying' || e.state === 'leaving' || e.state === 'appear' || e.state === 'attack' || e.stag) continue; // 攻撃中は攻撃のダメージだけ。よろけ中は 体当たりしない
      for (const b of boxesOf(e, this.boxList)) {
        if (aabbOverlap(obbBounds(b, e.x, e.y, e.z, e.yaw, tmpBox2), pb) && localOverlap(f, e, b)) {
          if (combat.damage(dmg * KIND_TRAITS[e.kind].contactMul, e.kind, { x: e.x, y: e.y, z: e.z })) {
            events.cues.hurt.push(e.id);
            return;
          }
          break;
        }
      }
    }
  }

  /** 攻撃の model が「当たりを見る」瞬間（ちょうちんは 火の玉を 出す） */
  onModelHit(e: Ent, box: { cx: number; cy: number; cz: number; w: number; h: number; d: number }): void {
    const { f, combat, events } = this.d;
    toWorldXZ(box.cx * e.bodyScale, box.cz * e.bodyScale, e.yaw, tmp);
    const wpos = { x: e.x + tmp.x, y: e.y + box.cy * e.bodyScale, z: e.z + tmp.z };
    if (YOKAI_DEFS[e.kind].basis.projectile) {
      this.d.fireballs.take(e);
      events.emit({ type: 'attackHit', tick: events.tick(), id: e.id, kind: e.kind, hitPlayer: false, position: wpos });
      events.emit({ type: 'fireball', tick: events.tick(), id: e.id, position: wpos });
      return;
    }
    // 箱をワールドでの外わくにして、プレイヤーの体の箱と重なるか
    const bs = e.bodyScale;
    const ob: OBox = { cx: box.cx * bs, cy: box.cy * bs, cz: box.cz * bs, hx: (box.w / 2) * bs, hy: (box.h / 2) * bs, hz: (box.d / 2) * bs };
    const padXZ = AI_CONST.attackPad;
    const padY = AI_CONST.attackPadY;
    const hit =
      aabbOverlap(obbBounds(ob, e.x, e.y, e.z, e.yaw, tmpBox), playerBox(f, tmpBox2, padXZ, padY)) &&
      localOverlap(f, e, ob, padXZ, padY);
    // WEAPON-5: パリィに 聞く（ろくろくびは 首の頭への 向き、ほかは 妖怪の足もとへの 向き）
    let dmg = e.attack;
    if (hit) {
      const v = askParry(this.d.opts.parry, f, 'attack', e.id, KIND_TRAITS[e.kind].longNeck ? wpos : { x: e.x, y: e.y, z: e.z }, e.attack);
      if (v?.result === 'success') {
        // 受けた: 攻撃は 取り消し（ダメージ 0・押されない・こわさない・attackHit なし）
        this.d.reeler.applyStagger(e.id, 'parry');
        return;
      }
      if (v?.result === 'early') dmg = v.amount;
    }
    if (KIND_TRAITS[e.kind].crushesBlocks) this.d.stone.crush(e);
    events.emit({ type: 'attackHit', tick: events.tick(), id: e.id, kind: e.kind, hitPlayer: hit, position: wpos });
    if (hit && combat.damage(dmg, e.kind, { x: e.x, y: e.y, z: e.z })) events.cues.hurt.push(e.id);
  }
}
