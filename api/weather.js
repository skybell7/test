// 대한민국 날씨 — 기상청 지상(종관, ASOS) 일자료 (공공데이터포털)
// GET /api/weather?region=seoul&from=YYYY-MM-DD&to=YYYY-MM-DD
//   → { source:'kma', station, days: { 'YYYY-MM-DD': { t, n, p, s, c } } }
// ASOS 일자료는 '어제'까지만 제공되므로 오늘 날씨는 클라이언트가 예보 서비스로 보완합니다.
import { hasKey, dataGoKr, kstDate } from './_lib/datagokr.js';

const BASE = 'https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList';

// 지역 → 가장 가까운 기상청 종관기상관측소(ASOS) 지점번호
export const STATIONS = {
  seoul: [108, '서울'], incheon: [112, '인천'], suwon: [119, '수원'], seongnam: [119, '수원'], goyang: [108, '서울'],
  yongin: [119, '수원'], bucheon: [112, '인천'], hwaseong: [119, '수원'], chuncheon: [101, '춘천'], gangneung: [105, '강릉'],
  wonju: [114, '원주'], daejeon: [133, '대전'], sejong: [239, '세종'], cheongju: [131, '청주'], cheonan: [232, '천안'],
  jeonju: [146, '전주'], gwangju: [156, '광주'], mokpo: [165, '목포'], suncheon: [174, '순천'], daegu: [143, '대구'],
  pohang: [138, '포항'], gumi: [279, '구미'], andong: [136, '안동'], busan: [159, '부산'], ulsan: [152, '울산'],
  changwon: [155, '창원'], jinju: [192, '진주'], gimhae: [253, '김해'], jeju: [184, '제주'], seogwipo: [189, '서귀포'],
};

const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
// 기상청 일자료 → 화면용 날씨코드 (WMO 코드 체계에 맞춤: 0 맑음, 2 구름많음, 3 흐림, 61 비, 71 눈)
function codeOf(p, s, cloud) {
  if (s != null && s >= 0.5) return 71;
  if (p != null && p >= 1) return 61;
  if (cloud == null) return null;
  return cloud >= 8 ? 3 : cloud >= 5 ? 2 : 0;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const st = STATIONS[req.query?.region];
  if (!st) return res.status(400).json({ error: '지원하지 않는 지역입니다.' });
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let { from, to } = req.query;
  if (!re.test(from || '') || !re.test(to || '')) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
  if (!hasKey()) return res.status(501).json({ error: 'DATA_GO_KR_KEY 미설정' });
  const yesterday = kstDate(-1);
  if (to > yesterday) to = yesterday;
  if (from > to) return res.status(200).json({ source: 'kma', station: st[1], days: {} });
  // 한 번에 최대 3년치만
  if ((new Date(to) - new Date(from)) / 864e5 > 1100) return res.status(400).json({ error: '조회 기간이 너무 깁니다.' });

  try {
    const days = {};
    for (let page = 1; page <= 3; page++) {
      const { items, total } = await dataGoKr(BASE, {
        pageNo: page, numOfRows: 999, dataType: 'JSON', dataCd: 'ASOS', dateCd: 'DAY',
        startDt: from.replace(/-/g, ''), endDt: to.replace(/-/g, ''), stnIds: st[0],
      });
      for (const it of items) {
        const t = num(it.maxTa), n = num(it.minTa);
        if (t == null || n == null) continue;
        const p = num(it.sumRn) ?? 0;
        const s = num(it.ddMefs) ?? 0;
        days[it.tm] = { t, n, p, s, c: codeOf(p, s, num(it.avgTca)), src: 'kma' };
      }
      if (page * 999 >= total) break;
    }
    return res.status(200).json({ source: 'kma', station: st[1], days });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
