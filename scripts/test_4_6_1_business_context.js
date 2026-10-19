'use strict'
/** Regression: storefront vocabulary, 16 templates, configurations and back-end contract. */
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'), requireWeb=createRequire(path.join(root,'apps/web/package.json'));
let ts;try{ts=requireWeb('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'wamercio-context-'));
function install(filename){const source=fs.readFileSync(path.join(root,'apps/web/lib',filename),'utf8');const transpiled=ts.transpileModule(source,{fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES5}});assert.equal((transpiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,filename+' invalid');fs.writeFileSync(path.join(temp,filename.replace(/\.ts$/,'.js')),transpiled.outputText)}
try{
 for(const name of ['merchant-modules.ts','business-language.ts','business-capabilities.ts'])install(name)
 const {getMerchantModules}=require(path.join(temp,'merchant-modules.js'))
 const {getBusinessCopy,businessCopyFields,businessCopyProfileSlugs,availableOrderStatuses}=require(path.join(temp,'business-language.js'))
 const {resolveBusinessCapabilities}=require(path.join(temp,'business-capabilities.js'))
 assert.equal(businessCopyProfileSlugs.length,16)
 assert.equal(new Set(businessCopyProfileSlugs).size,16)
 assert.equal(businessCopyFields.length,15)
 const seeded=fs.readFileSync(path.join(root,'services/api/migrations/000011_business_templates.up.sql'),'utf8')
 for(const slug of businessCopyProfileSlugs){
  const escaped=slug.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
  const engine=seeded.match(new RegExp("VALUES\\('"+escaped+"','[^']+','[^']+','[^']*','[^']*','([^']+)'") )?.[1]
  assert.ok(engine,`Seed absent: ${slug}`)
  const store={business_engine:engine,template_slug:slug}
  const copy=getBusinessCopy(store)
  for(const key of businessCopyFields)assert.ok(copy[key.key]&&typeof copy[key.key]==='string',`${slug}: ${key.key}`)
  const flags=getMerchantModules(store)
  if(engine==='services'){
   assert.equal(flags.tables,false,`${slug} tables`)
   assert.equal(flags.reservations,false,`${slug} restaurant reservations`)
   assert.equal(resolveBusinessCapabilities(store).requiresPayment,false,`${slug} appointment pending payment`)
   assert.match(copy.checkout_explanation,/confirm|horario|cupo|fecha/i,`${slug} should not claim confirmed appointment`)
  }
  if(engine!=='food')assert.equal(resolveBusinessCapabilities(store).supportsDineIn,false,`${slug} dining room`)
  if(engine==='food')assert.equal(resolveBusinessCapabilities(store).requiresPayment,true,`${slug} payment`)
 }
 const salon={business_engine:'services',template_slug:'salon-belleza'}
 assert.equal(getBusinessCopy(salon).checkout_action,'Solicitar cita')
 assert.equal(resolveBusinessCapabilities(salon).headerSubtitle,'Servicios y solicitudes de cita')
 assert.deepEqual(availableOrderStatuses('quote',salon).map(x=>x[0]),['pending','confirmed','preparing','ready','canceled'])
 assert.equal(getBusinessCopy({...salon,template_config:{interface_copy:{checkout_action:'Reservar ahora',notification_pending:'Recibido'}}}).checkout_action,'Reservar ahora')
 assert.notEqual(getBusinessCopy({...salon,template_config:{interface_copy:{checkout_action:'   '}}}).checkout_action,'')
 const api=fs.readFileSync(path.join(root,'services/api/internal/httpapi/server.go'),'utf8')
 assert.ok(api.includes('"template_slug": templateSlug'),'Public store must return template slug')
 assert.ok(api.includes('templateBoolDefault(config, "appointments", true)'),'Default appointment config differs in Go')
 assert.ok(api.includes('if currentStatus != in.Status {'),'Payment-only updates must not re-send operational notification')
 assert.ok(api.includes('flowType != "quote"'),'Quote should not trigger sales automations')
 const checkout=fs.readFileSync(path.join(root,'apps/web/components/storefront.tsx'),'utf8')
 assert.ok(checkout.includes('capabilities.copy.checkout_success'))
 assert.ok(checkout.includes('capabilities.copy.checkout_explanation'))
 const admin=fs.readFileSync(path.join(root,'apps/web/app/admin/templates/page.tsx'),'utf8')
 assert.ok(admin.includes('interface_copy'),'Template admin must edit merchant copy')
 console.log(`OK: ${businessCopyProfileSlugs.length} profiles, ${businessCopyFields.length} customizable labels; service/quote/payment/notification/portal regression checks`)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
