/**
 * 曲のデータ（音符の文字）を「ステップごとの鳴らす物の並び」にする。DOM も WebAudio も使わない。
 * 音符の書き方（preview.html と同じ）: `C4` `F#5` `Bb2`、`.` = 休み、`-` = 前の音をのばす、`+` = 和音、`|` = 小節の区切り（読み飛ばす）。
 * 打楽器の行は k・w・h など 1 文字ずつ（1 ステップに重ねてもよい）。
 */
import type { InstrumentDef, InstrumentName, ToneDef } from './instruments';

export interface BgmChord {
  name: string;
  /** 0〜11（C = 0） */
  root: number;
  minor: boolean;
}

export interface TrackDef {
  inst?: InstrumentName;
  drums?: boolean;
  vol?: number;
  /** こだまに送る量 */
  echo?: number;
  notes: string;
}

export interface SongDef {
  title: string;
  /** 曲ごとの大きさ（SOUND.md §2 の level） */
  level: number;
  bpm: number;
  beatsPerBar: number;
  stepsPerBeat: number;
  bars: number;
  /** 小節ごとの和音の名前（空白区切り） */
  chords: string;
  echo?: { steps: number; feedback: number; mix: number };
  tracks: readonly TrackDef[];
}

export type StepEvent =
  | { drum: string; vol: number }
  | { inst: InstrumentName; freq: number; dur: number; vol: number; echo: number };

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const pcOf = (letter: string, acc: string | undefined): number => (NOTE_INDEX[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;

export function noteFreq(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error('音の名前がおかしい: ' + name);
  const midi = (Number(m[3]) + 1) * 12 + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 'C' 'F#' 'Bb' 'Am' → { name, root: 0〜11, minor } */
export function parseChord(name: string): BgmChord {
  const m = /^([A-G])(#|b)?(m?)$/.exec(name);
  if (!m) throw new Error('和音の名前がおかしい: ' + name);
  return { name, root: pcOf(m[1], m[2]), minor: m[3] === 'm' };
}

export const NO_SONG_CHORD: BgmChord = { name: 'C', root: 0, minor: false };

export function tokens(str: string): string[] {
  return str.split(/\s+/).filter((t) => t && t !== '|');
}

export interface SongInfo {
  stepDur: number;
  steps: number;
  stepsPerBar: number;
  seconds: number;
}

export function songInfo(song: SongDef): SongInfo {
  const stepDur = 60 / song.bpm / song.stepsPerBeat;
  const stepsPerBar = song.beatsPerBar * song.stepsPerBeat;
  const steps = song.bars * stepsPerBar;
  return { stepDur, steps, stepsPerBar, seconds: steps * stepDur };
}

/** 曲を読みとる。書きまちがい（数が合わない・知らない楽器）は例外で知らせる */
export function compileSong(song: SongDef, instruments: Record<string, InstrumentDef>, kit: Record<string, readonly ToneDef[]>): StepEvent[][] {
  const { stepDur, steps } = songInfo(song);
  const events: StepEvent[][] = Array.from({ length: steps }, () => []);
  const ch = tokens(song.chords);
  if (ch.length !== song.bars) throw new Error(`「${song.title}」: 和音が ${ch.length} 個（${song.bars} 小節のはず）`);
  ch.forEach(parseChord);
  song.tracks.forEach((tr, ti) => {
    const tk = tokens(tr.notes);
    const where = `「${song.title}」の ${ti + 1} 本目`;
    if (tk.length !== steps) throw new Error(`${where}: ${tk.length} 個（${steps} 個のはず）`);
    if (!tr.drums && !(tr.inst && instruments[tr.inst])) throw new Error(`${where}: 楽器 ${tr.inst} がない`);
    tk.forEach((tok, i) => {
      if (tok === '.' || tok === '-') return;
      if (tr.drums) {
        for (const c of tok) {
          if (!kit[c]) throw new Error(`${where}: 打楽器 ${c} がない`);
          events[i].push({ drum: c, vol: tr.vol ?? 1 });
        }
        return;
      }
      let len = 1;
      while (i + len < steps && tk[i + len] === '-') len++;
      for (const nn of tok.split('+')) {
        events[i].push({ inst: tr.inst!, freq: noteFreq(nn), dur: len * stepDur, vol: tr.vol ?? 1, echo: tr.echo ?? 0 });
      }
    });
  });
  return events;
}

/** 曲の始まりから t 秒のときの和音（t が曲より長ければ ぐるぐる回る。負なら 頭の和音） */
export function chordAtSeconds(song: SongDef, t: number): BgmChord {
  const { stepDur, stepsPerBar } = songInfo(song);
  const names = tokens(song.chords);
  const bar = Math.max(0, Math.floor(t / stepDur / stepsPerBar + 1e-9)) % song.bars;
  return parseChord(names[bar]);
}
