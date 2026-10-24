/**
 * #293 試作: がしゃどくろが 受ける 攻撃の 口（gashaBigHit.ts の HitSources）を、ゲームの 本物の 武器の しくみに つなぐ。
 * main.ts は これを 1 回 呼ぶだけ（`?proto=gashaBig` の ときだけ）。
 *   刀（けさ・きりあげ・つき）   … blade.shape()（当たりの コマの 形）。ダメージ = 武器の 強さ × わざの 倍率（BladeSystem と おなじ 式）
 *   ためわざ（らせん）・真空波   … waveSys.list()（飛んで いる 波。半径・ダメージは 波が もっている 数）
 *   ためわざ（雷）             … legend.peekEvents() の lightningStrike（落ちた 場所・半径は ためわざの 数）
 *   ためわざ（虹の ドーム）     … legend.dome()（球）。ダメージ・間かくは ためわざの 数
 *   矢・パンチ                 … YokaiManager の raycast と damage に 割りこむ（gashaBigHit.ts）
 */
import type { BladeShapeInfo, BladeTech, ItemId, Vec3, W2Settings } from '../contracts';
import { chargeOf, legendPowerOf } from '../legend/defs';
import { techDamage } from '../tools/blade/BladeSystem';
import type { HitSources, YokaiWorldLike } from './gashaBigHit';

export interface WireRefs {
  blade: {
    shape(): BladeShapeInfo | null;
    state(): { item: ItemId | null; tech: BladeTech | null; frame: number; combo?: { step: number } | null };
  };
  /** waveSys.list()。runtime では radius・damage も もっている */
  waves(): readonly { id: number; position: Vec3 }[];
  legend: {
    peekEvents(): readonly { type: string; tick: number }[];
    dome(): { x: number; y: number; z: number; r: number } | null;
  };
  /** 手に 持っている もの（power = 1 本ごとの 強さ） */
  held(): { item: ItemId; power?: number | null } | null;
  settings: Pick<W2Settings, 'legendary' | 'bladeDamageMul'>;
  /** ふだんの 武器の 強さ（BladeSystem の weaponDamage と おなじ もの） */
  weaponDamage(item: ItemId): number;
  /** SAMURAI-1: 明珍手甲の 刀の 強さの 倍率（雷・ドームの 強さに かける。なければ 1。刀の ふつうの わざは weaponDamage に、波は 波が もつ 数に もう 入っている） */
  powerMul?(item: ItemId): number;
  yokai(): YokaiWorldLike | null;
  sound?(): void;
}

export function makeHitSources(r: WireRefs): HitSources {
  let seenTick = -Infinity;
  let primed = false;
  return {
    blade: () => {
      const shape = r.blade.shape();
      if (!shape) return null;
      const st = r.blade.state();
      if (!st.item || !st.tech) return null;
      return { shape, damage: techDamage(r.weaponDamage(st.item), r.settings.bladeDamageMul[st.tech]), swing: `${st.tech}:${st.combo?.step ?? 0}`, frame: st.frame };
    },
    waves: () => r.waves().map((w) => {
      const x = w as unknown as { id: number; position: Vec3; radius: number; damage: number };
      return { id: x.id, position: x.position, radius: x.radius, damage: x.damage };
    }),
    strikes: () => {
      const evs = r.legend.peekEvents();
      const out: { center: Vec3; radius: number; damage: number }[] = [];
      const h = r.held();
      const L = h ? chargeOf(r.settings, h.item) : null;
      for (const e of evs) {
        if (e.type !== 'lightningStrike' || e.tick <= seenTick) continue;
        if (primed && L && L.kind === 'lightning' && h) {
          const S = (e as unknown as { S?: Vec3 | null }).S;
          if (S) out.push({ center: { ...S }, radius: L.radius, damage: Math.round((legendPowerOf(r.settings, h.item, h.power ?? null) ?? 1) * (r.powerMul?.(h.item) ?? 1) * L.damageMul * 100 + 1e-7) / 100 });
        }
      }
      for (const e of evs) if (e.type === 'lightningStrike' && e.tick > seenTick) seenTick = e.tick;
      primed = true; // 最初の 1 回は 前から ある 出来事を 読みとばす
      return out;
    },
    dome: () => {
      const d = r.legend.dome();
      const h = r.held();
      const L = h ? chargeOf(r.settings, h.item) : null;
      if (!d || !h || !L || L.kind !== 'shining') return null;
      return { center: { x: d.x, y: d.y, z: d.z }, radius: d.r, damage: Math.round((legendPowerOf(r.settings, h.item, h.power ?? null) ?? 1) * (r.powerMul?.(h.item) ?? 1) * L.damageMul * 100 + 1e-7) / 100, everySteps: L.hitEvery };
    },
    yokai: r.yokai,
    sound: r.sound,
  };
}
