export interface VisionCandidateInput {
  name: string;
  confidence: number;
  reason: string;
}

export function splitKnownCombinedFoods<T extends {
  name: string;
  raw_name?: string;
  grams: number;
  visual_candidates?: VisionCandidateInput[];
}>(items: T[]): T[] {
  const hasDanmuji = items.some(item => candidateIdentityKey(item.raw_name || item.name) === '단무지');
  const hasPickle = items.some(item => candidateIdentityKey(item.raw_name || item.name) === '오이피클');
  if (hasDanmuji && hasPickle) return items;

  const combinedIndex = items.findIndex(item => {
    const text = [item.raw_name, item.name, ...(item.visual_candidates ?? []).map(candidate => candidate.name)]
      .filter(Boolean)
      .join(' ');
    return /단무지[\s\S]*(?:오이\s*)?피클|(?:오이\s*)?피클[\s\S]*단무지/.test(text);
  });
  if (combinedIndex < 0) return items;

  const combined = items[combinedIndex];
  const grams = Math.max(5, Math.round((Number(combined.grams) || 20) / 2));
  const makeItem = (name: string): T => ({
    ...combined,
    name,
    raw_name: name,
    grams,
    visual_candidates: [{
      name,
      confidence: Number(combined.visual_candidates?.[0]?.confidence) || 0.75,
      reason: '사진에서 단무지와 피클이 함께 보임',
    }],
  });

  return items.flatMap((item, index) => index === combinedIndex
    ? [makeItem('단무지'), makeItem('오이 피클')]
    : [item]);
}

export function normalizeCandidateName(value: string) {
  return value
    .toLowerCase()
    .replace(/\((소|중|대|small|medium|large)\)/gi, '')
    .replace(/\b(small|medium|large)\b/gi, '')
    .replace(/[^a-z0-9가-힣]/g, '');
}

export function isGenericBurgerName(value: string) {
  const name = normalizeCandidateName(value).replace(/오픈(?:형태|형|페이스)?|openface/g, '');
  return ['버거', '햄버거', '일반버거', '일반햄버거', 'burger', 'hamburger'].includes(name);
}

function isFallbackCandidateName(value: string) {
  const name = normalizeCandidateName(value);
  return [
    '기타',
    '기타음식',
    '알수없음',
    '알수없는음식',
    '음식',
    '반찬',
    'other',
    'unknown',
    'unknownfood',
    'food',
  ].includes(name);
}

function isGenericFriedCandidateName(value: string) {
  const name = normalizeCandidateName(value);
  return [
    '튀김',
    '튀김요리',
    '튀김류',
    '튀김모듬',
    '모듬튀김',
    '모둠튀김',
    '종합튀김',
    'tempura',
    'mixedtempura',
  ].includes(name);
}

function isSpecificFriedCandidateName(value: string) {
  const name = normalizeCandidateName(value);
  if (isGenericFriedCandidateName(name)) return false;
  return /튀김|돈까스|돈가스|커틀릿|cutlet|가라아게|까스/.test(name);
}

export function candidateIdentityKey(value: string) {
  const name = normalizeCandidateName(value);
  const aliases: Record<string, string> = {
    김치: '배추김치',
    배추김치: '배추김치',
    포기김치: '배추김치',
    배추포기김치: '배추김치',
    흰밥: '백미밥',
    쌀밥: '백미밥',
    흰쌀밥: '백미밥',
    백미밥: '백미밥',
    공기밥: '백미밥',
    밥한공기: '백미밥',
    흰쌀밥한공기: '백미밥',
    비빔밥: '비빔밥',
    돌솥비빔밥: '비빔밥',
    불고기: '불고기',
    소불고기: '불고기',
    쇠고기불고기: '불고기',
    삼겹살: '삼겹살',
    구운삼겹살: '삼겹살',
    삼겹살구이: '삼겹살',
    삼겹살구운: '삼겹살',
    후라이드치킨: '프라이드치킨',
    프라이드치킨: '프라이드치킨',
    달걀후라이: '계란후라이',
    계란후라이: '계란후라이',
    // 조리법·수식어 위치만 다른 표현은 같은 음식으로 취급한다.
    // 일반 계란·계란후라이와는 영양값이 다르므로 삶은 계란끼리만 합친다.
    삶은계란: '계란삶은',
    계란삶은: '계란삶은',
    삶은달걀: '계란삶은',
    달걀삶은: '계란삶은',
    연두부: '연두부',
    두부연두부: '연두부',
    프렌치프라이: '감자튀김',
    프렌치프라이스: '감자튀김',
    양배추: '양배추',
    양배추샐러드: '양배추샐러드드레싱포함',
    양배추샐러드드레싱포함: '양배추샐러드드레싱포함',
    코울슬로: '양배추샐러드드레싱포함',
    coleslaw: '양배추샐러드드레싱포함',
    채썬양배추: '양배추',
    채썬양배추샐러드: '양배추샐러드드레싱포함',
    양배추채: '양배추',
    양배추채썰기: '양배추',
    피클: '오이피클',
    딜피클: '오이피클',
    오이피클: '오이피클',
    오이피클통오이: '오이피클',
    할라피뇨: '오이피클',
    할라피뇨피클: '오이피클',
    고추피클: '오이피클',
    왕새우튀김: '새우튀김',
    새우튀김: '새우튀김',
    햄버거오픈형: '햄버거',
    햄버거오픈형태: '햄버거',
    햄버거오픈페이스: '햄버거',
    오픈햄버거: '햄버거',
    초밥: '초밥',
    모듬초밥: '초밥',
    모둠초밥: '초밥',
    초밥세트: '초밥',
    돈까스: '돈까스',
    돈가스: '돈까스',
    돈카츠: '돈까스',
    왕돈까스: '돈까스',
    왕돈가스: '돈까스',
    등심돈까스: '돈까스',
    등심돈가스: '돈까스',
    계란말이: '계란말이',
    달걀말이: '계란말이',
    계란말이조각: '계란말이',
    달걀말이조각: '계란말이',
    카레소스: '카레소스',
    카레라이스소스: '카레소스',
    돈카츠카레소스: '카레소스',
    돈까스카레소스: '카레소스',
    노란단무지: '단무지',
    검은깨가뿌려진백미밥: '백미밥',
    검은깨백미밥: '백미밥',
    미소장국: '미소장국',
    미소된장국: '미소장국',
    장국: '우동국물',
    우동장국: '우동국물',
    우동국물: '우동국물',
    튀김모듬: '모듬튀김',
    모듬튀김: '모듬튀김',
    모둠튀김: '모듬튀김',
  };
  if (aliases[name]) return aliases[name];

  if (name.includes('감자튀김') || name.includes('frenchfries')) return '감자튀김';
  if (name.includes('콜라') || name.includes('cocacola') || name.includes('cola')) {
    const zero = name.includes('제로') || name.includes('zero') || name.includes('다이어트') || name.includes('diet');
    return zero ? '제로콜라' : '일반콜라';
  }
  if (name.includes('불고기') && (name.includes('와퍼') || name.includes('whopper'))) return '불고기와퍼';
  if (name.includes('와퍼') || name.includes('whopper')) return '와퍼';
  if (name.includes('새우') && (name.includes('버거') || name.includes('burger'))) return '새우버거';
  return name;
}

export function collapseEquivalentCandidates<T extends {
  name: string;
  display_name?: string;
  vision_name?: string;
}>(candidates: T[]) {
  const unique = new Map<string, T>();

  candidates.forEach(candidate => {
    const visibleName = candidate.display_name ?? candidate.vision_name ?? candidate.name;
    const key = candidateIdentityKey(visibleName);
    if (!unique.has(key)) unique.set(key, candidate);
  });

  return [...unique.values()];
}

export function selectMeaningfulDatabaseCandidates<T extends {
  name: string;
  score: number;
  display_name?: string;
  vision_name?: string;
}>(candidates: T[], limit = 3) {
  const exactMatches = candidates.filter(candidate => candidate.score >= 100);
  const relevant = exactMatches.length > 0 ? exactMatches : candidates;
  return collapseEquivalentCandidates(relevant).slice(0, limit);
}

function validBox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const box = value.map(Number);
  if (!box.every(number => Number.isFinite(number) && number >= 0 && number <= 1000)) return null;
  if (box[2] <= box[0] || box[3] <= box[1]) return null;
  return box as [number, number, number, number];
}

function boxContainment(aValue: unknown, bValue: unknown) {
  const a = validBox(aValue);
  const b = validBox(bValue);
  if (!a || !b) return 0;
  const height = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const width = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const intersection = height * width;
  const smallerArea = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function boxArea(value: unknown) {
  const box = validBox(value);
  return box ? (box[2] - box[0]) * (box[3] - box[1]) : 0;
}

function foodFamilyKey(value: string) {
  const name = normalizeCandidateName(value);
  if (/피자|pizza/.test(name)) return '피자';
  if (/파스타|스파게티|pasta|spaghetti/.test(name)) return '파스타';
  if (/버거|와퍼|burger|whopper/.test(name)) return '버거';
  if (/라면|라멘|ramen/.test(name)) return '라면';
  if (/김밥|gimbap|kimbap/.test(name)) return '김밥';
  if (/김치|kimchi/.test(name) && !/찌개|볶음밥|ramen/.test(name)) return '김치';
  if (/양배추|cabbage/.test(name) && !/코울슬로|coleslaw/.test(name)) return '양배추';
  if (/튀김|돈까스|돈가스|커틀릿|cutlet|가라아게|까스/.test(name)) return '튀김요리';
  return candidateIdentityKey(value);
}

export function dedupeDetectedFoods<T extends {
  food_name: string;
  grams: number;
  confidence: number;
  box_2d?: number[];
}>(items: T[]) {
  const deduped: T[] = [];

  items.forEach(item => {
    const duplicateIndex = deduped.findIndex(other => {
      const sameIdentity = candidateIdentityKey(item.food_name) === candidateIdentityKey(other.food_name);
      const gramRatio = Math.min(item.grams, other.grams) / Math.max(item.grams, other.grams);
      const containment = boxContainment(item.box_2d, other.box_2d);
      if (sameIdentity) return containment >= 0.5 || gramRatio >= 0.6;
      return foodFamilyKey(item.food_name) === foodFamilyKey(other.food_name) && containment >= 0.72;
    });

    if (duplicateIndex < 0) {
      deduped.push(item);
      return;
    }

    const previous = deduped[duplicateIndex];
    const sameIdentity = candidateIdentityKey(item.food_name) === candidateIdentityKey(previous.food_name);
    const sameFamily = foodFamilyKey(item.food_name) === foodFamilyKey(previous.food_name);
    const itemArea = boxArea(item.box_2d);
    const previousArea = boxArea(previous.box_2d);

    // 모델이 접시 전체를 일반명으로 한 번, 그 일부를 구체 메뉴로 다시 잡은 경우
    // 더 넓은 영역(총중량)을 남겨 일부만 기록되는 오류를 막는다.
    if (!sameIdentity && sameFamily && itemArea > 0 && previousArea > 0) {
      const areaRatio = Math.max(itemArea, previousArea) / Math.min(itemArea, previousArea);
      if (areaRatio >= 1.35) {
        if (itemArea > previousArea) deduped[duplicateIndex] = item;
        return;
      }
    }

    const itemSpecificity = normalizeCandidateName(item.food_name).length;
    const previousSpecificity = normalizeCandidateName(previous.food_name).length;
    if (item.confidence > previous.confidence + 0.05
      || (Math.abs(item.confidence - previous.confidence) <= 0.05 && itemSpecificity > previousSpecificity)) {
      deduped[duplicateIndex] = item;
    }
  });

  return deduped;
}

export function cleanVisualCandidates(candidates: VisionCandidateInput[]) {
  const sorted = candidates
    .filter(candidate => candidate?.name?.trim())
    .map(candidate => ({
      name: candidate.name.trim(),
      confidence: Math.max(0, Math.min(1, Number(candidate.confidence) || 0)),
      reason: candidate.reason?.trim() || '',
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const withoutFallback = sorted.some(candidate => !isFallbackCandidateName(candidate.name))
    ? sorted.filter(candidate => !isFallbackCandidateName(candidate.name))
    : sorted;

  const withoutCompoundDuplicates = withoutFallback.filter((candidate, candidateIndex, all) => {
    const parts = candidate.name.split(/\s*(?:및|그리고|\+|&)\s*/).map(part => part.trim()).filter(Boolean);
    if (parts.length < 2) return true;
    return !parts.some(part => all.some((other, otherIndex) =>
      otherIndex !== candidateIndex
      && candidateIdentityKey(other.name) === candidateIdentityKey(part),
    ));
  });

  // "모듬튀김"은 새우튀김·돈까스 같은 구체 후보의 상위 표현일 뿐 사용자가
  // 영양값을 고르는 데 유용한 별도 선택지가 아니다. 구체 후보가 있으면 숨긴다.
  const bestGenericFriedConfidence = Math.max(
    0,
    ...withoutCompoundDuplicates
      .filter(candidate => isGenericFriedCandidateName(candidate.name))
      .map(candidate => candidate.confidence),
  );
  const hasSpecificFriedCandidate = withoutCompoundDuplicates.some(candidate =>
    isSpecificFriedCandidateName(candidate.name)
      && candidate.confidence >= 0.45
      && candidate.confidence >= bestGenericFriedConfidence - 0.15,
  );
  const withoutGenericFried = hasSpecificFriedCandidate
    ? withoutCompoundDuplicates.filter(candidate => !isGenericFriedCandidateName(candidate.name))
    : withoutCompoundDuplicates;

  const specificBurger = withoutGenericFried.find(candidate =>
    !isGenericBurgerName(candidate.name)
      && /버거|와퍼|burger|whopper/i.test(candidate.name)
      && candidate.confidence >= 0.75,
  );

  const meaningful = specificBurger
    ? withoutGenericFried.filter(candidate => !isGenericBurgerName(candidate.name))
    : withoutGenericFried;

  const deduped = new Map<string, VisionCandidateInput>();
  meaningful.forEach(candidate => {
    const key = candidateIdentityKey(candidate.name);
    const previous = deduped.get(key);
    // 감지명을 앞에 넣어도 모델이 제공한 시각 근거를 잃지 않도록 병합한다.
    if (!previous) deduped.set(key, candidate);
    else if (!previous.reason && candidate.reason) deduped.set(key, { ...previous, reason: candidate.reason });
  });
  return [...deduped.values()].slice(0, 3);
}
