import os, sys
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE,'..','common'))
from w8kit import *; from models import *
from PIL import Image
outs=[]
for k,fn in MODELS.items():
    H=(0,1.1,0)
    row=[]
    for yaw in (90,0,45,135):
        cam=orbit_cam(add(H,(-1.2,0,0)),yaw,20,10,96,56)
        lay=render(fn(H,state(TIMELINE[2],3),cam),cam,bg=Image.new('RGBA',(96,56),(150,205,245,255)),outline=C['B3'])
        row.append(up(lay,4))
    outs.append(row)
W=sum(r.width+4 for r in outs[0]); Hh=len(outs)*(outs[0][0].height+4)
sh=Image.new('RGB',(W,Hh))
for j,r in enumerate(outs):
    x=0
    for im in r: sh.paste(im.convert('RGB'),(x,j*(im.height+4))); x+=im.width+4
sh.save('/tmp/claude-0/-home-user-rikkun-World/051e33fe-27d4-5f43-8b62-d6186aceedfa/scratchpad/q.png')
