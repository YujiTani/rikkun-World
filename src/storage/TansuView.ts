// COOP-1 4c（docs/design/COOP-1.md §3.3・AC80・AC94）: 2P の「たんす」の ページが 世界の たんす（1P と 共有）の 中身を そのまま 読み書きする 口。
// 中身の 配列は `StorageSystem` の 物を そのまま 使う（コピーしない）ので、1P と 2P が 同時に 開いても 両方に 同じ 中身が 出る。
// 動かすのは 2P の もちもの（`inventory`）だけ。1P の `StorageSystem.opened` には さわらない。うつし方は 1P と 同じ（tansuMove.ts）。
import type { Inventory, ItemStack, Vec3 } from '../contracts';
import type { StorageSystem } from './StorageSystem';
import { TansuMover, tansuCloseReason, tansuDistance, type ShiftReason, type TansuApi, type TansuSlot } from './tansuMove';

export { tansuCloseReason, type TansuApi };

export interface TansuViewDeps {
  /** 2P の もちもの */
  inventory: Inventory & { setCursor(stack: ItemStack | null): void };
  /** 世界の たんす（1P と 共有） */
  tansu: Pick<StorageSystem, 'slotsAt' | 'changed'>;
  /** 2P の 足もと（遠く なったら とじる） */
  position: () => Vec3;
  /** 遠く なったと みなす きょり（`STORAGE_DEFAULTS.tansuCloseDist`。1P と 同じ） */
  closeDist: () => number;
  /** 入りきらなかった（どっちが いっぱい） */
  onFull?: (which: 'inv' | 'tansu') => void;
  /** 遠く なった・こわれた ときに 1 回（2P の パネルを とじる 合図）。自分で close() した ときは 呼ばない */
  onClose?: () => void;
}

export class TansuView implements TansuApi {
  private pos: Vec3 | null = null;
  private readonly mover: TansuMover;

  constructor(private readonly d: TansuViewDeps) {
    this.mover = new TansuMover({
      inventory: d.inventory,
      slots: () => this.slots(),
      changed: () => {
        const p = this.pos;
        if (p) d.tansu.changed(p.x, p.y, p.z);
      },
      onFull: d.onFull,
    });
  }

  open(x: number, y: number, z: number): boolean {
    if (!this.d.tansu.slotsAt(x, y, z)) return false;
    this.pos = { x, y, z };
    return true;
  }

  /** 自分で とじた（2P の パネルが とじる とき） */
  close(): void {
    this.pos = null;
  }

  openedAt(): Vec3 | null {
    return this.pos ? { ...this.pos } : null;
  }

  /** こわされた などで たんすが なくなったら 開いていない ことに する */
  ui(): { open: boolean } {
    return { open: this.slots() !== null };
  }

  openSlots(): readonly TansuSlot[] | null {
    return this.slots();
  }

  private slots(): TansuSlot[] | null {
    const p = this.pos;
    return p ? this.d.tansu.slotsAt(p.x, p.y, p.z) : null;
  }

  /** 毎ステップ 1 回: 遠く なった・こわれた ら とじて onClose（1P の StorageSystem.update と 同じ 決まり） */
  update(): void {
    const p = this.pos;
    if (!p) return;
    const reason = tansuCloseReason({ exists: this.slots() !== null, dist: tansuDistance(this.d.position(), p), closeDist: this.d.closeDist() });
    if (reason === null) return;
    this.pos = null;
    this.d.onClose?.();
  }

  click(i: number): boolean {
    return this.mover.click(i);
  }

  shiftClick(from: 'tansu' | 'inv', i: number): { moved: number; reason: ShiftReason } {
    return this.mover.shiftClick(from, i);
  }

  storeAll(): { moved: number; reason: ShiftReason } {
    return this.mover.storeAll();
  }

  storeSame(): { moved: number; reason: ShiftReason } {
    return this.mover.storeSame();
  }

  takeAll(): { moved: number; reason: ShiftReason } {
    return this.mover.takeAll();
  }

  // 「えらんだ もの を しまう」の ✓ は マウスの Ctrl クリックの 物なので 2P には ない（2 人用では 1P にも 出さない。§13）
  mark(_i: number): boolean {
    return false;
  }
  marks(): number[] {
    return [];
  }
  storeMarked(): { moved: number; reason: ShiftReason } {
    return { moved: 0, reason: null };
  }
}
