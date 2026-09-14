const fs=require('fs'),vm=require('vm'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const path='apps/web/lib/customer-address-territory.ts';
if(!fs.existsSync(path)){console.error('FAIL: customer address territory helper missing');process.exit(1)}
const src=fs.readFileSync(path,'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports,require){${js}\n})(module,module.exports,require)`,{module:mod,exports:mod.exports,require,console,URLSearchParams});
const h=mod.exports;
function eq(actual,expected,label){const a=JSON.stringify(actual),e=JSON.stringify(expected);if(a!==e){console.error('FAIL:',label,'expected',e,'got',a);process.exit(1)}}
(async()=>{
 if(typeof h.loadAddressTerritory!=='function'){console.error('FAIL: loadAddressTerritory helper missing');process.exit(1)}
 const calls=[];
 const fakeApi=async path=>{
   calls.push(path);
   if(path.includes('/cities?')) return {data:[{cityId:'city-1',name:'Bonao'}]};
   if(path.includes('/neighborhoods?')) return {items:[{neighborhoodId:'hood-1',name:'Los Transformadores'}]};
   throw new Error('unexpected path '+path);
 };
 const out=await h.loadAddressTerritory(fakeApi,'28','city-1');
 eq(calls,[
   '/public/territories/cities?provinceCode=28',
   '/public/territories/neighborhoods?cityId=city-1'
 ],'saved province and city load dependent catalogs in order');
 eq(out.cities,[{cityId:'city-1',name:'Bonao'}],'cities are unwrapped');
 eq(out.neighborhoods,[{neighborhoodId:'hood-1',name:'Los Transformadores'}],'neighborhoods are unwrapped');

 calls.length=0;
 const provinceOnly=await h.loadAddressTerritory(fakeApi,'28','');
 eq(calls,['/public/territories/cities?provinceCode=28'],'province-only address does not request neighborhoods');
 eq(provinceOnly.neighborhoods,[],'province-only neighborhoods stay empty');
 console.log('PASS: WAMERCIO 2.5.8 saved customer territory hydration');
})().catch(e=>{console.error('FAIL:',e&&e.stack||e);process.exit(1)});
