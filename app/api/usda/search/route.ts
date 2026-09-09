import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ── Korean → English food term dictionary ────────────────────────────────
// Sorted by length desc at runtime so longer phrases match first (e.g. 닭가슴살 before 닭)
const KO_EN: Record<string, string> = {
  // ── 브랜드 ─────────────────────────────────────────────────────────────
  '버거킹': 'burger king',
  '맥도날드': "mcdonald's",
  '롯데리아': 'lotteria',
  '케이에프씨': 'kfc',
  '서브웨이': 'subway',
  '스타벅스': 'starbucks',
  '피자헛': 'pizza hut',
  '도미노피자': "domino's pizza",
  '도미노': "domino's pizza",
  '파파존스': "papa john's",
  '모스버거': 'mos burger',
  '쉐이크쉑': 'shake shack',
  '파이브가이즈': 'five guys',
  '던킨': 'dunkin donuts',
  '배스킨라빈스': 'baskin robbins',
  '하겐다즈': 'haagen-dazs',
  // ── 버거 메뉴 ───────────────────────────────────────────────────────────
  '버거킹 불고기 와퍼': 'burger king bulgogi whopper',
  '롯데리아 새우버거': 'lotteria shrimp burger',
  '불고기 와퍼': 'bulgogi whopper',
  '새우버거': 'shrimp burger',
  '와퍼': 'whopper',
  '빅맥': 'big mac',
  '쿼터파운더': 'quarter pounder',
  '맥너겟': 'chicken mcnuggets',
  '에그맥머핀': 'egg mcmuffin',
  '불고기버거': 'bulgogi burger',
  '치킨버거': 'chicken burger',
  '더블치즈버거': 'double cheeseburger',
  '치즈버거': 'cheeseburger',
  '더블버거': 'double burger',
  // ── 사이드 / 음료 ───────────────────────────────────────────────────────
  '코카콜라 제로': 'coca-cola zero sugar',
  '제로 콜라': 'coca-cola zero sugar',
  '제로콜라': 'coca-cola zero sugar',
  '다이어트 콜라': 'diet cola',
  '감자튀김': 'french fries',
  '프렌치프라이': 'french fries',
  '어니언링': 'onion rings',
  '치킨너겟': 'chicken nuggets',
  '콜라': 'coca-cola',
  '제로': 'zero sugar',
  '사이다': 'sprite',
  '오렌지주스': 'orange juice',
  '에너지드링크': 'energy drink',
  '아메리카노': 'americano coffee',
  '카페라떼': 'cafe latte',
  '카페모카': 'cafe mocha',
  '카라멜마키아토': 'caramel macchiato',
  '라떼': 'latte',
  '커피': 'coffee',
  '우유': 'milk',
  '오이 피클': 'pickles cucumber dill',
  '오이피클': 'pickles cucumber dill',
  '피클': 'pickles cucumber dill',
  '미소장국': 'miso soup prepared',
  '우동국물': 'dashi broth soup',
  '계란말이': 'omelet egg cooked',
  '카레 소스': 'curry sauce prepared',
  '카레라이스': 'curry rice prepared',
  '새우튀김': 'shrimp breaded fried',
  '튀김 (모듬)': 'tempura mixed fried',
  '모듬튀김': 'tempura mixed fried',
  '돈까스': 'pork cutlet breaded fried',
  '단무지': 'pickled radish yellow',
  // ── 육류 ───────────────────────────────────────────────────────────────
  '닭가슴살': 'chicken breast',
  '닭다리': 'chicken leg',
  '닭날개': 'chicken wing',
  '치킨': 'chicken',
  '닭': 'chicken',
  '소고기': 'beef',
  '등심': 'sirloin',
  '안심': 'tenderloin',
  '삼겹살': 'pork belly',
  '목살': 'pork shoulder',
  '돼지고기': 'pork',
  '연어': 'salmon',
  '참치': 'tuna',
  '고등어': 'mackerel',
  '새우': 'shrimp',
  '오리': 'duck',
  '칠면조': 'turkey',
  '양고기': 'lamb',
  // ── 일반 음식 ───────────────────────────────────────────────────────────
  '버거': 'burger',
  '피자': 'pizza',
  '파스타': 'pasta',
  '스테이크': 'steak',
  '샐러드': 'salad',
  '수프': 'soup',
  '스프': 'soup',
  '샌드위치': 'sandwich',
  '타코': 'taco',
  '부리또': 'burrito',
  '라면': 'ramen',
  '우동': 'udon',
  '소바': 'soba',
  '스시': 'sushi',
  '초밥': 'sushi',
  '불고기': 'bulgogi',
  '비빔밥': 'bibimbap',
  '김치': 'kimchi',
  '떡볶이': 'tteokbokki',
  '도넛': 'donut',
  '케이크': 'cake',
  '쿠키': 'cookie',
  '아이스크림': 'ice cream',
  '요거트': 'yogurt',
  '그릭요거트': 'greek yogurt',
  '치즈': 'cheese',
  '계란': 'egg',
  '달걀': 'egg',
  '두부': 'tofu',
  '오트밀': 'oatmeal',
  '시리얼': 'cereal',
  '빵': 'bread',
  '토스트': 'toast',
  '베이글': 'bagel',
  '크루아상': 'croissant',
  '와플': 'waffle',
  '팬케이크': 'pancake',
  '쌀': 'rice',
  '고구마': 'sweet potato',
  '감자': 'potato',
  '브로콜리': 'broccoli',
  '양배추': 'cabbage',
  '시금치': 'spinach',
  '아보카도': 'avocado',
  '바나나': 'banana',
  '사과': 'apple',
  '딸기': 'strawberry',
  '블루베리': 'blueberry',
  '아몬드': 'almond',
  '땅콩': 'peanut',
  '호두': 'walnut',
  '캐슈넛': 'cashew',
  // ── 조리법 ─────────────────────────────────────────────────────────────
  '구운': 'grilled',
  '삶은': 'boiled',
  '튀긴': 'fried',
  '볶은': 'stir-fried',
  '찐': 'steamed',
  '훈제': 'smoked',
  // ── 보충제 ─────────────────────────────────────────────────────────────
  '단백질 쉐이크': 'protein shake',
  '프로틴 쉐이크': 'protein shake',
  '웨이프로틴': 'whey protein',
  '프로틴바': 'protein bar',
  '단백질바': 'protein bar',
  '프로틴': 'protein',
  '단백질': 'protein',
  '웨이': 'whey',
  '크레아틴': 'creatine',
  '아미노산': 'amino acid',
  'bcaa': 'bcaa',
};

const IS_KOREAN = /[가-힣㄰-㆏]/;

function translateQuery(query: string): string {
  if (!IS_KOREAN.test(query)) return query;

  let result = query.toLowerCase();
  // Longest entries first to avoid partial overwrites
  const entries = Object.entries(KO_EN).sort((a, b) => b[0].length - a[0].length);
  for (const [ko, en] of entries) {
    result = result.replace(new RegExp(ko, 'gi'), en);
  }
  // Strip remaining Korean characters
  result = result.replace(/[가-힣㄰-㆏]+/g, '').replace(/\s+/g, ' ').trim();
  return result || query;
}

// Nutrient IDs in USDA FoodData Central
const N = { kcal: 1008, carbs: 1005, protein: 1003, fat: 1004 };

function pickNutrients(foodNutrients: Array<{ nutrientId: number; value?: number }>) {
  const m = new Map(foodNutrients.map(n => [n.nutrientId, n.value ?? 0]));
  return {
    kcal: Math.round(m.get(N.kcal) ?? 0),
    carbs_g: Math.round((m.get(N.carbs) ?? 0) * 10) / 10,
    protein_g: Math.round((m.get(N.protein) ?? 0) * 10) / 10,
    fat_g: Math.round((m.get(N.fat) ?? 0) * 10) / 10,
  };
}

function descriptionScore(query: string, description: string) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1);
  const normalized = description.toLowerCase();
  if (!tokens.length) return 0;
  return tokens.filter(token => normalized.includes(token)).length / tokens.length;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ foods: [] });

  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('[usda/search] USDA_API_KEY not set');
    return NextResponse.json({ foods: [] });
  }

  const original = q.trim();
  const translated = translateQuery(original);
  const wasTranslated = translated !== original && !IS_KOREAN.test(translated);

  console.log(`[usda/search] "${original}"${wasTranslated ? ` → "${translated}"` : ''}`);

  try {
    const params = new URLSearchParams({
      query: translated,
      api_key: apiKey,
      pageSize: '10',
    });
    // dataType uses commas USDA expects unencoded — append manually
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}&dataType=Branded,Foundation,SR%20Legacy`;

    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`USDA ${res.status}`);

    const data = await res.json();

    const dataTypePriority: Record<string, number> = {
      Foundation: 4,
      'SR Legacy': 3,
      'Survey (FNDDS)': 2,
      Branded: 1,
    };
    const rankedFoods = [...(data.foods ?? [])].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const relevance = descriptionScore(translated, String(b.description ?? ''))
        - descriptionScore(translated, String(a.description ?? ''));
      if (relevance !== 0) return relevance;
      return (dataTypePriority[String(b.dataType ?? '')] ?? 0)
        - (dataTypePriority[String(a.dataType ?? '')] ?? 0);
    });

    const foods = rankedFoods.slice(0, 10).map((f: Record<string, unknown>) => {
      const nutrients = pickNutrients((f.foodNutrients as Array<{ nutrientId: number; value?: number }>) ?? []);
      const servingSize = typeof f.servingSize === 'number' ? f.servingSize : 0;
      const servingSizeUnit = String(f.servingSizeUnit ?? 'g').toLowerCase();
      const servingG = servingSize > 0 && servingSizeUnit === 'g'
        ? Math.round(servingSize)
        : 100;
      return {
        id: String(f.fdcId ?? ''),
        name: String(f.description ?? ''),
        brand: String(f.brandOwner ?? f.brandName ?? ''),
        dataType: String(f.dataType ?? ''),
        servingG,
        per100g: nutrients,
      };
    });

    return NextResponse.json({
      foods,
      translatedQuery: wasTranslated ? translated : undefined,
    });
  } catch (err) {
    console.error('[usda/search]', err);
    return NextResponse.json({ foods: [] });
  }
}
