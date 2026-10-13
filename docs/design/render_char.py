import re,sys
from PIL import Image,ImageDraw
src=open(sys.argv[1]).read()
blocks=re.findall(r"```\n(.*?)```",src,re.S)
def parse(b,nfront):
    fr,sd=[],[]
    for ln in b.splitlines():
        m=re.match(r"\s*(-?\d+)\s+(\S{36})(?:\s+(\S{24}))?",ln)
        if m: fr.append(m.group(2)); sd.append(m.group(3) or "")
    return fr,sd
f1,s1=parse(blocks[0],24); f2,_=parse(blocks[1],24)
import re as _r
base0={'K':'#23202A','k':'#3A3446','S':'#F2C49B','s':'#D9A57C','E':'#2E3A8C','W':'#FFFFFF','M':'#9A5A4A','G':'#3E8E3E','L':'#EDEDED','R':'#D23C4B','r':'#E86A8F','H':'#2F5E34','h':'#234628','B':'#24242A','b':'#4A4A52','O':'#EDEDED','Y':'#E0B020','T':'#1C1C22','A':'#2A2A33','a':'#4A4A58','F':'#E0B020','D':'#3A3A44','k':'#4A4458','U':'#2A2026','I':'#5A6FD0','P':'#F0A0A0','g':'#2E6B2E','u':'#2A2A30'}
base=dict(base0)
tbl=src.split('#### 色 の 表')[1].split('###')[0]
for ln in tbl.splitlines():
    m=_r.match(r"\|\s*([A-Za-z](?:\s*/\s*[A-Za-z])*)\s*\|(.*?)\|",ln)
    if not m: continue
    ks=[k.strip() for k in m.group(1).split('/')]; cs=_r.findall(r"#[0-9A-Fa-f]{6}",m.group(2))
    if ks==['O','Y','T']: cs=[cs[0],cs[2],cs[3]]
    for k,c in zip(ks,cs): base[k]=c
K0={'K':'#23202A','k':'#4A4458','U':'#2A2026','A':'#2A2A33','a':'#4A4A58'}
var={'こん':{},
 'みどり':dict(K0,G='#3E8E3E',g='#2E6B2E',H='#2F5E34',h='#234628',R='#D23C4B',r='#E86A8F'),
 'むらさき':dict(K0,G='#6B3FA0',g='#502E7A',H='#2F4A3A',h='#243A2D',R='#4B5BD0',r='#8FA0F0',A='#7A4A2A',a='#5A3520'),
 'くろ':dict(K0,G='#2E2E36',g='#1E1E24',H='#26262C',h='#1C1C22',R='#E04A8A',r='#F07AAE')}
P=5
def draw(img,x0,y0,rows,pal):
    d=ImageDraw.Draw(img)
    for y,r in enumerate(rows):
        for x,c in enumerate(r):
            if c in pal: d.rectangle([x0+x*P,y0+y*P,x0+x*P+P-1,y0+y*P+P-1],fill=pal[c])
colw=(36+24+36)*P+3*20; H=72*P+20
img=Image.new('RGB',(colw*4+20,H+40),'#c8d8c0')
d=ImageDraw.Draw(img)
for i,(n,v) in enumerate(var.items()):
    pal=dict(base);pal.update(v);x=10+i*colw
    draw(img,x,30+8*P,f1,pal);draw(img,x+36*P+10,30+8*P,s1,pal);draw(img,x+60*P+20,30,f2,pal)
    d.text((x,8),f"{i+1}. {n}",fill='black')
img.save(sys.argv[2])
