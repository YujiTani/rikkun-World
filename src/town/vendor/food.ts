import type { Inventory, ItemId } from '../../contracts';
import { FOOD_TABLE, FOOD_TUNING, type FoodKind } from './vendorTable';

/**
 * やたいの 食事の 係（TOWN-1 1E。docs/design/TOWN-1-shop.md §2.13・§4.10・AC48、TOWN-1.md §5）。画面・three なし。
 * 「たべる」: ようかいダマを はらい、その 場で もぐもぐ（munchSteps）→ ハートが 1 こずつ ぽん ぽん と ふえる。
 * ふえる 量は たべた とき に 決まる（だんご ＝ 表の 数〔まんたんを こえる 分は すてる〕、ごはん ＝ その とき の いちばん 多い 体力 まで）。
 * もぐもぐ の 間に 当たっても 回復は へらさない（当たった 分と 回復の 分は べつ）。やられたら そこで おわり。
 */

type Who = 1 | 2;
const ORB: ItemId = 'yokai_orb';

export type FoodEatResult = 'ok' | 'short' | 'full';

export interface FoodVitals {
  hp(): number;
  maxHp(): number;
  dead(): boolean;
  /** ふえた 量を 返す（まんたんを こえない） */
  heal(n: number): number;
}

export interface FoodPorts {
  /** その 人の もちもの（2P が いなければ null） */
  inventory(who: Who): Pick<Inventory, 'count' | 'remove'> | null;
  /** その 人の 体力（2P が いなければ null） */
  vitals(who: Who): FoodVitals | null;
  /** ハートが 1 こ ふえた（音・見た目。なくても よい） */
  popped?(who: Who): void;
  /** もぐもぐ を はじめた（音。なくても よい） */
  munch?(who: Who, kind: FoodKind): void;
}

interface Eating {
  kind: FoodKind;
  /** もぐもぐ の のこり（ステップ） */
  munch: number;
  /** これから ふえる 体力 */
  left: number;
  /** つぎの ぽん まで（ステップ） */
  pop: number;
}

export class FoodService {
  private readonly eating: [Eating | null, Eating | null] = [null, null];

  constructor(private readonly ports: FoodPorts) {}

  /** もって いる ようかいダマ */
  dama(who: Who): number {
    return this.ports.inventory(who)?.count(ORB) ?? 0;
  }

  /** いま 食べて いる（もぐもぐ か ハートが ふえて いる 間） */
  munching(who: Who): boolean {
    return this.eating[who - 1] !== null;
  }

  /** 体力が まんたん（2P が いなければ true） */
  full(who: Who): boolean {
    const v = this.ports.vitals(who);
    return !v || v.dead() || v.hp() >= v.maxHp();
  }

  /** ようかいダマが あと 何こ たりないか */
  short(who: Who, kind: FoodKind): number {
    return Math.max(0, FOOD_TABLE[kind].price - this.dama(who));
  }

  /** 「たべる」ボタンが 押せるか（まんたん・たりない・食べて いる ときは false） */
  canEat(who: Who, kind: FoodKind): boolean {
    return !this.munching(who) && !this.full(who) && this.short(who, kind) === 0;
  }

  /** たべる（full ＝ まんたん・食べて いる とちゅう、short ＝ ようかいダマが たりない。どちらも 何も へらない） */
  eat(who: Who, kind: FoodKind): FoodEatResult {
    const inv = this.ports.inventory(who);
    const v = this.ports.vitals(who);
    if (!inv || !v) return 'short';
    if (this.munching(who) || this.full(who)) return 'full';
    const row = FOOD_TABLE[kind];
    if (inv.count(ORB) < row.price) return 'short';
    inv.remove(ORB, row.price);
    const room = v.maxHp() - v.hp();
    const heal = row.heal === 'full' ? room : Math.min(row.heal, room);
    this.eating[who - 1] = { kind, munch: FOOD_TUNING.munchSteps, left: heal, pop: 0 };
    this.ports.munch?.(who, kind);
    return 'ok';
  }

  /** 毎ステップ（世界が 動いて いる 間） */
  step(): void {
    this.stepOne(1);
    this.stepOne(2);
  }

  /** 2P が やめた・やられた など: 食べるのを やめる */
  stop(who: Who): void {
    this.eating[who - 1] = null;
  }

  private stepOne(who: Who): void {
    const e = this.eating[who - 1];
    if (!e) return;
    const v = this.ports.vitals(who);
    if (!v || v.dead()) {
      this.eating[who - 1] = null;
      return;
    }
    if (e.munch > 0) {
      e.munch--;
      return;
    }
    if (e.pop > 0) {
      e.pop--;
      return;
    }
    const n = Math.min(FOOD_TUNING.popHp, e.left);
    if (n > 0) {
      v.heal(n);
      e.left -= n;
      this.ports.popped?.(who);
    }
    e.pop = FOOD_TUNING.popEvery - 1;
    if (e.left <= 0) this.eating[who - 1] = null;
  }
}
