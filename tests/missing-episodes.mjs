// Focused browser regression: real Details/Spotlight, fixture API only. No TV playback claim.
// ARC_PLAYWRIGHT_PACKAGE points to an already installed @playwright/test; no dependency install.
// ARC_CHROMIUM optionally names a Chromium to use instead of that package's own.
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
import {handleBack} from './src/lib/back';
import './src/styles.css';
configure({server:location.origin,token:'fixture-only'});
// Back as App wires it: the newest menu takes it.
addEventListener('keydown',e=>{if(e.key==='Escape')handleBack();});
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
 browser=await chromium.launch({headless:true,executablePath:process.env.ARC_CHROMIUM||undefined});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:.5});page.setDefaultTimeout(5000);
 const errors=[],requests=[];let showMissing=false,empty=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url());requests.push({path:u.pathname,query:u.search,auth:req.headers().authorization,method:req.method(),body:req.postData()});
  if(u.pathname.endsWith('/seasons')){
   const missing=u.searchParams.get('missing')==='1';
   return route.fulfill({json:{seasons:empty?[]:[...(missing?[{season_number:1,episodes:[ep(1,false,1)]}]:[]),{season_number:2,episodes:missing?[ep(1,false),ep(2,true),ep(3,false),ep(4,true)]:[ep(2,true),ep(4,true)]}],unplaced:[]}});
  }
  if(u.pathname.endsWith('/items/show'))return route.fulfill({json:{id:'show',kind:'series',title:'Synthetic Series',overview:'Generated metadata only',images:{},files:[]}});
  if(u.pathname.endsWith('/capabilities'))return route.fulfill({json:{features:{play_queues:{supported:true,available:true,allowed:true}}}});
  if(u.pathname.endsWith('/prefs'))return route.fulfill({json:{theme_music:false,show_missing_episodes:showMissing}});
  if(u.pathname.endsWith('/played'))return route.fulfill({status:204});
  return route.fulfill({json:[]});
 });
 const seasonsAsked=()=>requests.filter(r=>r.path.endsWith('/seasons')).map(r=>r.query);
 const tab=(name)=>page.getByRole('button',{name,exact:true});
 const item=(name)=>page.locator('.popover-item',{hasText:name});
 // The setting off (the default): only what's on disk, and no missing-episodes button on the page.
 await page.goto(origin+'/'+entry+'.html');
 await expect(page.locator('.episode-card')).toHaveCount(2);
 assert.deepEqual(seasonsAsked(),['']);
 await expect(page.getByText('Show Missing Episodes')).toHaveCount(0);
 await expect(page.getByText('Shuffle Season')).toHaveCount(0);
 await expect(page.getByText('Mark Season as')).toHaveCount(0);
 // OK on the season's tab opens its menu, as on Android and in Kodi.
 // Focus before keyboard input: pointer mode is not a remote-focus assertion.
 await tab('Season 2').focus();await page.keyboard.press('Enter');
 await expect(page.locator('.popover-title')).toHaveText('Season 2');
 await expect(item('Shuffle Season')).toBeFocused();
 await expect(item('Mark Season as Unwatched')).toBeVisible();
 // Letting go of OK didn't choose anything; Back closes the menu.
 assert.equal(requests.filter(r=>r.method!=='GET').length,0);
 await page.keyboard.press('Escape');await expect(page.locator('.popover')).toHaveCount(0);
 // Holding OK (the key repeats while held, as on a remote) opens it too; letting go chooses nothing.
 // Then Mark Season as Unwatched: the season's on-disk episodes, by season number.
 await tab('Season 2').focus();
 await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
 await expect(page.locator('.popover-title')).toHaveText('Season 2');
 await item('Mark Season as Unwatched').focus();await page.keyboard.press('Enter');
 await expect(page.locator('.popover')).toHaveCount(0);
 await expect.poll(()=>requests.filter(r=>r.method!=='GET').map(r=>[r.method,r.path,JSON.parse(r.body)])).toEqual([['PUT','/api/v1/items/show/played',{played:false,season_number:2}]]);
 // The setting on: missing episodes are listed, dimmed, and can't be played or opened.
 showMissing=true;await page.reload();
 await expect(page.locator('.episode-card')).toHaveCount(4);await expect(page.locator('.episode-card.missing')).toHaveCount(2);
 assert.equal(seasonsAsked().at(-1),'?missing=1');
 await expect(page.locator('.tab.selected')).toHaveText('Season 2');
 const missing=page.locator('.episode-card.missing').first().getByRole('button');
 await missing.focus();await page.keyboard.press('Enter');await missing.dispatchEvent('contextmenu');
 assert.deepEqual(await page.evaluate(()=>window.calls),{play:0,menu:0});
 if(process.env.ARC_SCREENSHOTS){mkdirSync(process.env.ARC_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.ARC_SCREENSHOTS+'/missing-episode.jpg',type:'jpeg',quality:83});}
 // A season of only missing episodes has nothing to shuffle or mark, so no menu.
 await tab('Season 1').focus();await expect(page.locator('.tab.selected')).toHaveText('Season 1');
 await tab('Season 1').dispatchEvent('contextmenu');await page.keyboard.press('Enter');
 await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
 await expect(page.locator('.popover')).toHaveCount(0);
 empty=true;await page.reload();await expect(page.getByText('No episodes on disk yet.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Show Missing Episodes',exact:true})).toHaveCount(0);
 assert.ok(requests.filter(r=>r.path.endsWith('/seasons')).every(r=>r.auth==='Bearer fixture-only'));
 assert.equal(requests.filter(r=>r.method!=='GET').length,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: Show Missing Episodes from the profile setting (off and on), the season menu by OK and by holding OK (Shuffle Season, Mark Season as Unwatched, Back), no menu for a missing-only season, missing cards guarded, empty show, authenticated API');
}finally{
 await browser?.close();vite.kill();
 rmSync(entry+'.html',{force:true});rmSync('.missing-preview.tsx',{force:true});
}
