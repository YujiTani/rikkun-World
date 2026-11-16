import type { MedalTier, YokaiKind, YokaiTitle } from '../contracts';
import { hashInts } from '../world/gen/random';
import { DAMA, DAMA_HOUR } from './damaTuning';

/**
 * ようかいダマを わたす 係（TOWN-1 区切り 1A。§2.3・§2.4・§4.1・§4.6・§5）と、さいふ（1.6〔1F〕§2.3b・§3.4・§4.6・§4.12）。
 * 数は damaTuning.ts の 表 1 か所。ようかいダマは もちものの マスに 入れず、人ごと（1P・2P）の「さいふ」の 数で 数える。
 * 1P と 2P は 同じ 道（who だけが ちがう）。乱数は シード付き（妖怪ごとに 決まる）。
 */

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

// ---------------------------------------------------------------- さいふの 係
export interface DamaPorts {
  /** その 人が 参加して いるか（1P は いつも true。2P は 参加中だけ） */
  joined(who: Who): boolean;
  /** その 人が 画面（もちもの・お店・本 など）を 開いて いるか（すみの 札を かくす。なければ いつも false） */
  screenOpen?(who: Who): boolean;
  /** さいふが ふえた とき（絵・音の 口。くり返し なので 小さく）。なくても よい */
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

/** すみの 札の 中身（`dama.hud(p)`。TOWN-1 §6.1） */
export interface DamaHud {
  /** 札が 出て いる（画面を 開いて かくれて いる 時は false） */
  shown: boolean;
  total: number;
  /** 3 けたごとに「,」（例 "1,234"） */
  text: string;
  /** 下の「＋」の 数。出て いない 時 null */
  plus: number | null;
  plusText: string | null;
  /** 「＋」の のこり ステップ。出て いない 時 0 */
  left: number;
}

/** 前の セーブの もちもの・たんす・地面に のこって いた ようかいダマの 数（うつしかえ。§4.6） */
export interface LegacyOrbs {
  p1: number;
  p2: number;
  /** たんす・かまど・地面・おとしもの ぶくろ（持ち主の 記録が ない ので 1P の さいふへ） */
  world: number;
}

/** 保存の 形（世界ごと。さいふの 数は wallet） */
export interface DamaSave {
  v: 1;
  /** ようかいダマを わたした 実績（実績ごと） */
  given: string[];
  /** 前の セーブの あずかり（わたしたら null） */
  legacy: number | null;
  /** さいふの 記録（1.6〔1F〕。ない セーブは 古い セーブ） */
  wallet: { n1: number; n2: number; moved: boolean };
}

/** 3 けたごとに「,」（TOWN-1 §3.4） */
export function commas(n: number): string {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const cnt = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.min(Math.floor(x), DAMA.wallet.max) : 0);

export class DamaService {
  private givenSet = new Set<string>();
  private legacy_: number | null = null;
  /** さいふの 数（[1P, 2P]。2P が 参加して いない 間も のこる） */
  private readonly wallet_: [number, number] = [0, 0];
  /** うつしかえ ずみ（新しい 世界は はじめから true。古い セーブを 開くと false） */
  private moved = true;
  /** 「＋」（[1P, 2P]。のこりが 0 なら 出て いない） */
  private readonly plus_: [{ n: number; left: number }, { n: number; left: number }] = [
    { n: 0, left: 0 },
    { n: 0, left: 0 },
  ];

  constructor(
    private readonly ports: DamaPorts,
    private readonly seed: number,
  ) {}

  /** その 人が 参加して いるか（2P は 参加中だけ） */
  joined(who: Who): boolean {
    return who === 1 || this.ports.joined(who);
  }

  /** さいふの 上限（人ごと。§4.12） */
  max(): number {
    return DAMA.wallet.max;
  }

  /** その 人の さいふの 数（2P が 参加して いなくても のこって いる） */
  count(who: Who): number {
    return this.wallet_[who - 1]!;
  }

  /** その 人の さいふに n こ たす。上限で とまる（こえた 分は すてる）。2P が いなければ 何も しない */
  give(who: Who, n: number): { added: number; over: number } {
    const want = Math.max(0, Math.floor(n));
    if (!this.joined(who) || want <= 0) return { added: 0, over: 0 };
    const added = Math.min(want, this.max() - this.count(who));
    if (added > 0) {
      this.wallet_[who - 1]! += added;
      const p = this.plus_[who - 1]!;
      p.n = Math.min(this.max(), (p.left > 0 ? p.n : 0) + added);
      p.left = DAMA.wallet.plusSteps;
      this.ports.onGot?.(who, added);
    }
    return { added, over: want - added };
  }

  /** その 人の さいふから n こ へらす。たりなければ 何も かえず false（「＋」は 出さない） */
  spend(who: Who, n: number): boolean {
    const k = Math.max(0, Math.floor(n));
    if (!this.joined(who) || this.count(who) < k) return false;
    this.wallet_[who - 1]! -= k;
    return true;
  }

  /** 1 ステップ すすめる（「＋」の のこりを へらす。画面を 開いて いる 間も すすむ） */
  step(): void {
    for (const p of this.plus_) {
      if (p.left <= 0) continue;
      p.left--;
      if (p.left <= 0) p.n = 0;
    }
  }

  /** すみの 札の 中身（2P が いなければ null） */
  hud(who: Who): DamaHud | null {
    if (!this.joined(who)) return null;
    const total = this.count(who);
    const p = this.plus_[who - 1]!;
    const on = p.left > 0;
    return {
      shown: !(this.ports.screenOpen?.(who) ?? false),
      total,
      text: commas(total),
      plus: on ? p.n : null,
      plusText: on ? `+${commas(p.n)}` : null,
      left: on ? p.left : 0,
    };
  }

  /** うつしかえ ずみ か（古い セーブを 開いた 直後は false。absorb で true） */
  migrated(): boolean {
    return this.moved;
  }

  /** まだ うつして いない（開いた とき 1 回 だけ。さいふの 記録が ない セーブ） */
  needsAbsorb(): boolean {
    return !this.moved;
  }

  /**
   * 古い セーブの うつしかえ・もちものに のこった ようかいダマの 回収（§4.6）。上限で とまる。「＋」は 出さず 音も 鳴らさない。
   * 呼ぶ 側が もちもの・たんす・地面から 消す。あずかり（legacy）と 実績の 記録は かえない。
   */
  absorb(o: LegacyOrbs): void {
    const max = this.max();
    this.wallet_[0] = Math.min(max, this.wallet_[0] + cnt(o.p1) + cnt(o.world));
    this.wallet_[1] = Math.min(max, this.wallet_[1] + cnt(o.p2));
    this.moved = true;
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
    this.giveTo(true, this.joined(2), n);
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
    return { v: 1, given: [...this.givenSet], legacy: this.legacy_, wallet: { n1: this.wallet_[0], n2: this.wallet_[1], moved: this.moved } };
  }

  /**
   * 保存から もどす。記録の ない（または こわれた）セーブは 古い セーブ あつかい:
   * とって ある 実績の 合計を あずかりに し、その 実績は「わたした」ことに する（あとから 二重に もらわない）。
   * さいふの 記録の ない セーブは さいふ 0・うつしかえ まだ（absorb で 1 回 だけ）。こわれた 数は 0。
   */
  deserialize(data: unknown, achievements: readonly LegacyAch[]): void {
    this.wallet_[0] = 0;
    this.wallet_[1] = 0;
    this.moved = false;
    for (const p of this.plus_) {
      p.n = 0;
      p.left = 0;
    }
    const d = data as { v?: unknown; given?: unknown; legacy?: unknown; wallet?: unknown } | null | undefined;
    const ok =
      d !== null && typeof d === 'object' && d.v === 1 && Array.isArray(d.given) && d.given.every((x) => typeof x === 'string') &&
      (d.legacy === null || d.legacy === undefined || (typeof d.legacy === 'number' && Number.isFinite(d.legacy) && d.legacy >= 0));
    if (ok) {
      this.givenSet = new Set(d.given as string[]);
      this.setLegacy((d.legacy as number | null | undefined) ?? null);
      const w = d.wallet as { n1?: unknown; n2?: unknown; moved?: unknown } | null | undefined;
      if (w !== null && typeof w === 'object') {
        this.wallet_[0] = cnt(w.n1);
        this.wallet_[1] = cnt(w.n2);
        this.moved = w.moved === true;
      }
      return;
    }
    this.givenSet = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));
    this.setLegacy(legacyDama(achievements));
  }
}
