import sys, numpy as np
from PIL import Image, ImageFilter
def make(n, out, size=640):
    N=np.asarray(Image.open(f'ln/{n}_n.png').convert('RGBA')).astype(np.float32)/255
    C=np.asarray(Image.open(f'ln/{n}_c.png').convert('RGBA')).astype(np.float32)/255
    a=N[...,3]
    def grad(x):
        gx=np.zeros_like(x); gy=np.zeros_like(x); gx[:,1:-1]=x[:,2:]-x[:,:-2]; gy[1:-1,:]=x[2:,:]-x[:-2,:]; return np.hypot(gx,gy)
    e=sum(grad(N[...,i]) for i in range(3)); ea=grad(a)
    line=np.clip((e-0.22)*3.0,0,1); sil=np.clip(ea*4,0,1)
    L=Image.fromarray((np.maximum(line,sil)*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    L=np.asarray(L).astype(np.float32)/255; L=np.clip(L*1.4,0,1)
    lum=(C[...,:3].mean(-1))
    lum=np.clip(lum*1.1,0,1)
    base=np.array([0.05,0.16,0.21]); hi=np.array([0.30,0.62,0.70])
    fill=base+(hi-base)*(lum[...,None]**1.3)
    lc=np.array([0.80,0.97,1.0])
    rgb=fill*(1-L[...,None])+lc*L[...,None]
    alpha=np.clip(np.maximum(a*0.93,L),0,1)
    img=Image.fromarray((np.dstack([rgb,alpha])*255).astype(np.uint8),'RGBA').resize((size,size),Image.LANCZOS); img.save(out)
for n in sys.argv[1:]: make(n,f'ln/{n}.png')
