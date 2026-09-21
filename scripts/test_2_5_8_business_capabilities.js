const fs=require('fs')
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')
const path='apps/web/lib/business-capabilities.ts'
if(!fs.existsSync(path)){console.error('FAIL: business capabilities resolver missing');process.exit(1)}
const src=fs.readFileSync(path,'utf8')
const out=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText
const mod={exports:{}}
new Function('module','exports','require',out)(mod,mod.exports,require)
const {resolveBusinessCapabilities,normalizeCheckoutFields}=mod.exports
function assert(v,msg){if(!v){console.error('FAIL:',msg);process.exit(1)}}
let c=resolveBusinessCapabilities({business_engine:'food',template_config:{item_label:'pizza',item_label_plural:'pizzas',supports_variants:true,supports_extras:true,supports_dine_in:true,primary_action:'Pedir'}})
assert(c.itemLabel==='pizza'&&c.itemPlural==='pizzas','food labels')
assert(c.supportsVariants&&c.supportsExtras&&c.supportsDineIn,'food capabilities')
assert(c.primaryAction==='Comprar','standard commerce action stays Comprar')
c=resolveBusinessCapabilities({business_engine:'food',template_config:{requires_lead_time:false}})
assert(c.supportsDineIn===true,'food defaults to dine-in when it is not lead-time based')
c=resolveBusinessCapabilities({business_engine:'food',template_config:{requires_lead_time:true}})
assert(c.supportsDineIn===false,'lead-time food does not default to dine-in')
c=resolveBusinessCapabilities({business_engine:'services',template_config:{item_label:'servicio',appointments:true,pickup_enabled:true,checkout_fields:[{key:'fecha',label:'Fecha',type:'date',required:true}]}})
assert(c.isService&&c.appointments,'service capabilities')
assert(c.pickupLabel==='En el negocio','service pickup label')
assert(c.checkoutFields.length===1&&c.checkoutFields[0].required,'service checkout fields')
c=resolveBusinessCapabilities({business_engine:'services',template_config:{}})
assert(c.supportsVariants===false&&c.supportsExtras===false,'generic services must not inherit product modifiers')
c=resolveBusinessCapabilities({business_engine:'quotation',template_config:{quotation:true,primary_action:'Cotizar'}})
assert(c.quotation&&c.orderNoun==='solicitud','quotation noun')
assert(c.requiresPayment===false,'quotation must not require payment before approval')
c=resolveBusinessCapabilities({business_engine:'retail',template_config:{}})
assert(c.supportsVariants===true&&c.supportsExtras===false,'safe retail defaults')
assert(c.requiresPayment===true,'standard commerce requires payment selection')
const fields=normalizeCheckoutFields({checkout_fields:[{key:'mensaje tarjeta',label:'Mensaje',type:'textarea',required:false},{key:'tipo',label:'Tipo',type:'select',options:['A','B'],required:true},{key:'bad',label:'Bad',type:'script'}]})
assert(fields.length===2,'checkout field sanitization')
assert(fields[0].key==='mensaje_tarjeta','field key normalization')
console.log('PASS: business capability resolver')
