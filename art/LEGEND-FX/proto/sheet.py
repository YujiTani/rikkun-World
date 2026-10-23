import sys
from PIL import Image
d='frames2/'+sys.argv[1]+'/'; ns=[int(x) for x in sys.argv[2].split(',')]; cols=int(sys.argv[3]) if len(sys.argv)>3 else 2; sc=float(sys.argv[4]) if len(sys.argv)>4 else .5
ims=[Image.open(d+'%04d.png'%n) for n in ns]; w,h=[int(v*sc) for v in ims[0].size]
rows=(len(ns)+cols-1)//cols; sh=Image.new('RGB',(w*cols,h*rows))
for k,im in enumerate(ims): sh.paste(im.resize((w,h)),((k%cols)*w,(k//cols)*h))
sh.save(d+'sheet.png')
