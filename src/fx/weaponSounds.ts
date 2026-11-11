import type { BladeEvent, BowEvent, WearEvent } from '../contracts';
import { playCombat } from './combatSounds';
import type { SoundFx, Tone } from './sound';
import { box, hz, mar, noise, powan, swish, wood, xylo } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * WEAPON-2 §3.4 の 音。コードで 作る みじかい やさしい 音（こわい音・大きい音は なし）。
 * 名前は `combat.sounds()` の 名前（AC23）と 同じ。
 */
export const WEAPON_SOUNDS = {
  /** かまえ「チャキッ」: 木の 2 打 */
  stance: [...wood(500, 420, 0, 0.05, 0.3), ...wood(760, 640, 0.06, 0.05, 0.25)],
  /** 突き「シュッ」: シャカ（上がる） */
  thrust: [swish(1800, 2800, 0, 0.07, 0.22)],
  /** 大げさ斬り「ブォン」: 低いシャカ（下がる）＋ ぽわん */
  kesa: [swish(700, 200, 0, 0.35, 0.4, 0.8), powan(260, 110, 0.05, 0.3, 0.25, 0.03)],
  /** 大げさ斬りの 当たり「ズバーン」: 木のポコ ＋ 木琴 1 音 */
  kesaHit: [
    noise(0, 0.045, 0.25, { type: 'bandpass', freq: 2200, q: 1.5 }),
    ...wood(300, 120, 0, 0.22, 0.55),
    ...xylo(hz('C6'), hz('D6'), 0.06, 0.28, 0.3),
  ],
  /** 切り上げ「シュバッ」（下から 上がる） */
  kiriage: [swish(700, 2400, 0, 0.12, 0.28)],
  /** WEAPON-6: 2 段目を 始めた「ピッ」（わざの音に 重ねる。小さく 短い。和音の 3 度） */
  combo2: [...box(hz('E6'), hz('E6') * 1.01, 0, 0.07, 0.2)],
  /** WEAPON-6: 3 段目を 始めた「ピッ」（combo2 より 少し 高い。5 度） */
  combo3: [...box(hz('G6'), hz('G6') * 1.01, 0, 0.08, 0.2)],
  /** たいきゅう のこり わずか「ピピッ」: オルゴール 2 音 */
  wearLow: [...box(hz('G6'), hz('G6'), 0, 0.07, 0.35), ...box(hz('C7'), hz('C7'), 0.1, 0.1, 0.35)],
  /** こわれた「パキ ポロロン」: 木の「パキ」＋ オルゴールで下がる 3 音（最後ははねて明るく） */
  toolBreak: [
    ...wood(1400, 700, 0, 0.07, 0.35),
    ...box(hz('G5'), hz('G5'), 0.1, 0.12, 0.3),
    ...box(hz('E5'), hz('E5'), 0.22, 0.12, 0.3),
    ...box(hz('C5'), hz('C5'), 0.34, 0.14, 0.3),
    ...box(hz('C6'), hz('C6') * 1.02, 0.5, 0.2, 0.28),
  ],
  /** ゆみを ひく「キリッ」: 段 1・2・3 で ド・ミ・ソ（鳴らすとき 和音の根音・3 度・5 度に動く。段 3 は 少し 長め） */
  drawStage1: mar(hz('C5'), hz('C5') * 1.03, 0, 0.09, 0.4),
  drawStage2: mar(hz('E5'), hz('E5') * 1.03, 0, 0.09, 0.4),
  drawStage3: mar(hz('G5'), hz('G5') * 1.03, 0, 0.16, 0.45),
  /** 段 0 で はなした「ぽよん」 */
  dry: [powan(300, 520, 0, 0.14, 0.4, 0.03)],
  /** とばす「ビュン」（段が 高いほど 大きく） */
  shoot1: [swish(2000, 700, 0, 0.1, 0.2)],
  shoot2: [swish(2200, 700, 0, 0.12, 0.3)],
  shoot3: [swish(2400, 650, 0, 0.14, 0.4)],
  /** や が 妖怪に「コツ」（このあと 「ポコーン」= `hit`） */
  arrowHit: wood(320, 180, 0, 0.06, 0.4),
  /** や が ブロックに ささった「トン」 */
  arrowStick: wood(210, 150, 0, 0.07, 0.45),
  /** LEGEND-4 八咫烏の ほのお「ボフッ」: まるい ぽわんと 低い ふくらみ ＋ ふわっと した 空気 ＋ 上で きらっと 2 音（やさしい。大きく しない） */
  yataBurst: [
    powan(180, 90, 0, 0.22, 0.4, 0.01),
    noise(0, 0.18, 0.16, { type: 'lowpass', freq: 900, freq1: 300, q: 0.7 }, 0.01),
    ...box(hz('E6'), hz('E6') * 1.01, 0.03, 0.1, 0.18),
    ...box(hz('A6'), hz('A6') * 1.01, 0.08, 0.14, 0.16),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type WeaponSoundName = keyof typeof WEAPON_SOUNDS;

/** `combat.sounds()` に のせる 名前（`shoot1`〜`shoot3` は `shoot`、`kesaHit` と `arrowHit` は `hit` も） */
export function weaponSoundLogNames(name: WeaponSoundName): string[] {
  if (name === 'shoot1' || name === 'shoot2' || name === 'shoot3') return ['shoot'];
  if (name === 'kesaHit' || name === 'arrowHit') return [name, 'hit'];
  return [name];
}

/**
 * NINJA-1: 小太刀の 追い打ちの 音。今の 切り上げ（kiriage）の 音を 小さく・みじかく・少し 高く 軽くして 使う（新しい 音は 作らない。
 * くりかえす 行動なので 控えめ）。`combat.sounds()` の 名前は kodachi
 */
export function playKodachi(sound: Pick<SoundFx, 'playTones'>): void {
  sound.playTones(WEAPON_SOUNDS.kiriage.map((t) => ({ ...t, gain: t.gain * 0.35, dur: t.dur * 0.7 })), 4);
  logSound('kodachi');
}

/**
 * たいきゅうの 出来事の 音（1P の WeaponFx と 2P の p2Wear が 同じ 音を 鳴らす ための 共通。COOP-1 4b）。
 * wearLow = 「もうすぐ こわれる」／ toolBreak = こわれた。
 */
export function playWearSound(sound: Pick<SoundFx, 'playTones'>, e: WearEvent): void {
  playWeapon(sound, e.type === 'wearLow' ? 'wearLow' : 'toolBreak');
}

export function playWeapon(sound: Pick<SoundFx, 'playTones'>, name: WeaponSoundName): void {
  sound.playTones(WEAPON_SOUNDS[name] as readonly Tone[]);
  logSound(...weaponSoundLogNames(name));
}

/**
 * 刀の 出来事の 音（1P の WeaponFx と 2P の P2Sounds が 同じ 音を 鳴らす ための 共通。COOP-1 3c）。
 * techStart: わざの 音（2 段目は ＋ combo2・3 段目は ＋ combo3）／ techHit: kesa は kesaHit・ほかは hit／ stance: かまえ／ 他は 鳴らさない。
 * 虹の 刀が 斬撃音を 入れかえる 枝（replaceTechSound）は WeaponFx に のこす（呼ぶ 前に 分ける）
 */
export function playBladeSound(sound: Pick<SoundFx, 'playTones'>, e: BladeEvent): void {
  switch (e.type) {
    case 'techStart':
      playWeapon(sound, e.tech);
      if (e.step === 2) playWeapon(sound, 'combo2');
      else if (e.step === 3) playWeapon(sound, 'combo3');
      break;
    case 'techHit':
      if (e.tech === 'kesa') playWeapon(sound, 'kesaHit');
      else playCombat(sound, 'hit');
      break;
    case 'stance':
      playWeapon(sound, 'stance');
      break;
    case 'techMiss':
    case 'cancel':
      break;
  }
}

/** 弓の 出来事の 音（WeaponFx.onBow の 音の 部分。2P も 使う）。ひく・とばす・あたる・ささる・からうち・やが ない・ひろう。ほか（drawStart・arrowEnd）は 鳴らさない */
export function playBowSound(sound: Pick<SoundFx, 'play' | 'playTones'>, e: BowEvent): void {
  switch (e.type) {
    case 'stage':
      playWeapon(sound, e.stage === 1 ? 'drawStage1' : e.stage === 2 ? 'drawStage2' : 'drawStage3');
      break;
    case 'arrowShot':
      playWeapon(sound, e.stage === 1 ? 'shoot1' : e.stage === 2 ? 'shoot2' : 'shoot3');
      break;
    case 'arrowHit':
      playWeapon(sound, 'arrowHit');
      playCombat(sound, 'hit');
      break;
    case 'arrowStick':
      playWeapon(sound, 'arrowStick');
      break;
    case 'dryRelease':
      playWeapon(sound, 'dry');
      break;
    case 'noArrow':
      sound.play('clink');
      break;
    case 'pickup':
      sound.play('pickup');
      break;
    case 'yataBurst':
      playWeapon(sound, 'yataBurst');
      break;
    case 'drawStart':
    case 'arrowEnd':
    case 'arrowSaved': // 弓の 宝石が きらりと する だけ（音なし。2 回に 1 回 くり返すので 足さない）
      break;
  }
}
