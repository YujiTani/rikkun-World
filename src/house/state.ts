import { toBlueprint, parseBlueprint, blueprintName, type Blueprint } from './editor/blueprint';
import { cloneState, emptyState, parseState, type EditorState } from './editor/model';
import { Kura } from './kura';
import type { HouseRecord } from './talk';

/**
 * 建築士さん・くら・エディターの 保存（HOUSE-1A の AC32・AC33、HOUSE-1B の AC32b）。セーブの `house` に 入る。
 * 形: { v: 2, kura: { id: 数 }, first: { x, z } | null, toolsGiven, fudeGiven, draft, blueprints, next }
 *   kura        … あずけた 材料（建築士さん どうしで 共有）
 *   first       … 最初の 1 人の 場所（決まったら 動かさない。null = まだ 決まって いない → 置き方の 関数が 決める）
 *   toolsGiven  … はじめての あいさつ（みずもり・どうづき）を したか
 *   fudeGiven   … はじめの ふでを わたしたか（1B から。#339 より 前の セーブは false → 次に 話した とき 1 本。AC46）
 *   draft       … エディターの 作りかけ（すすみ・大きさ・まど・やね・家具・名前。あかりは いつも ちょうちん）
 *   blueprints  … これまで 作った せっけいずの 中身（番号つき。持ち物の せっけいずの マスは 番号だけ 持つ）
 *   next        … 次の せっけいずの 番号（1, 2, 3 …。すてても こわしても もどらない）
 * もどす／すすむの 記録・見本の 向き・家具の えらびは 入れない（開きなおすと 空）。
 * 古い セーブ（キーなし・v1）・こわれた データは 初期の まま（くら 空・最初の 1 人は 決まった 場所に 出る・道具は まだ・作りかけは まっさら・番号 1）。
 */
export interface HouseSave {
  v: 2;
  kura: Record<string, number>;
  first: { x: number; z: number } | null;
  toolsGiven: boolean;
  fudeGiven: boolean;
  draft: EditorState;
  blueprints: Blueprint[];
  next: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export class HouseState {
  readonly kura = new Kura();
  /** 話す 流れ（HouseTalk）と 建築士さんの 置き場所（ArchitectManager）が 同じ 物を 読み書きする */
  readonly record: HouseRecord = { toolsGiven: false, fudeGiven: false, first: null };
  /** エディターの 作りかけ（EditorController が 中身を 入れかえる） */
  readonly holder: { draft: EditorState } = { draft: emptyState() };
  private readonly plans = new Map<number, Blueprint>();
  private next = 1;

  /** せっけいずを 1 まい 作った: 中身を しまって 番号を 返す（番号は ひとつずつ ふえる） */
  register(draft: Readonly<EditorState>): number {
    const bp = toBlueprint(draft, this.next++);
    this.plans.set(bp.number, bp);
    return bp.number;
  }

  /** 番号の せっけいず（知らない 番号は null） */
  blueprint(number: number): Blueprint | null {
    return this.plans.get(number) ?? null;
  }

  /** 持ち物の ツールチップに 出す 名前（知らない 番号は null） */
  planName(number: number): string | null {
    const bp = this.plans.get(number);
    return bp ? blueprintName(bp) : null;
  }

  serialize(): HouseSave {
    const f = this.record.first;
    return {
      v: 2,
      kura: this.kura.serialize(),
      first: f ? { x: f.x, z: f.z } : null,
      toolsGiven: this.record.toolsGiven,
      fudeGiven: this.record.fudeGiven,
      draft: cloneState(this.holder.draft),
      blueprints: [...this.plans.values()].map((b) => ({ ...b, furniture: b.furniture.map((p) => ({ ...p })), name: { ...b.name } })),
      next: this.next,
    };
  }

  /** 前の 中身は すてて 読む。形が ちがう 所は 初期の まま */
  deserialize(data: unknown): void {
    this.record.first = null;
    this.record.toolsGiven = false;
    this.record.fudeGiven = false;
    this.holder.draft = emptyState();
    this.plans.clear();
    this.next = 1;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      this.kura.restore(null);
      return;
    }
    const d = data as Record<string, unknown>;
    this.kura.restore(d.kura);
    const f = d.first as { x?: unknown; z?: unknown } | null | undefined;
    if (typeof f === 'object' && f !== null && finite(f.x) && finite(f.z)) this.record.first = { x: Math.floor(f.x), z: Math.floor(f.z) };
    this.record.toolsGiven = d.toolsGiven === true;
    this.record.fudeGiven = d.fudeGiven === true;
    if (d.draft !== undefined) this.holder.draft = parseState(d.draft);
    if (Array.isArray(d.blueprints)) {
      for (const raw of d.blueprints as unknown[]) {
        const bp = parseBlueprint(raw);
        if (bp) this.plans.set(bp.number, bp);
      }
    }
    const top = Math.max(0, ...this.plans.keys());
    this.next = Math.max(top + 1, typeof d.next === 'number' && Number.isInteger(d.next) && d.next >= 1 ? d.next : 1);
  }
}
