import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:3001';
const EMAIL = `inbody_test_${Date.now()}@test.com`;
const PW = 'test1234!';

mkdirSync('scripts/shots', { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: `scripts/shots/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  // inject fresh localStorage for this test session
  await ctx.addInitScript(() => localStorage.clear());
  const page = await ctx.newPage();

  // ── 1. 회원가입 ─────────────────────────────────────────────────────────
  console.log('\n[1] 회원가입');
  await page.goto(`${BASE}/signup`);
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="text"]', '테스트유저');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await shot(page, '01_signup_step1');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);
  await shot(page, '02_signup_step2');

  // Step 2: 남성 선택, 키 175, 출생 1995
  await page.click('text=남성');
  const numInputs = page.locator('input[type="number"]');
  await numInputs.nth(0).fill('175');
  await numInputs.nth(1).fill('1995');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`);
  await shot(page, '03_dashboard');
  console.log('  ✅ 회원가입 → 대시보드 도착');

  // ── 2. 인바디 탭 이동 ────────────────────────────────────────────────────
  console.log('\n[2] 인바디 탭');
  await page.locator('nav a[href="/inbody"]').click({ force: true });
  await page.waitForTimeout(400);
  await shot(page, '04_inbody_empty');

  const emptyVisible = await page.locator('text=인바디 기록이 없습니다').isVisible();
  console.log(`  빈 상태 문구: ${emptyVisible ? '✅' : '❌'}`);

  // ── 3. 첫 번째 인바디 기록 ───────────────────────────────────────────────
  console.log('\n[3] 첫 번째 기록 추가 (2026-05-01)');
  await page.locator('text=기록 추가').first().click();
  await page.waitForTimeout(300);
  await shot(page, '05_new_form');

  await page.fill('input[type="date"]', '2026-05-01');
  const n1 = page.locator('input[type="number"]');
  await n1.nth(0).fill('74.5');  // 체중
  await n1.nth(1).fill('35.2'); // 골격근
  await n1.nth(2).fill('18.4'); // 체지방률
  await page.waitForTimeout(300);
  await shot(page, '06_form_filled');

  // preview
  const previewGram = await page.locator('text=74.5 kg').isVisible().catch(() => false);
  console.log(`  입력 미리보기: ${previewGram ? '✅' : '⚠️'}`);
  const fatCalc = await page.locator('text=체지방량').isVisible();
  console.log(`  체지방량 계산 표시: ${fatCalc ? '✅' : '❌'}`);

  await page.click('text=저장');
  await page.waitForTimeout(500);
  await shot(page, '07_after_first');
  const rec1 = await page.locator('text=2026-05-01').first().isVisible();
  console.log(`  첫 기록 목록 표시: ${rec1 ? '✅' : '❌'}`);

  // ── 4. 두 번째 인바디 기록 (차트용) ─────────────────────────────────────
  console.log('\n[4] 두 번째 기록 추가 (2026-06-11)');
  await page.locator('text=기록 추가').first().click();
  await page.waitForTimeout(300);
  await page.fill('input[type="date"]', '2026-06-11');
  const n2 = page.locator('input[type="number"]');
  await n2.nth(0).fill('73.1');
  await n2.nth(1).fill('35.8');
  await n2.nth(2).fill('17.6');
  await page.click('text=저장');
  await page.waitForTimeout(500);
  await shot(page, '08_two_records');

  const hasSvg = await page.locator('svg').count() > 0;
  console.log(`  SVG 추이 차트 표시: ${hasSvg ? '✅' : '❌'}`);
  const trendLabel = await page.locator('text=체성분 추이').isVisible();
  console.log(`  체성분 추이 섹션: ${trendLabel ? '✅' : '❌'}`);

  // ── 5. 최근 측정 스냅샷 ──────────────────────────────────────────────────
  console.log('\n[5] 최근 측정 스냅샷');
  const snapLabel = await page.locator('text=최근 측정').isVisible();
  console.log(`  최근 측정 섹션: ${snapLabel ? '✅' : '❌'}`);

  // Latest weight should be 73.1
  const latestW = await page.getByText('73.1kg').isVisible().catch(() => false);
  console.log(`  최신 체중 73.1kg: ${latestW ? '✅' : '⚠️'}`);
  await shot(page, '09_snapshot');

  // ── 6. 예측 카드 ─────────────────────────────────────────────────────────
  console.log('\n[6] 예측 카드');
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(300);
  await shot(page, '10_prediction');

  const predTitle = await page.locator('text=다음 달 예측').isVisible();
  console.log(`  예측 카드 표시: ${predTitle ? '✅' : '❌'}`);

  const confLow = await page.locator('text=신뢰도 낮음').isVisible();
  console.log(`  신뢰도 낮음 (데이터 없음): ${confLow ? '✅' : '⚠️'}`);

  const noDataAlert = await page.locator('text=식단과 운동 기록을 추가하면').isVisible();
  console.log(`  데이터 부족 안내: ${noDataAlert ? '✅' : '⚠️'}`);

  const bmrRow = await page.locator('text=기초대사량').isVisible();
  const tdeeRow = await page.locator('text=TDEE').isVisible();
  console.log(`  BMR / TDEE 수치: ${bmrRow && tdeeRow ? '✅' : '❌'}`);

  // ── 7. 전체 기록 목록 ────────────────────────────────────────────────────
  console.log('\n[7] 전체 기록 목록');
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(300);
  await shot(page, '11_record_list');

  const allRec = await page.locator('text=전체 기록').isVisible();
  console.log(`  전체 기록 섹션: ${allRec ? '✅' : '❌'}`);
  const newestBadge = await page.locator('text=최신').isVisible();
  console.log(`  최신 뱃지: ${newestBadge ? '✅' : '❌'}`);

  // ── 8. 대시보드 인바디 위젯 ──────────────────────────────────────────────
  console.log('\n[8] 대시보드 인바디 위젯');
  await page.locator('nav a[href="/dashboard"]').click({ force: true });
  await page.waitForTimeout(600);
  await shot(page, '12_dashboard_widget');

  const dashW = await page.getByText('73.1kg').isVisible().catch(() => false);
  console.log(`  위젯 체중 73.1kg: ${dashW ? '✅' : '⚠️'}`);
  const dashBf = await page.locator('text=체지방').first().isVisible();
  console.log(`  위젯 체지방 표시: ${dashBf ? '✅' : '❌'}`);

  // ── 9. 유효성 검사 ────────────────────────────────────────────────────────
  console.log('\n[9] 유효성 검사');
  await page.locator('nav a[href="/inbody"]').click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('text=기록 추가').first().click();
  await page.waitForTimeout(300);

  // Empty form → error
  await page.click('text=저장');
  await page.waitForTimeout(200);
  const errEmpty = await page.locator('text=모든 필드를 입력해주세요').isVisible();
  console.log(`  빈 폼 에러: ${errEmpty ? '✅' : '❌'}`);

  // Skeletal > weight * 0.7
  const n3 = page.locator('input[type="number"]');
  await n3.nth(0).fill('70');
  await n3.nth(1).fill('55'); // 55 > 70*0.7=49 → error
  await n3.nth(2).fill('20');
  await page.click('text=저장');
  await page.waitForTimeout(200);
  const errSkeletal = await page.locator('text=골격근량이 체중보다').isVisible();
  console.log(`  골격근 초과 에러: ${errSkeletal ? '✅' : '❌'}`);
  await shot(page, '13_validation');

  await browser.close();
  console.log('\n🎉 인바디 전체 플로우 테스트 완료');
}

main().catch(e => { console.error('\n❌ 오류:', e.message); process.exit(1); });
