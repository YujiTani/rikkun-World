import { Kura } from './kura';
import type { HouseRecord } from './talk';

/**
 * 建築士さん・くらの 保存（HOUSE-1A。docs/design/HOUSE-1.md AC32・AC33）。セーブの `house` に 入る。
 * 形: { v: 1, kura: { id: 数 }, first: { x, z } | null, toolsGiven }
 *   kura        … あずけた 材料（建築士さん どうしで 共有）
 *   first       … 最初の 1 人の 場所（決まったら 動かさない。null = まだ 決まって いない → 置き方の 関数が 決める）
 *   toolsGiven  … はじめての あいさつ（みずもり・どうづき）を したか
 * 古い セーブ（キーなし）・こわれた データは 初期の まま（くら 空・最初の 1 人は 決まった 場所に 出る・道具は まだ）。
 */
export interface HouseSave {
  v: 1;
  kura: Record<string, number>;
  first: { x: number; z: number } | null;
  toolsGiven: boolean;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export class HouseState {
  readonly kura = new Kura();
  /** 話す 流れ（HouseTalk）と 建築士さんの 置き場所（ArchitectManager）が 同じ 物を 読み書きする */
  readonly record: HouseRecord = { toolsGiven: false, first: null };

  serialize(): HouseSave {
    const f = this.record.first;
    return { v: 1, kura: this.kura.serialize(), first: f ? { x: f.x, z: f.z } : null, toolsGiven: this.record.toolsGiven };
  }

  /** 前の 中身は すてて 読む。形が ちがう 所は 初期の まま */
  deserialize(data: unknown): void {
    this.record.first = null;
    this.record.toolsGiven = false;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      this.kura.restore(null);
      return;
    }
    const d = data as Record<string, unknown>;
    this.kura.restore(d.kura);
    const f = d.first as { x?: unknown; z?: unknown } | null | undefined;
    if (typeof f === 'object' && f !== null && finite(f.x) && finite(f.z)) this.record.first = { x: Math.floor(f.x), z: Math.floor(f.z) };
    this.record.toolsGiven = d.toolsGiven === true;
  }
}
