/* =====================================================================
   weather.js — 일별 날씨
   1순위: 기상청 종관기상관측(ASOS) 일자료 — 웹 배포 + DATA_GO_KR_KEY 설정 시 /api/weather 경유
   2순위: Open-Meteo (무료, 키 불필요) — 기상청 미설정 시, 그리고 '오늘'처럼 관측 일자료가 아직 없는 날
   어느 쪽이든 병원 '지역(시 단위)'만 전송하며 진료 데이터는 전송하지 않습니다.
   ===================================================================== */
const REGIONS = {
  none: { name: '사용 안 함' },
  seoul: { name: '서울', lat: 37.57, lon: 126.98 }, incheon: { name: '인천', lat: 37.46, lon: 126.71 },
  suwon: { name: '수원', lat: 37.26, lon: 127.03 }, seongnam: { name: '성남', lat: 37.42, lon: 127.13 },
  goyang: { name: '고양', lat: 37.66, lon: 126.83 }, yongin: { name: '용인', lat: 37.24, lon: 127.18 },
  bucheon: { name: '부천', lat: 37.50, lon: 126.78 }, hwaseong: { name: '화성', lat: 37.20, lon: 126.83 },
  chuncheon: { name: '춘천', lat: 37.88, lon: 127.73 }, gangneung: { name: '강릉', lat: 37.75, lon: 128.88 },
  wonju: { name: '원주', lat: 37.34, lon: 127.92 }, daejeon: { name: '대전', lat: 36.35, lon: 127.38 },
  sejong: { name: '세종', lat: 36.48, lon: 127.29 }, cheongju: { name: '청주', lat: 36.64, lon: 127.49 },
  cheonan: { name: '천안', lat: 36.81, lon: 127.11 }, jeonju: { name: '전주', lat: 35.82, lon: 127.15 },
  gwangju: { name: '광주', lat: 35.16, lon: 126.85 }, mokpo: { name: '목포', lat: 34.81, lon: 126.39 },
  suncheon: { name: '순천', lat: 34.95, lon: 127.49 }, daegu: { name: '대구', lat: 35.87, lon: 128.60 },
  pohang: { name: '포항', lat: 36.02, lon: 129.34 }, gumi: { name: '구미', lat: 36.12, lon: 128.34 },
  andong: { name: '안동', lat: 36.57, lon: 128.73 }, busan: { name: '부산', lat: 35.18, lon: 129.08 },
  ulsan: { name: '울산', lat: 35.54, lon: 129.31 }, changwon: { name: '창원', lat: 35.23, lon: 128.68 },
  jinju: { name: '진주', lat: 35.18, lon: 128.11 }, gimhae: { name: '김해', lat: 35.23, lon: 128.89 },
  jeju: { name: '제주', lat: 33.50, lon: 126.53 }, seogwipo: { name: '서귀포', lat: 33.25, lon: 126.56 },
};
const WX_KEY = 'clinicWeather.v1';
let WX = (() => { try { return JSON.parse(localStorage.getItem(WX_KEY)) || {}; } catch (e) { return {}; } })();
if (!WX.days) WX = { region: null, days: {} };
let wxInflight = null;
let wxFailUntil = 0;  // Open-Meteo 연결 실패 시 잠시 재시도 중단
let kmaFailUntil = 0; // 기상청 경유 실패 시 잠시 재시도 중단
let wxServer = location.protocol.startsWith('http') ? null : false; // 기상청 경유 가능 여부 (null=확인 전)

function wxSave() { try { localStorage.setItem(WX_KEY, JSON.stringify(WX)); } catch (e) {} }

function weatherOf(d) {
  if (S().region === 'none' || WX.region !== S().region) return null;
  return WX.days[d] || null;
}

const WX_CODES = [
  [[0], '☀️', '맑음'], [[1, 2], '⛅', '구름 조금'], [[3], '☁️', '흐림'], [[45, 48], '🌫️', '안개'],
  [[51, 53, 55, 56, 57], '🌦️', '이슬비'], [[61, 63, 65, 66, 67], '🌧️', '비'], [[80, 81, 82], '🌦️', '소나기'],
  [[71, 73, 75, 77, 85, 86], '❄️', '눈'], [[95, 96, 99], '⛈️', '뇌우'],
];
function wxIcon(w) { const f = WX_CODES.find(([codes]) => codes.includes(w.c)); return f ? { icon: f[1], label: f[2] } : { icon: '', label: '' }; }
function weatherText(w, long = false) {
  if (!w || w.t == null) return '';
  const { icon, label } = wxIcon(w);
  let s = `${icon} ${long ? label + ' ' : ''}${Math.round(w.n)}~${Math.round(w.t)}°C`;
  if (w.s >= 0.5) s += ` · 적설 ${w.s.toFixed(1)}cm`;
  else if (w.p >= 1) s += ` · 강수 ${Math.round(w.p)}mm`;
  return s;
}
// 진료에 영향을 줄 만한 날씨
function weatherNotable(w) {
  if (!w || w.t == null) return null;
  if (w.s >= 1) return '눈';
  if (w.p >= 10) return '많은 비';
  if (w.t >= 33) return '폭염';
  if (w.n <= -10) return '한파';
  return null;
}

async function fetchWx(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json();
  const d = j.daily || {};
  (d.time || []).forEach((t, i) => {
    if (d.temperature_2m_max[i] == null) return;
    WX.days[t] = { t: d.temperature_2m_max[i], n: d.temperature_2m_min[i], p: d.precipitation_sum[i] || 0, s: d.snowfall_sum[i] || 0, c: d.weather_code[i], src: 'om' };
  });
}

/* 기간 내 빠진 날씨를 불러옵니다. 새 데이터가 생기면 true */
async function ensureWeather(from, to) {
  const reg = REGIONS[S().region];
  if (!reg || !reg.lat) return false;
  if (WX.region !== S().region) WX = { region: S().region, days: {} };
  if (to > TODAY) to = TODAY;
  if (from > to) return false;
  const missing = daysBetween(from, to).filter((d) => !WX.days[d]);
  if (!missing.length) return false;
  if (wxInflight) { await wxInflight.catch(() => {}); return ensureWeather(from, to); }

  let release; wxInflight = new Promise((r) => { release = r; });
  try { return await fetchMissing(reg, missing); } finally { wxInflight = null; release(); }
}
async function fetchMissing(reg, missing) {
  const before = Object.keys(WX.days).length;
  // 1) 기상청 (어제까지)
  const yesterday = addDays(TODAY, -1);
  const past = missing.filter((d) => d <= yesterday);
  if (past.length && wxServer !== false && Date.now() >= kmaFailUntil) {
    try {
      const r = await fetch(`/api/weather?region=${S().region}&from=${past[0]}&to=${past[past.length - 1]}`);
      if (r.ok) {
        const j = await r.json();
        Object.assign(WX.days, j.days || {}); WX.station = j.station; wxServer = true;
      } else if ([400, 404, 405, 501].includes(r.status)) wxServer = false; // 키 미설정 또는 서버 없음
      else kmaFailUntil = Date.now() + 10 * 60 * 1000;                     // 일시 오류
    } catch (e) { kmaFailUntil = Date.now() + 10 * 60 * 1000; }
  }
  // 2) 남은 날은 Open-Meteo
  const rest = Date.now() < wxFailUntil ? [] : missing.filter((d) => !WX.days[d]);
  const q = `latitude=${reg.lat}&longitude=${reg.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum&timezone=Asia%2FSeoul`;
  const archiveEnd = addDays(TODAY, -6);
  const jobs = [];
  const old = rest.filter((d) => d <= archiveEnd);
  if (old.length) jobs.push(fetchWx(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${old[0]}&end_date=${old[old.length - 1]}`));
  if (rest.some((d) => d > archiveEnd)) jobs.push(fetchWx(`https://api.open-meteo.com/v1/forecast?${q}&past_days=10&forecast_days=1`));
  const results = await Promise.allSettled(jobs);
  if (results.some((r) => r.status === 'rejected')) wxFailUntil = Date.now() + 10 * 60 * 1000;
  wxSave();
  return Object.keys(WX.days).length > before;
}

function resetWeather() { WX = { region: S().region, days: {} }; wxFailUntil = 0; kmaFailUntil = 0; if (wxServer === false && location.protocol.startsWith('http')) wxServer = null; wxSave(); }
function weatherSourceText() {
  if (S().region === 'none') return '날씨: 사용 안 함';
  const vals = Object.values(WX.region === S().region ? WX.days : {});
  const kma = vals.filter((w) => w.src === 'kma').length, om = vals.length - kma;
  if (wxServer === true || kma) return `날씨: <b>기상청 종관기상관측(${escapeHtml(WX.station || REGIONS[S().region].name)} 관측소)</b> 일자료${om ? ` · 오늘 등 일부는 Open-Meteo 예보` : ''}`;
  if (!location.protocol.startsWith('http')) return '날씨: Open-Meteo (PC 파일로 열면 기상청 연결은 사용할 수 없습니다)';
  return '날씨: Open-Meteo (기상청 연결은 서버에 DATA_GO_KR_KEY를 설정하면 자동 사용)';
}
