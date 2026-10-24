/**
 * #293 試作: がしゃどくろの BGM の 共通の 係（ページに 1 つ。`window.__gashaBgm`）。
 *  ・少女「災厄」（saiyaku.mp3）と 大きな 姿「神々の 戯れ」（kamigami.mp3、作曲 こおろぎ）を ループで 流し、かえる とき クロスフェードする。
 *  ・流し方は ミキサーの BGM の 口（`bgmOut`）に つなぎ、ふだんの BGM は `suppressBgm` で 止める。音の ファイルが なければ 音なし。
 *  ・決まり: 一度でも 少女が 出たら（災厄が 流れたら）、そのあとは 大きな 姿の 曲を 頼まれても 流さない（休んで いる 間も。頼まれたら「災厄」を 流す）。
 *    少女が 出たと いう 記録は ページを 開いている 間 ずっと のこる（少女の 戦いは 休んでは また 出る くり返しなので）。`reset()` で けす。
 *  ・少女も 大きな 姿も 曲を 頼んで いない（白目に もどった）とき 止めて、ふだんの BGM に もどす。
 *  ・フェードの 秒と 音量は 調整表（gashaBigTuning.ts と gashaGirlTuning.ts の bgm）。
 * 使い方: 少女は `request('girl', true/false)`、大きな 姿は `request('big', true/false)` で 頼む。`step()` を 毎コマ 呼ぶ（なんども 呼んで よい）。
 */
import { TUNE as BIG } from './gashaBigTuning';
import { TUNE as GIRL } from './gashaGirlTuning';

export type BgmTrack = 'saiyaku' | 'kamigami';
export type BgmOwner = 'girl' | 'big';

export interface GashaBgmEnv {
  /** ゲームの BGM の ミキサー（BGM 音量の 設定に のる）。まだ 音が 使えない ときは null */
  bgmOut(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ふだんの BGM を 止める（がしゃどくろの 曲が 流れて いる 間） */
  suppressBgm(on: boolean, fade?: { outSec?: number; inSec?: number; delaySec?: number }): void;
  /** 音の ファイルを 読む（テスト用に 差しかえられる。なければ fetch） */
  loadFile?(url: string): Promise<ArrayBuffer>;
}

const FILE: Record<BgmTrack, string> = {
  saiyaku: './__proto-gasha/bgm/saiyaku.mp3',
  kamigami: './__proto-gasha/bgm/kamigami.mp3',
};
const TUNING: Record<BgmTrack, () => { fadeSec: number; volume: number }> = {
  saiyaku: () => GIRL.bgm,
  kamigami: () => BIG.bgm,
};
/** 曲の おわりの 無音（秒）。ここは ループに ふくめない（ffmpeg silencedetect で はかった） */
const TAIL_SILENCE: Partial<Record<BgmTrack, number>> = { kamigami: 0.55 };
const TRACKS: BgmTrack[] = ['saiyaku', 'kamigami'];

interface TrackState {
  buf: AudioBuffer | null;
  fetched: boolean;
  missing: boolean;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
  ctxStart: number;
}

export interface GashaBgmStatus {
  /** いま 流して いる 曲（フェードアウト中は 数えない） */
  playing: BgmTrack | null;
  /** 流す ことに なっている 曲（まだ 読みこみ中でも） */
  desired: BgmTrack | null;
  /** 少女が 出た ので 大きな 姿の 曲は 流さない */
  girlLock: boolean;
  wants: Record<BgmOwner, boolean>;
}

export class GashaBgm {
  private readonly want: Record<BgmOwner, boolean> = { girl: false, big: false };
  private girlLock = false;
  private desired: BgmTrack | null = null;
  private suppressed = false;
  /** この 時刻（音の 時計）まで 曲を はじめない（ふだんの BGM が フェードアウトする 間 まつ） */
  private holdUntil = 0;
  private readonly tr: Record<BgmTrack, TrackState> = {
    saiyaku: { buf: null, fetched: false, missing: false, src: null, gain: null, ctxStart: 0 },
    kamigami: { buf: null, fetched: false, missing: false, src: null, gain: null, ctxStart: 0 },
  };

  constructor(private readonly env: GashaBgmEnv) {}

  /** owner が 曲を 頼む / やめる。少女が 頼んだら その 戦いの あいだ 大きな 姿の 曲は 流れない */
  request(owner: BgmOwner, on: boolean): void {
    this.want[owner] = on;
    if (owner === 'girl' && on) this.girlLock = true;
    this.decide();
  }

  /** 少女が 出た 記録も けして、ぜんぶ 止める（テスト・スクショ用） */
  reset(): void {
    this.want.girl = this.want.big = false;
    this.girlLock = false;
    this.decide();
  }

  private decide(): void {
    const w = this.want;
    // 誰も 頼んで いない（白目）→ 止める。少女が 出た あとは 大きな 姿が 頼んでも「災厄」
    this.desired = w.girl ? 'saiyaku' : w.big ? (this.girlLock ? 'saiyaku' : 'kamigami') : null;
  }

  status(): GashaBgmStatus {
    const playing = TRACKS.find((k) => this.tr[k].src !== null) ?? null;
    return { playing, desired: this.desired, girlLock: this.girlLock, wants: { ...this.want } };
  }

  /** 曲ごとの 様子（デバッグ表示用） */
  info(track: BgmTrack): { file: 'none' | 'loading' | 'loaded' | 'missing'; started: boolean; duration: number; loop: boolean; loops: number; fade: number; ctx: string } {
    const t = this.tr[track];
    return {
      file: t.buf ? 'loaded' : t.missing ? 'missing' : t.fetched ? 'loading' : 'none',
      started: t.src !== null,
      duration: t.buf?.duration ?? 0,
      loop: t.src?.loop ?? false,
      loops: t.src && t.buf ? Math.floor((t.src.context.currentTime - t.ctxStart) / t.buf.duration) : 0,
      fade: t.gain ? Math.round(t.gain.gain.value * 100) / 100 : 0,
      ctx: t.src ? t.src.context.state : 'none',
    };
  }

  private load(track: BgmTrack): void {
    const t = this.tr[track];
    if (t.fetched) return;
    t.fetched = true;
    const get = this.env.loadFile
      ?? ((url: string) => fetch(url).then((r) => (r.ok && /audio/.test(r.headers.get('content-type') ?? '') ? r.arrayBuffer() : Promise.reject(new Error('no bgm')))));
    void get(FILE[track])
      .then(async (ab) => { const o = this.env.bgmOut(); const ctx = o?.ctx ?? new AudioContext(); t.buf = await ctx.decodeAudioData(ab); })
      .catch(() => { t.missing = true; });
  }

  /** 毎コマ 呼ぶ。頼まれた 曲を 流し、ほかの 曲は フェードアウトして 止める */
  step(): void {
    const want = this.desired;
    if (want !== null) this.load(want);
    const sup = want !== null;
    if (sup !== this.suppressed) {
      this.suppressed = sup;
      const B = BIG.bgm;
      if (sup) {
        // ふだんの BGM が フェードアウト → そのあと（overlapSec だけ 重ねて）がしゃどくろの 曲が フェードイン
        const o = this.env.bgmOut();
        if (o) this.holdUntil = o.ctx.currentTime + Math.max(0, B.normalFadeOutSec - B.overlapSec);
        this.env.suppressBgm(true, { outSec: B.normalFadeOutSec });
      } else {
        // がしゃどくろの 曲が フェードアウト → そのあと ふだんの BGM が フェードイン
        this.env.suppressBgm(false, { inSec: B.normalFadeInSec, delaySec: Math.max(0, B.fadeSec - B.overlapSec) });
      }
    }
    else if (sup) this.env.suppressBgm(true); // main 側の 旗が 別の 係に 下ろされて いても 立てなおす
    for (const k of TRACKS) {
      const t = this.tr[k];
      if (k !== want && t.src) { this.stop(k); continue; }
      if (k === want && !t.src && t.buf) this.start(k);
      else if (k === want && t.src && t.src.context.state === 'suspended') void (t.src.context as AudioContext).resume?.();
    }
  }

  private start(k: BgmTrack): void {
    const t = this.tr[k];
    const o = this.env.bgmOut();
    if (!o || !t.buf) return; // 音が まだ 使えない（あとで また）
    if (o.ctx.currentTime < this.holdUntil && !TRACKS.some((x) => x !== k && this.tr[x].src)) return; // ふだんの BGM の フェードアウトを まつ
    const cfg = TUNING[k]();
    const g = o.ctx.createGain();
    const now = o.ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(cfg.volume, now + Math.max(0.01, cfg.fadeSec));
    g.connect(o.bus);
    const src = o.ctx.createBufferSource();
    src.buffer = t.buf; src.loop = true;
    // ループの 範囲を はっきり きめる（曲の おわりの 無音は のぞく。decode の あと loopEnd が 0 の ままに ならないように）
    src.loopStart = 0;
    src.loopEnd = Math.max(0.1, t.buf.duration - (TAIL_SILENCE[k] ?? 0));
    src.connect(g);
    // 何かの 都合で 音源が おわって しまっても、まだ 頼まれて いれば 次の step() で 頭から また 流す
    src.onended = () => { if (t.src === src) { t.src = null; t.gain = null; try { g.disconnect(); } catch { /* むし */ } } };
    if (o.ctx.state === 'suspended') void o.ctx.resume?.();
    src.start(now);
    t.src = src; t.gain = g; t.ctxStart = now;
  }

  private stop(k: BgmTrack): void {
    const t = this.tr[k];
    const src = t.src, g = t.gain;
    t.src = null; t.gain = null;
    if (!src || !g) return;
    const ctx = src.context;
    const now = ctx.currentTime;
    const fade = Math.max(0.01, TUNING[k]().fadeSec);
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
      src.stop(now + fade + 0.05);
    } catch { /* すでに 止まって いる */ }
    src.onended = () => { try { g.disconnect(); } catch { /* むし */ } };
  }
}

/** ページに 1 つだけの 係（少女と 大きな 姿で 共有する）。はじめに 呼んだ 方の env を 使う */
export function sharedGashaBgm(env: GashaBgmEnv): GashaBgm {
  const w = globalThis as unknown as { __gashaBgm?: GashaBgm };
  if (!w.__gashaBgm) w.__gashaBgm = new GashaBgm(env);
  return w.__gashaBgm;
}
