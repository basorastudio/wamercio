import { NextRequest, NextResponse } from "next/server";
const reserved = new Set(["www","app","admin","api"]);
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const root = (process.env.ROOT_DOMAIN || process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost").toLowerCase();
  const url = req.nextUrl.clone();
  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api") || url.pathname.includes(".")) return NextResponse.next();
  let sub = "";
  if (host.endsWith("."+root)) sub = host.slice(0, -(root.length+1)).split(".")[0];
  else if (root==="localhost" && host.endsWith(".localhost")) sub=host.split(".")[0];
  if (sub && !reserved.has(sub) && !url.pathname.startsWith("/t/")) { url.pathname = `/t/${sub}${url.pathname === "/" ? "" : url.pathname}`; return NextResponse.rewrite(url); }
  return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
