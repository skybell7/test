// 병원 통계 페이지(/clinic) 와 리포트 API 를 입장 key 로 보호합니다.
// Vercel 환경 변수 CLINIC_ACCESS_KEY 를 설정해야 합니다. (미설정 시 접근 차단)
import { next } from '@vercel/functions';
import { isAuthorized } from './api/_lib/auth.js';

export const config = {
  matcher: ['/clinic', '/clinic/:path*', '/api/report'],
};

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/clinic/login.html') return next({ headers: PRIVATE_HEADERS });

  if (!process.env.CLINIC_ACCESS_KEY) {
    return new Response('CLINIC_ACCESS_KEY 환경 변수가 설정되지 않아 접근이 차단되었습니다.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...PRIVATE_HEADERS },
    });
  }

  if (await isAuthorized(request.headers.get('cookie'))) return next({ headers: PRIVATE_HEADERS });

  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
      status: 401, headers: { 'Content-Type': 'application/json; charset=utf-8', ...PRIVATE_HEADERS },
    });
  }
  const login = new URL('/clinic/login.html', url);
  return Response.redirect(login, 302);
}
