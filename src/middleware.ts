import { NextResponse, type NextRequest } from "next/server";

/**
 * Exact-case URL normalization: /3Dfy → /3dfy, /make3D → /make3d, /World → /world.
 * Done in middleware (not next.config redirects) because redirect source
 * matching is case-insensitive there and would loop.
 */
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  let target: string | null = null;
  if (path === "/3Dfy") target = "/3dfy";
  else if (path === "/make3D") target = "/make3d";
  else if (path.startsWith("/make3D/")) target = "/make3d" + path.slice("/make3D".length);
  else if (path === "/World") target = "/world";
  else if (path.startsWith("/World/")) target = "/world" + path.slice("/World".length);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/3Dfy", "/make3D", "/make3D/:path*", "/World", "/World/:path*"],
};
