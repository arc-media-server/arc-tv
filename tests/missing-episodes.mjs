// Focused browser regression: real Details/Spotlight, fixture API only. No TV playback claim.
// ARC_PLAYWRIGHT_PACKAGE points to an already installed @playwright/test; no dependency install.
import {createRequire} from 'node:module';
import {writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,expect}=require(process.env.ARC_PLAYWRIGHT_PACKAGE || '@playwright/test');
const origin='http://127.0.0.1:15179';
const entry='tests/.missing-preview';
writeFileSync(entry+'.html','<div id="root"></div><script type="module" src="/.missing-preview.tsx"></script>');
// Put the entry beside Vite's index for normal React refresh handling.
writeFileSync('.missing-preview.tsx',`
import {createRoot} from 'react-dom/client';
import {SpotlightRootDecorator} from '@enact/spotlight/SpotlightRootDecorator';
import {Details} from './src/screens/Details';
import {NavContext} from './src/lib/nav';
import {CardMenuContext} from './src/components/Cards';
import {configure} from './src/api';
import {useToast} from './src/lib/toast';
import './src/styles.css';
configure({server:location.origin,token:'fixture-only'});
window.calls={play:0,menu:0};
const nav={play:()=>window.calls.play++,open:()=>{},playExtra:()=>{},person:()=>{},collection:()=>{},playlist:()=>{},back:()=>{}};
function Preview(){const message=useToast();return <NavContext.Provider value={nav}><CardMenuContext.Provider value={()=>window.calls.menu++}><Details id="show"/><div className="toast">{message}</div></CardMenuContext.Provider></NavContext.Provider>}
const Root=SpotlightRootDecorator(Preview);createRoot(document.getElementById('root')).render(<Root/>);
`);
const vite=spawn('node_modules/.bin/vite',['--host','127.0.0.1','--port','15179','--strictPort'],{stdio:'ignore'});
let browser;
const ep=(n,available,season=2)=>({id:available?'disk-'+n:'',kind:'episode',title:'Episode '+n,season_number:season,episode_number:n,available,overview:'Synthetic episode description',runtime_min:20,user_data:{played:true}});
try{
 for(let i=0;i<40;i++){try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:.5});page.setDefaultTimeout(5000);
 const errors=[],requests=[];let fail=false,empty=false,slow=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url());requests.push({path:u.pathname,query:u.search,auth:req.headers().authorization,method:req.method(),body:req.postData()});
  if(u.pathname.endsWith('/seasons')){
   if(fail){fail=false;return route.fulfill({status:503,json:{error:'fixture offline'}});}
   const missing=u.searchParams.get('missing')==='1';
   if(slow){slow=false;await new Promise(r=>setTimeout(r,500));return route.fulfill({json:{seasons:[{season_number:99,episodes:[ep(2,true,99)]}]}});}
   return route.fulfill({json:{seasons:empty?[]:[...(missing?[{season_number:1,episodes:[ep(1,false,1)]}]:[]),{season_number:2,episodes:missing?[ep(1,false),ep(2,true),ep(3,false)]:[ep(2,true)]}],unplaced:[]}});
  }
  if(u.pathname.endsWith('/items/show'))return route.fulfill({json:{id:'show',kind:'series',title:'Synthetic Series',overview:'Generated metadata only',images:{},files:[]}});
  if(u.pathname.endsWith('/capabilities'))return route.fulfill({json:{features:{play_queues:{supported:true,available:true,allowed:true}}}});
  if(u.pathname.endsWith('/prefs'))return route.fulfill({json:{theme_music:false}});
  if(u.pathname.endsWith('/played'))return route.fulfill({status:204});
  return route.fulfill({json:[]});
 });
 await page.goto(origin+'/'+entry+'.html');
 const show=page.getByRole('button',{name:'Show Missing Episodes',exact:true});
 await expect(show).toBeVisible();await expect(page.locator('.episode-card')).toHaveCount(1);
 // Focus before keyboard input: pointer mode is not a remote-focus assertion.
 await show.focus();await page.keyboard.press('Enter');
 const hide=page.getByRole('button',{name:'Hide Missing Episodes',exact:true});
 await expect(hide).toBeFocused();await expect(page.locator('.tab.selected')).toHaveText('Season 2');
 await expect(page.locator('.episode-card')).toHaveCount(3);await expect(page.locator('.episode-card.missing')).toHaveCount(2);
 const missing=page.locator('.episode-card.missing').first().getByRole('button');
 await missing.focus();await page.keyboard.press('Enter');await missing.dispatchEvent('contextmenu');
 assert.deepEqual(await page.evaluate(()=>window.calls),{play:0,menu:0});
 if(process.env.ARC_SCREENSHOTS){mkdirSync(process.env.ARC_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.ARC_SCREENSHOTS+'/missing-episode.jpg',type:'jpeg',quality:83});}
 await page.getByRole('button',{name:'Season 1',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('button',{name:'Mark Season as Watched',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Shuffle Season',exact:true})).toHaveCount(0);
 await hide.focus();fail=true;await page.keyboard.press('Enter');
 await expect(page.getByText("Couldn't load episodes. Try again.")).toBeVisible();await expect(hide).toBeVisible();
 await page.keyboard.press('Enter');await expect(show).toBeVisible();await expect(page.locator('.tab.selected')).toHaveText('Season 2');
 // Older in-flight response must not replace newer season results.
 slow=true;await page.keyboard.press('Enter');await page.waitForTimeout(75);await page.keyboard.press('Enter');
 await expect(hide).toBeVisible();await page.waitForTimeout(550);await expect(page.getByRole('button',{name:'Season 99',exact:true})).toHaveCount(0);
 await hide.focus();await page.keyboard.press('Enter');await expect(show).toBeVisible();
 empty=true;await page.reload();await expect(page.getByText('No episodes on disk yet.')).toBeVisible();await expect(show).toBeVisible();
 assert.ok(requests.filter(r=>r.path.endsWith('/seasons')).every(r=>r.auth==='Bearer fixture-only'));
 assert.equal(requests.filter(r=>r.method!=='GET').length,0);
 assert.deepEqual(errors,[]);
 console.log('PASS: show/hide, stable season/focus, missing-only and empty seasons, unique missing cards, action guards, failure recovery, latest response, authenticated API');
}finally{
 await browser?.close();vite.kill();
 rmSync(entry+'.html',{force:true});rmSync('.missing-preview.tsx',{force:true});
}
