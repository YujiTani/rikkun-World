/**
 * 曲を書き出して数で測る（SOUND-1 B11）。ふだんの `npm test` では動かさない（node に Web Audio が無いので、環境変数で入れ物を渡す）。
 *
 *   AUDIO_MEASURE_LIB=<node-web-audio-api のフォルダ> AUDIO_MEASURE_OUT=<WAV を書く場所> npx vitest run src/fx/bgm/measure.run.test.ts
 *
 * やること:
 *  1. preview.html の案 B の engine（そのまま）で、頭の 8 小節（よるは 4 小節）を 2 周書き出して測る（基準）
 *  2. 今のコードで同じ頭の小節を測る → 基準と ±0.1 dB で合う（移し替えで音が変わっていない）
 *  3. 今のコードの全部の長さ（足した小節ぶん）を測る → SOUND.md §3 の目安の中・基準と ±2 dB
 *  4. ループのつなぎ目（1 周めの終わり → 2 周めの頭）を測る
 *  5. スピーカー直前（全体 0.6・リミッター・天井を通した音）のピーク
 * WAV（16 bit・モノ）も書く。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { songInfo } from './compile';
import { levelStats, seamStats, type LevelStats } from './measure';
import { headOf, renderBgm, type OfflineCtor } from './render';
import { BGM_SONGS, type BgmSong } from './songs';

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
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}

/** preview.html の案 B の engine を、画面の部分を除いて そのまま動かす */
async function previewLevels(Ctor: OfflineCtor): Promise<Record<BgmSong, LevelStats>> {
  const html = readFileSync('docs/audio/preview.html', 'utf8');
  const s = html.indexOf('<script>') + 8;
  const e = html.indexOf('/* ---- 画面で鳴らす');
  const code = html.slice(s, e);
  const plansCode = code; // PLANS・MIX・engine は ここまでに全部ある
  const fn = new Function(
    'OfflineAudioContext',
    `${plansCode}
     const plan = PLANS.find(p => p.id === 'B');
     async function levels(key, bars) {
       const full = plan.bgm[key];
       const spb = full.beatsPerBar * full.stepsPerBeat;
       const song = { ...full, bars, chords: tokens(full.chords).slice(0, bars).join(' '),
         tracks: full.tracks.map(t => ({ ...t, notes: tokens(t.notes).slice(0, bars * spb).join(' ') })) };
       const info = songInfo(song), sr = 44100;
       const ctx = new OfflineAudioContext(1, Math.ceil(sr * info.seconds * 2), sr);
       const g = ctx.createGain(); g.gain.value = MIX.bgm; g.connect(ctx.destination);
       const bus = makeSongBus(ctx, g, song);
       const events = compileSong(plan, song);
       for (let i = 0; i < info.steps * 2; i++) scheduleStep(ctx, bus, plan, events, i % info.steps, 0.01 + i * info.stepDur);
       const buf = await ctx.startRendering();
       return buf.getChannelData(0);
     }
     return { levels };`,
  );
  const { levels } = fn(Ctor) as { levels: (key: BgmSong, bars: number) => Promise<Float32Array> };
  const out = {} as Record<BgmSong, LevelStats>;
  for (const key of ['day', 'night', 'battle'] as const) out[key] = levelStats(await levels(key, key === 'night' ? 4 : 8), 44100);
  return out;
}

describe.skipIf(!LIB)('B11 書き出して測る', () => {
  it('測って表にする', { timeout: 300_000 }, async () => {
    const mod = (await import(/* @vite-ignore */ LIB!)) as { OfflineAudioContext?: OfflineCtor; default?: { OfflineAudioContext: OfflineCtor } };
    const Ctor = (mod.OfflineAudioContext ?? mod.default!.OfflineAudioContext) as OfflineCtor;
    if (OUT) mkdirSync(OUT, { recursive: true });
    const base = await previewLevels(Ctor);
    const f = (v: number): string => v.toFixed(2).padStart(7);
    const rows: string[] = ['曲 | 区間 | 長さ(秒) | ピーク dB | 最大50ms dB | 平均 dB'];
    for (const key of ['day', 'night', 'battle'] as const) {
      const b = base[key];
      rows.push(`${key} | preview 頭 | - | ${f(b.peakDb)} | ${f(b.loud50Db)} | ${f(b.rmsDb)}`);
      const head = headOf(BGM_SONGS[key], key === 'night' ? 4 : 8);
      const h = levelStats((await renderBgm(Ctor, head, { laps: 2 })).samples, 44100);
      rows.push(`${key} | 今のコード 頭 | ${songInfo(head).seconds.toFixed(1)} | ${f(h.peakDb)} | ${f(h.loud50Db)} | ${f(h.rmsDb)}`);
      expect(Math.abs(h.peakDb - b.peakDb)).toBeLessThan(0.1);
      expect(Math.abs(h.loud50Db - b.loud50Db)).toBeLessThan(0.1);
      expect(Math.abs(h.rmsDb - b.rmsDb)).toBeLessThan(0.1);

      const full = await renderBgm(Ctor, key, { laps: 2 });
      const l = levelStats(full.samples, full.sampleRate);
      rows.push(`${key} | 全部の長さ | ${full.seconds.toFixed(1)} | ${f(l.peakDb)} | ${f(l.loud50Db)} | ${f(l.rmsDb)}`);
      expect(Math.abs(l.peakDb - b.peakDb)).toBeLessThanOrEqual(2);
      expect(Math.abs(l.loud50Db - b.loud50Db)).toBeLessThanOrEqual(2);
      expect(Math.abs(l.rmsDb - b.rmsDb)).toBeLessThanOrEqual(2);

      const seam = seamStats(full.samples, full.sampleRate, full.start + full.seconds);
      rows.push(`${key} | つなぎ目 | - | 前後 1 秒の差 ${seam.levelDiffDb.toFixed(2)} dB | 段差/最大 ${seam.stepRatio.toFixed(3)} (${seam.seamStep.toFixed(5)} / ${seam.maxStep.toFixed(5)})`);
      expect(seam.stepRatio).toBeLessThanOrEqual(1);
      expect(seam.levelDiffDb).toBeLessThan(6); // 曲の終わりの余韻と頭の音の差（音楽の強弱。クリックではない）

      const sp = await renderBgm(Ctor, key, { laps: 1, speaker: true });
      const spl = levelStats(sp.samples, sp.sampleRate);
      rows.push(`${key} | スピーカー直前(全体0.6) | ${sp.seconds.toFixed(1)} | ${f(spl.peakDb)} | ${f(spl.loud50Db)} | ${f(spl.rmsDb)}`);
      expect(spl.peakDb).toBeLessThan(-1);
      if (OUT) {
        writeFileSync(join(OUT, `bgm-${key}-2laps.wav`), wav16(full.samples, full.sampleRate));
        writeFileSync(join(OUT, `bgm-${key}-speaker.wav`), wav16(sp.samples, sp.sampleRate));
      }
    }
    console.log('\n' + rows.join('\n'));
    if (OUT) writeFileSync(join(OUT, 'measure.txt'), rows.join('\n') + '\n');
  });
});
