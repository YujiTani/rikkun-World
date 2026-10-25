import { CHOCHIN } from './chochin';
import { YOKAI_IDS, type YokaiKind } from './ids';
import { KARAKASA } from './karakasa';
import { NURIKABE } from './nurikabe';
import { ROKUROKUBI } from './rokurokubi';
import type { DropRow, HeadSpec, VariantColors, YokaiAi, YokaiBasis, YokaiDef, YokaiMotion, YokaiSense, YokaiTraits } from './types';

/**
 * 妖怪の登録表（#307・ルール #304「1 つのデータは 1 か所」）。
 * 1 種 1 ファイル（karakasa.ts …）を ならべ、古い表（YOKAI_NAME・BASIS・MOTION・KIND_AI・SENSE.kinds・YOKAI_DROPS・
 * YOKAI_VARIANT_COLORS・HEADS・国の重みの土台 BASE・実績の名前）が 中身を ここから 作れるように 「見せ方」の 関数を 出す。
 * 実行時に contracts.ts を import しない（import の輪を 作らない）。型だけを読む。
 *
 * 動きの分かれ道（浮く・石になる・重い攻撃だけでのけぞる など）は <kind>.ts の traits（印）に書く。
 * 新しい妖怪を足すとき: ids.ts に id → <kind>.ts に値 → registry.ts の YOKAI_DEFS に 1 行（Record<YokaiKind, …> なので 書き忘れは 型エラー）
 * → yokai/models/<kind>.ts に形 ＋ createYokai・YokaiManager の switch（never で 書き忘れは 型エラー）→ ui/medalArt.ts の メダルの絵（switch が 型エラー）。
 * 国の 出やすさ（COUNTRY_TABLE の 行）と 抽選の順（yokai/countryPick.ts の YOKAI_DRAW_ORDER）は 乱数の 結果が 変わるので 手で 足す（registry.test.ts が 見張る）。
 */
export const YOKAI_DEFS: Readonly<Record<YokaiKind, YokaiDef>> = {
  karakasa: KARAKASA,
  chochin: CHOCHIN,
  nurikabe: NURIKABE,
  rokurokubi: ROKUROKUBI,
};

/** 全種類（ids.ts の 順）から { 種類: 値 } を 作る（全件そろう） */
export function mapKinds<T>(pick: (kind: YokaiKind) => T): Record<YokaiKind, T> {
  const out: Partial<Record<YokaiKind, T>> = {};
  for (const kind of YOKAI_IDS) out[kind] = pick(kind);
  return out as Record<YokaiKind, T>;
}

// ---------------------------------------------------------------- 見せ方（古い表に 合わせる形）。どれも 新しい コピーを 返す

/** 名前（YOKAI_NAME） */
export function yokaiNames(): Record<YokaiKind, string> {
  return mapKinds((k) => YOKAI_DEFS[k].name);
}

/** 元の数（stats.ts の BASIS。書かなかった 飛び道具・前だけは false） */
export function yokaiBasis(): Record<YokaiKind, Required<YokaiBasis>> {
  return mapKinds((k) => {
    const b = YOKAI_DEFS[k].basis;
    return { target: b.target, attack: b.attack, xp: b.xp, projectile: b.projectile ?? false, frontOnly: b.frontOnly ?? false };
  });
}

/** 動きの数（stats.ts の MOTION） */
export function yokaiMotion(): Record<YokaiKind, YokaiMotion> {
  return mapKinds((k) => ({ ...YOKAI_DEFS[k].motion }));
}

/** AI の数（KIND_AI） */
export function yokaiAi(): Record<YokaiKind, YokaiAi> {
  return mapKinds((k) => ({ ...YOKAI_DEFS[k].ai }));
}

/** 感知の数（SENSE.kinds。main.ts が 開発用に その場で 書きかえる ので、呼ぶたびに 複製を 返す） */
export function yokaiSense(): Record<YokaiKind, YokaiSense> {
  return mapKinds((k) => ({ ...YOKAI_DEFS[k].sense }));
}

/** ドロップ表（YOKAI_DROPS） */
export function yokaiDrops(): Record<YokaiKind, readonly DropRow[]> {
  return mapKinds((k) => YOKAI_DEFS[k].drops.map((r) => ({ ...r })));
}

/** 色ちがいの 色の表（YOKAI_VARIANT_COLORS） */
export function yokaiVariantColors(): Record<YokaiKind, VariantColors> {
  return mapKinds((k) => ({ 2: { ...YOKAI_DEFS[k].colors[2] }, 3: { ...YOKAI_DEFS[k].colors[3] } }));
}

/** 二つ名の 頭の印の 位置（nickMarks.ts の HEADS） */
export function yokaiHeads(): Record<YokaiKind, HeadSpec> {
  return mapKinds((k) => ({ ...YOKAI_DEFS[k].head }));
}

/** 国の 重みの 土台（countryTable.ts の BASE。はらっぱの 行） */
export function yokaiCountryBase(): Record<YokaiKind, number> {
  return mapKinds((k) => YOKAI_DEFS[k].country.base);
}

/** 「たおした」実績の 名前（achievements/defs.ts。ids.ts の 順） */
export function yokaiAchievementNames(): ReadonlyArray<readonly [YokaiKind, string]> {
  return YOKAI_IDS.map((k) => [k, YOKAI_DEFS[k].achievement.name] as const);
}

/** 動きの分かれ道の印（書かなかった印は なし: false・1・空）。ai/ の動きは `kind === '…'` ではなく ここを 読む */
export function yokaiTraits(): Record<YokaiKind, Required<YokaiTraits>> {
  return mapKinds((k) => {
    const t = YOKAI_DEFS[k].traits ?? {};
    return {
      floatsDown: t.floatsDown ?? false,
      knockOnlyHeavy: t.knockOnlyHeavy ?? false,
      walksFacing: t.walksFacing ?? false,
      turnsToStone: t.turnsToStone ?? false,
      contactMul: t.contactMul ?? 1,
      crushesBlocks: t.crushesBlocks ?? false,
      limitedCount: t.limitedCount ?? false,
      longNeck: t.longNeck ?? false,
      glowColors: t.glowColors ?? [],
    };
  });
}
