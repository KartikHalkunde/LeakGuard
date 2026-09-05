import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/health" || pathname === "/api/control-plane/ingest" || pathname === "/api/control-plane/github/webhook") {
    return NextResponse.next();
  }
  const user = process.env.LEAKGUARD_DASHBOARD_USER;
  const password = process.env.LEAKGUARD_DASHBOARD_PASSWORD;
  if (!user || !password) return NextResponse.next();
  const expected = `Basic ${btoa(`${user}:${password}`)}`;
  if (request.headers.get("authorization") === expected) return NextResponse.next();
  return new NextResponse("LeakGuard admin authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LeakGuard Organization", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
