// Optional focused browser checks using existing Playwright and pinned Chromium.
import {createRequire} from 'node:module';
import {writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,expect}=require(process.env.ARC_PLAYWRIGHT_PACKAGE||'@playwright/test');
const origin='http://127.0.0.1:15181';
writeFileSync('tests/.spoilers-preview.html','<div id="root"></div><script type="module" src="/.spoilers-preview.tsx"></script>');
writeFileSync('.spoilers-preview.tsx',`
import {createRoot} from 'react-dom/client';
import {SpotlightRootDecorator} from '@enact/spotlight/SpotlightRootDecorator';
import {Details} from './src/screens/Details';import {SettingsContent} from './src/screens/Settings';
import {MediaCard,cardFor} from './src/components/Cards';import {TitleSummary,ImmersiveBackdrop} from './src/components/Backdrop';
import {NavContext} from './src/lib/nav';import {configure} from './src/api';import {invalidatePrefs} from './src/lib/store';import {useToast} from './src/lib/toast';import './src/styles.css';
configure({server:location.origin,token:'fixture'});window.invalidatePrefs=invalidatePrefs;
const ep=JSON.parse(new URLSearchParams(location.search).get('episode')||'{}');
const nav={play:()=>{},open:()=>{},playExtra:()=>{},person:()=>{},collection:()=>{},playlist:()=>{},back:()=>{}};
function Preview(){const message=useToast();const mode=new URLSearchParams(location.search).get('mode');return <NavContext.Provider value={nav}>{mode==='settings'?<SettingsContent serverName="Fixture" onSwitchServer={()=>{}} onSignOut={()=>{}} onReady={()=>{}}/>:mode==='details'?<Details id="show"/>:<><ImmersiveBackdrop item={ep} delay={0}/><TitleSummary item={ep} meta={[]}/><MediaCard card={cardFor(ep)} look="thumb" onClick={()=>{}}/></>}<div className="toast">{message}</div></NavContext.Provider>}
const Root=SpotlightRootDecorator(Preview);createRoot(document.getElementById('root')).render(<Root/>);
`);
const vite=spawn('node_modules/.bin/vite',['--host','127.0.0.1','--port','15181','--strictPort'],{stdio:'ignore'});let browser;
const ep={id:'ep',parent_id:'show',kind:'episode',title:'Episode One',episode_number:1,season_number:1,overview:'SECRET EPISODE DESCRIPTION',images:{primary:'/api/items/ep/images/primary',series_backdrop:'/api/items/show/images/backdrop'},user_data:{played:false,position_ms:0}};
try{
 for(let i=0;i<40;i++){try{await fetch(origin);break;}catch{await new Promise(r=>setTimeout(r,100));}}
 browser=await chromium.launch({headless:true});
 async function scenario({hide=true,item=ep,mode='',delay=0,run}){
  if(process.env.ARC_CASE && mode!==process.env.ARC_CASE)return;
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:.5});page.setDefaultTimeout(5000);let current=hide,refuse=false;const images=[],patches=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());assert.equal(req.headers().authorization,'Bearer fixture');
   if(url.pathname.endsWith('/me/prefs')){
    if(req.method()==='PATCH'){patches.push(req.postDataJSON());if(refuse)return route.fulfill({status:503,json:{error:'fixture refused'}});current=req.postDataJSON().hide_spoilers;}
    if(delay)await new Promise(r=>setTimeout(r,delay));
    return route.fulfill({json:{hide_spoilers:current,theme_music:false}});
   }
   if(url.pathname.includes('/images/')){images.push(url.pathname);return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});}
   if(url.pathname.endsWith('/items/show'))return route.fulfill({json:{id:'show',kind:'series',title:'Synthetic Series',overview:'Safe show overview',images:{backdrop:'/api/items/show/images/backdrop'}}});
   if(url.pathname.endsWith('/seasons'))return route.fulfill({json:{seasons:[{season_number:1,episodes:[item]}]}});
   if(url.pathname.endsWith('/palette'))return route.fulfill({json:{available:false}});
   return route.fulfill({json:[]});
  });
  await page.goto(origin+'/tests/.spoilers-preview.html?mode='+mode+'&episode='+encodeURIComponent(JSON.stringify(item)));
  try{await run({page,images,patches,set:(h)=>current=h,refuse:(v)=>refuse=v});assert.deepEqual(errors,[]);}finally{await page.close();}
 }
 await scenario({delay:200,run:async({page,images,set})=>{
  await expect(page.getByText(ep.overview)).toHaveCount(0);await page.waitForTimeout(400);assert.ok(!images.some(x=>x.includes('/ep/')));assert.ok(images.some(x=>x.includes('/show/')));
  set(false);await page.evaluate(()=>window.invalidatePrefs());await expect(page.getByText(ep.overview)).toBeVisible();await expect.poll(()=>images.some(x=>x.includes('/ep/'))).toBe(true);
  set(true);await page.evaluate(()=>window.invalidatePrefs());await expect(page.getByText(ep.overview)).toHaveCount(0);
 }});
 for(const item of [{...ep,user_data:{played:true}},{...ep,user_data:{position_ms:1}}])await scenario({item,run:async({page,images})=>{await expect(page.getByText(ep.overview)).toBeVisible();await expect.poll(()=>images.some(x=>x.includes('/ep/'))).toBe(true);}});
 await scenario({item:{...ep,images:{primary:ep.images.primary}},run:async({page,images})=>{await page.waitForTimeout(350);assert.equal(images.length,0);await expect(page.getByText(ep.overview)).toHaveCount(0);}});
 await scenario({mode:'details',run:async({page,images})=>{await expect(page.getByText('Synthetic Series')).toBeVisible();await expect(page.locator('.episode-card')).toHaveCount(1);await page.waitForTimeout(250);assert.ok(!images.some(x=>x.includes('/ep/')));await expect(page.getByText(ep.overview)).toHaveCount(0);if(process.env.ARC_SCREENSHOTS){mkdirSync(process.env.ARC_SCREENSHOTS,{recursive:true});await page.locator('.episode-card .card-face').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);await page.screenshot({path:process.env.ARC_SCREENSHOTS+'/protected-episode.jpg',type:'jpeg',quality:83});}}});
 await scenario({hide:false,mode:'settings',run:async({page,patches,refuse})=>{
  const setting=page.getByRole('button').filter({hasText:'Hide Spoilers'});await expect(setting).toContainText('Off');await setting.focus();refuse(true);await page.keyboard.press('Enter');await expect(page.getByText("Couldn't save this setting. Try again.")).toBeVisible();await expect(setting).toContainText('Off');refuse(false);await page.keyboard.press('Enter');await expect(setting).toContainText('On');assert.deepEqual(patches,[{hide_spoilers:true},{hide_spoilers:true}]);
 }});
 console.log('PASS: protected cards/summary/backdrop/details, safe loading/no fallback, watched/resumed reveal, live preference change, Settings authenticated save/refusal/retry');
}finally{await browser?.close();vite.kill();rmSync('tests/.spoilers-preview.html',{force:true});rmSync('.spoilers-preview.tsx',{force:true});}
