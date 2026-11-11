// HOUSE-2A（#364・仕様 3.3 版）レシピの まきもの: 手に 入れる（found）・使って おぼえる（read）。DOM・three なし。
// 3.3 版: 拾った 場では おぼえない。まきもの（アイテム）が 持ち物に 入る だけ。手に もって 右クリックで 1 まい へって 1 つ おぼえる。
// 1 まい おぼえると テロップ・短い 音・「あたらしい！」。ぜんぶ おぼえた とき（さいごの 1 まい）は テロップを かえて 紙ふぶき +1・大きい 音。
// ぜんぶ おぼえた あとに 使うと まきもの 1 まい へって かみ 3 まい（持ち物に 入らない 分は 足もとに 落とす）・テロップだけ（音なし）。
import type { ItemId } from '../../contracts';
import { MINE_ITEM } from '../../content/items/ids';
import { HOUSE_BAND_STEPS } from '../../ui/celebrate/config';
import type { SheetBag } from '../editor/sheet';
import type { Who } from '../whoPort';
import type { RecipeLog } from './log';
import { pickRecipe } from './pick';
import { RECIPE_IDS, isRecipeId, recipeName } from './table';

/** レシピの 音（wire/houseSite.ts が 鳴らす。HouseSfx の 一部） */
type RecipeSfx = { k: 'recipe' } | { k: 'recipeAll' };

/** 数（1 か所） */
const KEEP = {
  /** ぜんぶ おぼえた あとに まきものを 使った とき もらえる かみ（まい） */
  paperAfterAll: 3,
  /** 使う とき へる まきもの（まい。1 回の 右クリックで 1 まい） */
  perRead: 1,
} as const;

const PAPER: ItemId = 'paper';
const SCROLL: ItemId = MINE_ITEM.recipe_scroll;

/** テロップの 字（名前は 形の 名前。ぜんぶ ひらがな・カタカナ） */
const RECIPE_TEXT = {
  learned: (name: string): string => `${name}の レシピを おぼえた！ けんちくしさんの せっけいずで えらべるよ`,
  all: 'レシピを ぜんぶ おぼえた！',
  /** ぜんぶ おぼえた あとに 使った */
  paper: 'もう ぜんぶ おぼえて いるよ。まきものは かみに なった',
  /** はじめて 手に 入れた（使い方。2 まい目からは 出さない） */
  howto: 'レシピの まきものを てに いれた！ てに もって みぎクリックで よもう',
} as const;

export interface KeeperDeps {
  seed: number;
  /** その 人の もちもの（1P・2P は 別々。まきものは 手に 入れた 人の 物に 入り、その 人が 使う） */
  bagOf: (who: Who) => Pick<SheetBag, 'add' | 'remove' | 'count'>;
  /** 持ち物に 入らなかった 分を その 人の 足もとに 落とす */
  drop?: (item: ItemId, count: number, who: Who) => void;
  play?: (e: RecipeSfx) => void;
  /** 上の 帯の 列に テロップを 入れる（ゲームの 画面。who ＝ 使った・拾った 人。なければ 何も しない） */
  band?: (text: string, who: Who) => void;
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

  private say(text: string, who: Who): void {
    this.text = text;
    this.left = HOUSE_BAND_STEPS;
    this.d.band?.(text, who);
  }

  /** おぼえる（まだの 物なら true。知らない id・もう おぼえた 物は false で かわらない）。ゲームの 中の 道は read だけ。窓口 learn は テスト用の 近道 */
  learn(id: string, who: Who = 1): boolean {
    if (!isRecipeId(id) || !this.log.learn(id)) return false;
    const all = this.log.complete;
    this.say(all ? RECIPE_TEXT.all : RECIPE_TEXT.learned(recipeName(id)), who);
    if (all) this.d.confetti?.();
    this.d.play?.({ k: all ? 'recipeAll' : 'recipe' });
    return true;
  }

  /** 手に 入れた（宝箱の わく・まきもの）: その 人の 持ち物に まきもの 1 まい（入らなければ 足もとに）。おぼえない・音なし。はじめてなら 使い方の テロップ */
  found(who: Who = 1): void {
    this.give(who);
    this.welcome(who);
  }

  /** ほって 持ち物へ 入れた 後の 入口（giveStacks が 入れて いる）: はじめての 使い方の テロップだけ */
  welcome(who: Who = 1): void {
    if (this.log.howtoShown) return;
    this.log.howtoShown = true;
    this.say(RECIPE_TEXT.howto, who);
  }

  private give(who: Who): void {
    const left = this.d.bagOf(who).add(SCROLL, 1);
    if (left > 0) this.d.drop?.(SCROLL, left, who);
  }

  /**
   * 手に もって 右クリック 1 回の 本体: その 人の まきものを 1 まい へらして 1 つ おぼえる（まだの 物から。pick.ts）。
   * 持って いなければ false で 何も おきない。ぜんぶ おぼえた あとは かみ 3 まい（へらして から 入れる。入らない 分は 足もと）・テロップだけ
   */
  read(who: Who = 1): boolean {
    const bag = this.d.bagOf(who);
    if (bag.count(SCROLL) < KEEP.perRead) return false;
    bag.remove(SCROLL, KEEP.perRead);
    const id = pickRecipe({ seed: this.d.seed, learned: this.log.learnedIds() });
    if (id !== null) {
      this.learn(id, who);
      return true;
    }
    const left = bag.add(PAPER, KEEP.paperAfterAll);
    if (left > 0) this.d.drop?.(PAPER, left, who);
    this.say(RECIPE_TEXT.paper, who);
    return true;
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

  /** 窓口 recipes()。nextPick ＝ 今 使ったら おぼえる 物（ぜんぶ おぼえて いれば null） */
  view(): { learned: string[]; fresh: string[]; all: string[]; nextPick: string | null } {
    return { learned: [...this.log.learnedIds()], fresh: this.log.freshRecipes(), all: [...RECIPE_IDS], nextPick: pickRecipe({ seed: this.d.seed, learned: this.log.learnedIds() }) };
  }
}
