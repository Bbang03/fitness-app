import { NextResponse } from 'next/server';
import { FOOD_DB, calcNutrition } from '@/lib/foodData';
import {
  candidateIdentityKey,
  cleanVisualCandidates,
  dedupeDetectedFoods,
  isGenericBurgerName,
  splitKnownCombinedFoods,
  type VisionCandidateInput,
} from '@/lib/visionCandidateValidation';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = process.env.GEMINI_VISION_MODEL?.trim() || 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_ATTEMPTS = 3;

// DB에 있는 음식명만 뱉게 강제 → 매칭 실패 제거
const FOOD_NAMES = FOOD_DB.map(f => f.name);
const OTHER = '기타';

const PROMPT = `너는 한국 음식 사진을 분석하는 영양 기록 도우미다.

사진에 보이는 **먹을 수 있는 음식**을 개별 항목으로 나눠서 식별해라.

규칙:
1. name 은 반드시 주어진 목록 중 하나여야 한다. 목록에 없으면 "${OTHER}" 를 쓴다.
2. raw_name 에는 네가 실제로 판단한 음식 이름을 한국어로 최대한 구체적으로 적는다. 포장이나 라벨이 보이면 브랜드와 제로/다이어트/무가당 여부도 포함해라. (예: "코카콜라 제로", "부대찌개") 라벨을 읽을 수 없으면 추측하지 말고 일반 이름만 적는다.
   raw_name에는 "또는", "혹은", "or"를 쓰지 마라. 확정하기 어렵다면 하나의 일반적인 대표 음식명을 쓰고 대안은 visual_candidates에만 적어라.
3. grams 는 사진 속 그 음식의 추정 중량(g). 그릇 크기, 젓가락/숟가락, 밥공기를 기준으로 추정해라.
   box_2d 는 그 음식이 보이는 영역을 [ymin, xmin, ymax, xmax] 순서의 0~1000 정수 좌표로 적어라.
   사진이 옆으로 돌아가 있더라도 올바른 방향으로 이해해서 분석해라.
4. portion 은 1인분 기준으로 적음/보통/많음.
5. confidence 는 0.0~1.0. 확신 없으면 낮게 줘라. 억지로 높이지 마라.
6. 음료, 소스, 국물도 칼로리가 있으면 포함해라.
7. 사진에 음식이 없으면 is_food=false 로 하고 items 는 빈 배열로 둔다.
8. 반찬이 여러 개면 각각 따로 항목으로 나눠라. 합치지 마라.
   같은 실제 음식이나 음료를 중복 출력하지 말고, 같은 종류가 여러 조각이면 한 항목으로 합쳐 총중량을 적어라.
   raw_name이나 후보 이름에 "A 및 B", "A와 B"처럼 서로 다른 음식을 한 항목으로 합치지 마라.
   예: 단무지와 오이피클이 모두 보이면 반드시 단무지 1항목, 오이피클 1항목으로 나눈다.
   튀김은 외형을 확인해 종류를 구분한다. 넓고 납작하며 잘린 고기 단면이 보이면 돈까스,
   꼬리 달린 길쭉한 형태면 새우튀김이며, 근거 없이 모두 "모듬튀김"으로 뭉뚱그리지 마라.
9. visual_candidates 에는 사진만 보고 가능한 구체적인 음식/제품명을 가능성 높은 순서로 1~3개 적어라.
   - 브랜드 로고, 포장, 번 모양, 패티 재료, 소스, 튀김옷처럼 사진에서 확인되는 특징을 사용해라.
   - 예: "버거킹 불고기 와퍼", "새우버거", "일반 햄버거".
   - 서로 실질적으로 다른 후보만 넣고, 억지 후보는 만들지 마라.
   - 구체적인 메뉴와 그 상위 개념을 동시에 넣지 마라. 예: "버거킹 와퍼"와 "햄버거"는 같은 후보이므로 구체적인 하나만 쓴다.
   - 소/중/대 같은 크기 차이는 후보를 나누지 마라. 중량은 grams 로만 표현한다.
   - 일반/제로, 육류/새우처럼 영양정보가 실제로 달라지는 경우에만 별도 후보로 둔다.
   - reason 은 사진에서 실제로 보이는 짧은 근거만 적고 보이지 않는 정보는 추측하지 마라.
   - 후보별 confidence 를 주되 합계가 반드시 1일 필요는 없다.
   - 응답 직전에 후보끼리 다시 비교해서 동의어, 브랜드명 유무, 상위·하위 표현만 다른 후보를 제거해라.
     예: "김치/배추김치", "백미밥/쌀밥", "와퍼/버거킹 와퍼"는 각각 한 후보만 남긴다.
   - 양배추에 드레싱이나 마요네즈가 실제로 보이면 "양배추 샐러드 (드레싱 포함)",
     아무 소스 없는 채 썬 양배추면 "양배추"로 구분한다. 두 형태는 영양값이 다르다.
10. estimated_nutrition_per100g 에는 해당 음식의 일반적인 100g 기준 kcal, 탄수화물, 단백질, 지방을 보수적으로 추정해라.
    이 값은 영양 DB에서 음식을 전혀 찾지 못했을 때만 사용자 확인용 대체값으로 사용한다.

사진에서 구분할 수 없는 재료나 조리법을 임의로 추가하지 마라.`;

interface GeminiItem {
  name: string;
  raw_name: string;
  grams: number;
  portion: '적음' | '보통' | '많음';
  confidence: number;
  visual_candidates: VisionCandidateInput[];
  box_2d: number[];
  estimated_nutrition_per100g: {
    kcal: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  };
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', enum: [...FOOD_NAMES, OTHER] },
          raw_name: { type: 'STRING' },
          grams: { type: 'NUMBER' },
          portion: { type: 'STRING', enum: ['적음', '보통', '많음'] },
          confidence: { type: 'NUMBER' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
          visual_candidates: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                confidence: { type: 'NUMBER' },
                reason: { type: 'STRING' },
              },
              required: ['name', 'confidence', 'reason'],
            },
          },
          estimated_nutrition_per100g: {
            type: 'OBJECT',
            properties: {
              kcal: { type: 'NUMBER' },
              carbs_g: { type: 'NUMBER' },
              protein_g: { type: 'NUMBER' },
              fat_g: { type: 'NUMBER' },
            },
            required: ['kcal', 'carbs_g', 'protein_g', 'fat_g'],
          },
        },
        required: ['name', 'raw_name', 'grams', 'portion', 'confidence', 'box_2d', 'visual_candidates', 'estimated_nutrition_per100g'],
      },
    },
  },
  required: ['is_food', 'items'],
};

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY 가 설정되지 않았습니다.' }, { status: 500 });
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { image, mimeType = 'image/jpeg' } = body;
  if (!image) {
    return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
  }
  // base64 기준 약 4MB 상한 (리사이즈 후엔 보통 100KB 미만)
  if (image.length > 4_000_000) {
    return NextResponse.json({ error: '이미지가 너무 큽니다.' }, { status: 413 });
  }

  const requestBody = JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType, data: image } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

  let res: Response | undefined;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      const transient = res.status === 408 || res.status === 429 || res.status >= 500;
      if (res.ok || !transient || attempt === MAX_ATTEMPTS - 1) break;

      const retryAfterSeconds = Number(res.headers.get('retry-after'));
      const serverBackoff = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? Math.min(retryAfterSeconds * 1000, 25_000)
        : null;
      // Gemini 무료 티어 429는 짧은 1~5초 재시도로 회복되지 않는 경우가 많다.
      // 두 번째/세 번째 시도 전에 12초, 25초를 기다려 분당 한도 버킷을 넘긴다.
      const backoffMs = serverBackoff
        ?? (res.status === 429
          ? [12_000, 25_000][attempt]
          : Math.min(1200 * 2 ** attempt + Math.round(Math.random() * 400), 5000));
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  } catch {
    return NextResponse.json({ error: '인식 서버에 연결하지 못했습니다.' }, { status: 502 });
  }

  if (!res) {
    return NextResponse.json({ error: '인식 서버에서 응답을 받지 못했습니다.' }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 429는 분당 또는 일일 무료 티어 한도일 수 있다.
    const msg = res.status === 429
      ? '사진 인식 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 검색·직접 입력을 이용해주세요.'
      : '음식 인식에 실패했습니다.';
    console.error('[vision] gemini error', res.status, detail.slice(0, 500));
    return NextResponse.json({ error: msg }, { status: res.status === 429 ? 429 : 502 });
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: '인식 결과가 비어 있습니다.' }, { status: 502 });
  }

  let parsed: { is_food: boolean; items: GeminiItem[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: '인식 결과를 해석하지 못했습니다.' }, { status: 502 });
  }

  if (!parsed.is_food || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return NextResponse.json({ is_food: false, items: [], meta: { model: MODEL, duplicates_removed: 0 } });
  }

  // 이름 → FOOD_DB 매칭 → 영양소 계산. 칼로리는 전부 서버 DB 기준.
  const items = splitKnownCombinedFoods(parsed.items).map((it) => {
    const grams = Math.max(1, Math.round(Number(it.grams) || 0));
    const enumeratedFood = it.name === OTHER ? undefined : FOOD_DB.find(f => f.name === it.name);
    const rawDetectedName = it.raw_name?.trim() || enumeratedFood?.name || '알 수 없는 음식';
    // 모델이 enum에는 "기타"를 선택했어도 raw_name이 내부 DB의 동의어와
    // 일치하면 외부 검색으로 보내지 않고 검증된 내부 영양값을 사용한다.
    const detectedIdentity = candidateIdentityKey(rawDetectedName);
    const rawMatchedFood = FOOD_DB.find(candidate => candidateIdentityKey(candidate.name) === detectedIdentity);
    // enum의 일반명보다 raw_name의 구체적인 음식 형태를 우선한다.
    // 예: enum=양배추, raw=드레싱 포함 양배추 샐러드.
    const food = rawMatchedFood ?? enumeratedFood;
    const rawCandidates = Array.isArray(it.visual_candidates) ? it.visual_candidates : [];
    // "참깨 또는 소스가 뿌려진 양배추"처럼 재료 수식어의 불확실성을
    // 별도 음식 후보로 쪼개지 않는다. 이 경우 검증된 대표 음식명을 사용한다.
    const descriptiveDisjunction = /(?:또는|혹은|\bor\b)[\s\S]*(?:뿌려진|들어간|올라간|곁들인|첨가된)/i
      .test(rawDetectedName);
    const detectedName = descriptiveDisjunction && food ? food.name : rawDetectedName;
    const disjunctiveNames = detectedName
      .split(/\s*(?:또는|혹은|\bor\b)\s*/i)
      .map(name => name.trim())
      .filter(Boolean);
    const candidateInputs = descriptiveDisjunction
      ? [
          { name: detectedName, confidence: it.confidence ?? 0, reason: '' },
          ...rawCandidates.filter(candidate => !/(?:또는|혹은|\bor\b)/i.test(candidate.name)),
        ]
      : disjunctiveNames.length > 1
      ? [
          ...disjunctiveNames.slice(0, 3).map((name, index) => ({
            name,
            confidence: Math.max(0.3, (Number(it.confidence) || 0.5) - index * 0.05),
            reason: '사진만으로 둘 중 하나를 확정하기 어려움',
          })),
          ...rawCandidates.filter(candidate => !/(?:또는|혹은|\bor\b)/i.test(candidate.name)),
        ]
      : [
          { name: detectedName, confidence: it.confidence ?? 0, reason: '' },
          ...rawCandidates,
        ];
    let candidates = cleanVisualCandidates(candidateInputs);
    if (/카레\s*소스/.test(detectedName)) {
      candidates = candidates.filter(candidate => !/카레\s*라이스/.test(candidate.name));
    }

    const shrimpTailEvidence = rawCandidates.some(candidate =>
      /새우\s*튀김/.test(candidate.name)
        && /꼬리|tail|굽은\s*새우|새우\s*(?:몸통|형태)/i.test(candidate.reason ?? ''),
    );
    // 빵가루 튀김은 꼬리가 안 보이면 돈까스와 새우튀김을 사진만으로 확정하기 어렵다.
    // 틀린 영양값을 자동 등록하지 않고 두 의미 있는 후보만 사용자에게 묻는다.
    const unsupportedShrimpIdentity = /새우\s*튀김/.test(detectedName) && !shrimpTailEvidence;
    if (unsupportedShrimpIdentity) {
      candidates = [
        { name: '돈까스', confidence: 0.6, reason: '새우 꼬리가 보이지 않아 튀김 종류 확인 필요' },
        { name: '새우튀김', confidence: 0.55, reason: '새우 꼬리가 보이지 않아 튀김 종류 확인 필요' },
      ];
    }

    // 패티가 번/채소에 가려진 버거는 모델이 흔히 그냥 "햄버거"로 확정한다.
    // 영양값이 크게 다른 패티 종류를 사진만으로 단정하지 말고 사용자가 고르게 한다.
    const onlyGenericBurgerCandidates = isGenericBurgerName(detectedName)
      && !candidates.some(candidate =>
        candidate.confidence >= 0.45
        && !isGenericBurgerName(candidate.name)
        && /버거|와퍼|burger|whopper/i.test(candidate.name),
      );
    if (onlyGenericBurgerCandidates) {
      const genericConfidence = Math.min(Number(it.confidence) || 0.5, 0.6);
      candidates = [
        { name: '소고기 햄버거', confidence: genericConfidence, reason: '패티 종류가 사진에서 명확하지 않음' },
        { name: '치킨버거', confidence: Math.max(0.35, genericConfidence - 0.05), reason: '패티 종류가 사진에서 명확하지 않음' },
        { name: '새우버거', confidence: Math.max(0.3, genericConfidence - 0.15), reason: '패티 종류가 사진에서 명확하지 않음' },
      ];
    }

    const topConfidence = candidates[0]?.confidence ?? (it.confidence ?? 0);
    const secondConfidence = candidates[1]?.confidence ?? 0;
    const meaningfulDisjunction = disjunctiveNames.length > 1 && candidates.length > 1;
    const needsIdentityConfirmation = meaningfulDisjunction || onlyGenericBurgerCandidates || unsupportedShrimpIdentity || (candidates.length > 1
      && (topConfidence < 0.7 || topConfidence - secondConfidence < 0.2));
    const box = Array.isArray(it.box_2d) && it.box_2d.length === 4
      ? it.box_2d.map(value => Math.max(0, Math.min(1000, Math.round(Number(value) || 0))))
      : undefined;

    const rawEstimate = it.estimated_nutrition_per100g;
    const estimateValues = rawEstimate
      ? [rawEstimate.kcal, rawEstimate.carbs_g, rawEstimate.protein_g, rawEstimate.fat_g].map(Number)
      : [];
    const estimatedPer100g = estimateValues.length === 4
      && estimateValues.every(value => Number.isFinite(value) && value >= 0)
      && estimateValues[0] <= 900
      && estimateValues.slice(1).every(value => value <= 100)
      ? {
          kcal: Math.round(estimateValues[0]),
          carbs_g: Math.round(estimateValues[1] * 10) / 10,
          protein_g: Math.round(estimateValues[2] * 10) / 10,
          fat_g: Math.round(estimateValues[3] * 10) / 10,
        }
      : undefined;

    if (!food) {
      return {
        matched: false as const,
        food_id: null,
        food_name: detectedName,
        grams,
        portion: it.portion,
        confidence: it.confidence ?? 0,
        nutrition: null,
        estimated_per100g: estimatedPer100g,
        vision_candidates: candidates,
        needs_identity_confirmation: needsIdentityConfirmation,
        box_2d: box,
      };
    }

    return {
      matched: true as const,
      food_id: food.id,
      food_name: detectedName,
      grams,
      portion: it.portion,
      confidence: it.confidence ?? 0,
      nutrition: calcNutrition(food, grams),
      reference_name: food.name,
      serving_g: food.serving_g,
      serving_desc: food.serving_desc,
      vision_candidates: candidates,
      needs_identity_confirmation: needsIdentityConfirmation,
      box_2d: box,
    };
  });

  const deduped = dedupeDetectedFoods(items);

  return NextResponse.json({
    is_food: true,
    items: deduped,
    meta: {
      model: MODEL,
      duplicates_removed: items.length - deduped.length,
    },
  });
}
