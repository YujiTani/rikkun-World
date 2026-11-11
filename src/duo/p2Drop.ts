// 2P の もちもの画面で X = 1 こ すてる・R3 = ぜんぶ すてる（1P の DropController の padFocus と 同じ きまり）。
import type { ArmorSlot, StorageEvent } from '../contracts';
import { DropController, ItemDropper, type DragTarget, type DropperDeps } from '../storage/ItemDropper';
import type { ActionState } from '../input/actions';

/** えらび名の 形（slot:数字・tansu:数字・equip:部位） */
const FOCUS_RE = /^(slot|tansu|equip):(.+)$/;
const ARMOR_FOCUS = ['head', 'body', 'arms', 'legs'] as const;

/** 名前の 前半 → すてる 元の 作り方 */
const FROM_FOCUS = {
  slot: (id: string): DragTarget => Number(id),
  tansu: (id: string): DragTarget => `tansu:${Number(id)}`,
  equip: (id: string): DragTarget | null => ((ARMOR_FOCUS as readonly string[]).includes(id) ? (id as ArmorSlot) : null),
} as const;

/** 2P の えらび名（`duo.inv(2).focus`）→ すてる 元。すてられない もの（タブ・とじる など）は null */
export function dragTargetOfFocus(focus: string | null): DragTarget | null {
  const m = focus === null ? null : FOCUS_RE.exec(focus);
  if (m === null) return null;
  const [, kind, id] = m;
  return FROM_FOCUS[kind as keyof typeof FROM_FOCUS](id!);
}

export interface P2DropDeps extends DropperDeps {
  actions: Pick<ActionState, 'wasPressed'>;
  /** 2P の もちもの画面が 開いているか */
  isOpen: () => boolean;
  /** いま えらんでいる 物の 名前 */
  focus: () => string | null;
}

export interface P2Drop {
  /** 毎ステップ 1 回 */
  update(): void;
  drainEvents(): StorageEvent[];
}

export function createP2Drop(d: P2DropDeps): P2Drop {
  const dropper = new ItemDropper(d);
  const controller = new DropController({
    actions: d.actions,
    dropper,
    playEnabled: () => false, // あそんでいる ときの 2P の すてるは ここでは 受けない
    inventoryOpen: d.isOpen,
    hover: () => null,
    padFocus: () => dragTargetOfFocus(d.focus()),
  });
  return { update: () => controller.update(), drainEvents: () => dropper.drainEvents() };
}
