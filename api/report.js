// 월간 리포트 AI 해설 (Gemini). middleware.js 가 입장 key 로 보호합니다.
// 클라이언트는 집계된 숫자(summary)만 보내며, 프롬프트는 서버에서 고정해 다른 용도로 쓰이지 않게 합니다.
const MAX_BYTES = 20000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });

  const summary = req.body?.summary;
  if (!summary || typeof summary !== 'object') return res.status(400).json({ error: '리포트 데이터가 없습니다.' });
  const data = JSON.stringify(summary);
  if (data.length > MAX_BYTES) return res.status(413).json({ error: '리포트 데이터가 너무 큽니다.' });

  const prompt = `당신은 동네 의원의 경영을 돕는 컨설턴트입니다. 아래는 한 의원의 월간 운영 통계(JSON)입니다.
개인정보는 포함되어 있지 않으며, 금액 단위는 원, 비율 단위는 %입니다. null 은 미입력입니다.
"진행중인달"이 true 이면 아직 끝나지 않은 달이므로 그 점을 감안해 주세요.

원장님께 드리는 월간 리포트를 한국어로 작성해 주세요. 형식:
## 한 줄 요약
## 잘된 점
- (2~3개)
## 주의할 점
- (2~3개)
## 다음 달 제안
- (실행 가능한 제안 3개)

규칙: 반드시 데이터의 숫자를 근거로 들고, 데이터에 없는 내용은 추측하지 마세요. 과장 없이 간결하게, 전체 600자 내외로 작성하세요.
전월·전년 동월 비교, 요일별 패턴, 보험 삭감률, 손익분기 대비 현재 환자 수, 목표 달성률이 있다면 우선적으로 다뤄 주세요.

데이터:
${data}`;

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
    });
    const d = await r.json();
    const reply = d?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
    if (!r.ok || !reply) return res.status(502).json({ error: 'AI 응답을 받지 못했습니다.', details: d?.error?.message });
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'AI 통신 실패', details: error.message });
  }
}
