import { NextResponse, type NextRequest } from 'next/server';

// Lightweight gate: redirect to /login when there is no session cookie at all.
// The real session check happens server-side against SQLite in every page and API route.
export function middleware(req: NextRequest) {
  if (!req.cookies.get('fh_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!login|api|_next|favicon|icon|manifest|robots|apple-touch-icon|sw\\.js).*)'],
};
