import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chordAtSeconds, compileSong, songInfo, tokens } from './compile';
import { BGM_INSTRUMENTS, BGM_KIT } from './instruments';
import { BGM_SONGS, type BgmSong } from './songs';

const KEYS: BgmSong[] = ['day', 'night', 'battle'];

/** preview.html の案 B の音符（曲ごと・行ごと）を、書いてあるまま読みとる */
function previewB(): Record<BgmSong, string[]> {
  const html = readFileSync('docs/audio/preview.html', 'utf8');
  const a = html.indexOf("id: 'B'");
  const b = html.indexOf("id: 'C'");
  expect(a).toBeGreaterThan(0);
  const sec = html.slice(a, b);
  const notes = [...sec.matchAll(/notes: `([^`]*)`/g)].map((m) => m[1]);
  expect(notes.length).toBe(12); // ひる 4 + よる 4 + たたかい 4
  return { day: notes.slice(0, 4), night: notes.slice(4, 8), battle: notes.slice(8, 12) };
}

describe('B1 曲を読みとる', () => {
  for (const key of KEYS) {
    it(`${key}: 1 小節 = 拍子 × 2 ステップ・全部の行が同じ小節数・和音の数 = 小節数`, () => {
      const song = BGM_SONGS[key];
      const info = songInfo(song);
      expect(info.stepsPerBar).toBe(song.beatsPerBar * 2);
      expect(song.stepsPerBeat).toBe(2);
      expect(info.steps).toBe(song.bars * info.stepsPerBar);
      for (const tr of song.tracks) {
        const tk = tokens(tr.notes);
        expect(tk.length % info.stepsPerBar).toBe(0);
        expect(tk.length / info.stepsPerBar).toBe(song.bars);
      }
      expect(tokens(song.chords).length).toBe(song.bars);
      const ev = compileSong(song, BGM_INSTRUMENTS, BGM_KIT);
      expect(ev.length).toBe(info.steps);
      expect(ev.some((e) => e.length > 0)).toBe(true);
    });
  }

  it('長さ: ひる・よる 40 秒以上、たたかい 25 秒以上', () => {
    expect(songInfo(BGM_SONGS.day).seconds).toBeGreaterThanOrEqual(40);
    expect(songInfo(BGM_SONGS.night).seconds).toBeGreaterThanOrEqual(40);
    expect(songInfo(BGM_SONGS.battle).seconds).toBeGreaterThanOrEqual(25);
  });

  it('テンポ・拍子・level は SOUND.md §2 のとおり', () => {
    expect([BGM_SONGS.day.bpm, BGM_SONGS.day.beatsPerBar, BGM_SONGS.day.level]).toEqual([108, 3, 1.27]);
    expect([BGM_SONGS.night.bpm, BGM_SONGS.night.beatsPerBar, BGM_SONGS.night.level]).toEqual([72, 4, 1.48]);
    expect([BGM_SONGS.battle.bpm, BGM_SONGS.battle.beatsPerBar, BGM_SONGS.battle.level]).toEqual([132, 4, 1.0]);
  });

  it('頭の 8 小節（よるは 4 小節）の音符と和音が preview の案 B と同じ', () => {
    const pv = previewB();
    const headChords: Record<BgmSong, string> = {
      day: 'G C D G Em C D G',
      night: 'F Dm Bb C',
      battle: 'Am F G C Am F G E',
    };
    for (const key of KEYS) {
      const song = BGM_SONGS[key];
      const headBars = key === 'night' ? 4 : 8;
      const headSteps = headBars * songInfo(song).stepsPerBar;
      expect(song.tracks.length).toBe(pv[key].length);
      song.tracks.forEach((tr, i) => {
        const mine = tokens(tr.notes).slice(0, headSteps);
        const theirs = tokens(pv[key][i]);
        expect(theirs.length).toBe(headSteps);
        expect(mine, `${key} の ${i + 1} 本目`).toEqual(theirs);
      });
      expect(tokens(song.chords).slice(0, headBars)).toEqual(tokens(headChords[key]));
    }
  });

  it('よるはこだまつき、ひる・たたかいは無し', () => {
    expect(BGM_SONGS.night.echo).toEqual({ steps: 3, feedback: 0.3, mix: 0.45 });
    expect(BGM_SONGS.day.echo).toBeUndefined();
    expect(BGM_SONGS.battle.echo).toBeUndefined();
  });

  it('曲のつなぎ目: 終わりの和音から頭の和音へ（ひる D→G・よる C→F・たたかい E→Am）', () => {
    const last = (k: BgmSong) => tokens(BGM_SONGS[k].chords).at(-1);
    const first = (k: BgmSong) => tokens(BGM_SONGS[k].chords)[0];
    expect([last('day'), first('day')]).toEqual(['G', 'G']);
    expect([last('night'), first('night')]).toEqual(['C', 'F']);
    expect([last('battle'), first('battle')]).toEqual(['E', 'Am']);
  });

  it('四角い波は使わない（SOUND.md §1）', () => {
    for (const inst of Object.values(BGM_INSTRUMENTS)) expect(inst.wave).toBe('sine');
  });
});

describe('B2 いまの和音', () => {
  it('ひる: 0 秒 = G、5 小節目 = Em、1 周したら頭にもどる', () => {
    const song = BGM_SONGS.day;
    const { seconds, stepDur, stepsPerBar } = songInfo(song);
    const bar = stepDur * stepsPerBar;
    expect(chordAtSeconds(song, 0).name).toBe('G');
    expect(chordAtSeconds(song, 4 * bar + 0.01)).toEqual({ name: 'Em', root: 4, minor: true });
    expect(chordAtSeconds(song, 1 * bar + 0.01)).toEqual({ name: 'C', root: 0, minor: false });
    expect(chordAtSeconds(song, seconds + 0.01).name).toBe('G');
    expect(chordAtSeconds(song, seconds + 4 * bar + 0.01).name).toBe('Em');
  });
  it('よる: F Dm Bb C（根音 5・2・10・0、Dm だけ短調）', () => {
    const song = BGM_SONGS.night;
    const bar = songInfo(song).stepDur * songInfo(song).stepsPerBar;
    const at = (n: number) => chordAtSeconds(song, n * bar + 0.01);
    expect(at(0)).toEqual({ name: 'F', root: 5, minor: false });
    expect(at(1)).toEqual({ name: 'Dm', root: 2, minor: true });
    expect(at(2)).toEqual({ name: 'Bb', root: 10, minor: false });
    expect(at(3)).toEqual({ name: 'C', root: 0, minor: false });
  });
  it('時間が負（まだ始まっていない）でも こわれない', () => {
    expect(chordAtSeconds(BGM_SONGS.battle, -1).name).toBe('Am');
  });
});
