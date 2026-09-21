const fs=require('fs'),vm=require('vm'),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const path='apps/web/lib/storefront-cart.ts';
if(!fs.existsSync(path)){console.error('FAIL: missing storefront-cart helper');process.exit(1)}
const src=fs.readFileSync(path,'utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports,require){${js}\n})(module,module.exports,require)`,{module:mod,exports:mod.exports,require,console});
const h=mod.exports;
function eq(actual,expected,label){const a=JSON.stringify(actual),e=JSON.stringify(expected);if(a!==e){console.error('FAIL:',label,'expected',e,'got',a);process.exit(1)}}
const extras=[{name:'Pepperoni extra',price:100},{name:'Queso extra',price:75}];
eq(h.cartKey('p1','Familiar',extras),'p1|Familiar|Pepperoni extra|Queso extra','stable sorted cart key');
let rows=[];
rows=h.mergeCartItem(rows,{key:'p1|Mediana|',product_id:'p1',name:'Pizza',image_url:'',quantity:1,base_price:200,unit_price:200,variant_name:'Mediana',extras:[]});
rows=h.mergeCartItem(rows,{key:'p1|Mediana|',product_id:'p1',name:'Pizza',image_url:'',quantity:2,base_price:200,unit_price:200,variant_name:'Mediana',extras:[]});
eq(rows.length,1,'merge identical config');eq(rows[0].quantity,3,'merge quantity');
rows=h.replaceCartItem(rows,'p1|Mediana|',{key:'p1|Familiar|',product_id:'p1',name:'Pizza',image_url:'',quantity:1,base_price:400,unit_price:400,variant_name:'Familiar',extras:[]});
eq(rows[0].variant_name,'Familiar','replace config');eq(rows[0].quantity,1,'replace quantity');
const w=h.weightedSaleConfig({attributes:{wamercio_weighted_sale:true,wamercio_weight_increment:0.25,wamercio_min_weight:0.5,wamercio_allow_amount_sale:true}});
eq(w,{enabled:true,unit:'lb',increment:0.25,minimum:0.5,allowAmount:true},'weighted config');
eq(h.quantityFromAmount(150,75),2,'amount to weight');
eq(h.roundQuantity(1.23456),1.235,'quantity precision');
console.log('PASS: WAMERCIO 2.5.6 cart helpers');
