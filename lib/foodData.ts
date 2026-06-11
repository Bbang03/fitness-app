export interface FoodItem {
  id: string;
  name: string;
  category: string;
  serving_desc: string;  // 기본 제공량 표시 (예: "1공기 (210g)")
  serving_g: number;     // 기본 제공량 g
  per100g: {            // 100g 당 영양소
    kcal: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  };
}

export const FOOD_DB: FoodItem[] = [
  // ── 주식 ──────────────────────────────────────────────────────────────────
  { id: 'r01', name: '백미밥', category: '주식', serving_desc: '1공기 (210g)', serving_g: 210,
    per100g: { kcal: 143, carbs_g: 31, protein_g: 2.5, fat_g: 0.3 } },
  { id: 'r02', name: '현미밥', category: '주식', serving_desc: '1공기 (210g)', serving_g: 210,
    per100g: { kcal: 136, carbs_g: 28, protein_g: 2.9, fat_g: 1.0 } },
  { id: 'r03', name: '잡곡밥', category: '주식', serving_desc: '1공기 (210g)', serving_g: 210,
    per100g: { kcal: 131, carbs_g: 27, protein_g: 3.2, fat_g: 1.0 } },
  { id: 'r04', name: '오트밀', category: '주식', serving_desc: '1인분 (40g)', serving_g: 40,
    per100g: { kcal: 389, carbs_g: 66, protein_g: 17, fat_g: 7 } },
  { id: 'r05', name: '고구마', category: '주식', serving_desc: '중간크기 1개 (150g)', serving_g: 150,
    per100g: { kcal: 86, carbs_g: 20, protein_g: 1.6, fat_g: 0.1 } },
  { id: 'r06', name: '감자', category: '주식', serving_desc: '중간크기 1개 (150g)', serving_g: 150,
    per100g: { kcal: 77, carbs_g: 17, protein_g: 2.0, fat_g: 0.1 } },
  { id: 'r07', name: '식빵', category: '주식', serving_desc: '2장 (70g)', serving_g: 70,
    per100g: { kcal: 264, carbs_g: 50, protein_g: 9, fat_g: 4 } },
  { id: 'r08', name: '통밀빵', category: '주식', serving_desc: '2장 (70g)', serving_g: 70,
    per100g: { kcal: 247, carbs_g: 44, protein_g: 10, fat_g: 4 } },

  // ── 육류 ──────────────────────────────────────────────────────────────────
  { id: 'p01', name: '닭가슴살 (삶은)', category: '단백질', serving_desc: '1인분 (150g)', serving_g: 150,
    per100g: { kcal: 165, carbs_g: 0, protein_g: 31, fat_g: 3.6 } },
  { id: 'p02', name: '닭다리 (구운)', category: '단백질', serving_desc: '1개 (120g)', serving_g: 120,
    per100g: { kcal: 216, carbs_g: 0, protein_g: 26, fat_g: 12 } },
  { id: 'p03', name: '소고기 등심', category: '단백질', serving_desc: '1인분 (150g)', serving_g: 150,
    per100g: { kcal: 271, carbs_g: 0, protein_g: 26, fat_g: 18 } },
  { id: 'p04', name: '소고기 안심', category: '단백질', serving_desc: '1인분 (150g)', serving_g: 150,
    per100g: { kcal: 219, carbs_g: 0, protein_g: 28, fat_g: 12 } },
  { id: 'p05', name: '돼지고기 삼겹살', category: '단백질', serving_desc: '1인분 (200g)', serving_g: 200,
    per100g: { kcal: 395, carbs_g: 0, protein_g: 17, fat_g: 36 } },
  { id: 'p06', name: '돼지고기 앞다리', category: '단백질', serving_desc: '1인분 (150g)', serving_g: 150,
    per100g: { kcal: 145, carbs_g: 0, protein_g: 20, fat_g: 7 } },
  { id: 'p07', name: '연어 (생)', category: '단백질', serving_desc: '1토막 (150g)', serving_g: 150,
    per100g: { kcal: 208, carbs_g: 0, protein_g: 20, fat_g: 13 } },
  { id: 'p08', name: '참치캔 (물에 담근)', category: '단백질', serving_desc: '1캔 (135g)', serving_g: 135,
    per100g: { kcal: 108, carbs_g: 0, protein_g: 24, fat_g: 0.8 } },
  { id: 'p09', name: '새우', category: '단백질', serving_desc: '1인분 (100g)', serving_g: 100,
    per100g: { kcal: 99, carbs_g: 0.2, protein_g: 24, fat_g: 0.3 } },
  { id: 'p10', name: '고등어 (구운)', category: '단백질', serving_desc: '1토막 (100g)', serving_g: 100,
    per100g: { kcal: 202, carbs_g: 0, protein_g: 20, fat_g: 13 } },

  // ── 계란·두부 ─────────────────────────────────────────────────────────────
  { id: 'e01', name: '계란 (삶은)', category: '단백질', serving_desc: '1개 (60g)', serving_g: 60,
    per100g: { kcal: 155, carbs_g: 1.1, protein_g: 13, fat_g: 11 } },
  { id: 'e02', name: '계란 흰자', category: '단백질', serving_desc: '1개 (33g)', serving_g: 33,
    per100g: { kcal: 52, carbs_g: 0.7, protein_g: 11, fat_g: 0.2 } },
  { id: 'e03', name: '계란 후라이', category: '단백질', serving_desc: '1개 (65g)', serving_g: 65,
    per100g: { kcal: 196, carbs_g: 0.8, protein_g: 14, fat_g: 15 } },
  { id: 'e04', name: '두부 (단단한)', category: '단백질', serving_desc: '1/4모 (100g)', serving_g: 100,
    per100g: { kcal: 76, carbs_g: 1.9, protein_g: 8, fat_g: 4.5 } },
  { id: 'e05', name: '두부 (연두부)', category: '단백질', serving_desc: '1/2팩 (150g)', serving_g: 150,
    per100g: { kcal: 42, carbs_g: 1.3, protein_g: 4.5, fat_g: 2.3 } },

  // ── 유제품 ────────────────────────────────────────────────────────────────
  { id: 'd01', name: '우유 (전유)', category: '유제품', serving_desc: '1팩 (200ml)', serving_g: 200,
    per100g: { kcal: 61, carbs_g: 4.8, protein_g: 3.2, fat_g: 3.5 } },
  { id: 'd02', name: '우유 (저지방)', category: '유제품', serving_desc: '1팩 (200ml)', serving_g: 200,
    per100g: { kcal: 46, carbs_g: 4.8, protein_g: 3.2, fat_g: 1.5 } },
  { id: 'd03', name: '그릭요거트', category: '유제품', serving_desc: '1컵 (170g)', serving_g: 170,
    per100g: { kcal: 59, carbs_g: 3.6, protein_g: 10, fat_g: 0.4 } },
  { id: 'd04', name: '요거트 (플레인)', category: '유제품', serving_desc: '1개 (100g)', serving_g: 100,
    per100g: { kcal: 61, carbs_g: 6.9, protein_g: 3.5, fat_g: 3.3 } },
  { id: 'd05', name: '슬라이스 치즈', category: '유제품', serving_desc: '1장 (20g)', serving_g: 20,
    per100g: { kcal: 330, carbs_g: 4, protein_g: 22, fat_g: 25 } },
  { id: 'd06', name: '코티지치즈', category: '유제품', serving_desc: '1/2컵 (113g)', serving_g: 113,
    per100g: { kcal: 98, carbs_g: 3.4, protein_g: 11, fat_g: 4.3 } },

  // ── 채소 ──────────────────────────────────────────────────────────────────
  { id: 'v01', name: '브로콜리', category: '채소', serving_desc: '1컵 (91g)', serving_g: 91,
    per100g: { kcal: 34, carbs_g: 7, protein_g: 2.8, fat_g: 0.4 } },
  { id: 'v02', name: '시금치', category: '채소', serving_desc: '1컵 (30g)', serving_g: 30,
    per100g: { kcal: 23, carbs_g: 3.6, protein_g: 2.9, fat_g: 0.4 } },
  { id: 'v03', name: '아보카도', category: '채소', serving_desc: '1/2개 (75g)', serving_g: 75,
    per100g: { kcal: 160, carbs_g: 8.5, protein_g: 2, fat_g: 15 } },
  { id: 'v04', name: '토마토', category: '채소', serving_desc: '중간크기 1개 (120g)', serving_g: 120,
    per100g: { kcal: 18, carbs_g: 3.9, protein_g: 0.9, fat_g: 0.2 } },
  { id: 'v05', name: '양배추', category: '채소', serving_desc: '1컵 (89g)', serving_g: 89,
    per100g: { kcal: 25, carbs_g: 5.8, protein_g: 1.3, fat_g: 0.1 } },
  { id: 'v06', name: '당근', category: '채소', serving_desc: '중간크기 1개 (61g)', serving_g: 61,
    per100g: { kcal: 41, carbs_g: 9.6, protein_g: 0.9, fat_g: 0.2 } },
  { id: 'v07', name: '오이', category: '채소', serving_desc: '1/2개 (150g)', serving_g: 150,
    per100g: { kcal: 15, carbs_g: 3.6, protein_g: 0.7, fat_g: 0.1 } },

  // ── 과일 ──────────────────────────────────────────────────────────────────
  { id: 'f01', name: '바나나', category: '과일', serving_desc: '중간크기 1개 (118g)', serving_g: 118,
    per100g: { kcal: 89, carbs_g: 23, protein_g: 1.1, fat_g: 0.3 } },
  { id: 'f02', name: '사과', category: '과일', serving_desc: '중간크기 1개 (182g)', serving_g: 182,
    per100g: { kcal: 52, carbs_g: 14, protein_g: 0.3, fat_g: 0.2 } },
  { id: 'f03', name: '오렌지', category: '과일', serving_desc: '중간크기 1개 (131g)', serving_g: 131,
    per100g: { kcal: 47, carbs_g: 12, protein_g: 0.9, fat_g: 0.1 } },
  { id: 'f04', name: '딸기', category: '과일', serving_desc: '1컵 (152g)', serving_g: 152,
    per100g: { kcal: 32, carbs_g: 7.7, protein_g: 0.7, fat_g: 0.3 } },
  { id: 'f05', name: '블루베리', category: '과일', serving_desc: '1컵 (148g)', serving_g: 148,
    per100g: { kcal: 57, carbs_g: 14, protein_g: 0.7, fat_g: 0.3 } },
  { id: 'f06', name: '포도', category: '과일', serving_desc: '1컵 (92g)', serving_g: 92,
    per100g: { kcal: 69, carbs_g: 18, protein_g: 0.7, fat_g: 0.2 } },
  { id: 'f07', name: '수박', category: '과일', serving_desc: '2조각 (280g)', serving_g: 280,
    per100g: { kcal: 30, carbs_g: 7.6, protein_g: 0.6, fat_g: 0.2 } },

  // ── 한식 요리 ─────────────────────────────────────────────────────────────
  { id: 'k01', name: '비빔밥', category: '한식', serving_desc: '1인분 (400g)', serving_g: 400,
    per100g: { kcal: 138, carbs_g: 22, protein_g: 4.5, fat_g: 3.5 } },
  { id: 'k02', name: '김치찌개 (돼지)', category: '한식', serving_desc: '1인분 (300g)', serving_g: 300,
    per100g: { kcal: 67, carbs_g: 5, protein_g: 5, fat_g: 2.7 } },
  { id: 'k03', name: '된장찌개', category: '한식', serving_desc: '1인분 (250g)', serving_g: 250,
    per100g: { kcal: 32, carbs_g: 3.2, protein_g: 2.4, fat_g: 1.2 } },
  { id: 'k04', name: '제육볶음', category: '한식', serving_desc: '1인분 (200g)', serving_g: 200,
    per100g: { kcal: 190, carbs_g: 7.5, protein_g: 12.5, fat_g: 12 } },
  { id: 'k05', name: '불고기', category: '한식', serving_desc: '1인분 (150g)', serving_g: 150,
    per100g: { kcal: 185, carbs_g: 8, protein_g: 22, fat_g: 7 } },
  { id: 'k06', name: '삼겹살 (구운)', category: '한식', serving_desc: '1인분 (200g)', serving_g: 200,
    per100g: { kcal: 395, carbs_g: 0, protein_g: 17, fat_g: 36 } },
  { id: 'k07', name: '김밥', category: '한식', serving_desc: '1줄 (240g)', serving_g: 240,
    per100g: { kcal: 158, carbs_g: 26, protein_g: 5, fat_g: 3.8 } },
  { id: 'k08', name: '순두부찌개', category: '한식', serving_desc: '1인분 (350g)', serving_g: 350,
    per100g: { kcal: 43, carbs_g: 2.3, protein_g: 3.4, fat_g: 2 } },
  { id: 'k09', name: '닭볶음탕', category: '한식', serving_desc: '1인분 (250g)', serving_g: 250,
    per100g: { kcal: 112, carbs_g: 6, protein_g: 10, fat_g: 5.6 } },
  { id: 'k10', name: '계란볶음밥', category: '한식', serving_desc: '1인분 (300g)', serving_g: 300,
    per100g: { kcal: 150, carbs_g: 20, protein_g: 5, fat_g: 5.3 } },
  { id: 'k11', name: '라면', category: '한식', serving_desc: '1봉지 (120g)', serving_g: 120,
    per100g: { kcal: 446, carbs_g: 63, protein_g: 10, fat_g: 16 } },
  { id: 'k12', name: '김치', category: '한식', serving_desc: '1인분 (50g)', serving_g: 50,
    per100g: { kcal: 15, carbs_g: 2.4, protein_g: 1.1, fat_g: 0.5 } },

  // ── 보충제 ────────────────────────────────────────────────────────────────
  { id: 's01', name: '단백질 쉐이크 (WPI)', category: '보충제', serving_desc: '1스쿱 (30g)', serving_g: 30,
    per100g: { kcal: 400, carbs_g: 6.7, protein_g: 83, fat_g: 3.3 } },
  { id: 's02', name: '단백질 쉐이크 (WPC)', category: '보충제', serving_desc: '1스쿱 (30g)', serving_g: 30,
    per100g: { kcal: 383, carbs_g: 13, protein_g: 73, fat_g: 6.7 } },
  { id: 's03', name: '게이너 (Mass Gainer)', category: '보충제', serving_desc: '2스쿱 (100g)', serving_g: 100,
    per100g: { kcal: 380, carbs_g: 70, protein_g: 20, fat_g: 5 } },
  { id: 's04', name: '아몬드', category: '간식', serving_desc: '1줌 (28g)', serving_g: 28,
    per100g: { kcal: 579, carbs_g: 22, protein_g: 21, fat_g: 50 } },
  { id: 's05', name: '땅콩버터', category: '간식', serving_desc: '2큰술 (32g)', serving_g: 32,
    per100g: { kcal: 588, carbs_g: 20, protein_g: 25, fat_g: 50 } },
  { id: 's06', name: '프로틴바', category: '보충제', serving_desc: '1개 (60g)', serving_g: 60,
    per100g: { kcal: 367, carbs_g: 42, protein_g: 33, fat_g: 12 } },
];

export function searchFoods(query: string, limit = 30): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOOD_DB.slice(0, limit);
  return FOOD_DB.filter(f =>
    f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
  ).slice(0, limit);
}

export function calcNutrition(food: FoodItem, grams: number) {
  const ratio = grams / 100;
  return {
    kcal: Math.round(food.per100g.kcal * ratio),
    carbs_g: Math.round(food.per100g.carbs_g * ratio * 10) / 10,
    protein_g: Math.round(food.per100g.protein_g * ratio * 10) / 10,
    fat_g: Math.round(food.per100g.fat_g * ratio * 10) / 10,
  };
}
