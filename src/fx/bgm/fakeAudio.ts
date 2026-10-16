/**
 * テスト用の にせの AudioContext（ブラウザなしで「どう鳴らすと決めたか」を見る）。
 * つまみ（AudioParam）への予約を全部ためておき、つなぎ方（connect）も覚える。
 */
export interface ParamEvent {
  type: 'set' | 'linear' | 'exp' | 'cancel' | 'target';
  value: number;
  time: number;
}

export class FakeParam {
  value: number;
  readonly events: ParamEvent[] = [];
  constructor(v = 1) {
    this.value = v;
  }
  setValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'set', value: v, time: t });
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'linear', value: v, time: t });
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'exp', value: v, time: t });
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number): this {
    this.events.push({ type: 'target', value: v, time: t });
    this.value = v;
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.events.push({ type: 'cancel', value: 0, time: t });
    return this;
  }
  /** 最後の ramp（線の予約）。なければ undefined */
  lastRamp(): ParamEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.type === 'linear' || e.type === 'exp') return e;
    }
    return undefined;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  startedAt: number | null = null;
  stopAt: number | null = null;
  // どの種類でも持っておく（種類ごとの型は つくらない）
  gain = new FakeParam(1);
  frequency = new FakeParam(440);
  delayTime = new FakeParam(0);
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  Q = new FakeParam(1);
  type = 'sine';
  curve: Float32Array | null = null;
  buffer: unknown = null;
  loop = false;
  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {}
  connect(n: FakeNode): FakeNode {
    this.outputs.push(n);
    return n;
  }
  disconnect(): void {
    this.outputs.length = 0;
  }
  start(t = 0): void {
    this.startedAt = t;
  }
  stop(t = 0): void {
    this.stopAt = t;
  }
  setPeriodicWave(): void {}
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed';
  sampleRate = 48000;
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  resumeCalls = 0;
  suspendCalls = 0;
  constructor(initial: 'suspended' | 'running' = 'running') {
    this.state = initial;
    this.destination = new FakeNode('destination', this);
  }
  private make(kind: string): FakeNode {
    const n = new FakeNode(kind, this);
    this.nodes.push(n);
    return n;
  }
  createGain = () => this.make('gain');
  createOscillator = () => this.make('osc');
  createBiquadFilter = () => this.make('biquad');
  createBufferSource = () => this.make('source');
  createDelay = () => this.make('delay');
  createDynamicsCompressor = () => this.make('compressor');
  createWaveShaper = () => this.make('shaper');
  createPeriodicWave = () => ({});
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  /** kind のノードを つくった順に */
  all(kind: string): FakeNode[] {
    return this.nodes.filter((n) => n.kind === kind);
  }
  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
