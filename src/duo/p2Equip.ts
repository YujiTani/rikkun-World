// COOP-1 4b（docs/design/COOP-1.md §3.3・§3.5・AC83）: 2P の パネルの そうびの マスと p2.armor の つなぎ。
// 2P は パッドで もちものの マスを つかみ、そうびの マスで「決める」と 着る（クリック・ダブルクリックは 1P の パネルだけ）。
import type { ArmorSlot } from '../contracts';
import type { ArmorUi } from '../ui/equipPanel';
import type { P2State } from './p2State';

/** そうびの マスの えらび名（`duo.inv(2).focus`）と 部位 */
const EQUIP_FOCUS: Readonly<Record<string, ArmorSlot>> = {
  'equip:head': 'head',
  'equip:body': 'body',
  'equip:arms': 'arms',
  'equip:legs': 'legs',
};

/** えらび名 → その 部位。そうびの マスで なければ null */
export function equipSlotOfFocus(focus: string | null): ArmorSlot | null {
  return focus === null ? null : (EQUIP_FOCUS[focus] ?? null);
}

/**
 * 2P の パッドで「決める」を 押した ときの そうびの マスの 動き。そうびの マスなら `armor.click(部位)` を 1 回 呼んで true、
 * ちがえば 何も せず false（呼んだ 側が ふつうの 決めるを 行う）。
 */
export function pressEquip(focus: string | null, armor: Pick<ArmorUi, 'click'>): boolean {
  const slot = equipSlotOfFocus(focus);
  if (slot === null) return false;
  armor.click?.(slot);
  return true;
}

/** 2P の パネル（InventoryScreen）に わたす そうび = 2P の p2.armor そのもの（1P の そうびではない） */
export function p2ArmorUi(p2: Pick<P2State, 'armor'>): ArmorUi {
  return p2.armor;
}
