"use client";

function extractRings(geometry:any):number[][][]{
 if(!geometry?.coordinates)return[];
 if(geometry.type==="Polygon")return geometry.coordinates as number[][][];
 if(geometry.type==="MultiPolygon")return (geometry.coordinates as number[][][][]).flat();
 return[];
}
export function GeofencePreview({geometry,height=220}:{geometry:any;height?:number}){
 const rings=extractRings(geometry);const pts=rings.flat();if(!pts.length)return <div className="grid h-40 place-items-center rounded-2xl bg-gray-50 text-sm text-gray-400">Geometría no disponible</div>;
 const lngs=pts.map(p=>Number(p[0])),lats=pts.map(p=>Number(p[1]));const minX=Math.min(...lngs),maxX=Math.max(...lngs),minY=Math.min(...lats),maxY=Math.max(...lats);const pad=12,w=500,h=height;const dx=Math.max(maxX-minX,0.00001),dy=Math.max(maxY-minY,0.00001);
 const path=(ring:number[][])=>ring.map((p,i)=>{const x=pad+(Number(p[0])-minX)/dx*(w-pad*2);const y=h-pad-(Number(p[1])-minY)/dy*(h-pad*2);return `${i?"L":"M"}${x.toFixed(1)},${y.toFixed(1)}`}).join(" ")+" Z";
 return <div className="overflow-hidden rounded-2xl bg-slate-50"><svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Vista previa de la geocerca"><defs><pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 L 0 0 0 25" fill="none" stroke="currentColor" strokeOpacity=".07" strokeWidth="1"/></pattern></defs><rect width={w} height={h} fill="url(#grid)" className="text-slate-500"/>{rings.map((r,i)=><path key={i} d={path(r)} fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" className="text-[#ff5400]"/> )}</svg></div>
}
