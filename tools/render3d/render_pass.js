const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
for(const n of process.argv.slice(2))for(const m of ['n','c']){const p=await b.newPage({viewport:{width:480,height:480}});p.on('pageerror',e=>console.log(n,'E',String(e).slice(0,300)));
await p.goto('http://127.0.0.1:8765/parts.html?pass='+m+'&p='+n);await p.waitForFunction(()=>window.__done,null,{timeout:40000});const d=await p.evaluate(()=>document.querySelector('canvas').toDataURL('image/png'));require('fs').writeFileSync('ln/'+n+'_'+m+'.png',Buffer.from(d.split(',')[1],'base64'));await p.close()}
await b.close()})();
