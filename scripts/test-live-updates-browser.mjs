// Optional genuine browser check: requires system Chromium, repository Vite and only fixture data.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let title='Fixture film', streams=new Set(), requestCount=0;
const fixture=createServer((req,res)=>{
 const path=new URL(req.url,'http://fixture').pathname;
 if(path==='/api/v1/events') {assert.equal(req.headers.authorization,'Bearer fixture-token');res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('id: opening\nevent: resync\ndata: {}\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
 const item={id:'fixture-film',kind:'movie',title,year:2026,runtime_min:90,user_data:{played:false,position_ms:120000},images:{},files:[{id:1,duration_ms:5400000}]};
 let data=[];
 if(path==='/api/v1/auth/status') data={signed_in:true,profile:{id:'fixture-profile',name:'Fixture',color:'teal'},profiles:[]};
 if(path==='/api/v1/me/prefs') data={home:[{id:'watchlist',hidden:true}]};
 if(path==='/api/v1/libraries') data=[];
 if(path==='/api/v1/home/continue'){data=[item];requestCount++;}
 if(path==='/api/v1/capabilities') data={features:{}};
 res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
});
await new Promise(r=>fixture.listen(18410,'127.0.0.1',r));
const vite=spawn('node_modules/.bin/vite',['--host','127.0.0.1','--port','18411','--strictPort'],{env:{...process.env,ARC_URL:'http://127.0.0.1:18410'}});
const chrome=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=18419','--user-data-dir=/tmp/arc-tv-live-browser','--window-size=960,540','about:blank']);
vite.stdout.on("data",d=>process.stdout.write(d));vite.stderr.on("data",d=>process.stdout.write(d));
let ws;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:18411');await fetch('http://127.0.0.1:18419/json/version');break;}catch{await pause(250);}}
 const tabs=await (await fetch('http://127.0.0.1:18419/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const waiting=new Map();ws.onmessage=e=>{const data=JSON.parse(e.data);if(data.method==='Runtime.exceptionThrown')console.log(JSON.stringify(data.params));if(data.id){const [resolve,reject]=waiting.get(data.id)||[];waiting.delete(data.id);if(data.error)reject(data.error);else resolve(data.result);}};
 const cmd=(method,params={})=>new Promise((resolve,reject)=>{waiting.set(++id,[resolve,reject]);ws.send(JSON.stringify({id,method,params}));});
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:960,height:540,deviceScaleFactor:1,mobile:false});await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});
 await cmd('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('arc.server',JSON.stringify({url:'',id:'fixture',name:'Fixture Arc'}));localStorage.setItem('arc.token','fixture-token');`});
 await cmd('Page.navigate',{url:'http://127.0.0.1:18411'});await pause(4500);
 const text=async()=> (await cmd('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true})).result.value;
 assert.match(await text(),/Fixture film/);assert.equal(streams.size,1);
 const folder='docs/changes/2026-11-17-live-updates';mkdirSync(folder,{recursive:true});
 const capture=async(name)=>{const shot=await cmd('Page.captureScreenshot',{format:'jpeg',quality:78});writeFileSync(`${folder}/${name}.jpg`,Buffer.from(shot.data,'base64'));};
 await capture('home-before-hint');
 const before=requestCount;title='Updated fixture film';for(const stream of streams)stream.write('id: update\nevent: invalidate\ndata: {"topic":"catalog"}\n\n');
 await pause(1900);assert.match(await text(),/Updated fixture film/);assert.equal(requestCount,before+1,'one Home row reload per batch');
 await capture('home-after-hint');
 console.log('Genuine repository Vite browser: one authenticated SSE stream, opening resync skipped, catalog hint quietly updated Home once; JPEG screenshots captured.');
}finally{ws?.close();vite.kill();chrome.kill();fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
