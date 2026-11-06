import type { P2State } from './p2State';
import { DUO_TUNING } from './tuning';
import type { DuoLeaveReason, P2Save } from './types';

export interface DuoSessionDeps {
  p2: P2State;
  /** やめる前に 呼ぶ（2P の 持ち物を セーブへ。AC7・AC17）。joined が まだ true の あいだに 呼ぶ */
  saveP2(p2: P2Save): void;
  /** 参加の とき 呼ぶ。前に 参加した ことが あれば その セーブ、なければ null（からっぽで 始める。AC7） */
  loadP2(): P2Save | null;
  /** 2P が いなく なった あと（joined が false に なってから）呼ぶ */
  onLeft?(reason: DuoLeaveReason): void;
}

/** 毎ステップ 渡す 入力（固定ステップ 1/60 秒） */
export interface DuoStepInput {
  /** 2P の パッドが つながって いる */
  padPresent: boolean;
  /** 2P の もちもの画面の「やめる」を 押している */
  quitHeld: boolean;
}

/** 参加・やめる・パッドぬけ・カメラの 引きを まとめる 小さな 状態機械（DOM・Three.js なし） */
export class DuoSession {
  private on = false;
  private quitSteps = 0;
  private lostSteps = 0;
  private lost = false;
  private camera: number = DUO_TUNING.cameraSolo;

  constructor(private readonly deps: DuoSessionDeps) {}

  get joined(): boolean {
    return this.on;
  }

  /** すぐ 参加させる。参加できたら true（もう 参加して いたら false） */
  join(): boolean {
    if (this.on) return false;
    const saved = this.deps.loadP2();
    if (saved) this.deps.p2.deserialize(saved);
    else this.deps.p2.clear();
    this.on = true;
    this.quitSteps = 0;
    this.lostSteps = 0;
    this.lost = false;
    return true;
  }

  /** 毎ステップ。長押し 120 ステップで 'quit'、パッドなし 3600 ステップで 'padLost' で やめる */
  step(input: DuoStepInput): void {
    this.easeCamera();
    if (!this.on) return;
    if (input.padPresent) {
      this.lost = false;
      this.lostSteps = 0;
    } else {
      this.lost = true;
      this.lostSteps++;
    }
    this.quitSteps = input.quitHeld ? this.quitSteps + 1 : 0;
    if (this.quitSteps >= DUO_TUNING.quitHoldSteps) this.leave('quit');
    else if (this.lostSteps >= DUO_TUNING.padLostSteps) this.leave('padLost');
  }

  /** 「やめる」の ゲージ 0〜1（120 ステップで 1。はなすと 0） */
  quitGauge(): number {
    return Math.min(1, this.quitSteps / DUO_TUNING.quitHoldSteps);
  }

  padLost(): boolean {
    return this.on && this.lost;
  }

  /** いなくなる: saveP2 → joined = false → onLeft の 順。いなければ 何もしない。'import'（よみこむ）だけは 保存しない（AC72） */
  leave(reason: DuoLeaveReason): void {
    if (!this.on) return;
    if (reason !== 'import') this.deps.saveP2(this.deps.p2.serialize());
    this.deps.p2.clear();
    this.on = false;
    this.quitSteps = 0;
    this.lostSteps = 0;
    this.lost = false;
    this.deps.onLeft?.(reason);
  }

  /** なめらかに 変わる カメラの 距離（1 人 4.0・2P が いる あいだ 5.0。§9.1。0.5 秒 = 30 ステップで とどく） */
  cameraDistance(): number {
    return this.camera;
  }

  cameraDistanceTarget(): number {
    return this.on ? DUO_TUNING.cameraSplit : DUO_TUNING.cameraSolo;
  }

  private easeCamera(): void {
    const target = this.cameraDistanceTarget();
    const speed = (DUO_TUNING.cameraSplit - DUO_TUNING.cameraSolo) / DUO_TUNING.cameraEaseSteps;
    const d = target - this.camera;
    this.camera = Math.abs(d) <= speed ? target : this.camera + Math.sign(d) * speed;
  }
}
