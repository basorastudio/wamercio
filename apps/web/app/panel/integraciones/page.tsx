"use client";

import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {QRCodeSVG} from "qrcode.react";
import {api} from "@/lib/api";
import {Copy,Link2,MessageSquare,Power,Printer,QrCode,RefreshCw,Send,Trash2,Wifi,WifiOff} from "lucide-react";

const events=[
  ["order_created","Pedido creado"],
  ["order_accepted","Pedido aceptado"],
  ["order_preparing","Pedido preparando"],
  ["order_out_for_delivery","Pedido en camino"],
  ["order_completed","Pedido completado"],
  ["order_cancelled","Pedido cancelado"],
];

export default function Integrations(){
  const qc=useQueryClient();
  const status=useQuery({queryKey:["waxum-status"],queryFn:()=>api<any>("/api/v1/dashboard/whatsapp/status"),refetchInterval:3000,retry:false});
  const needQR=!!status.data?.configured&&!status.data?.is_logged_in&&["connecting","waiting_for_qr","waiting_for_pair_code","disconnected"].includes(status.data?.status||"disconnected");
  const qr=useQuery({queryKey:["waxum-qr"],queryFn:()=>api<any>("/api/v1/dashboard/whatsapp/qr"),enabled:needQR,refetchInterval:3500,retry:false});
  const integrations=useQuery({queryKey:["integrations"],queryFn:()=>api<any>("/api/v1/dashboard/integrations")});
  const pq=useQuery({queryKey:["printer-tokens"],queryFn:()=>api<any>("/api/v1/dashboard/printer-tokens")});
  const [event,setEvent]=useState("order_created");
  const [template,setTemplate]=useState("Hola {{cliente}}, recibimos tu pedido #{{pedido}} por {{total}}.");
  const [newPrinterToken,setNewPrinterToken]=useState("");
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [to,setTo]=useState("");
  const [testText,setTestText]=useState("Hola 👋 Este es un mensaje de prueba enviado desde wamercio mediante Waxum.");
  const [cta,setCTA]=useState({url:"https://",image_url:"",header_text:"Producto disponible",body_text:"Mira los detalles y compra directamente en nuestro catálogo.",display_text:"Ver producto",footer_text:"wamercio"});

  async function action(fn:()=>Promise<any>,success:string){setBusy(true);setMsg("");try{await fn();setMsg(success);await qc.invalidateQueries({queryKey:["waxum-status"]});await qc.invalidateQueries({queryKey:["waxum-qr"]})}catch(e:any){setMsg(e.message||"Ocurrió un error")}finally{setBusy(false)}}
  async function connect(){await action(()=>api("/api/v1/dashboard/whatsapp/connect",{method:"POST"}),"Sesión iniciada. Escanea el QR para vincular WhatsApp.")}
  async function disconnect(){await action(()=>api("/api/v1/dashboard/whatsapp/disconnect",{method:"POST"}),"WhatsApp desconectado temporalmente.")}
  async function unlink(){await action(()=>api("/api/v1/dashboard/whatsapp/session",{method:"DELETE"}),"Dispositivo desvinculado. Puedes enlazar otro número.")}
  async function saveTemplate(){await api("/api/v1/dashboard/notification-templates",{method:"PUT",body:JSON.stringify({Event:event,Channel:"whatsapp",TemplateText:template,Active:true})});setMsg("Plantilla guardada.");qc.invalidateQueries({queryKey:["integrations"]})}
  async function printer(){const d=await api<any>("/api/v1/dashboard/printer-tokens",{method:"POST",body:JSON.stringify({Name:"Impresora principal"})});setNewPrinterToken(d.token);qc.invalidateQueries({queryKey:["printer-tokens"]})}
  async function sendText(){await action(()=>api("/api/v1/dashboard/whatsapp/messages/text",{method:"POST",body:JSON.stringify({to,text:testText})}),"Mensaje de texto enviado.")}
  async function sendQuick(){await action(()=>api("/api/v1/dashboard/whatsapp/messages/quick-reply",{method:"POST",body:JSON.stringify({to,body_text:"¿Qué deseas hacer?",footer_text:"wamercio",buttons:[{id:"catalogo",display_text:"Ver catálogo"},{id:"pedido",display_text:"Mi pedido"},{id:"soporte",display_text:"Hablar con tienda"}]})}),"Quick Reply enviado.")}
  async function sendList(){await action(()=>api("/api/v1/dashboard/whatsapp/messages/list",{method:"POST",body:JSON.stringify({to,title:"Menú del comercio",description:"Selecciona una opción",button_text:"Ver opciones",footer:"wamercio",sections:[{title:"Compras",rows:[{row_id:"catalogo",title:"Ver catálogo",description:"Explorar productos"},{row_id:"pedidos",title:"Mis pedidos",description:"Consultar pedidos recientes"}]},{title:"Ayuda",rows:[{row_id:"soporte",title:"Contactar negocio",description:"Hablar con el comercio"}]}]})}),"Lista interactiva enviada.")}
  async function sendCTA(){await action(()=>api("/api/v1/dashboard/whatsapp/messages/cta-url",{method:"POST",body:JSON.stringify({to,...cta})}),"CTA URL enviado.")}

  const s=status.data;
  const connected=!!s?.is_logged_in&&!!s?.socket_alive;
  const qrValue=qr.data?.qr_codes?.[0]||"";

  return <div>
    <h1 className="text-3xl font-black">Integraciones</h1>
    <p className="mt-2 text-gray-500">WhatsApp con Waxum, automatizaciones e impresión.</p>
    {msg&&<div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3 text-sm font-bold text-orange-900">{msg}</div>}

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl bg-white p-5 shadow-soft xl:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-11 w-11 place-items-center rounded-2xl ${connected?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{connected?<Wifi/>:<WifiOff/>}</div>
            <div><h2 className="text-xl font-black">WhatsApp · Waxum</h2><p className="text-sm text-gray-500">Una sesión independiente por negocio. El token de Waxum permanece protegido en el servidor.</p></div>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-black ${connected?"bg-green-100 text-green-700":"bg-gray-100 text-gray-600"}`}>{connected?"CONECTADO":(s?.status||"DESCONECTADO").toUpperCase()}</div>
        </div>

        {!s?.configured&&<div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><b>Waxum todavía no está configurado por el SuperAdmin.</b><div className="mt-1 text-gray-600">Configura WAXUM_BASE_URL y WAXUM_SUPERADMIN_TOKEN en Dokploy.</div></div>}

        {s?.configured&&<div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-400">Estado</div><b>{s.status||"-"}</b></div>
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-400">Número</div><b>{s.phone_number||"Sin vincular"}</b></div>
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-400">Nombre</div><b>{s.push_name||"-"}</b></div>
              <div className="rounded-xl bg-gray-50 p-4"><div className="text-xs text-gray-400">Sesión</div><b className="break-all text-xs">{s.session_id||"Se creará al conectar"}</b></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!connected&&<button disabled={busy} onClick={connect} className="btn btn-brand"><QrCode size={17}/>Conectar WhatsApp</button>}
              {connected&&<button disabled={busy} onClick={disconnect} className="btn bg-gray-900 text-white"><Power size={17}/>Desconectar</button>}
              {s?.session_id&&<button disabled={busy} onClick={unlink} className="btn border border-red-200 bg-white text-red-600"><Trash2 size={17}/>Desvincular dispositivo</button>}
              <button onClick={()=>{status.refetch();qr.refetch()}} className="btn border border-gray-200 bg-white"><RefreshCw size={17}/>Actualizar</button>
            </div>
            <p className="mt-3 text-xs text-gray-400">Desconectar conserva la sesión para reconectar después. Desvincular elimina la sesión de Waxum y requiere un nuevo QR.</p>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4 text-center">
            {connected?<div className="grid min-h-56 place-items-center"><div><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-700"><Wifi size={30}/></div><b className="mt-3 block">WhatsApp vinculado</b><div className="text-sm text-gray-500">{s.phone_number}</div></div></div>:qrValue?<><QRCodeSVG value={qrValue} size={230} level="M" className="mx-auto"/><div className="mt-3 text-sm font-bold">Escanea con WhatsApp</div><div className="mt-1 text-xs text-gray-400">Dispositivos vinculados → Vincular dispositivo</div></>:<div className="grid min-h-56 place-items-center text-sm text-gray-400"><div><QrCode className="mx-auto mb-2"/>Pulsa “Conectar WhatsApp” para generar el QR.</div></div>}
          </div>
        </div>}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-soft xl:col-span-2">
        <div className="flex items-center gap-3"><MessageSquare className="text-[#ff5400]"/><div><h2 className="text-xl font-black">Pruebas de mensajes Waxum</h2><p className="text-sm text-gray-500">Prueba los tipos interactivos que utilizaremos en el catálogo.</p></div></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <input className="field lg:col-span-2" placeholder="WhatsApp destino: 809..., 829... o 849..." value={to} onChange={e=>setTo(e.target.value)}/>
          <div className="rounded-xl bg-gray-50 p-4"><b>Texto</b><textarea className="field mt-3 min-h-24" value={testText} onChange={e=>setTestText(e.target.value)}/><button disabled={!connected||!to||busy} onClick={sendText} className="btn btn-brand mt-3"><Send size={16}/>Enviar texto</button></div>
          <div className="rounded-xl bg-gray-50 p-4"><b>Mensajes interactivos</b><p className="mt-2 text-sm text-gray-500">Quick Reply de hasta 3 botones y lista por secciones.</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={!connected||!to||busy} onClick={sendQuick} className="btn btn-brand">Quick Reply</button><button disabled={!connected||!to||busy} onClick={sendList} className="btn border border-gray-200 bg-white">Lista interactiva</button></div></div>
          <div className="rounded-xl bg-gray-50 p-4 lg:col-span-2"><div className="flex items-center gap-2"><Link2 size={17}/><b>CTA URL con imagen</b></div><div className="mt-3 grid gap-3 md:grid-cols-2"><input className="field" placeholder="URL destino" value={cta.url} onChange={e=>setCTA({...cta,url:e.target.value})}/><input className="field" placeholder="URL pública de imagen (opcional)" value={cta.image_url} onChange={e=>setCTA({...cta,image_url:e.target.value})}/><input className="field" placeholder="Encabezado" value={cta.header_text} onChange={e=>setCTA({...cta,header_text:e.target.value})}/><input className="field" placeholder="Texto del botón" value={cta.display_text} onChange={e=>setCTA({...cta,display_text:e.target.value})}/><textarea className="field md:col-span-2" placeholder="Descripción" value={cta.body_text} onChange={e=>setCTA({...cta,body_text:e.target.value})}/></div><button disabled={!connected||!to||busy} onClick={sendCTA} className="btn btn-brand mt-3">Enviar CTA URL</button></div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <h2 className="text-xl font-black">Plantillas automáticas</h2>
        <select className="field mt-4" value={event} onChange={e=>setEvent(e.target.value)}>{events.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        <textarea className="field mt-3 min-h-32" value={template} onChange={e=>setTemplate(e.target.value)}/>
        <p className="mt-2 text-xs text-gray-400">Variables: {'{{cliente}}'}, {'{{pedido}}'}, {'{{total}}'}, {'{{negocio}}'}, {'{{estado}}'}.</p>
        <button onClick={saveTemplate} className="btn btn-brand mt-4">Guardar plantilla</button>
        <div className="mt-4 space-y-2">{(integrations.data?.templates||[]).map((x:any)=><button key={x.Event+x.Channel} onClick={()=>{setEvent(x.Event);setTemplate(x.TemplateText)}} className="block w-full rounded-xl bg-gray-50 p-3 text-left text-sm"><b>{x.Event}</b><div className="mt-1 line-clamp-2 text-gray-500">{x.TemplateText}</div></button>)}</div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3"><Printer className="text-[#ff5400]"/><div><h2 className="text-xl font-black">Impresión de pedidos</h2><p className="text-sm text-gray-500">Cola de impresión equivalente al sistema original.</p></div></div>
        <button onClick={printer} className="btn btn-brand mt-4">Generar token de impresora</button>
        {newPrinterToken&&<div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4"><b>Guarda este token ahora. No volverá a mostrarse.</b><div className="mt-2 flex gap-2"><code className="min-w-0 flex-1 break-all rounded bg-white p-3 text-xs">{newPrinterToken}</code><button onClick={()=>navigator.clipboard.writeText(newPrinterToken)} className="rounded-xl bg-white px-3"><Copy size={17}/></button></div><div className="mt-2 text-xs text-gray-500">El agente consulta GET /api/v1/public/printer/pending enviando X-Printer-Token.</div></div>}
        <div className="mt-4 grid gap-3">{(pq.data?.tokens||[]).map((x:any)=><div key={x.ID} className="rounded-xl bg-gray-50 p-4"><b>{x.Name}</b><div className="text-xs text-gray-400">{x.CreatedAt}</div></div>)}</div>
      </section>
    </div>
  </div>
}
