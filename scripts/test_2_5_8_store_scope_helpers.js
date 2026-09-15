const fs=require('fs'),vm=require('vm'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const path='apps/web/lib/store-service-scope.ts';
if(!fs.existsSync(path)){console.error('FAIL: store service scope helper missing');process.exit(1)}
const src=fs.readFileSync(path,'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports,require){${js}\n})(module,module.exports,require)`,{module:mod,exports:mod.exports,require,console});
const h=mod.exports;
function eq(a,e,label){const aa=JSON.stringify(a),ee=JSON.stringify(e);if(aa!==ee){console.error('FAIL:',label,'expected',ee,'got',aa);process.exit(1)}}
eq(h.scopeFieldVisibility('national'),{province:true,municipality:true,neighborhood:true},'national fields');
eq(h.scopeFieldVisibility('provincial'),{province:false,municipality:true,neighborhood:true},'provincial fields');
eq(h.scopeFieldVisibility('municipal'),{province:false,municipality:false,neighborhood:true},'municipal fields');
const store={service_scope:'municipal',province_code:'28',province:'Monseñor Nouel',city_id:'bonao',municipality:'Bonao'};
const seeded=h.applyStoreScopeToAddress({province_code:'01',province:'Distrito Nacional',city_id:'dn',municipality:'Santo Domingo',neighborhood:'Centro'},store);
eq({province_code:seeded.province_code,province:seeded.province,city_id:seeded.city_id,municipality:seeded.municipality},{province_code:'28',province:'Monseñor Nouel',city_id:'bonao',municipality:'Bonao'},'municipal fixed territory');
console.log('PASS: store scope frontend helpers');
