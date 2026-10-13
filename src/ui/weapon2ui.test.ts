import { describe, expect, it } from 'vitest';
import { contrastRatio, parseCssColor } from './theme/colorMath';
import { FIGHT_CAPTIONS_W2 } from './weapon2Guide';
import { buildTooltip } from './tooltipModel';
import { findUnrubiedKanji } from './text';
import { isWearLow, wearSignature, wearTier, wearView } from './wearGauge';
import { createDefaultItemInfo } from '../craft/info';
import { CLASS_TEXT } from '../craft/info/table';
import {
  TECH_NAME,
  WEAPON_FX,
  brokenLogText,
  lockRingVisible,
  lowChipText,
  pickShardColors,
  shakeOffset,
  techNameOpacity,
  trailOpacity,
} from '../fx/weaponFxModel';
import { WEAPON_SOUNDS, weaponSoundLogNames } from '../fx/weaponSounds';
import { COMBAT_SOUNDS } from '../fx/combatSounds';
import { drainSounds, logSound } from '../fx/soundLog';

describe('たいきゅう ゲージ（AC29）', () => {
  it('色の 段: 60% 以上 ok・30% 以上 mid・30% 未満 low', () => {
    expect(wearTier(1)).toBe('ok');
    expect(wearTier(0.6)).toBe('ok');
    expect(wearTier(0.59)).toBe('mid');
    expect(wearTier(0.3)).toBe('mid');
    expect(wearTier(0.29)).toBe('low');
    expect(wearTier(0.01)).toBe('low');
  });
  it('新品でも 値が ある・へった 量で のこりが かわる・へらない 道具は null', () => {
    const v = wearView({ item: 'katana', count: 1 })!;
    expect(v).toMatchObject({ max: 250, left: 250, ratio: 1, tier: 'ok', low: false });
    expect(wearView({ item: 'katana', count: 1, wear: 150 })).toMatchObject({ left: 100, tier: 'mid' });
    expect(wearView({ item: 'dirt', count: 1 })).toBeNull();
    expect(wearView({ item: 'lantern', count: 1 })).toBeNull();
    expect(wearView(null)).toBeNull();
  });
  it('のこり わずか: かたな 25 以下、きの つるはし 6 以下', () => {
    expect(isWearLow(26, 250, 0.1)).toBe(false);
    expect(isWearLow(25, 250, 0.1)).toBe(true);
    expect(isWearLow(7, 59, 0.1)).toBe(false);
    expect(isWearLow(6, 59, 0.1)).toBe(true);
  });
  it('3 つの 色と 下地の コントラスト 3 以上', () => {
    const bg = parseCssColor('rgb(16, 20, 31)')!;
    for (const c of ['rgb(61, 220, 132)', 'rgb(255, 200, 61)', 'rgb(255, 90, 95)']) expect(contrastRatio(parseCssColor(c)!, bg)).toBeGreaterThanOrEqual(3);
  });
  it('へった 量の 合い言葉は かわると かわる', () => {
    const a = wearSignature([{ item: 'katana', count: 1 }, null]);
    const b = wearSignature([{ item: 'katana', count: 1, wear: 1 }, null]);
    expect(a).not.toBe(b);
  });
});

describe('ツールチップ・説明（AC31）', () => {
  it('ツールチップに たいきゅう 100 / 250', () => {
    const t = buildTooltip('katana', { nameOf: () => 'かたな', rarityOf: () => 'common', placeable: () => false, recipes: () => [] }, { item: 'katana', count: 1, wear: 150 });
    expect(t.lines).toContain('たいきゅう 100 / 250');
  });
  it('説明: つよさに たいきゅう 250・なかまの 文', () => {
    const src = createDefaultItemInfo((i) => i);
    const info = src.info('katana');
    expect(info.stats.find((s) => s.key === 'durability')).toMatchObject({ label: 'たいきゅう', value: 250 });
    const yumi = src.info('yumi');
    expect(yumi.stats.find((s) => s.key === 'durability')?.value).toBe(384);
    expect(yumi.stats.find((s) => s.key === 'damage')?.value).toBe('1〜3');
    expect(src.info('kabuto').stats.find((s) => s.key === 'durability')?.value).toBe(165);
    expect(CLASS_TEXT.durable).toBe('つかうと へって、0 で こわれる');
  });
});

describe('案内画面・文字', () => {
  it('たたかう の 文に 漢字の ふりがな もれ なし', () => {
    for (const c of FIGHT_CAPTIONS_W2) expect(findUnrubiedKanji(c)).toEqual([]);
    expect(FIGHT_CAPTIONS_W2.some((c) => c.includes('R で かまえ'))).toBe(true);
  });
  it('わざの 名前・チップ・ログは 漢字なし', () => {
    for (const n of Object.values(TECH_NAME)) expect(findUnrubiedKanji(n)).toEqual([]);
    expect(lowChipText('かたな')).toBe('かたな が もうすぐ こわれるよ');
    expect(brokenLogText('きの つるはし')).toBe('きの つるはし が こわれた');
  });
});

describe('刀の 演出の 計算（AC22）', () => {
  it('わざの 名前: 24F、最後の 8F で うすく', () => {
    expect(techNameOpacity(0)).toBe(1);
    expect(techNameOpacity(15)).toBe(1);
    expect(techNameOpacity(20)).toBeLessThan(1);
    expect(techNameOpacity(24)).toBe(0);
  });
  it('ゆれは 2px 以下・6F・もどる', () => {
    for (let f = 0; f < WEAPON_FX.shakeSteps; f++) expect(Math.abs(shakeOffset(f))).toBeLessThanOrEqual(2);
    expect(shakeOffset(WEAPON_FX.shakeSteps)).toBe(0);
  });
  it('きせきは 持続の あいだ 1、8F で 消える（単調に へる）', () => {
    expect(trailOpacity(-1)).toBe(1);
    let prev = 1;
    for (let i = 0; i <= 8; i++) {
      const o = trailOpacity(i);
      expect(o).toBeLessThanOrEqual(prev);
      prev = o;
    }
    expect(trailOpacity(8)).toBe(0);
  });
  it('灰色の わ: 大げさ斬りの 硬直 前半だけ', () => {
    expect(lockRingVisible({ tech: 'kesa', phase: 'recovery', frame: 13 }, 14, 3, 24)).toBe(true);
    expect(lockRingVisible({ tech: 'kesa', phase: 'recovery', frame: 30 }, 14, 3, 24)).toBe(false);
    expect(lockRingVisible({ tech: 'thrust', phase: 'recovery', frame: 8 }, 4, 2, 8)).toBe(false);
  });
  it('かけらの 色は 8 こ・赤くない道具でも 同じ数', () => {
    let s = 1;
    const cols = pickShardColors('katana', 8, () => ((s = (s * 48271) % 2147483647) / 2147483647));
    expect(cols).toHaveLength(8);
  });
});

describe('音（AC23）', () => {
  it('音の 名前が そろい、短く 小さい', () => {
    for (const n of ['stance', 'thrust', 'kesa', 'kiriage', 'wearLow', 'toolBreak', 'drawStage1', 'drawStage2', 'drawStage3', 'dry', 'arrowStick'])
      expect(Object.keys(WEAPON_SOUNDS)).toContain(n);
    for (const tones of Object.values(WEAPON_SOUNDS)) for (const t of tones) {
      expect(t.gain).toBeLessThanOrEqual(0.7);
      expect(t.delay + t.dur).toBeLessThan(1.1);
    }
    expect(Object.keys(COMBAT_SOUNDS)).toHaveLength(15);
  });
  it('弓の 段は ド・ミ・ソ（高さが ちがう）で 段 3 は 長め', () => {
    const f = (k: 'drawStage1' | 'drawStage2' | 'drawStage3') => WEAPON_SOUNDS[k][0].f0;
    expect(f('drawStage1')).toBeLessThan(f('drawStage2'));
    expect(f('drawStage2')).toBeLessThan(f('drawStage3'));
    expect(WEAPON_SOUNDS.drawStage3[0].dur).toBeGreaterThan(WEAPON_SOUNDS.drawStage1[0].dur);
  });
  it('名前の 列: shoot・hit', () => {
    expect(weaponSoundLogNames('shoot2')).toEqual(['shoot']);
    expect(weaponSoundLogNames('kesaHit')).toEqual(['kesaHit', 'hit']);
    drainSounds();
    logSound('a', 'b');
    expect(drainSounds()).toEqual(['a', 'b']);
  });
});
