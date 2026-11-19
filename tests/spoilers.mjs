// Pure profile rule and non-mutating safe artwork selection; no browser or production server.
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const source=stripTypeScriptTypes(await readFile('src/lib/spoilers.ts','utf8'),{mode:'transform'});
const {spoilerHidden,spoilerSafeItem}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const ep={id:'ep',kind:'episode',overview:'Spoiler',images:{primary:'/episode-still',backdrop:'/episode-backdrop',series_backdrop:'/show-backdrop',series_primary:'/show-poster'},user_data:{}};
assert.ok(spoilerHidden(ep,true));
for(const item of [{...ep,kind:'movie'},{...ep,kind:'series'},{...ep,user_data:{played:true}},{...ep,user_data:{position_ms:1}}])assert.equal(spoilerSafeItem(item,true),item);
assert.equal(spoilerSafeItem(ep,false),ep);
const before=JSON.stringify(ep),safe=spoilerSafeItem(ep,true);
assert.equal(safe.overview,'');assert.equal(safe.images.primary,'/show-backdrop');assert.equal(safe.images.backdrop,'/show-backdrop');assert.equal(JSON.stringify(ep),before);
const noSeries={...ep,images:{primary:'/still',backdrop:'/still2'}};
assert.equal(spoilerSafeItem(noSeries,true).images.primary,undefined);
assert.equal(spoilerSafeItem(noSeries,true).images.backdrop,undefined);
assert.equal(spoilerSafeItem(noSeries,true,{images:{primary:'/poster',backdrop:'/parent'}}).images.primary,'/parent');
console.log('Spoiler rule: unstarted only, watched/resume/off/movie/series, safe fallback/placeholder and immutable source passed');
