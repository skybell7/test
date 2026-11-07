// 공공데이터포털(data.go.kr) 공용 호출 로직
// Vercel 환경 변수 DATA_GO_KR_KEY 에 '일반 인증키(Decoding)' 를 넣으세요. (Encoding 키도 자동 인식)

export function hasKey() { return !!process.env.DATA_GO_KR_KEY; }

function encodedKey() {
  const k = process.env.DATA_GO_KR_KEY.trim();
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

export async function dataGoKr(base, params) {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = await fetch(`${base}?serviceKey=${encodedKey()}&${qs}`);
  const text = await r.text();
  if (text.trim().startsWith('<')) { // 인증 오류 등은 XML 로 옵니다
    const msg = (text.match(/<returnAuthMsg>([^<]*)/) || text.match(/<resultMsg>([^<]*)/) || [])[1] || 'XML 응답';
    throw new Error(`공공데이터포털 오류: ${msg}`);
  }
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new Error('공공데이터포털 응답을 해석할 수 없습니다.'); }
  const h = j?.response?.header;
  if (h && h.resultCode !== '00') throw new Error(`공공데이터포털 오류: ${h.resultCode} ${h.resultMsg}`);
  const items = j?.response?.body?.items?.item;
  return { items: !items ? [] : Array.isArray(items) ? items : [items], total: Number(j?.response?.body?.totalCount) || 0 };
}

// 한국 시간 기준 날짜 (YYYY-MM-DD)
export function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 864e5).toISOString().slice(0, 10);
}
