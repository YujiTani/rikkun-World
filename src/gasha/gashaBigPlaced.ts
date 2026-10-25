/**
 * #293 試作: プレイヤーが がしゃどくろの 体の 上に 置く ブロック（yuzu 2026-10-24「がしゃどくろのうえのどこにでも、ブロックが置ければok」
 * 「すき間にブロックはプレイヤーが橋作ればいいのかも気づいたら、そういう攻略もさせてあげたい」→ 特別な 橋の しくみは 作らない）。
 *
 * ・ねらい・置く マス・こわす は ワールドの ブロックと おなじ 感覚（体の 固い マスを 1 ブロックの 格子で ねらう。DigSystem が ワールドの ねらいと くらべる）。
 * ・置いた ブロックは「ねらった 体の 箱」の 関節（いちばん ちかい 部位）に くっついて、体と いっしょに うごく。ちょうど 1 ブロックの 固い 箱。
 *   のれる・ぶつかる（BigActor の 追加の 箱）。ふつうの ブロックの 絵（テクスチャの アトラス）。
 * ・数の 上限は 調整表 placed.max。がしゃどくろを 置きなおすと ぜんぶ 消える（試作）。
 * ・刀・矢・魔法は 置いた ブロックに 当たらない（怒りの 攻撃で 割れるかは あとで）。
 */
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { BlockId, Vec3, VoxelWorld } from '../contracts';
import { raycastBlocks } from '../dig/raycast';
import type { BodyAim, BodyBlocksPort } from '../dig/bodyBlocks';
import { BLOCK_TILES, createAtlasTexture, tileUv } from '../world/blocks/textures';
import type { BigActor, ExtraHit } from './gashaBigActor';
import type { BigModel, JointName } from './gashaBig';
import { rayBox } from './gashaBigHit';
import { maskHas } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';

/** 体に 置ける ブロック（ふつうの 立方体の ブロックだけ。こたつ・たんす・はたけ・たいまつ・草 などは ふくまない） */
export const BODY_PLACEABLE: ReadonlySet<BlockId> = new Set<BlockId>([
  'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'kawara', 'brick', 'snow', 'momiji_leaves', 'matsu_leaves',
]);

export interface PlacedBlock {
  id: BlockId;
  joint: JointName;
  /** 関節の 座標（もとの 座標 - 休みの 姿勢の 関節の 位置）での 中心 */
  p: Vector3;
  /** 関節の 向きに 対する 3 本の 軸（置いた ときの 世界の x・y・z）。y が 上 */
  ax: [Vector3, Vector3, Vector3];
  /** 関節の 座標での はんぶんの 大きさ（世界の 0.5 ブロック） */
  half: number;
}

export interface PlacedDeps {
  model(): BigModel | null;
  actor(): BigActor | null;
  /** 昼夜の 明るさの 係。あれば 材料を 登録する */
  lighting?: { registerTree(root: Object3D, group: 'doll'): number };
  /** 距離で 空の 色に 溶ける 処理を 材料に つける（体と おなじ） */
  patch?: (m: MeshBasicMaterial) => void;
  /** ガラスの 雲を 割る（中心・はんい・最大 数）。割れた 数を 返す */
  breakGlassAt?(c: Vec3, radius: number, max: number): number;
}

const SHADE = { top: 1.0, side: 0.84, side2: 0.72, bottom: 0.58 };

export class BodyPlaced implements BodyBlocksPort {
  private blocks: PlacedBlock[] = [];
  private meshes = new Map<JointName, Mesh>();
  private mat: MeshBasicMaterial | null = null;
  private last: { place: Vec3; joint: JointName | null } | null = null;
  private readonly fake: VoxelWorld;

  constructor(private readonly d: PlacedDeps) {
    const solid = (x: number, y: number, z: number): boolean => this.d.actor()?.solid(x, y, z) ?? false;
    this.fake = { getBlock: (x: number, y: number, z: number) => (solid(x, y, z) ? 'stone' : 'air'), isSolid: solid } as unknown as VoxelWorld;
  }

  get count(): number { return this.blocks.length; }
  list(): { id: BlockId; joint: JointName }[] { return this.blocks.map((b) => ({ id: b.id, joint: b.joint })); }

  accepts(block: BlockId): boolean { return BODY_PLACEABLE.has(block); }

  /** 体の 中心から x, z が perf.farDist より 遠い(重い 計算を 省く) */
  private far(x: number, z: number): boolean {
    const a = this.d.actor();
    return !a || Math.hypot(x - a.pos.x, z - a.pos.z) > T.perf.farDist;
  }

  aim(o: Vec3, dir: Vec3, reach: number): BodyAim | null {
    const a = this.d.actor();
    if (!a || this.far(o.x, o.z)) return null;
    const t = raycastBlocks(this.fake, o.x, o.y, o.z, dir.x, dir.y, dir.z, reach, true);
    if (!t) return null;
    const placed = this.findPlaced(t.block.x + 0.5, t.block.y + 0.5, t.block.z + 0.5);
    const bi = a.boxAt(t.block.x, t.block.y, t.block.z);
    this.last = { place: { ...t.place }, joint: placed ? placed.joint : bi >= 0 ? a.jointOfBox(bi) : null };
    const glass = !placed && this.isGlass(bi);
    return { cell: t.block, face: t.face, place: t.place, distance: t.distance, placed: placed ? placed.id : glass ? 'leaves' : null, glass };
  }

  canPlace(cell: Vec3, block: BlockId): boolean {
    const a = this.d.actor();
    return !!a && this.accepts(block) && this.blocks.length < T.placed.max && !a.solid(cell.x, cell.y, cell.z);
  }

  place(cell: Vec3, block: BlockId): boolean {
    const m = this.d.model(), a = this.d.actor();
    if (!m || !a || !this.canPlace(cell, block)) return false;
    let joint = this.last && this.last.place.x === cell.x && this.last.place.y === cell.y && this.last.place.z === cell.z ? this.last.joint : null;
    if (!joint) {
      // ねらいが 古い（テストなど）: となりの マスの 箱に つける
      for (const [dx, dy, dz] of [[0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0]] as const) {
        const bi = a.boxAt(cell.x + dx, cell.y + dy, cell.z + dz);
        if (bi >= 0) { joint = a.jointOfBox(bi); break; }
      }
    }
    if (!joint) return false;
    m.group.updateMatrixWorld(true);
    const M = m.joints[joint].matrixWorld;
    const q = new Quaternion(), sc = new Vector3(), pos = new Vector3();
    M.decompose(pos, q, sc);
    const inv = new Matrix4().copy(M).invert();
    const qi = q.clone().invert();
    const p = new Vector3(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5).applyMatrix4(inv);
    const ax: PlacedBlock['ax'] = [new Vector3(1, 0, 0).applyQuaternion(qi), new Vector3(0, 1, 0).applyQuaternion(qi), new Vector3(0, 0, 1).applyQuaternion(qi)];
    this.blocks.push({ id: block, joint, p, ax, half: 0.5 / sc.x });
    this.sync(joint);
    return true;
  }

  solid(x: number, y: number, z: number): boolean { return this.d.actor()?.solid(x, y, z) ?? false; }

  surfaceBelow(x: number, y: number, z: number): number | null {
    const a = this.d.actor();
    if (!a || this.far(x, z)) return null;
    const oy = y + 1.0, max = 9; // 見える 上面は 当たりの マスより 最大 1 ブロック 高い ことが ある ので 足の 1 ブロック 上から 見おろす
    let best = Infinity;
    const test = (b: { name: string; c: number[]; ax: number[]; half: number[]; mask?: Parameters<typeof maskHas>[0] }): void => {
      const t = rayBox(b, x, oy, z, 0, -1, 0, max);
      if (t === null || t <= 0 || t >= best) return;
      if (b.mask) {
        const hy = oy - t, dx = x - b.c[0]!, dy = hy - b.c[1]!, dz = z - b.c[2]!;
        const u = dx * b.ax[0]! + dy * b.ax[1]! + dz * b.ax[2]!, w = dx * b.ax[6]! + dy * b.ax[7]! + dz * b.ax[8]!;
        if (!maskHas(b.mask, u, w, b.half[0]!, b.half[2]!)) return;
      }
      best = t;
    };
    for (const b of a.boxList) test(b);
    for (const b of a.extraBoxes) test(b);
    return best === Infinity ? null : oy - best;
  }

  /** 箱の 番号 bi が ガラスの 雲（マスクの ある 箱）か */
  private isGlass(bi: number): boolean {
    const a = this.d.actor();
    return !!a && bi >= 0 && bi < a.hitBoxCount && !!a.boxList[bi]!.mask;
  }

  remove(cell: Vec3): BlockId | null {
    const f = this.findPlaced(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
    if (!f) {
      // ガラスの 雲の マス: 中心に いちばん ちかい ガラス 1 こを 割る
      const a = this.d.actor();
      if (a && this.isGlass(a.boxAt(cell.x, cell.y, cell.z))) this.d.breakGlassAt?.({ x: cell.x + 0.5, y: cell.y + 0.5, z: cell.z + 0.5 }, T.glass.digRadius, 1);
      return null;
    }
    const i = this.blocks.indexOf(f.block);
    if (i < 0) return null;
    this.blocks.splice(i, 1);
    this.sync(f.joint);
    return f.id;
  }

  /** 灰で 焼ける: 世界の 点 c から radius いないの 燃える ブロック（burnable の 名前）を 近い 順に 最大 max 個 消す。消した ものを 返す（restore で もどす）。当たりも 見た目も 作りなおす */
  burn(c: Vec3, radius: number, burnable: ReadonlySet<string>, max: number): PlacedBlock[] {
    const a = this.d.actor();
    if (!a) return [];
    const xs = a.extraBoxes, found: { b: PlacedBlock; d: number }[] = [];
    for (let i = 0; i < xs.length && i < this.blocks.length; i++) {
      const pb = this.blocks[i]!, bx = xs[i]!;
      if (!burnable.has(pb.id)) continue;
      const d = Math.hypot(bx.c[0] - c.x, bx.c[1] - c.y, bx.c[2] - c.z);
      if (d <= radius) found.push({ b: pb, d });
    }
    found.sort((p, q) => p.d - q.d);
    const out: PlacedBlock[] = [], joints = new Set<JointName>();
    for (const f of found.slice(0, max)) {
      const i = this.blocks.indexOf(f.b);
      if (i < 0) continue;
      this.blocks.splice(i, 1);
      out.push(f.b); joints.add(f.b.joint);
    }
    for (const j of joints) this.sync(j);
    return out;
  }

  /** burn で 消した ブロックを もどす（もどす 場所は もとの 関節の 座標） */
  restore(b: PlacedBlock): void {
    if (this.blocks.includes(b)) return;
    this.blocks.push(b);
    this.sync(b.joint);
  }

  /** がしゃどくろを 置きなおした / 消した: ぜんぶ 消す（見た目は モデルごと 消える） */
  reset(): void {
    this.blocks = [];
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.meshes.clear();
  }

  /** 世界の 点（マスの 中心）を ふくむ 置いた ブロック */
  private findPlaced(cx: number, cy: number, cz: number): { id: BlockId; joint: JointName; block: PlacedBlock } | null {
    const a = this.d.actor();
    if (!a) return null;
    const xs = a.extraBoxes;
    for (let i = 0; i < xs.length; i++) {
      const b = xs[i]!;
      const dx = cx - b.c[0], dy = cy - b.c[1], dz = cz - b.c[2];
      const e = 0.5 + 1e-3;
      if (Math.abs(dx * b.ax[0]! + dy * b.ax[1]! + dz * b.ax[2]!) <= e && Math.abs(dx * b.ax[3]! + dy * b.ax[4]! + dz * b.ax[5]!) <= e && Math.abs(dx * b.ax[6]! + dy * b.ax[7]! + dz * b.ax[8]!) <= e) {
        const pb = this.blocks[i]!;
        return { id: pb.id, joint: pb.joint, block: pb };
      }
    }
    return null;
  }

  /** 当たり（BigActor の 追加の 箱）と 見た目（関節ごとの メッシュ）を 作りなおす */
  private sync(joint: JointName): void {
    const m = this.d.model(), a = this.d.actor();
    if (!m || !a) return;
    const extras: ExtraHit[] = this.blocks.map((b) => ({ joint: b.joint, c: b.p.clone().add(m.rest[b.joint]), axes: b.ax, half: [b.half, b.half, b.half] }));
    a.setExtras(extras);
    this.rebuild(m, joint);
  }

  private material(): MeshBasicMaterial {
    if (this.mat) return this.mat;
    const mat = new MeshBasicMaterial({ map: createAtlasTexture(), vertexColors: true });
    this.d.patch?.(mat);
    this.mat = mat;
    if (this.d.lighting) {
      const g = new Group();
      g.add(new Mesh(new BufferGeometry(), mat));
      this.d.lighting.registerTree(g, 'doll');
    }
    return mat;
  }

  private rebuild(m: BigModel, joint: JointName): void {
    const mine = this.blocks.filter((b) => b.joint === joint);
    let mesh = this.meshes.get(joint);
    if (!mine.length) {
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); this.meshes.delete(joint); }
      return;
    }
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const n = new Vector3(), t1 = new Vector3(), t2 = new Vector3(), fc = new Vector3(), v = new Vector3(), e1 = new Vector3(), e2 = new Vector3(), cr = new Vector3();
    for (const b of mine) {
      const tiles = BLOCK_TILES[b.id] ?? BLOCK_TILES.stone!;
      const h = b.half;
      for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
        n.copy(b.ax[a]!).multiplyScalar(s);
        // 横の 面は 上（ax[1]）を 絵の 上に。上下の 面は ax[(a+1)%3] と ax[(a+2)%3]
        if (a === 1) { t1.copy(b.ax[2]!); t2.copy(b.ax[0]!); } else { t1.copy(b.ax[a === 0 ? 2 : 0]!); t2.copy(b.ax[1]!); }
        const tile = a === 1 ? (s > 0 ? tiles[0] : tiles[1]) : tiles[2];
        const [u0, v0, u1, v1] = tileUv(tile);
        const shade = a === 1 ? (s > 0 ? SHADE.top : SHADE.bottom) : a === 0 ? SHADE.side : SHADE.side2;
        fc.copy(b.p).addScaledVector(n, h);
        const base = pos.length / 3;
        const cs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (const [cu, cv] of cs) {
          v.copy(fc).addScaledVector(t1, cu * h).addScaledVector(t2, cv * h);
          pos.push(v.x, v.y, v.z);
          uv.push(cu < 0 ? u0 : u1, cv < 0 ? v0 : v1);
          col.push(shade, shade, shade);
        }
        // 外向きに 反時計まわり
        e1.set(pos[(base + 1) * 3]! - pos[base * 3]!, pos[(base + 1) * 3 + 1]! - pos[base * 3 + 1]!, pos[(base + 1) * 3 + 2]! - pos[base * 3 + 2]!);
        e2.set(pos[(base + 3) * 3]! - pos[base * 3]!, pos[(base + 3) * 3 + 1]! - pos[base * 3 + 1]!, pos[(base + 3) * 3 + 2]! - pos[base * 3 + 2]!);
        cr.crossVectors(e1, e2);
        if (cr.dot(n) > 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    g.setIndex(idx);
    if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; }
    else {
      mesh = new Mesh(g, this.material());
      mesh.frustumCulled = false;
      mesh.name = `placed_${joint}`;
      m.joints[joint].add(mesh);
      this.meshes.set(joint, mesh);
    }
  }
}
