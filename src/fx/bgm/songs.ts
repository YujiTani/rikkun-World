/**
 * 案 B の BGM 3 曲（docs/audio/SOUND.md §2）。音符の書き方は compile.ts。
 * 頭の 8 小節（よるは 4 小節）は preview.html の案 B のまま。そのあとの小節は SOUND.md の「長さ」のために足した
 * （同じ楽器・テンポ・和音の流れの続き。オーナー確認が要る所）。
 *
 * ひる   : A(preview) → A'(同じ和音で旋律を変える) → B(橋: C G Am Em C G D D) → A(もどる)  = 32 小節 = 53.3 秒
 * よる   : P1(preview) → P2(旋律を変える) → P3(Gm で少し影) → P1(もどる)                     = 16 小節 = 53.3 秒
 * たたかい: P1(preview) → P2(同じ和音で旋律を変える)                                             = 16 小節 = 29.1 秒
 */
import type { SongDef } from './compile';

export type BgmSong = 'day' | 'night' | 'battle';

const cat = (...parts: string[]): string => parts.map((p) => p.trim()).join(' | ');

/* ----------------------------------------------------------------- ひる（108・3 拍子） */
const DAY_CHORDS_A = 'G C D G Em C D G';
const DAY_CHORDS_B = 'C G Am Em C G D D';

const DAY_MELODY_A = `D6 - B5 - G5 - | E6 - - - C6 - | F#6 - E6 - D6 - | B5 - - - - - |
                      E6 - G6 - E6 - | C6 - E6 - G6 - | F#6 - A6 - F#6 D6 | G6 - - - - -`;
const DAY_MELODY_A2 = `G5 - B5 - D6 - | G5 - C6 - E6 - | A5 - D6 - F#6 - | G6 - - - D6 - |
                       B5 - E6 - G6 - | E6 - C6 - G5 - | A5 - D6 - F#6 - | G6 - - - - -`;
const DAY_MELODY_B = `E6 - C6 - G5 - | D6 - B5 - G5 - | C6 - E6 - A5 - | G6 - E6 - B5 - |
                      C6 - E6 - G6 - | B5 - D6 - G6 - | A6 - F#6 - D6 - | F#6 - A5 - - -`;

const DAY_BASS_A = `G2 - - - - - | C3 - - - - - | D3 - - - - - | G2 - - - - - |
                    E2 - - - - - | C3 - - - - - | D3 - - - - - | G2 - - - D3 -`;
const DAY_BASS_B = `C3 - - - - - | G2 - - - - - | A2 - - - - - | E2 - - - - - |
                    C3 - - - - - | G2 - - - - - | D3 - - - - - | D3 - - - F#2 -`;

const DAY_COMP_A = `. . B3+D4 . B3+D4 . | . . C4+E4 . C4+E4 . | . . A3+F#4 . A3+F#4 . | . . B3+D4 . B3+D4 . |
                    . . G3+B3 . G3+B3 . | . . C4+E4 . C4+E4 . | . . A3+D4 . A3+F#4 . | . . B3+D4 . . .`;
const DAY_COMP_A2 = `. . B3+D4 . B3+D4 . | . . C4+E4 . C4+E4 . | . . A3+F#4 . A3+F#4 . | . . B3+D4 . B3+D4 . |
                     . . G3+B3 . G3+B3 . | . . C4+E4 . C4+E4 . | . . A3+F#4 . A3+F#4 . | . . B3+D4 . B3+D4 .`;
const DAY_COMP_B = `. . C4+E4 . C4+E4 . | . . B3+D4 . B3+D4 . | . . A3+C4 . A3+C4 . | . . G3+B3 . G3+B3 . |
                    . . C4+E4 . C4+E4 . | . . B3+D4 . B3+D4 . | . . A3+F#4 . A3+F#4 . | . . A3+F#4 . A3+F#4 .`;

const DAY_DRUMS = `w . h . h . | w . h . h . | w . h . h . | w . h . h . |
                   w . h . h . | w . h . h . | w . h . h . | w . h . w .`;
const DAY_DRUMS_PLAIN = `w . h . h . | w . h . h . | w . h . h . | w . h . h . |
                         w . h . h . | w . h . h . | w . h . h . | w . h . h .`;

export const DAY_SONG: SongDef = {
  title: 'ひる',
  level: 1.27,
  bpm: 108,
  beatsPerBar: 3,
  stepsPerBeat: 2,
  bars: 32,
  chords: [DAY_CHORDS_A, DAY_CHORDS_A, DAY_CHORDS_B, DAY_CHORDS_A].join(' '),
  tracks: [
    { inst: 'musicbox', notes: cat(DAY_MELODY_A, DAY_MELODY_A2, DAY_MELODY_B, DAY_MELODY_A) },
    { inst: 'mbass', notes: cat(DAY_BASS_A, DAY_BASS_A, DAY_BASS_B, DAY_BASS_A) },
    { inst: 'marimba', vol: 0.8, notes: cat(DAY_COMP_A, DAY_COMP_A2, DAY_COMP_B, DAY_COMP_A) },
    { drums: true, notes: cat(DAY_DRUMS, DAY_DRUMS_PLAIN, DAY_DRUMS_PLAIN, DAY_DRUMS) },
  ],
};

/* ----------------------------------------------------------------- よる（72・4 拍子・こだまつき） */
const NIGHT_CHORDS_P1 = 'F Dm Bb C';
const NIGHT_CHORDS_P3 = 'Gm Dm Bb C';

const NIGHT_MELODY_P1 = 'C6 - A5 - - - F5 - | D6 - A5 - - - F5 - | D6 - C6 - Bb5 - A5 - | G5 - - - - - - -';
const NIGHT_MELODY_P2 = 'A5 - C6 - F6 - - - | F5 - A5 - D6 - - - | D6 - Bb5 - F5 - D5 - | E5 - G5 - - - - -';
const NIGHT_MELODY_P3 = 'D6 - Bb5 - - - G5 - | A5 - D6 - - - F5 - | F6 - D6 - Bb5 - - - | G5 - E5 - C5 - - -';

const NIGHT_ARP_P1 = 'F3 C4 A4 C4 F3 C4 A4 C4 | D3 A3 F4 A3 D3 A3 F4 A3 | Bb2 F3 D4 F3 Bb2 F3 D4 F3 | C3 G3 E4 G3 C3 G3 Bb3 G3';
const NIGHT_ARP_P3 = 'G2 D3 Bb3 D3 G2 D3 Bb3 D3 | D3 A3 F4 A3 D3 A3 F4 A3 | Bb2 F3 D4 F3 Bb2 F3 D4 F3 | C3 G3 E4 G3 C3 G3 Bb3 G3';

const NIGHT_HUM_P1 = 'F4+A4 - - - - - - - | D4+F4 - - - - - - - | Bb3+D4 - - - - - - - | E4+G4 - - - - - - -';
const NIGHT_HUM_P3 = 'Bb3+D4 - - - - - - - | D4+F4 - - - - - - - | Bb3+D4 - - - - - - - | E4+G4 - - - - - - -';

const NIGHT_DRUMS = '. . h . . . h . | . . h . . . h . | . . h . . . h . | . . h . . . h .';

export const NIGHT_SONG: SongDef = {
  title: 'よる',
  level: 1.48,
  bpm: 72,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  chords: [NIGHT_CHORDS_P1, NIGHT_CHORDS_P1, NIGHT_CHORDS_P3, NIGHT_CHORDS_P1].join(' '),
  echo: { steps: 3, feedback: 0.3, mix: 0.45 },
  tracks: [
    { inst: 'musicbox', echo: 0.5, notes: cat(NIGHT_MELODY_P1, NIGHT_MELODY_P2, NIGHT_MELODY_P3, NIGHT_MELODY_P1) },
    { inst: 'marimba', vol: 0.6, notes: cat(NIGHT_ARP_P1, NIGHT_ARP_P1, NIGHT_ARP_P3, NIGHT_ARP_P1) },
    { inst: 'hum', notes: cat(NIGHT_HUM_P1, NIGHT_HUM_P1, NIGHT_HUM_P3, NIGHT_HUM_P1) },
    { drums: true, vol: 0.7, notes: cat(NIGHT_DRUMS, NIGHT_DRUMS, NIGHT_DRUMS, NIGHT_DRUMS) },
  ],
};

/* ----------------------------------------------------------------- たたかい（132・4 拍子） */
const BATTLE_CHORDS = 'Am F G C Am F G E';

const BATTLE_MELODY_P1 = `A5 . C6 . E6 . C6 . | F6 . E6 . C6 . A5 . | B5 . D6 . G6 - F6 . | E6 . D6 . C6 - - . |
                          A5 C6 E6 . A6 . E6 . | F6 E6 D6 . C6 . A5 . | B5 . C6 . D6 . E6 . | E6 - - - B5 . G#5 .`;
const BATTLE_MELODY_P2 = `A5 . A5 . C6 . E6 . | F6 . C6 . A5 . F5 . | G5 . B5 . D6 . G6 - | E6 . G6 . E6 . C6 . |
                          A5 C6 E6 . A6 - E6 . | F6 . A6 . C7 - A6 . | G6 . D6 . B5 . D6 . | E6 - - - B5 . G#5 .`;

const BATTLE_BASS = `A2 . A3 . A2 . A3 . | F2 . F3 . F2 . F3 . | G2 . G3 . G2 . G3 . | C3 . C4 . C3 . G2 . |
                     A2 . A3 . A2 . A3 . | F2 . F3 . F2 . F3 . | G2 . G3 . G2 . G3 . | E2 . E3 . E2 . B2 .`;
const BATTLE_COMP = `. C4+E4 . C4+E4 . C4+E4 . C4+E4 | . A3+C4 . A3+C4 . A3+C4 . A3+C4 | . B3+D4 . B3+D4 . B3+D4 . B3+D4 | . C4+E4 . C4+E4 . C4+E4 . C4+E4 |
                     . C4+E4 . C4+E4 . C4+E4 . C4+E4 | . A3+C4 . A3+C4 . A3+C4 . A3+C4 | . B3+D4 . B3+D4 . B3+D4 . B3+D4 | . G#3+B3 . G#3+B3 . G#3+B3 . G#3+B3`;
const BATTLE_DRUMS = `k h w h k h w h | k h w h k h w h | k h w h k h w h | k h w h k h w h |
                      k h w h k h w h | k h w h k h w h | k h w h k h w h | k h w h w w w w`;

export const BATTLE_SONG: SongDef = {
  title: 'たたかい',
  level: 1.0,
  bpm: 132,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  bars: 16,
  chords: `${BATTLE_CHORDS} ${BATTLE_CHORDS}`,
  tracks: [
    { inst: 'xylo', notes: cat(BATTLE_MELODY_P1, BATTLE_MELODY_P2) },
    { inst: 'mbass', notes: cat(BATTLE_BASS, BATTLE_BASS) },
    { inst: 'marimba', vol: 0.7, notes: cat(BATTLE_COMP, BATTLE_COMP) },
    { drums: true, notes: cat(BATTLE_DRUMS, BATTLE_DRUMS) },
  ],
};

export const BGM_SONGS: Record<BgmSong, SongDef> = { day: DAY_SONG, night: NIGHT_SONG, battle: BATTLE_SONG };
