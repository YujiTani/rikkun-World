"""PixelLab で 64x64 アイコンの 下絵を 作る（docs/design/ICON-64.md 9 章）。
要: 環境の 変数 PIXELLAB_SECRET（オーナーの API トークン）。ないと 何も しない。
呼ぶ 前と 後に /balance を 記録。--max で 呼ぶ 回数の 上限（既定 0 = 見積もり だけ）。
使い方: PIXELLAB_SECRET=... python3 art/ICON-64/pixellab/gen.py --max 8 [--endpoint create-image-pixflux]
"""
import argparse, base64, json, os, sys, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
API = 'https://api.pixellab.ai/v2'

def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + os.environ['PIXELLAB_SECRET'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)

def prompts():
    fam = json.load(open(os.path.join(HERE, 'families.json')))
    style = fam.pop('_style')
    for f, v in fam.items():
        if f == 'block': continue
        for iid in v['items']:
            yield iid, v['prompt'].format(name=iid.replace('_', ' '), desc=f) + ', ' + style

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--max', type=int, default=0); ap.add_argument('--endpoint', default='create-image-pixflux')
    a = ap.parse_args()
    todo = list(prompts())
    print(f'{len(todo)} 点 / 上限 {a.max} 回 / {a.endpoint}')
    if a.max == 0 or 'PIXELLAB_SECRET' not in os.environ:
        print('呼ばない（--max 0 か PIXELLAB_SECRET が ない）'); return
    log = {'endpoint': a.endpoint, 'balance_before': call('GET', '/balance'), 'calls': []}
    os.makedirs(os.path.join(HERE, 'raw'), exist_ok=True)
    for iid, p in todo[:a.max]:
        r = call('POST', '/' + a.endpoint, {'description': p, 'image_size': {'width': 64, 'height': 64}, 'no_background': True})
        job = r.get('background_job_id')
        while job:
            time.sleep(6); r = call('GET', f'/background-jobs/{job}')
            if r.get('status') in ('completed', 'failed'): break
        img = (r.get('last_response') or r).get('image') or (r.get('images') or [{}])[0]
        b64 = img.get('base64', '') if isinstance(img, dict) else ''
        if b64: open(os.path.join(HERE, 'raw', f'{iid}.png'), 'wb').write(base64.b64decode(b64.split(',')[-1]))
        log['calls'].append({'id': iid, 'job': job, 'ok': bool(b64)})
    log['balance_after'] = call('GET', '/balance')
    json.dump(log, open(os.path.join(HERE, 'log.json'), 'w'), ensure_ascii=False, indent=1)

main()
