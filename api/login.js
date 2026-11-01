import { COOKIE_NAME, SESSION_HOURS, tokenFor, safeEqual } from './_lib/auth.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const accessKey = process.env.CLINIC_ACCESS_KEY;
  if (!accessKey) return res.status(503).json({ error: '서버에 입장 key(CLINIC_ACCESS_KEY)가 설정되지 않았습니다.' });

  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  const [given, expected] = await Promise.all([tokenFor(key), tokenFor(accessKey)]);
  if (!key || !safeEqual(given, expected)) {
    await sleep(1200); // 무차별 대입 지연
    return res.status(401).json({ error: '입장 key가 올바르지 않습니다.' });
  }

  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${expected}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`);
  return res.status(200).json({ ok: true });
}
