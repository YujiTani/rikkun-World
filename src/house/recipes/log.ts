// HOUSE-2A（#364）おぼえた レシピの 記録・「あたらしい！」（しゅるいの ボタン ごと）・えらべる 物の 門。仕様 §2.2・§2.3。DOM・three なし。
// 1 まい おぼえると その レシピで 出る ボタンの 印が ぜんぶ ふえる。ボタンを えらぶ・つける たびに その ボタンの 印だけ 消える（もどすでは もどらない）。
import { ALL_KINDS, LIGHT_DEFAULT, PARTS, USUAL, isStyleless, splitKind, type Part } from './kinds';
import { RECIPE_IDS, isRecipeId, recipeButtons, recipeOfFurniture, recipeOfForm, recipeOfLight, recipeOfSuffix, type RecipeId } from './table';

/** 保存の 形（`serialize()` の `recipes`）。fresh は ボタンの id（`roof-kawara_mura`・`light-hotaru`・`furniture-maneki`・`suffix-5`） */
export interface RecipeSave {
  learned: string[];
  fresh: string[];
}

const PART_BTN = (part: Part): string => `part-${part}`;

export class RecipeLog {
  private learned: RecipeId[] = [];
  private fresh: string[] = [];

  has(id: RecipeId): boolean {
    return this.learned.includes(id);
  }

  /** おぼえる（まだの 物なら true。ボタンの 印が ふえる） */
  learn(id: RecipeId): boolean {
    if (this.has(id)) return false;
    this.learned.push(id);
    this.fresh.push(...recipeButtons(id));
    return true;
  }

  learnedIds(): readonly RecipeId[] {
    return this.learned;
  }

  /** ぜんぶ おぼえた か */
  get complete(): boolean {
    return this.learned.length >= RECIPE_IDS.length;
  }

  /** 印の のこって いる レシピ（おぼえた 順） */
  freshRecipes(): RecipeId[] {
    return this.learned.filter((id) => recipeButtons(id).some((b) => this.fresh.includes(b)));
  }

  /** 「あたらしい！」の 印の ボタン（しゅるいの ボタン ＋ 印の のこった しゅるいが ある ばしょの ボタン `part-<ばしょ>`） */
  marks(): string[] {
    const out = [...this.fresh];
    for (const part of PARTS) {
      if (this.fresh.some((b) => b.startsWith(`${part}-`))) out.push(PART_BTN(part));
    }
    return out;
  }

  /** そのボタンの 印を 消す（なければ 何も しない） */
  clearMark(button: string): void {
    const i = this.fresh.indexOf(button);
    if (i >= 0) this.fresh.splice(i, 1);
  }

  // ---------------------------------------------------------------- えらべる 物の 門（いつもの 物は いつも えらべる）

  /** ばしょ part の しゅるい kind を えらべる か（知らない id は false） */
  kindOk(part: Part, kind: string): boolean {
    if (!ALL_KINDS[part].includes(kind)) return false;
    if ((USUAL[part] as readonly string[]).includes(kind)) return true;
    const id = recipeOfForm(part, isStyleless(kind) ? kind : splitKind(kind).form);
    return id !== null && this.has(id);
  }

  /** ばしょ part で おぼえた 形（ポップアップの 行に 出る 物） */
  formsOf(part: Part, forms: readonly string[]): string[] {
    return forms.filter((f) => {
      const id = recipeOfForm(part, f);
      return id !== null && this.has(id);
    });
  }

  lightOk(kind: string): boolean {
    if (kind === LIGHT_DEFAULT) return true;
    const id = recipeOfLight(kind);
    return id !== null && this.has(id);
  }

  furnOk(kind: string): boolean {
    const id = recipeOfFurniture(kind);
    return id === null || this.has(id);
  }

  /** 後ろの 文字（SUFFIXES の 番号）を えらべる か（はじめの 5 つは いつも） */
  suffixOk(index: number): boolean {
    const id = recipeOfSuffix(index);
    return id === null || this.has(id);
  }

  // ---------------------------------------------------------------- 保存

  serialize(): RecipeSave {
    return { learned: [...this.learned], fresh: [...this.fresh] };
  }

  /** 読む（知らない id・くりかえしは すてる。例外を 出さない） */
  restore(raw: unknown): void {
    this.learned = [];
    this.fresh = [];
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as { learned?: unknown; fresh?: unknown };
    if (Array.isArray(r.learned)) {
      for (const id of r.learned as unknown[]) if (isRecipeId(id) && !this.learned.includes(id)) this.learned.push(id);
    }
    const known = new Set(this.learned.flatMap(recipeButtons));
    if (Array.isArray(r.fresh)) {
      for (const b of r.fresh as unknown[]) if (typeof b === 'string' && known.has(b) && !this.fresh.includes(b)) this.fresh.push(b);
    }
  }
}
