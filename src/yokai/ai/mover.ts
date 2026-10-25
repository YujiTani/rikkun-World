import type { VoxelWorld } from '../../contracts';
import { fallDamage } from '../../combat/config';
import { bodyInWall } from '../../world/wall';
import { YOKAI_STATS } from '../stats';
import { boxFreeAt } from './body';
import { AI_CONST, KIND_AI, type YokaiConfig } from './config';
import { DT, type Ent, type YokaiField } from './entity';
import { flySurface, groundSupport } from './terrain';

interface MoverDeps {
  world: VoxelWorld;
  f: YokaiField;
  config: Pick<YokaiConfig, 'safeFallHeight' | 'fallDamagePerBlock'>;
}

/**
 * 歩く・ぶつかる係: 向きの方へ 進む（かべ・足場・みず・段差の きまり）、押される、重ならないように 押しあう。
 */
export class YokaiMover {
  constructor(private readonly d: MoverDeps) {}

  /** (dirx, dirz) へ distance だけ進む。ぶつかるときは軸ごとにずらす。進んだ距離を返す */
  walk(e: Ent, dirx: number, dirz: number, distance: number): number {
    const nx = e.x + dirx * distance;
    const nz = e.z + dirz * distance;
    if (this.place(e, nx, nz)) return distance;
    if (Math.abs(dirx) > 1e-6 && this.place(e, nx, e.z)) return Math.abs(dirx * distance);
    if (Math.abs(dirz) > 1e-6 && this.place(e, e.x, nz)) return Math.abs(dirz * distance);
    return 0;
  }

  /** (x, z) に動けるなら動く */
  private place(e: Ent, x: number, z: number): boolean {
    const { world, f, config } = this.d;
    const ai = e.dims;
    if (ai.flies) {
      const r = ai.radius;
      if (!bodyInWall(x, z, r, AI_CONST.edgeMargin)) return false;
      if (!world.isLoaded(Math.floor(x), Math.floor(z))) return false;
      const s = flySurface(world, x, z, e.y);
      if (s === null) return false;
      const ny = e.y + Math.max(-AI_CONST.hoverRate * DT, Math.min(AI_CONST.hoverRate * DT, s - e.y));
      const yy = ny + 0.5;
      if (!boxFreeAt(world, x - r, yy, z - r, x + r, ny + 1.7, z + r)) return false;
      e.x = x;
      e.z = z;
      return true;
    }
    const allowWater = !YOKAI_STATS[e.kind].avoidsWater;
    let t = groundSupport(world, x, z, e.y, ai, AI_CONST.maxDrop, allowWater);
    if (Number.isNaN(t) && (e.state === 'chase' || e.state === 'search') && f.py < e.y - AI_CONST.maxDrop) {
      // プレイヤーが下にいるときは、深い段差も歩いて降りる。みず の上・落ちて倒れる深さ・足場なしは降りない
      t = groundSupport(world, x, z, e.y, ai, AI_CONST.chaseMaxDrop, allowWater);
      if (
        !Number.isNaN(t) &&
        e.kind !== 'karakasa' && // からかさ は ゆらゆら落ちて ダメージなし
        world.getBlock(Math.floor(x), Math.floor(t), Math.floor(z)) !== 'water' &&
        fallDamage(e.y - t, config.safeFallHeight, config.fallDamagePerBlock) >= e.hp
      ) {
        t = NaN;
      }
    }
    if (Number.isNaN(t) && e.airSafe) {
      // 虹の はじきで 空を とんでいる 間: 足場が なくても 体の 箱が かべに 重ならなければ 横へ すすむ
      const r = ai.radius;
      if (!bodyInWall(x, z, r, AI_CONST.edgeMargin) || !world.isLoaded(Math.floor(x), Math.floor(z))) return false;
      if (!boxFreeAt(world, x - r, e.y + 0.05, z - r, x + r, e.y + ai.height, z + r)) return false;
      e.x = x;
      e.z = z;
      return true;
    }
    if (Number.isNaN(t)) return false;
    e.x = x;
    e.z = z;
    return true;
  }

  applyKnock(e: Ent): void {
    if (e.knockLeft <= 0) return;
    const step = e.knockT > 0 ? (e.knockTotal * 2 * e.knockLeft) / (e.knockT * (e.knockT + 1)) : e.knockStep;
    if (this.walk(e, e.knockDx, e.knockDz, step) <= 0) e.knockLeft = 0;
    else e.knockLeft--;
  }

  /** 妖怪どうし・プレイヤーと重ならないように軽く押しあう */
  separate(): void {
    const { f } = this.d;
    const ents = f.ents;
    const n = ents.length;
    for (let i = 0; i < n; i++) {
      const a = ents[i]!;
      if (a.state === 'dying' || a.state === 'leaving') continue;
      const ra = a.dims.radius;
      for (let j = i + 1; j < n; j++) {
        const b = ents[j]!;
        if (b.state === 'dying' || b.state === 'leaving') continue;
        const rb = b.dims.radius;
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = ra + rb;
        if (d >= min || Math.abs(a.y - b.y) > 1.5) continue;
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
        } else {
          dx /= d;
          dz /= d;
        }
        const push = Math.min(0.05, (min - d) / 2);
        if (b.state !== 'attack' && !b.stag) this.walk(b, dx, dz, push);
        if (a.state !== 'attack' && !a.stag) this.walk(a, -dx, -dz, push);
      }
      const dx = a.x - f.px;
      const dz = a.z - f.pz;
      const d = Math.hypot(dx, dz);
      const min = ra + AI_CONST.playerWidth / 2;
      if (!a.stag && d < min && f.py < a.y + a.dims.height && f.py + AI_CONST.playerHeight > a.y + (KIND_AI[a.kind].flies ? 0.5 : 0)) {
        const ux = d < 1e-6 ? 1 : dx / d;
        const uz = d < 1e-6 ? 0 : dz / d;
        this.walk(a, ux, uz, Math.min(0.08, min - d));
      }
    }
  }
}
