// 병원 통계 페이지 입장 key 공용 로직 (middleware / api 에서 함께 사용)
export const COOKIE_NAME = 'clinic_auth';
export const SESSION_HOURS = 12;

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// 쿠키에는 key 자체가 아니라 key에서 파생한 토큰만 저장합니다.
// 환경 변수 CLINIC_ACCESS_KEY를 바꾸면 기존 로그인은 모두 무효가 됩니다.
export async function tokenFor(key) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`clinic-auth-v1:${key}`)));
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export async function isAuthorized(cookieHeader) {
  const key = process.env.CLINIC_ACCESS_KEY;
  if (!key) return false;
  const got = readCookie(cookieHeader, COOKIE_NAME);
  return !!got && safeEqual(got, await tokenFor(key));
}
