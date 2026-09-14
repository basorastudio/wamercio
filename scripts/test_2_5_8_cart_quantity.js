const fs=require('fs'),vm=require('vm'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const path='apps/web/lib/storefront-cart.ts';
const src=fs.readFileSync(path,'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports,require){${js}\n})(module,module.exports,require)`,{module:mod,exports:mod.exports,require,console});
const h=mod.exports;
function eq(actual,expected,label){if(actual!==expected){console.error('FAIL:',label,'expected',expected,'got',actual);process.exit(1)}}
if(typeof h.initialProductQuantity!=='function'){console.error('FAIL: initialProductQuantity helper missing');process.exit(1)}
if(typeof h.normalizeStoredCart!=='function'){console.error('FAIL: normalizeStoredCart helper missing');process.exit(1)}
eq(h.initialProductQuantity({attributes:{}},undefined),1,'unit product starts at one');
eq(h.initialProductQuantity({attributes:{}},{quantity:3}),3,'existing unit line preserves quantity');
eq(h.initialProductQuantity({attributes:{wamercio_weighted_sale:true,wamercio_min_weight:0.25}},undefined),0.25,'weighted product starts at configured minimum');
eq(h.initialProductQuantity({attributes:{wamercio_weighted_sale:true,wamercio_min_weight:0.5}},{quantity:1.5}),1.5,'existing weighted line preserves quantity');
const migrated=h.normalizeStoredCart([{key:'x',product_id:'x',name:'Pan de ajo',image_url:'',quantity:0.25,base_price:150,unit_price:150,variant_name:'',extras:[],sale_mode:'unit',quantity_step:0.25}]);
eq(migrated[0].quantity,1,'legacy fractional unit quantity migrates to one');
eq(migrated[0].quantity_step,1,'legacy unit quantity step migrates to one');
console.log('PASS: WAMERCIO 2.5.8 initial product quantity');
