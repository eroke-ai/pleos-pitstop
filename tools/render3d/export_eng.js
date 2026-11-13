const { chromium } = require('playwright');
const J=[['engine_v2.html?glb=1','eng_oil',{cam:[6.6,2.9,7.6],target:[0.75,0.1,0],fov:27.5}],['engine_tv.html?m=plug&glb=1','eng_plug',{cam:[5.2,6.6,5.6],target:[0,1.62,.1],fov:14.5}],['engine_tv.html?m=mount&glb=1','eng_mount',{cam:[7.2,6.2,4.6],target:[.2,-.05,-.2],fov:17.5}]];
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
for(const [u,n,m] of J){const p=await b.newPage({viewport:{width:900,height:640}});p.on('pageerror',e=>console.log(n,'E',String(e).slice(0,300)));p.on('console',x=>{if(x.text().startsWith('ERR'))console.log(x.text())});
await p.goto('http://127.0.0.1:8765/'+u);await p.waitForFunction(()=>window.__done,null,{timeout:90000});const d=await p.evaluate(()=>window.__glb);require('fs').writeFileSync('glb/'+n+'.glb',Buffer.from(d,'base64'));
m.dir=m.cam.map((c,i)=>c-m.target[i]);m.ground=false;m.bevel=0.012;require('fs').writeFileSync('glb/'+n+'.json',JSON.stringify(m));console.log(n,d.length);await p.close()}
await b.close()})();
