import type { Inventory, MedalTier, YokaiKind, YokaiTitle } from '../contracts';
import { hashInts } from '../world/gen/random';
import { DAMA, DAMA_HOUR } from './damaTuning';

/**
 * ようかいダマ（`yokai_orb`）を わたす 係（TOWN-1 区切り 1A。§2.3・§2.4・§4.1・§4.6・§5）。
 * 数は damaTuning.ts の 表 1 か所。もちものは 人ごと（1P・2P）。入らない 分は その 人の 足もとへ。
 * 1P と 2P は 同じ 道（who だけが ちがう）。乱数は シード付き（妖怪ごとに 決まる）。
 */

const ORB = 'yokai_orb' as const;
type Who = 1 | 2;

// ---------------------------------------------------------------- 数（表から 計算。入れものに 触らない 関数）
/** ふつうの 妖怪 1 ひきの 数。二つ名つきは 表の 数。同じ (シード, 妖怪の 番号) なら いつも 同じ。場所の 倍率には よらない */
export function damaForYokai(seed: number, id: number, title: YokaiTitle): number {
  if (title !== 'none') return DAMA.title[title];
  const span = DAMA.normal.max - DAMA.normal.min + 1;
  return DAMA.normal.min + (hashInts(seed ^ DAMA.seedSalt, id, 1) % span);
}

export function damaForGashadokuro(): number {
  return DAMA.gashadokuro;
}

export function damaForMedal(medal: MedalTier): number {
  return DAMA.medal[medal];
}

/** 前の セーブで とって ある 実績の 行（あずかりの 計算用） */
export interface LegacyAch {
  id: string;
  medal: MedalTier;
  unlocked: boolean;
  /** しずかに とる 実績（数えない） */
  quiet: boolean;
}

/** 前の セーブの あずかり ＝ とって ある 実績の メダルごとの 数の 合計（しずかな 実績は 0） */
export function legacyDama(list: readonly LegacyAch[]): number {
  let sum = 0;
  for (const a of list) if (a.unlocked && !a.quiet) sum += damaForMedal(a.medal);
  return sum;
}

/** 1 時間の 見つもり（TOWN-1 §4.1 の 式。がしゃどくろ・やたい なし）。AC31 */
export function hourEstimate(): { income: number; left: number } {
  const avg = (DAMA.normal.min + DAMA.normal.max) / 2;
  const income =
    DAMA_HOUR.yokai * avg +
    DAMA_HOUR.titled * DAMA.title.oyabun +
    DAMA_HOUR.achievement.count * DAMA_HOUR.achievement.average +
    DAMA_HOUR.meate.count * DAMA_HOUR.meate.average;
  return { income, left: income - DAMA_HOUR.spend.food - DAMA_HOUR.spend.ofuda };
}

// ---------------------------------------------------------------- わたす 係
export interface DamaPorts {
  /** その 人の もちもの。2P が 参加して いなければ null（わたさない） */
  inventory(who: Who): Pick<Inventory, 'add' | 'count'> | null;
  /** 入らなかった 分を その 人の 足もとに 落とす（ふつうに ひろえる） */
  dropAtFeet(who: Who, count: number): void;
  /** もらった とき（絵・音の 口。くり返し なので 小さく）。なくても よい */
  onGot?(who: Who, count: number): void;
}

/** 妖怪を たおした 知らせ（だれが 当てたか は 人ごとの はい／いいえ） */
export interface YokaiDamaInfo {
  id: number;
  kind: YokaiKind;
  title: YokaiTitle;
  hit1: boolean;
  hit2: boolean;
}

/** 保存の 形（世界ごと。もちものの 中の 数は もちものの 保存に ある） */
export interface DamaSave {
  v: 1;
  /** ようかいダマを わたした 実績（実績ごと） */
  given: string[];
  /** 前の セーブの あずかり（わたしたら null） */
  legacy: number | null;
}

export class DamaService {
  private givenSet = new Set<string>();
  private legacy_: number | null = null;

  constructor(
    private readonly ports: DamaPorts,
    private readonly seed: number,
  ) {}

  /** その 人が 参加して いるか（2P は 参加中だけ） */
  joined(who: Who): boolean {
    return this.ports.inventory(who) !== null;
  }

  /** その 人の もちものの ようかいダマ（2P が いなければ 0） */
  count(who: Who): number {
    return this.ports.inventory(who)?.count(ORB) ?? 0;
  }

  /** その 人に n こ わたす。入らない 分は 足もとへ。わたせた（入った）数と 落とした 数を 返す */
  give(who: Who, n: number): { added: number; dropped: number } {
    const inv = this.ports.inventory(who);
    const want = Math.max(0, Math.floor(n));
    if (!inv || want <= 0) return { added: 0, dropped: 0 };
    const left = inv.add(ORB, want);
    if (left > 0) this.ports.dropAtFeet(who, left);
    this.ports.onGot?.(who, want);
    return { added: want - left, dropped: left };
  }

  private giveTo(hit1: boolean, hit2: boolean, n: number): void {
    if (hit1) this.give(1, n);
    if (hit2) this.give(2, n);
  }

  /** 妖怪を プレイヤーが たおした。1 回でも 当てた 人 ぜんいんが 同じ 数 もらう。だれも 当てて いなければ 0 */
  fromYokai(info: YokaiDamaInfo): number {
    if (!info.hit1 && !info.hit2) return 0;
    const n = damaForYokai(this.seed, info.id, info.title);
    this.giveTo(info.hit1, info.hit2, n);
    return n;
  }

  fromGashadokuro(info: { hit1: boolean; hit2: boolean }): number {
    if (!info.hit1 && !info.hit2) return 0;
    const n = damaForGashadokuro();
    this.giveTo(info.hit1, info.hit2, n);
    return n;
  }

  /** 実績を とった。しずかな 実績・もう わたした 実績は 0。参加中の 2 人とも 同じ 数。わたした 数（1 人ぶん）を 返す */
  fromAchievement(def: { id: string; medal: MedalTier }, silent: boolean): number {
    if (silent || this.givenSet.has(def.id)) return DAMA.quiet;
    this.givenSet.add(def.id);
    const n = damaForMedal(def.medal);
    this.giveTo(true, this.ports.inventory(2) !== null, n);
    return n;
  }

  given(): string[] {
    return [...this.givenSet];
  }

  /** 前の セーブの あずかり（ものしりさんに はじめて 話すまで。1D が 使う）。ない ときは null */
  legacy(): number | null {
    return this.legacy_;
  }

  setLegacy(n: number | null): void {
    this.legacy_ = n !== null && n > 0 ? Math.floor(n) : null;
  }

  serialize(): DamaSave {
    return { v: 1, given: [...this.givenSet], legacy: this.legacy_ };
  }

  /**
   * 保存から もどす。記録の ない（または こわれた）セーブは 古い セーブ あつかい:
   * とって ある 実績の 合計を あずかりに し、その 実績は「わたした」ことに する（あとから 二重に もらわない）。
   */
  deserialize(data: unknown, achievements: readonly LegacyAch[]): void {
    const d = data as { v?: unknown; given?: unknown; legacy?: unknown } | null | undefined;
    const ok =
      d !== null && typeof d === 'object' && d.v === 1 && Array.isArray(d.given) && d.given.every((x) => typeof x === 'string') &&
      (d.legacy === null || d.legacy === undefined || (typeof d.legacy === 'number' && Number.isFinite(d.legacy) && d.legacy >= 0));
    if (ok) {
      this.givenSet = new Set(d.given as string[]);
      this.setLegacy((d.legacy as number | null | undefined) ?? null);
      return;
    }
    this.givenSet = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
    this.setLegacy(legacyDama(achievements));
  }
}
