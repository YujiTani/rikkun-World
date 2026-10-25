import type { YokaiHurtBy, YokaiKnock } from '../../contracts';
import type { StaggerBook } from '../stagger';
import type { YokaiConfig } from './config';
import { AI_CONST } from './config';
import type { YokaiDefeat } from './defeat';
import { HEAVY_G, type YokaiField } from './entity';
import type { YokaiEvents } from './events';
import type { YokaiManagerOptions } from './managerTypes';
import type { YokaiPresenter } from './presenter';

interface HurtDeps {
  f: YokaiField;
  config: Pick<YokaiConfig, 'knockback'>;
  stag: Pick<StaggerBook, 'hasDouble' | 'damage'>;
  events: Pick<YokaiEvents, 'emit' | 'tick' | 'cues'>;
  opts: Pick<YokaiManagerOptions, 'onParryEvent'>;
  marks: Pick<YokaiPresenter, 'showMarks'>;
  reward: Pick<YokaiDefeat, 'defeat'>;
}

/**
 * ダメージを 受ける係: 体力を へらし、たおれる／いたがる／押される（のけぞる）を 決める。
 */
export class YokaiHurt {
  constructor(private readonly d: HurtDeps) {}

  /** ダメージ。よろけ中の 最初の 1 回は 2 倍（WEAPON-5）。実際に 与えた 数を 返す（当たらなければ 0） */
  hurtYokai(id: number, amount: number, from: { x: number; y: number; z: number }, knock?: YokaiKnock, by: YokaiHurtBy | 'reflect' = 'player'): number {
    const { d } = this;
    const e = d.f.ents.find((q) => q.id === id);
    if (!e || e.state === 'dying' || e.state === 'leaving' || e.remove) return 0;
    // NINJA-1: 小太刀の 追い打ち（kodachi）は よろけの 2 倍を 使わない（つぎの 本の 当たりの ために のこす）・押さない
    const kodachi = by === 'kodachi';
    const wasDouble = !kodachi && d.stag.hasDouble(id);
    if (!kodachi) amount = d.stag.damage(id, amount);
    if (wasDouble) d.opts.onParryEvent?.({ type: 'staggerDouble', yokaiId: id, damage: amount });
    e.hp = Math.max(0, Math.round((e.hp - amount) * 100 + 1e-7) / 100); // WEAPON-4: 0.01 の位に まるめる（小数の 誤差で のこさない）
    d.marks.showMarks(e);
    if (e.hp <= 0) {
      d.reward.defeat(e);
      return amount;
    }
    e.model.hit();
    d.events.emit({ type: 'hurt', tick: d.events.tick(), id: e.id, kind: e.kind, position: { x: e.x, y: e.y, z: e.z }, by: by === 'macho' ? 'macho' : by === 'kodachi' ? 'kodachi' : 'player' });
    // LIVE-4: りっくん が たたいた（ぶき・や・わざ）。パリィ で はね返した 火の玉 と マッチョ の パンチ は きっかけ に しない
    if (by === 'player') d.events.cues.hit.push(e.id);
    if (!kodachi && (e.kind !== 'nurikabe' || knock?.heavy)) {
      let dx = e.x - from.x;
      let dz = e.z - from.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-6) {
        dx = -Math.sin(e.yaw) * -1;
        dz = Math.cos(e.yaw);
      } else {
        dx /= dist;
        dz /= dist;
      }
      e.knockDx = dx;
      e.knockDz = dz;
      const T = knock?.ticks && knock.ticks > 0 ? Math.floor(knock.ticks) : AI_CONST.knockbackTicks;
      e.knockLeft = T;
      e.knockStep = (knock ? Math.max(0, knock.dist) : d.config.knockback) / T;
      // 長い はじきは はじめ 速く・おわり ゆっくり（1 ステップ目 ≒ 2 × 平均）
      e.knockTotal = knock?.ticks && knock.ticks > 0 ? Math.max(0, knock.dist) : 0;
      e.knockT = knock?.ticks && knock.ticks > 0 ? T : 0;
      // heavy（虹の はじき）の 上は「とぶ 高さ」（重力 HEAVY_G=75 で 上 6 に 24 ステップ（0.4 秒）で とどく）。いちばん 高い 所が up マス → 初速 √(2·HEAVY_G·up)。ふつうの 押しは 今までどおり 初速
      e.knockUpV = knock && knock.up > 0 ? (knock.heavy ? Math.sqrt(2 * HEAVY_G * knock.up) : knock.up) : 0;
      if (knock?.heavy) e.airSafe = true;
    }
    return amount;
  }
}
