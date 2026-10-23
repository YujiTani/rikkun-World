import sys, os
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.abspath(os.path.join(HERE,'..','..','..'))
def strip(path, cells, z=1, bg=(120,160,120,255)):
    im=Image.open(path); out=Image.new('RGBA',(len(cells)*256,256),bg)
    for i,(r,f) in enumerate(cells):
        out.alpha_composite(im.crop((f*256,r*256,f*256+256,r*256+256)),(i*256,0))
    return out
if __name__=='__main__':
    w=sys.argv[1]; mo=sys.argv[2]; cells=[tuple(map(int,c.split(','))) for c in sys.argv[3:-1]]
    src=os.path.join(ROOT,'art/char-sheets/girl',mo+'.png'); new=os.path.join(HERE,w,mo+'.png')
    a=strip(src,cells); b=strip(new,cells)
    o=Image.new('RGBA',a.size[:1]+(512,)); o.paste(a,(0,0)); o.paste(b,(0,256)); o.save(sys.argv[-1])
