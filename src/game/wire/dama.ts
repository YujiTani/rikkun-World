// ようかいダマ（TOWN-1 1A）の つなぎ: 係を 作る・妖怪／がしゃどくろ／実績から わたす・保存・テストの 窓口。
import type { AchievementSystem } from '../../achievements/AchievementSystem';
import { DamaService, commas, type LegacyAch } from '../../dama/dama';
import { DAMA_TEXT } from '../../dama/damaText';
import type { WalletPort } from '../../dama/walletPort';
import type { Shared } from './shared';
import { DAMA } from '../../dama/damaTuning';
import { ACHIEVEMENT_DEFS } from '../../achievements/defs';

interface DamaWireDeps {
  seed: number;
  /** 2P が 参加して いるか */
  joined2: () => boolean;
  /** その 人が 画面を 開いて いるか（すみの 札を かくす。§3.4） */
  screenOpen: (who: 1 | 2) => boolean;
  /** さいふが ふえた（音の 口。なくても よい） */
  onGot?: (who: 1 | 2, n: number) => void;
}

/** 係を 作る（1P と 2P は who だけが ちがう） */
export function createDamaService(d: DamaWireDeps): DamaService {
  return new DamaService(
    { joined: (who) => who === 1 || d.joined2(), screenOpen: d.screenOpen, ...(d.onGot ? { onGot: d.onGot } : {}) },
    d.seed,
  );
}

/** さいふの 口（お店・かじや・やたい・食事の 係へ。1.6〔1F〕） */
export function walletOf(svc: DamaService): WalletPort {
  return { count: (who) => svc.count(who), spend: (who, n) => svc.spend(who, n), add: (who, n) => svc.give(who, n) };
}

/** 画面を 開いて いる 人（すみの 札を かくす）。1 人の ときの 全面の 画面は ぜんぶ 1P。2 人の ときは 開いた 人の 半分だけ */
export function screenOpenOf(s: Shared, lock: { overlayVisible(): boolean }): (who: 1 | 2) => boolean {
  return (who) => {
    if (who === 1 ? s.screen.inventoryOpen() : s.p2House.panelOpen()) return true;
    if (s.shop.openBy(who) || s.modalOwner.get() === who) return true;
    if (s.coopMenuIsOpen()) return true;
    return who === 1 && lock.overlayVisible();
  };
}

/** もちもの画面を 開いて いる 人（invChip が 出る） */
export function invOpenOf(s: Shared): (who: 1 | 2) => boolean {
  return (who) => (who === 1 ? s.screen.inventoryOpen() : s.duoJoined() && s.p2House.panelOpen());
}

/** 前の セーブで とって ある 実績の 行（あずかりの 計算）。しずかに とる 実績は quiet */
export function legacyList(sys: Pick<AchievementSystem, 'list'>): LegacyAch[] {
  const quiet = new Map(ACHIEVEMENT_DEFS.map((a) => [a.id, DAMA.quietStats.includes(a.stat)]));
  return sys.list().map((a) => ({ id: a.id, medal: a.medal, unlocked: a.unlocked, quiet: quiet.get(a.id) ?? false }));
}

/** もちもの画面の 上の 数（開いて いない 時 null。1 人 ＝ 字つき「ようかいダマ 1,234」・2 人 ＝ 数だけ） */
export function invChipOf(svc: DamaService, invOpen: (who: 1 | 2) => boolean) {
  return (p: 1 | 2): { text: string; count: number } | null => {
    if (!svc.joined(p) || !invOpen(p)) return null;
    const n = svc.count(p);
    return { text: svc.joined(2) ? commas(n) : `${DAMA_TEXT.name} ${commas(n)}`, count: n };
  };
}

/** `window.__rikkun.dama`（TOWN-1 §6.1）。p ＝ 1 | 2 */
export function createDamaHook(svc: DamaService, invOpen: (who: 1 | 2) => boolean) {
  return {
    /** その 人の さいふの 数（2P が いなければ null） */
    count: (p: 1 | 2): number | null => (svc.joined(p) ? svc.count(p) : null),
    /** テストの 準備: n こ さいふへ（上限を こえた 分は over） */
    give: (p: 1 | 2, n: number) => svc.give(p, n),
    /** さいふの 上限（§4.12） */
    max: () => svc.max(),
    /** すみの 札の 中身（2P が いなければ null） */
    hud: (p: 1 | 2) => svc.hud(p),
    /** もちもの画面の 上の 数（開いて いない 時 null。1 人 ＝ 字つき・2 人 ＝ 数だけ） */
    invChip: invChipOf(svc, invOpen),
    /** 前の セーブの あずかり（ない ときは null） */
    legacy: () => svc.legacy(),
  };
}
