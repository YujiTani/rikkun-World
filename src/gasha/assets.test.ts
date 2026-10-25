import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BGM_FILE } from './gashaBgm';

/** #293 リリース: BGM と 少女の GLB が「公開版でも 読める 場所に、相対パスで、軽く」入っている ことを 見はる */
describe('がしゃどくろの 音・モデルの ファイル', () => {
  it('BGM は 相対パスで public/ の ogg を 指し、ファイルが 本当に ある（mp3 は 入れない）', () => {
    for (const url of Object.values(BGM_FILE)) {
      expect(url.startsWith('./')).toBe(true); // 公開版で 絶対パスは 404
      expect(url.endsWith('.ogg')).toBe(true);
      const file = 'public/' + url.slice(2);
      expect(existsSync(file), file).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 4).toString('latin1'), `${file} は ogg`).toBe('OggS');
      expect(bytes.length, `${file} の 大きさ`).toBeLessThan(2_500_000);
    }
    const dir = 'public/sound/gasha/bgm';
    expect(readdirSync(dir).filter((f) => /\.(mp3|wav|flac)$/i.test(f))).toEqual([]);
  });

  it('少女の GLB は public/ の 下に あり、gashaGirl.ts は 相対パスで そこを 読む', () => {
    const src = readFileSync('src/gasha/gashaGirl.ts', 'utf8');
    const m = /\.load\(\s*'(\.\/[^']+\.glb)'/.exec(src);
    expect(m, 'gashaGirl.ts の GLB の パス').not.toBeNull();
    const file = 'public/' + m![1]!.slice(2);
    expect(existsSync(file), file).toBe(true);
    expect(statSync(file).size).toBeLessThan(6_000_000); // もとは 9.4 MB
    const glb = readFileSync(file);
    expect(glb.subarray(0, 4).toString('latin1')).toBe('glTF');
    const jsonLen = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8')) as { meshes: { primitives: { attributes: Record<string, number> }[] }[]; skins?: unknown[]; animations?: unknown[]; accessors: { count: number }[] };
    const attrs = json.meshes.flatMap((mesh) => mesh.primitives.map((p) => p.attributes));
    for (const a of attrs) {
      expect(Object.keys(a)).not.toContain('TANGENT'); // 材質は MeshBasicMaterial に おきかえる ので 使わない
      for (const idx of Object.values(a)) expect(json.accessors[idx]).toBeDefined();
      expect(a.JOINTS_0).toBeDefined(); // 骨の 重みは のこす
      expect(a.WEIGHTS_0).toBeDefined();
    }
    expect(json.skins?.length).toBe(1);
    expect(json.animations?.length).toBe(1);
  });

  it('試作用の /__proto-gasha/ の 入り口は 公開の コードに のこらない', () => {
    for (const f of ['vite.config.ts', 'src/gasha/gashaBgm.ts', 'src/gasha/gashaGirl.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toContain("'./__proto-gasha/");
    }
    expect(readFileSync('vite.config.ts', 'utf8')).not.toContain('/__proto-gasha');
  });

  it('proto-assets/ には 少女の GLB を のこさない（public/ へ 移した）', () => {
    expect(existsSync('proto-assets/girl-rig/girl-cast.glb')).toBe(false);
  });
});
