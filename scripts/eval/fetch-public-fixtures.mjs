#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = new URL('./images/', import.meta.url);
const LABELS_PATH = new URL('./public-labels.json', import.meta.url);
const ATTRIBUTION_PATH = new URL('./public-attribution.json', import.meta.url);

const fixtures = [
  { file: 'public_01_bibimbap.jpg', query: 'Korean cuisine Bibimbap', name: '비빔밥', accepted_names: ['돌솥비빔밥'] },
  { file: 'public_02_kimchi_jjigae.jpg', query: 'Kimchi jjigae', name: '김치찌개', evaluate: false },
  { file: 'public_03_tteokbokki.jpg', query: 'Tteokbokki Korean food', name: '떡볶이' },
  { file: 'public_04_samgyeopsal.jpg', query: 'Samgyeopsal grilled pork belly Korean food', name: '삼겹살', accepted_names: ['삼겹살 구이', '구운 삼겹살', '삼겹살 (구운)'] },
  { file: 'public_05_fried_chicken.jpg', query: 'Korean fried chicken food', name: '치킨버거', evaluate: false },
  { file: 'public_06_cheese_pizza.jpg', query: 'Cheese pizza food', name: '피자', accepted_names: ['치즈 피자', '피자 (치즈)'] },
  { file: 'public_07_cucumber_pickles.jpg', query: 'Cucumber dill pickles food', name: '오이 피클', accepted_names: ['피클'] },
  { file: 'public_08_cabbage_salad.jpg', query: 'Shredded cabbage salad food', name: '양배추', accepted_names: ['양배추 샐러드', '채 썬 양배추'] },
  { file: 'public_09_japchae.jpg', query: 'Japchae Korean noodle dish', name: '잡채' },
  { file: 'public_10_bulgogi.jpg', query: 'Bulgogi Korean beef dish', name: '불고기' },
  { file: 'public_11_gimbap.jpg', query: 'Gimbap sliced Korean food', name: '김밥' },
  { file: 'public_12_ramyeon.jpg', query: 'Ramyeon Korean food', name: '라면', accepted_names: ['라멘', '라면 (국물 포함)'] },
  { file: 'public_13_cola_zero.jpg', query: 'Coke Zero can', name: '코카콜라 제로', accepted_names: ['제로 콜라', '콜라 제로'] },
  { file: 'public_14_cola_regular.jpg', query: 'Coca Cola classic can', name: '코카콜라', accepted_names: ['콜라', '일반 콜라'] },
  { file: 'public_15_sushi.jpg', query: 'Sushi platter food', name: '초밥', accepted_names: ['스시', '모둠초밥'] },
  { file: 'public_16_laptop.jpg', query: 'Laptop computer on desk', is_food: false },
  { file: 'public_17_empty_plate.jpg', query: 'Empty plate', is_food: false },
  { file: 'public_18_pajeon.jpg', query: 'Korean seafood pajeon pancake', name: '해물파전', accepted_names: ['파전', '해물전'] },
  { file: 'public_19_korean_chicken.jpg', query: 'Korean fried chicken pieces', name: '프라이드치킨', accepted_names: ['후라이드치킨', '치킨'] },
  { file: 'public_20_caesar_salad.jpg', query: 'Caesar salad food', name: '시저 샐러드', accepted_names: ['샐러드'] },
];

const append = process.argv.includes('--append');

async function findImage(query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '960',
  });
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'FitTrack-local-evaluation/1.0' },
    });
    if (response.status !== 429 || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  if (!response) return null;
  if (!response.ok) {
    if (response.status === 429) return null;
    throw new Error(`Commons search ${response.status}`);
  }
  const data = await response.json();
  const pages = Object.values(data.query?.pages ?? {});
  const page = pages.find(item => {
    const info = item.imageinfo?.[0];
    return (info?.thumburl || info?.url) && /^image\/(jpeg|png|webp)$/.test(info.mime ?? '');
  });
  if (!page) return null;
  return page;
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const labels = append
  ? JSON.parse(await fs.readFile(LABELS_PATH, 'utf8').catch(() => '[]'))
  : [];
const attribution = append
  ? JSON.parse(await fs.readFile(ATTRIBUTION_PATH, 'utf8').catch(() => '[]'))
  : [];
const existingFiles = new Set(attribution.map(item => item.file));
const persist = async () => {
  await fs.writeFile(LABELS_PATH, `${JSON.stringify(labels, null, 2)}\n`);
  await fs.writeFile(ATTRIBUTION_PATH, `${JSON.stringify(attribution, null, 2)}\n`);
};

for (const fixture of fixtures) {
  if (append && existingFiles.has(fixture.file)) continue;
  const page = await findImage(fixture.query);
  if (!page) {
    console.warn(`${fixture.file}: no public image found`);
    continue;
  }
  const info = page.imageinfo[0];
  const imageResponse = await fetch(info.thumburl || info.url, {
    headers: { 'User-Agent': 'FitTrack-local-evaluation/1.0' },
  });
  if (!imageResponse.ok) throw new Error(`Image download ${imageResponse.status}`);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(new URL(fixture.file, OUTPUT_DIR), buffer);
  if (fixture.evaluate !== false) {
    labels.push({
      file: fixture.file,
      is_food: fixture.is_food !== false,
      items: fixture.is_food === false
        ? []
        : [{ name: fixture.name, accepted_names: fixture.accepted_names ?? [], grams: 0 }],
    });
  }
  attribution.push({
    file: fixture.file,
    expected: fixture.name,
    commons_title: page.title,
    description_url: info.descriptionurl,
    artist: info.extmetadata?.Artist?.value ?? '',
    license: info.extmetadata?.LicenseShortName?.value ?? '',
  });
  existingFiles.add(fixture.file);
  await persist();
  console.log(`${fixture.file}: ${page.title}`);
}

await persist();
console.log(`Saved ${labels.length} public fixtures to ${path.resolve(OUTPUT_DIR.pathname)}`);
