/**
 * 曲を OfflineAudioContext で書き出す（数で見る用）。本番と同じ createSongBus / scheduleSongStep を使う。
 * 試聴ページ（ブラウザ）と、node の測定（measure.run.test.ts）の両方で使う。
 */
import { MIX, createAudioSettings } from '../audioConfig';
import { buildMasterChain } from '../audioMixer';
import { compileSong, songInfo, tokens, type SongDef } from './compile';
import { BGM_INSTRUMENTS, BGM_KIT } from './instruments';
import { BGM_SONGS, type BgmSong } from './songs';
import { createSongBus, scheduleSongStep } from './songBus';

export type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** 頭の bars 小節だけの曲（preview の 8 小節と比べる用） */
export function headOf(song: SongDef, bars: number): SongDef {
  const stepsPerBar = song.beatsPerBar * song.stepsPerBeat;
  return {
    ...song,
    bars,
    chords: tokens(song.chords).slice(0, bars).join(' '),
    tracks: song.tracks.map((t) => ({ ...t, notes: tokens(t.notes).slice(0, bars * stepsPerBar).join(' ') })),
  };
}

export interface RenderOptions {
  /** 何周ぶん書き出すか */
  laps: number;
  sampleRate?: number;
  /** true: 本番と同じ全体のつなぎ（全体 0.6・リミッター・天井）を通した スピーカー直前の音。false: preview と同じ「リミッターの前」（BGM の大きさ 0.4 だけかける） */
  speaker?: boolean;
  /** 曲の頭の時刻（preview と同じ 0.01） */
  start?: number;
}

export interface Rendered {
  samples: Float32Array;
  sampleRate: number;
  /** 1 周の秒 */
  seconds: number;
  /** 曲の頭の時刻 */
  start: number;
}

export async function renderBgm(Ctor: OfflineCtor, song: SongDef | BgmSong, o: RenderOptions): Promise<Rendered> {
  const def = typeof song === 'string' ? BGM_SONGS[song] : song;
  const sr = o.sampleRate ?? 44100;
  const start = o.start ?? 0.01;
  const info = songInfo(def);
  const ctx = new Ctor(1, Math.ceil(sr * info.seconds * o.laps), sr);
  let dest: AudioNode;
  if (o.speaker) {
    const chain = buildMasterChain(ctx, createAudioSettings());
    dest = chain.bgmBus;
  } else {
    const g = ctx.createGain();
    g.gain.value = MIX.bgmDefault;
    g.connect(ctx.destination);
    dest = g;
  }
  const bus = createSongBus(ctx, dest, def);
  const events = compileSong(def, BGM_INSTRUMENTS, BGM_KIT);
  for (let i = 0; i < info.steps * o.laps; i++) scheduleSongStep(ctx, bus, events[i % info.steps], start + i * info.stepDur);
  const buf = await ctx.startRendering();
  return { samples: buf.getChannelData(0), sampleRate: sr, seconds: info.seconds, start };
}
