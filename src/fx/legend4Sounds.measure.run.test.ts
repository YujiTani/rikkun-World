/**
 * LEGEND-4 の効果音を OfflineAudioContext で書き出して数で測る（ふだんの `npm test` では動かさない。node に Web Audio が無いので環境変数で入れ物を渡す）。
 *
 *   AUDIO_MEASURE_LIB=<node-web-audio-api のフォルダ> AUDIO_MEASURE_OUT=<WAV を書く場所> npx vitest run src/fx/legend4Sounds.measure.run.test.ts
 *
 * 本番と同じ SoundFx（ゆらぎ・和音合わせ・大きさ）と全体のつなぎ（リミッター・天井）を通す。fxVolume は はじめの値。
 * 測るもの: ピーク（音割れ・-1 dBFS 以下）・いちばん大きい 50ms・長さ・BGM（夜の曲の いちばん大きい 50ms）との差。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { createAudioSettings } from './audioConfig';
import { buildMasterChain } from './audioMixer';
import { levelStats } from './bgm/measure';
import { renderBgm, type OfflineCtor } from './bgm/render';
import { FX_SETTINGS } from './config';
import { SoundFx, type Tone } from './sound';
import { LEGEND4_SOUNDS } from './legend4Sounds';
import { WEAPON_SOUNDS } from './weaponSounds';

const LIB = process.env.AUDIO_MEASURE_LIB;
const OUT = process.env.AUDIO_MEASURE_OUT ?? '';

function wav16(x: Float32Array, sr: number): Buffer {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i]!)) * 32767), 44 + i * 2);
  return b;
}

const SR = 44100;

/** count 回 同時に鳴らして書き出す（4 回目は 上限（3 まで）で 鳴らない。重ねたときの ピークを 見る） */
async function renderSfx(Ctor: OfflineCtor, tones: readonly Tone[], count: number, seconds: number): Promise<Float32Array> {
  const ctx = new Ctor(1, Math.ceil(SR * seconds), SR);
  const chain = buildMasterChain(ctx, createAudioSettings());
  const fx = new SoundFx({ output: () => ({ ctx: ctx as never, destination: chain.sfxBus as never }), settings: FX_SETTINGS, seed: 7 });
  for (let i = 0; i < count; i++) fx.playTones(tones);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0).slice();
}

describe.skipIf(!LIB)('LEGEND-4 の 効果音を 数で測る', () => {
  it('書き出す', async () => {
    const mod = (await import(/* @vite-ignore */ LIB!)) as { OfflineAudioContext?: OfflineCtor; default?: { OfflineAudioContext: OfflineCtor } };
    const lib = { OfflineAudioContext: (mod.OfflineAudioContext ?? mod.default!.OfflineAudioContext) as OfflineCtor };
    const Ctor = lib.OfflineAudioContext;
    if (OUT) mkdirSync(OUT, { recursive: true });
    const bgm = await renderBgm(Ctor, 'night', { laps: 1, speaker: true });
    const bgmDb = levelStats(bgm.samples, bgm.sampleRate).loud50Db;
    const names: [string, readonly Tone[]][] = [
      ['kokuryuShot', LEGEND4_SOUNDS.kokuryuShot],
      ['yataShot', LEGEND4_SOUNDS.yataShot],
      ['yataBurst', LEGEND4_SOUNDS.yataBurst],
      ['tenshiPaa', LEGEND4_SOUNDS.tenshiPaa],
      ['airJump', LEGEND4_SOUNDS.airJump],
      ['hammerSlam', LEGEND4_SOUNDS.hammerSlam],
      ['hammerDive', LEGEND4_SOUNDS.hammerDive],
      ['ref_shoot2', WEAPON_SOUNDS.shoot2],
      ['ref_kesaHit', WEAPON_SOUNDS.kesaHit],
    ];
    const lines: string[] = [`BGM(night) loud50 = ${bgmDb.toFixed(1)} dBFS`];
    for (const [name, tones] of names) {
      const x = await renderSfx(Ctor, tones, 1, 1.6);
      let last = 0;
      for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > 0.002) last = i;
      const s = levelStats(x, SR);
      lines.push(`${name}: peak ${s.peakDb.toFixed(1)} dBFS  loud50 ${s.loud50Db.toFixed(1)} dBFS  (BGM との差 ${(s.loud50Db - bgmDb).toFixed(1)} dB)  length ${(last / SR).toFixed(2)} s`);
      if (!name.startsWith('ref_')) {
        const y = levelStats(await renderSfx(Ctor, tones, 4, 1.6), SR);
        lines.push(`  同じ音を 4 回 同時に 呼ぶ（3 つまで 鳴る）: peak ${y.peakDb.toFixed(1)} dBFS  loud50 ${y.loud50Db.toFixed(1)} dBFS`);
      }
      if (OUT && !name.startsWith('ref_')) writeFileSync(join(OUT, `${name}.wav`), wav16(x, SR));
    }
    if (OUT) writeFileSync(join(OUT, 'measure.txt'), lines.join('\n') + '\n');
  }, 120000);
});
