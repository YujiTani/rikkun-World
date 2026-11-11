// HOUSE-2A（#364）レシピを おぼえる（とった・宝箱から 出た その場で）。仕様 §2.1・§2.2・§5。DOM・three なし。
// 1 まい おぼえると テロップ・短い 音・「あたらしい！」。ぜんぶ おぼえた とき（さいごの 1 まい）は テロップを かえて 紙ふぶき +1・大きい 音。
// ぜんぶ おぼえた あとに 拾うと かみ 3 まい（持ち物に 入らない 分は 足もとに 落とす）。持ち物は レシピには 使わない。
import type { ItemId } from '../../contracts';
import { HOUSE_BAND_STEPS } from '../../ui/celebrate/config';
import type { SheetBag } from '../editor/sheet';
import type { RecipeLog } from './log';
import { pickRecipe } from './pick';
import { RECIPE_IDS, isRecipeId, recipeName, type RecipeId } from './table';

/** レシピの 音（wire/houseSite.ts が 鳴らす。HouseSfx の 一部） */
type RecipeSfx = { k: 'recipe' } | { k: 'recipeAll' };

/** 数（1 か所） */
const KEEP = {
  /** ぜんぶ おぼえた あとに 拾った とき もらえる かみ（まい） */
  paperAfterAll: 3,
} as const;

/** テロップの 字（名前は 形の 名前。ぜんぶ ひらがな・カタカナ） */
const RECIPE_TEXT = {
  learned: (name: string): string => `${name}の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ`,
  all: 'レシピを ぜんぶ おぼえた！',
} as const;

export interface KeeperDeps {
  seed: number;
  bag: Pick<SheetBag, 'add'>;
  /** 持ち物に 入らなかった 分を 足もとに 落とす */
  drop?: (item: ItemId, count: number) => void;
  play?: (e: RecipeSfx) => void;
  /** 上の 帯の 列に テロップを 入れる（ゲームの 画面。なければ 何も しない） */
  band?: (text: string) => void;
  /** 小さな 紙ふぶき +1（ぜんぶ おぼえた とき） */
  confetti?: () => void;
}

export class RecipeKeeper {
  private text = '';
  private left = 0;
  /** 読む 側へ わたす 入れもの（毎フレーム 新しい 物を 作らない） */
  private readonly out = { text: '', ticksLeft: 0 };

  constructor(
    readonly log: RecipeLog,
    private readonly d: KeeperDeps,
  ) {}

  /** おぼえる（まだの 物なら true。知らない id・もう おぼえた 物は false で かわらない） */
  learn(id: string): boolean {
    if (!isRecipeId(id) || !this.log.learn(id)) return false;
    const all = this.log.complete;
    this.text = all ? RECIPE_TEXT.all : RECIPE_TEXT.learned(recipeName(id));
    this.left = HOUSE_BAND_STEPS;
    this.d.band?.(this.text);
    if (all) this.d.confetti?.();
    this.d.play?.({ k: all ? 'recipeAll' : 'recipe' });
    return true;
  }

  /** 拾った とき（宝箱・まきもの）: レシピを 1 まい おぼえる。ぜんぶ おぼえて いたら null で かみ 3 まい。場所と 世界で 決まる（pick.ts） */
  found(at: { x: number; y: number; z: number }): RecipeId | null {
    const id = pickRecipe({ seed: this.d.seed, at, learned: this.log.learnedIds() });
    if (id !== null) {
      this.learn(id);
      return id;
    }
    const left = this.d.bag.add('paper', KEEP.paperAfterAll);
    if (left > 0) this.d.drop?.('paper', left);
    return null;
  }

  /** 1 ステップ（テロップの 時間） */
  step(): void {
    if (this.left > 0) this.left--;
  }

  /** 窓口 recipeBand()。読むだけ（使いまわす 入れもの） */
  band(): { text: string; ticksLeft: number } | null {
    if (this.left <= 0) return null;
    this.out.text = this.text;
    this.out.ticksLeft = this.left;
    return this.out;
  }

  /** 窓口 recipes() */
  view(): { learned: string[]; fresh: string[]; all: string[] } {
    return { learned: [...this.log.learnedIds()], fresh: this.log.freshRecipes(), all: [...RECIPE_IDS] };
  }
}

