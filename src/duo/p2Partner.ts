// COOP-1 4b（docs/design/COOP-1.md §3.5）: 妖怪から 見た 2P の 窓口（YokaiPartner）。wire/duoPlay.ts の build() から 外に 出した 物。
// ダメージの 種類（火の玉 = 'ball'）と 2P の そうび（忍び装束の 判定）を 妖怪の 側へ 伝える。
import type { ArmorSlot, ItemId, Vec3 } from '../contracts';
import type { YokaiPartner } from '../yokai/ai/target';
import type { P2Life } from './p2Life';

export interface P2PartnerDeps {
  /** 2P の 足もと（読むたびに いまの 位置。コピーを 作らない） */
  position: () => Vec3;
  /** 参加している・倒れていない・パッドが ささっている */
  targetable: () => boolean;
  life: Pick<P2Life, 'damage'>;
  /** 2P の そうび（p2.armor） */
  armor: { equipped(slot: ArmorSlot): ItemId | null };
}

export function createP2Partner(d: P2PartnerDeps): YokaiPartner {
  return {
    get position() {
      return d.position();
    },
    get targetable() {
      return d.targetable();
    },
    armor: d.armor,
    // 火の玉などの 種類(damageKind)も そうびの 式まで 伝える。むてき・倒れている ときは applied が 0 で false
    hurt: (amount, kind, from, damageKind) => d.life.damage(amount, { type: 'yokai', kind, from, damageKind }).applied > 0,
  };
}
