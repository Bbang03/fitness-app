import fs from 'node:fs/promises';

const API =
  'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02';

const envText =
  await fs.readFile(
    '.env.local',
    'utf8',
  );

const keyLine =
  envText
    .split(/\r?\n/)
    .find((line) =>
      line.startsWith(
        'MFDS_SERVICE_KEY=',
      ),
    );

if (!keyLine) {
  throw new Error(
    'MFDS_SERVICE_KEY가 없습니다.',
  );
}

let serviceKey =
  keyLine
    .slice(
      'MFDS_SERVICE_KEY='
        .length,
    )
    .trim();

try {
  serviceKey =
    decodeURIComponent(
      serviceKey,
    );
} catch {}

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(
      String(value)
        .replace(/,/g, ''),
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function getItems(json) {
  if (
    Array.isArray(json.body?.items)
  ) {
    return json.body.items;
  }

  if (
    Array.isArray(
      json.response?.body?.items,
    )
  ) {
    return json.response.body
      .items;
  }

  return [];
}

let total = 0;
let complete = 0;
let energyValid = 0;

let missingCarbs = 0;
let missingFat = 0;
let missingProtein = 0;

const PAGE_SIZE = 500;
const MAX_PAGES = 10;

for (
  let page = 1;
  page <= MAX_PAGES;
  page++
) {
  console.log(
    `MFDS page ${page} 요청 중...`,
  );

  const params =
    new URLSearchParams({
      serviceKey,
      pageNo: String(page),
      numOfRows:
        String(PAGE_SIZE),
      type: 'json',
    });

  const response =
    await fetch(
      `${API}?${params}`,
    );

  if (!response.ok) {
    throw new Error(
      `MFDS ${response.status}`,
    );
  }

  const json =
    await response.json();

  const items =
    getItems(json);

  if (
    items.length === 0
  ) {
    break;
  }

  for (
    const item
    of items
  ) {
    total++;

    const kcal =
      num(item.AMT_NUM1);

    const protein =
      num(item.AMT_NUM3);

    const fat =
      num(item.AMT_NUM4);

    const carbs =
      num(item.AMT_NUM6);

    if (
      protein === null
    ) {
      missingProtein++;
    }

    if (
      carbs === null
    ) {
      missingCarbs++;
    }

    if (
      fat === null
    ) {
      missingFat++;
    }

    if (
      kcal === null ||
      protein === null ||
      carbs === null ||
      fat === null
    ) {
      continue;
    }

    complete++;

    const macroKcal =
      carbs * 4 +
      protein * 4 +
      fat * 9;

    const gap =
      Math.abs(
        macroKcal - kcal,
      ) / kcal;

    if (
      gap <= 0.15
    ) {
      energyValid++;
    }
  }

  console.log(
    `누적 ${total}개`,
  );
}

console.log('');
console.log(
  '====== 결과 ======',
);

console.log(
  '전체:',
  total,
);

console.log(
  '탄단지 완전:',
  complete,
);

console.log(
  '열량 검산 통과:',
  energyValid,
);

console.log(
  '탄수 누락:',
  missingCarbs,
);

console.log(
  '단백질 누락:',
  missingProtein,
);

console.log(
  '지방 누락:',
  missingFat,
);

console.log('');

console.log(
  '완전 데이터 비율:',
  (
    complete /
    total *
    100
  ).toFixed(1) + '%',
);

console.log(
  '최종 학습 가능 비율:',
  (
    energyValid /
    total *
    100
  ).toFixed(1) + '%',
);