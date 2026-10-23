import type { YokaiKind, YokaiTitle } from '../contracts';

export type { YokaiTitle };

/** 二つ名がついた妖怪（なし を のぞく） */
export type RealTitle = Exclude<YokaiTitle, 'none'>;

export interface TitleRule {
  /** 1 体ごとに ついく確率 */
  chance: number;
  hpMul: number;
  /** 攻撃力に足す（体力。1 = ハート半分） */
  attackAdd: number;
  speedMul: number;
  xpMul: number;
  /** ドロップの表を引く回数 */
  dropRolls: number;
  /** からだの大きさ */
  bodyScale: number;
  /** 出現音が 鳴っている間（聞こえる長さ。−20 dB まで。秒）。この間は 2 体目の音を 重ねない（§5・§6） */
  soundSeconds: number;
}

/** BALANCE §2.5 の表（§4.9 の「二つ名」の設定） */
export const TITLE_RULES: Record<YokaiTitle, TitleRule> = {
  none: { chance: 0, hpMul: 1, attackAdd: 0, speedMul: 1, xpMul: 1, dropRolls: 1, bodyScale: 1, soundSeconds: 0 },
  oyabun: { chance: 0.03, hpMul: 1.5, attackAdd: 0, speedMul: 1, xpMul: 2, dropRolls: 2, bodyScale: 1.25, soundSeconds: 3.0 },
  taisho: { chance: 0.01, hpMul: 2, attackAdd: 1, speedMul: 1.1, xpMul: 3, dropRolls: 3, bodyScale: 1.25, soundSeconds: 3.8 },
  nushi: { chance: 0.003, hpMul: 3, attackAdd: 2, speedMul: 1.2, xpMul: 5, dropRolls: 4, bodyScale: 1.5, soundSeconds: 5.2 },
};

/** たいしょう・ヌシ（同時に 1 体まで） */
export function isBigTitle(t: YokaiTitle): boolean {
  return t === 'taisho' || t === 'nushi';
}

/**
 * 頼まれた二つ名を、きまり（§6）の中におさめる。
 * たいしょう・ヌシ が もういる（bigTaken）ときは なし。
 */
export function limitTitle(_kind: YokaiKind, title: YokaiTitle, bigTaken: boolean): YokaiTitle {
  if (!isBigTitle(title)) return title;
  return bigTaken ? 'none' : title;
}

/** 二つ名の抽選（1 体 1 回。シード付きの rng を渡す） */
export function rollTitle(rng: () => number, kind: YokaiKind, bigTaken: boolean): YokaiTitle {
  const r = rng();
  const n = TITLE_RULES.nushi.chance;
  const t = TITLE_RULES.taisho.chance;
  const o = TITLE_RULES.oyabun.chance;
  const got: YokaiTitle = r < n ? 'nushi' : r < n + t ? 'taisho' : r < n + t + o ? 'oyabun' : 'none';
  return limitTitle(kind, got, bigTaken);
}

/** 頭の上の名前（ひらがな・カタカナだけ） */
export function titleLabel(name: string, title: YokaiTitle): string {
  switch (title) {
    case 'oyabun':
      return `${name} おやぶん`;
    case 'taisho':
      return `${name} たいしょう`;
    case 'nushi':
      return `${name} の ヌシ`;
    default:
      return name;
  }
}

/** 登場のおしらせ（たいしょう・ヌシ だけ。ほかは null） */
export function titleAnnounceText(name: string, title: YokaiTitle): string | null {
  return isBigTitle(title) ? `${titleLabel(name, title)} が あらわれた！` : null;
}

/** おしらせを出す ステップ（3 秒） */
export const ANNOUNCE_TICKS = 180;
