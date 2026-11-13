const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
for(const n of process.argv.slice(2)){const p=await b.newPage({viewport:{width:480,height:480}});p.on('pageerror',e=>console.log(n,'E',String(e).slice(0,300)));p.on('console',m=>{if(m.text().startsWith('ERR'))console.log(m.text())});
await p.goto('http://127.0.0.1:8765/parts.html?glb=1&p='+n);await p.waitForFunction(()=>window.__done,null,{timeout:60000});
const [d,dir]=await p.evaluate(()=>[window.__glb,window.__dir]);require('fs').writeFileSync('glb/'+n+'.glb',Buffer.from(d,'base64'));require('fs').writeFileSync('glb/'+n+'.json',JSON.stringify({dir}));console.log(n,d.length);await p.close()}
await b.close()})();
