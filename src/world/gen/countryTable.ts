import { mapKinds, yokaiCountryBase } from '../../content/yokai/registry';
import type { YokaiKind } from '../../contracts';
import { ruby } from '../../ui/text';
import { COUNTRY_KINDS, type CountryKind } from './config';

/**
 * 12 の国の表（COUNTRY-1 §3。#291）。国の名前・よみ・しるしの持ち主・妖怪の重みは **ここだけ** に書く。
 * 行の並びは COUNTRY_KINDS と同じ。あとで 国だけの物・国の妖怪・宝箱を足すときは、行に 書き足す。
 */

/** 4 大妖怪（弱い → 強い） */
export type BossKind = 'tsuchigumo' | 'omukade' | 'itsumade' | 'byakko';

export interface CountryRow {
  kind: CountryKind;
  /** 画面の名前の HTML（漢字は ruby） */
  name: string;
  /** よみ（ひらがな。実績・テストで使う） */
  yomi: string;
  /** しるしの持ち主（4 大） */
  boss: BossKind;
  /** 妖怪の重み（種類 → 重み。表に ない種類は 0） */
  yokai: Partial<Record<YokaiKind, number>>;
}

/** 重みの ものさし（はらっぱ）。値は 登録表の country.base（content/yokai/<kind>.ts）。国ごとの行は これに「多め +15・ほか −5」 */
const BASE = yokaiCountryBase();
const MANY = 15;
const FEW = 5;
const emphasis = (...kinds: YokaiKind[]): Partial<Record<YokaiKind, number>> => mapKinds((k) => BASE[k] + (kinds.includes(k) ? MANY : -FEW));

export const COUNTRY_TABLE: readonly CountryRow[] = [
  { kind: 'harappa', name: `はじまりの ${ruby('原', 'はら')}っぱ`, yomi: 'はじまりの はらっぱ', boss: 'tsuchigumo', yokai: { ...BASE } },
  { kind: 'mori', name: ruby('森', 'もり'), yomi: 'もり', boss: 'tsuchigumo', yokai: emphasis('rokurokubi') },
  { kind: 'ookina', name: `${ruby('大', 'おお')}きな ${ruby('木', 'き')}の ${ruby('森', 'もり')}`, yomi: 'おおきな きの もり', boss: 'byakko', yokai: emphasis('rokurokubi') },
  { kind: 'hana', name: ruby('花畑', 'はなばたけ'), yomi: 'はなばたけ', boss: 'byakko', yokai: emphasis('chochin') },
  { kind: 'sunahama', name: ruby('砂浜', 'すなはま'), yomi: 'すなはま', boss: 'omukade', yokai: emphasis('karakasa', 'tako_hachimaki') },
  { kind: 'susuki', name: `すすきの ${ruby('原', 'はら')}`, yomi: 'すすきの はら', boss: 'itsumade', yokai: emphasis('chochin') },
  { kind: 'take', name: `${ruby('竹', 'たけ')}やぶ`, yomi: 'たけやぶ', boss: 'tsuchigumo', yokai: emphasis('karakasa') },
  { kind: 'kappa', name: `かっぱの ${ruby('沼', 'ぬま')}`, yomi: 'かっぱの ぬま', boss: 'omukade', yokai: emphasis('karakasa') },
  { kind: 'iwayama', name: ruby('岩山', 'いわやま'), yomi: 'いわやま', boss: 'omukade', yokai: emphasis('nurikabe') },
  { kind: 'tengu', name: `${ruby('天狗', 'てんぐ')}の ${ruby('山', 'やま')}`, yomi: 'てんぐの やま', boss: 'itsumade', yokai: emphasis('nurikabe') },
  { kind: 'momiji', name: ruby('紅葉山', 'もみじやま'), yomi: 'もみじやま', boss: 'itsumade', yokai: emphasis('chochin') },
  { kind: 'yuki', name: ruby('雪山', 'ゆきやま'), yomi: 'ゆきやま', boss: 'byakko', yokai: emphasis('nurikabe') },
];

const BY_KIND: ReadonlyMap<string, CountryRow> = new Map(COUNTRY_TABLE.map((r) => [r.kind, r]));

/** その国の 1 行（なければ undefined） */
export function countryRow(kind: string): CountryRow | undefined {
  return BY_KIND.get(kind);
}

// 並びが COUNTRY_KINDS と ずれたら 起動で すぐ 気づく
if (COUNTRY_TABLE.length !== COUNTRY_KINDS.length || COUNTRY_TABLE.some((r, i) => r.kind !== COUNTRY_KINDS[i])) {
  throw new Error('COUNTRY_TABLE の 並びが COUNTRY_KINDS と ちがう');
}
