// 대한민국 공휴일 — 한국천문연구원 특일정보 (공공데이터포털)
// GET /api/holidays?year=2026 → { source, days: { 'YYYY-MM-DD': { name, kind } } }
// kind: legal(법정공휴일) | substitute(대체공휴일) | temporary(임시공휴일)
import { hasKey, dataGoKr } from './_lib/datagokr.js';

const BASE = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

export function kindOf(name) {
  if (/대체/.test(name)) return 'substitute';
  if (/임시/.test(name)) return 'temporary';
  return 'legal';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const year = Number(req.query?.year);
  if (!(year >= 2000 && year <= 2100)) return res.status(400).json({ error: 'year 가 올바르지 않습니다.' });
  if (!hasKey()) return res.status(501).json({ error: 'DATA_GO_KR_KEY 미설정 — 내장 공휴일 목록을 사용합니다.' });
  try {
    const { items } = await dataGoKr(BASE, { solYear: year, numOfRows: 100, pageNo: 1, _type: 'json' });
    const days = {};
    for (const it of items) {
      if (it.isHoliday !== 'Y') continue;
      const s = String(it.locdate);
      const d = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      const name = String(it.dateName || '공휴일').trim();
      // 같은 날 두 공휴일이 겹치면 이름을 합칩니다 (예: 어린이날·부처님오신날)
      days[d] = days[d] ? { name: `${days[d].name}·${name}`, kind: days[d].kind === 'legal' ? 'legal' : kindOf(name) } : { name, kind: kindOf(name) };
    }
    return res.status(200).json({ source: 'kasi', year, days });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
