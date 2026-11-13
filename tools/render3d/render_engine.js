const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:900,height:640},deviceScaleFactor:1});
p.on('console',m=>console.log('C',m.text().slice(0,300)));p.on('pageerror',e=>console.log('E',String(e).slice(0,400)));
await p.goto('http://127.0.0.1:8765/'+process.argv[2]);await p.waitForFunction(()=>window.__done,null,{timeout:60000});
const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));require('fs').writeFileSync(process.argv[3],Buffer.from(d.split(',')[1],'base64'));console.log(JSON.stringify(await p.evaluate(()=>window.__pts)));await b.close()})();
