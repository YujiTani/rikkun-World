/**
 * 全体の音のつなぎ（SOUND.md §3・§5）。AudioContext は このミキサーだけが作る。
 *
 *   BGM  → 曲ごとのフェード → BGM バス(bgmVolume) → 画面(screen) → タブ(hidden) → duck ┐
 *   効果音 → 効果音バス ───────────────────────────────────────────────────────────────┴→ 全体(masterVolume)
 *   → ミュート → リミッター → 天井 → スピーカー
 *
 * （画面の倍率とタブの 0 は §3 の図に無い 2 つのゲイン。つなぎ目を分けて、別々の秒数で変えるため）
 */
import { MIX, type AudioSettings } from './audioConfig';

export interface MasterChain {
  master: GainNode;
  mute: GainNode;
  bgmBus: GainNode;
  screen: GainNode;
  hidden: GainNode;
  duck: GainNode;
  sfxBus: GainNode;
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** 天井のカーブ: K まではそのまま、上は tanh で C までにおさえる（-1 dBFS を超えない） */
export function ceilingCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(4097);
  const { knee: K, max: C } = MIX.ceiling;
  for (let i = 0; i < curve.length; i++) {
    const x = i / 2048 - 1;
    const a = Math.abs(x);
    const y = a <= K ? a : K + (C - K) * Math.tanh((a - K) / (C - K));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** つなぎを作る（OfflineAudioContext でも使える。試聴ページの「数で見る」用） */
export function buildMasterChain(ctx: BaseAudioContext, s: AudioSettings): MasterChain {
  const lim = ctx.createDynamicsCompressor();
  const L = MIX.limiter;
  lim.threshold.value = L.threshold;
  lim.knee.value = L.knee;
  lim.ratio.value = L.ratio;
  lim.attack.value = L.attack;
  lim.release.value = L.release;
  const safe = ctx.createWaveShaper();
  safe.curve = ceilingCurve();
  lim.connect(safe);
  safe.connect(ctx.destination);
  const mute = ctx.createGain();
  mute.gain.value = s.audioMuted ? 0 : 1;
  mute.connect(lim);
  const master = ctx.createGain();
  master.gain.value = clamp01(s.masterVolume);
  master.connect(mute);
  const duck = ctx.createGain();
  duck.connect(master);
  const hidden = ctx.createGain();
  hidden.connect(duck);
  const screen = ctx.createGain();
  screen.connect(hidden);
  const bgmBus = ctx.createGain();
  bgmBus.gain.value = clamp01(s.bgmVolume);
  bgmBus.connect(screen);
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = MIX.sfx;
  sfxBus.connect(master);
  return { master, mute, bgmBus, screen, hidden, duck, sfxBus };
}

export type MixerContextState = 'none' | 'suspended' | 'running' | 'closed';

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private chain: MasterChain | null = null;
  private screenTarget = 1;
  private hiddenFlag = false;
  private holding = false;
  private duckUntil = -Infinity;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly s: AudioSettings,
    private readonly factory: () => AudioContext | null = defaultFactory,
  ) {}

  /** プレイヤーが押した・クリックした後に呼ぶ。ここで初めて AudioContext を作る（作れなくてもこわれない） */
  unlock(): void {
    if (!this.ctx) {
      let ctx: AudioContext | null = null;
      try {
        ctx = this.factory();
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      this.ctx = ctx;
      try {
        this.chain = buildMasterChain(ctx, this.s);
      } catch {
        this.ctx = null;
        this.chain = null;
        return;
      }
      const c = this.chain;
      c.screen.gain.value = this.screenTarget;
      c.hidden.gain.value = this.hiddenFlag ? 0 : 1;
      c.duck.gain.value = this.holding ? MIX.duck.amount : 1;
    }
    if (!this.hiddenFlag && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** 効果音バス。unlock 前・作れないときは null */
  output(): { ctx: AudioContext; destination: AudioNode } | null {
    if (!this.ctx || !this.chain) return null;
    return { ctx: this.ctx, destination: this.chain.sfxBus };
  }

  /** BGM バスの入口 */
  bgmInput(): AudioNode | null {
    return this.chain ? this.chain.bgmBus : null;
  }

  contextState(): MixerContextState {
    if (!this.ctx) return 'none';
    const st = this.ctx.state as string;
    return st === 'running' || st === 'closed' ? st : 'suspended';
  }

  /** 設定（音量・ミュート）を読み直して 0.05 秒以上かけて反映 */
  apply(): void {
    const c = this.chain;
    if (!c || !this.ctx) return;
    this.ramp(c.master.gain, clamp01(this.s.masterVolume), MIX.rampSeconds);
    this.ramp(c.bgmBus.gain, clamp01(this.s.bgmVolume), MIX.rampSeconds);
    this.ramp(c.mute.gain, this.s.audioMuted ? 0 : 1, MIX.rampSeconds);
  }

  /** BGM を下げてもどす（保つ 1.4 秒）。おめでとう画面で下げたままのときは何もしない */
  duck(): void {
    const c = this.chain;
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    const D = MIX.duck;
    this.duckUntil = t + D.attack + D.hold;
    if (this.holding) return;
    const g = c.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(D.amount, t + D.attack);
    g.setValueAtTime(D.amount, t + D.attack + D.hold);
    g.linearRampToValueAtTime(1, t + D.attack + D.hold + D.release);
  }

  /** おめでとう画面のあいだ下げたままにする（false で 1.0 秒でもどす） */
  holdDuck(on: boolean): void {
    if (on === this.holding) return;
    this.holding = on;
    const c = this.chain;
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    const g = c.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? MIX.duck.amount : 1, t + (on ? MIX.duck.attack : MIX.duck.release));
    if (!on) this.duckUntil = -Infinity;
  }

  /** duck() の最中か、おめでとう画面で下げたまま */
  ducking(): boolean {
    if (this.holding) return true;
    return !!this.ctx && this.ctx.currentTime < this.duckUntil;
  }

  /** 画面ごとの倍率（SOUND.md §5）。0.3 秒かけて */
  setScreenLevel(x: number): void {
    const v = clamp01(x);
    if (v === this.screenTarget) return;
    this.screenTarget = v;
    const c = this.chain;
    if (!c || !this.ctx) return;
    this.ramp(c.screen.gain, v, MIX.screenSeconds);
  }

  /** 目標の倍率（ならしている途中の値ではない） */
  screenLevel(): number {
    return this.screenTarget;
  }

  /** タブを見ていない: 0.8 秒で 0 → suspend。もどったら resume ＋ 1.5 秒で入る */
  setHidden(hidden: boolean): void {
    if (hidden === this.hiddenFlag) return;
    this.hiddenFlag = hidden;
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    const c = this.chain;
    const ctx = this.ctx;
    if (!c || !ctx) return;
    if (hidden) {
      this.ramp(c.hidden.gain, 0, MIX.hiddenFade);
      this.suspendTimer = setTimeout(
        () => {
          this.suspendTimer = null;
          if (this.hiddenFlag && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
        },
        MIX.hiddenFade * 1000 + 50,
      );
    } else {
      void ctx.resume().catch(() => undefined);
      this.ramp(c.hidden.gain, 1, MIX.hiddenReturn);
    }
  }

  private ramp(p: AudioParam, target: number, seconds: number): void {
    const t = this.ctx!.currentTime;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(target, t + seconds);
  }
}

function defaultFactory(): AudioContext | null {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}
