import { COMBAT_SOUNDS } from './combatSounds';
import { CRAFT_SOUNDS } from './craftSounds';
import { FARM_SOUNDS } from './farmSounds';
import { WHIFF_TONES } from './sfxVoices';
import type { SoundFx, Tone } from './sound';
import { STORAGE_SOUNDS } from './storageSounds';
import { WEAPON_SOUNDS } from './weaponSounds';
import { PARRY_SOUNDS } from './parrySounds';
import { playLegend, startLegendLoop } from './legendSounds';

export type SfxGroup = 'dig' | 'combat' | 'weapon' | 'craft' | 'farm' | 'storage';

export interface SfxCatalogEntry {
  group: SfxGroup;
  name: string;
  /** ひらがな・カタカナ */
  label: string;
  play(s: SoundFx): void;
}

type Table = Readonly<Record<string, readonly Tone[]>>;

const fromTable = (group: SfxGroup, table: Table, items: ReadonlyArray<readonly [string, string]>): SfxCatalogEntry[] =>
  items.map(([name, label]) => ({ group, name, label, play: (s: SoundFx) => s.playTones(table[name]!) }));

const DIG_ITEMS = [
  ['dig', 'ほる（コツ）'],
  ['crack', 'ひび（カッ）'],
  ['crackFinal', 'ひびの さいご'],
  ['ready', 'いま おして（キラッ）'],
  ['break', 'こわれる（ポン）'],
  ['place', 'おく（コトン）'],
  ['clink', 'ほれない'],
  ['pickup', 'ひろう（きらーん）'],
  ['levelUp', 'レベルアップ'],
] as const;

/** 試聴ページ（sound.html）が読む、全部の効果音の一覧 */
export const SFX_CATALOG: readonly SfxCatalogEntry[] = [
  // ---- ほる・おく ----
  ...DIG_ITEMS.map(([name, label]): SfxCatalogEntry => ({ group: 'dig', name, label, play: (s) => s.play(name) })),
  { group: 'dig', name: 'pickup', label: 'ひろう（つづけて 3 かいめ）', play: (s) => s.play('pickup', 0, { comboStep: 3 }) },
  { group: 'dig', name: 'whiff', label: 'からぶり（ひゅ）', play: (s) => s.playTones(WHIFF_TONES) },
  // ---- たたかい・ようかい・じかん ----
  ...fromTable('combat', COMBAT_SOUNDS, [
    ['punch', 'パンチ'],
    ['hit', 'たたく（ポコ）'],
    ['miss', 'からぶり（スカッ）'],
    ['defeat', 'たおした'],
    ['orb', 'ようかいだま'],
    ['hurt', 'いたい（ぼふ）'],
    ['faint', 'やられた'],
    ['respawn', 'ふっかつ'],
    ['spawn', 'でてくる（ぽわん）'],
    ['bell', 'ゆうがたの かね'],
    ['birds', 'あさの とり'],
    ['dropCommon', 'おとしもの（ふつう）'],
    ['dropUncommon', 'おとしもの（すこし めずらしい）'],
    ['dropRare', 'おとしもの（めずらしい）'],
    ['dropSuperRare', 'おとしもの（とても めずらしい）'],
  ]),
  // ---- ぶき ----
  ...fromTable('weapon', WEAPON_SOUNDS, [
    ['stance', 'かまえ'],
    ['thrust', 'つき'],
    ['kesa', 'おおぎり（ブォン）'],
    ['kesaHit', 'おおぎりの あたり'],
    ['kiriage', 'きりあげ'],
    ['combo2', '3 だん わざ（2 だん め）'],
    ['combo3', '3 だん わざ（3 だん め）'],
    ['wearLow', 'もうすぐ こわれる'],
    ['toolBreak', 'こわれた どうぐ'],
    ['drawStage1', 'ゆみ だん 1'],
    ['drawStage2', 'ゆみ だん 2'],
    ['drawStage3', 'ゆみ だん 3'],
    ['dry', 'ゆみ（ぽよん）'],
    ['shoot1', 'とばす 1'],
    ['shoot2', 'とばす 2'],
    ['shoot3', 'とばす 3'],
    ['arrowHit', 'やが あたる'],
    ['arrowStick', 'やが ささる'],
  ]),
  ...fromTable('weapon', PARRY_SOUNDS, [
    ['parrySwing', 'パリィを はじめる'],
    ['parry', 'パリィ せいこう（パキィーン）'],
    ['parryEarly', 'パリィ はやすぎ（カツッ）'],
    ['staggerBreak', 'よろけに ヒット（ポンッ）'],
  ]),
  // 風神剣・雷神剣（WEAPON-8）。新しい 音は 音の ファイル（public/sound/legend/）。読めない ときは 合成音
  ...(
    [
      ['chargeReady', 'ため いっぱい（ふぉん）'],
      ['lightning', 'かみなり（ゴロ ドーン）'],
      ['lightningFar', 'かみなり（とおく）'],
      ['thunderSlash', 'かみなりの きりつけ（バチバチ）'],
      ['legendDrop', 'ヌシが おとした（キラキラ）'],
      ['windWave', 'しんくうは（ヒュッ）'],
      ['spiralWind', 'らせんの かぜ（ゴゴゴ）'],
      ['shiningStart', 'にじ シャイニング（キラキラ）'],
      ['shiningHit', 'にじ ドームが はじく（ポヨン）'],
      ['shiningEnd', 'にじ シャイニング おわり（ふわ）'],
      ['shiningReady', 'にじ また つかえる（ちりん）'],
    ] as const
  ).map(([name, label]): SfxCatalogEntry => ({ group: 'weapon', name, label, play: (s) => playLegend(s, name) })),
  // ため音（風神剣・雷神剣）。ため中の 1 秒 → いっぱいで ため続けの ループ（約 2.5 秒 鳴らして 止める）
  ...(
    [
      ['chargeRise', 'ためる（ひかりの うた）'],
      ['chargeHold', 'ため つづけ（ふわん ふわん）'],
    ] as const
  ).flatMap(([name, label]): SfxCatalogEntry[] =>
    ([[null, ''], ['fujin', '・ふうじん'], ['raijin', '・らいじん']] as const).map(([flavor, tag]) => ({
      group: 'weapon',
      name,
      label: label + tag,
      play: (s) => {
        const h = startLegendLoop(s, name, flavor);
        setTimeout(() => h.stop(0.3), 2500);
      },
    })),
  ),
  ...fromTable('weapon', CRAFT_SOUNDS, [
    ['slash', 'かたな（シュッ）'],
    ['naginata', 'なぎなた'],
    ['bowDraw', 'ゆみを ひく'],
    ['bowRelease', 'ゆみを はなす'],
    ['arrowThud', 'やが ブロックに あたる'],
    ['noArrow', 'やが ない'],
    ['equip', 'きた'],
    ['guard', 'ふせいだ'],
    ['sparkle', 'きらめく かたな'],
  ]),
  // ---- つくる・じっせき ----
  ...fromTable('craft', CRAFT_SOUNDS, [
    ['craft', 'つくった'],
    ['craftFail', 'つくれない（おしい）'],
    ['bakeStart', 'やく（ボッ）'],
    ['crackle', 'やいてる（パチパチ）'],
    ['bakeDone', 'やけた'],
    ['banzai', 'ばんざい'],
    ['tab', 'タブ'],
    ['chime1', 'チャイム（ほし 1）'],
    ['chime2', 'チャイム（ほし 2）'],
    ['chime3', 'チャイム（ほし 3）'],
    ['chime4', 'チャイム（ほし 4）'],
    ['bannerSpin', 'よこだんまく（くるくる）'],
    ['fanfare', 'ファンファーレ（できた！）'],
    ['modal', 'おめでとう'],
    ['modalSparkle', 'キラキラ'],
    ['badge', 'メダル'],
    ['closeReady', 'とじる できる'],
  ]),
  // ---- はたけ・みず・どうぶつ ----
  ...fromTable('farm', FARM_SOUNDS, [
    ['till', 'たがやす（ザクッ）'],
    ['tillPress', 'たがやす（ちいさく）'],
    ['plant', 'まく（ポコッ）'],
    ['harvest', 'しゅうかく'],
    ['wild', 'やせいの やさい'],
    ['notRipe', 'まだ（ぷるん）'],
    ['seedFound', 'たねが でた'],
    ['eat', 'たべる'],
    ['fill', 'くむ（ゴボゴボ）'],
    ['fullCan', 'まんたん（ちゃぷん）'],
    ['pour', 'みずを まく'],
    ['empty', 'からっぽ'],
    ['sprinklerPlace', 'スプリンクラー'],
    ['pet', 'なでる'],
    ['petAgain', 'なでる（もういちど）'],
  ]),
  // ---- たんす ----
  ...fromTable('storage', STORAGE_SOUNDS, [
    ['throw', 'すてる（ポイッ）'],
    ['drawerOpen', 'ひきだしを あける'],
    ['drawerClose', 'ひきだしを しめる'],
  ]),
];
