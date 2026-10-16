# CHAR-1 v2: 骨入りの 3D モデル（Meshy の .glb）を 8 方向 × 上下 3 段 から撮影して、ドット絵のコマ表にする。
# Blender の中で流す（Blender MCP の execute_blender_code に、このファイルの中身と 下の 設定 を渡す）。
#
# 設定（流す前に 上書きできる。書かなければ 既定）
#   GLB      : 読みこむ .glb（Meshy で 動きを付けて書き出したもの。Mixamo の骨）
#   MOTIONS  : [(名前, .glb の中の 動きの名前, コマ数[, 腰の高さを固定])]。コマは 動きの はじめから終わりまで 等しく とる。
#              名前は 前方一致（読みこみで .001 などが付いても 合う）。腰の高さを固定 = True のときは、
#              腰の 上下の動きを 消して写す（ジャンプなど。ゲームの体の 上下と 二重にならないように）
#   OUT_DIR  : 書き出し先。動きごとに <名前>.png（コマ表）と atlas.json（まとめ）
# コマ表: よこ = コマ、たて = 段 × 8 方向（段 0 = 水平、1 = 見下ろし 75 度、2 = 見上げ 75 度。
#         方向 0 = 正面、カメラが キャラの右へ 45 度ずつ まわる）。1 コマは CELL×CELL ドット。
# ドット絵にするとき: 1024 で撮影 → 4×4 ごとに、色見本（palette.json）で いちばん多い色（暗い色は 2.5 倍に 数える）。
import bpy, math, os, json, time
import numpy as np
from mathutils import Vector

HERE = '/Users/yuzunosk/games/rikkun-World/art/CHAR-1-v2/'
try:
    GLB
except NameError:
    GLB = HERE + 'kitty_rigged.glb'
try:
    MOTIONS
except NameError:
    MOTIONS = [('idle', 'Idle_4', 8), ('walk', 'Walking_Woman', 8), ('run', 'Run_03', 8), ('jump', 'Regular_Jump', 8, True)]
try:
    OUT_DIR
except NameError:
    OUT_DIR = '/Users/yuzunosk/games/rikkun-World/public/models/char/'

TIERS = [0, 75, -75]      # 段の カメラの 上下の角度（度）
CENTER = 0.95             # 撮影の まん中の 高さ（モデルの m）。ゲームの ATLAS.center と そろえる
SPAN = 2.0                # 正投影カメラが 写す たての はば（m）。ゲームの ATLAS.span
RENDER = 1024
CELL = 256
DARK_WEIGHT = 2.5

PAL = np.array(json.load(open(HERE + 'palette.json'))['colors'], np.float32)
K = len(PAL)
WGT = np.where(PAL @ np.array([0.3, 0.59, 0.11]) < 0.35, DARK_WEIGHT, 1.0)


def setup_scene():
    sc = bpy.data.scenes.get('char_sprites') or bpy.data.scenes.new('char_sprites')
    for o in list(sc.objects):
        bpy.data.objects.remove(o)
    bpy.context.window.scene = sc
    bpy.ops.import_scene.gltf(filepath=GLB)
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    for o in sc.objects:
        if o.type == 'MESH':
            o.hide_render = False
    cam_data = bpy.data.cameras.new('sprcam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = SPAN
    cam = bpy.data.objects.new('sprcam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    r = sc.render
    r.engine = 'BLENDER_WORKBENCH'
    r.resolution_x = r.resolution_y = RENDER
    r.resolution_percentage = 100
    r.film_transparent = True
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    sh = sc.display.shading
    sh.light = 'FLAT'
    sh.color_type = 'TEXTURE'
    sh.show_object_outline = False
    sh.show_shadows = False
    sh.show_cavity = False
    sc.view_settings.view_transform = 'Standard'
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks:
            t.mute = True
    return sc, arm, cam


def place(cam, i, elev, cx, cy, dz=0.0):
    a = math.radians(45 * i)
    e = math.radians(elev)
    d = 6
    tgt = Vector((cx, cy, CENTER + dz))
    cam.location = tgt + Vector((-math.sin(a) * math.cos(e) * d, -math.cos(a) * math.cos(e) * d, math.sin(e) * d))
    cam.rotation_euler = (math.radians(90) - e, 0, -a)


def pixelize(path):
    im = bpy.data.images.load(path, check_existing=False)
    p = np.array(im.pixels[:], np.float32).reshape(RENDER, RENDER, 4)[::-1]
    bpy.data.images.remove(im)
    a = p[..., 3] > 0.5
    L = np.full((RENDER, RENDER), -1, int)
    X = p[..., :3][a]
    lab = np.empty(len(X), int)
    for st in range(0, len(X), 60000):
        lab[st:st + 60000] = ((X[st:st + 60000, None] - PAL[None]) ** 2).sum(-1).argmin(1)
    L[a] = lab
    c = RENDER // CELL
    Lb = L.reshape(CELL, c, CELL, c).transpose(0, 2, 1, 3).reshape(CELL, CELL, c * c)
    out = np.zeros((CELL, CELL, 4), np.float32)
    for r, q in np.argwhere((Lb >= 0).sum(-1) >= c * c * 0.45):
        v = Lb[r, q]
        v = v[v >= 0]
        out[r, q, :3] = PAL[int((np.bincount(v, minlength=K) * WGT).argmax())]
        out[r, q, 3] = 1
    return out


def run():
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = bpy.app.tempdir + 'char_sprites/'
    os.makedirs(tmp, exist_ok=True)
    sc, arm, cam = setup_scene()
    hips = next(b for b in arm.pose.bones if 'hips' in b.name.lower())
    meta = {'cell': CELL, 'span': SPAN, 'center': CENTER, 'tiers': TIERS, 'dirs': 8, 'motions': {}}
    if os.path.exists(OUT_DIR + 'atlas.json'):   # 前に撮った動きは のこす（動きを 分けて撮れるように）
        meta['motions'] = json.load(open(OUT_DIR + 'atlas.json')).get('motions', {})
    for mo in MOTIONS:
        name, key, n = mo[:3]
        lock_z = len(mo) > 3 and mo[3]
        act = next(a for a in bpy.data.actions if a.name == key or a.name.startswith(key + '.'))
        ad = arm.animation_data
        ad.action = act
        # Blender 4.4 から 動きには「スロット」がある。つけないと ポーズが 動かない
        if hasattr(ad, 'action_slot') and len(getattr(act, 'slots', [])):
            ad.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        frames = [round(f0 + (f1 - f0) * k / n) for k in range(n)] if n > 1 else [round(f0)]
        base_z = None
        atlas = np.zeros((len(TIERS) * 8 * CELL, len(frames) * CELL, 4), np.float32)
        for fi, f in enumerate(frames):
            sc.frame_set(f)
            hp = arm.matrix_world @ hips.head   # 腰が まん中に くるように カメラを よこに ずらす
            if base_z is None:
                base_z = hp.z
            dz = max(0.0, hp.z - base_z) if lock_z else 0.0   # 上がる分だけ消す（しゃがむのは そのまま）
            for ti, e in enumerate(TIERS):
                for i in range(8):
                    place(cam, i, e, hp.x, hp.y, dz)
                    path = tmp + 'r.png'
                    sc.render.filepath = path
                    bpy.ops.render.render(write_still=True)
                    row = ti * 8 + i
                    atlas[row * CELL:(row + 1) * CELL, fi * CELL:(fi + 1) * CELL] = pixelize(path)
        o = bpy.data.images.new('atlas_' + name, atlas.shape[1], atlas.shape[0], alpha=True)
        o.pixels[:] = atlas[::-1].ravel()
        o.filepath_raw = OUT_DIR + name + '.png'
        o.file_format = 'PNG'
        o.save()
        bpy.data.images.remove(o)
        fps = sc.render.fps / sc.render.fps_base
        meta['motions'][name] = {'action': act.name, 'frames': len(frames), 'fps': round(len(frames) / max((f1 - f0) / fps, 1e-3), 2)}
        print(name, act.name, 'frames', len(frames), round(time.time() - t0, 1), 's')
    json.dump(meta, open(OUT_DIR + 'atlas.json', 'w'), indent=1, ensure_ascii=False)
    print('done', round(time.time() - t0, 1), 's')


run()
