#!/usr/bin/env node
/**
 * 음식 사진 인식 평가 하네스
 *
 * 사용법:
 *   1) npm run dev  (별도 터미널, 3000 포트)
 *   2) node scripts/eval-vision.mjs
 *
 * 옵션:
 *   --dir <path>     이미지 폴더        (기본 scripts/eval/images)
 *   --labels <path>  정답 파일          (기본 scripts/eval/public-labels.json)
 *   --size <px>      리사이즈 최대 변    (기본 1024)  예: --size 640,1024 로 비교
 *   --repeat <n>     같은 사진 n회 반복 → 재현성 측정 (기본 1)
 *   --variants <v>   clean,dark,blur 촬영 조건 (기본 clean)
 *   --files <names>  쉼표로 지정한 파일만 평가
 *   --delay-ms <ms>  요청 사이 대기 시간 (무료 티어 한도 완화)
 *   --out <path>     결과 JSON 저장     (기본 scripts/eval/result.json)
 *
 * labels.json 형식:
 * [
 *   { "file": "01.jpg", "is_food": true,
 *     "items": [ { "name": "백미밥", "grams": 210 }, { "name": "김치", "grams": 40 } ] },
 *   { "file": "20.jpg", "is_food": false, "items": [] }
 * ]
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { candidateIdentityKey, dedupeDetectedFoods } from '../lib/visionCandidateValidation.ts';

// ── args ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const IMG_DIR = arg('dir', 'scripts/eval/images');
const LABELS = arg('labels', 'scripts/eval/public-labels.json');
const SIZES = arg('size', '1024').split(',').map(Number);
const REPEAT = Number(arg('repeat', '1'));
const OUT = arg('out', 'scripts/eval/result.json');
const ENDPOINT = arg('endpoint', 'http://localhost:3000/api/vision/recognize');
const VARIANTS = arg('variants', 'clean').split(',').map(value => value.trim()).filter(Boolean);
const FILE_FILTER = new Set(arg('files', '').split(',').map(value => value.trim()).filter(Boolean));
const DELAY_MS = Math.max(0, Number(arg('delay-ms', '0')) || 0);
const ALLOWED_VARIANTS = new Set(['clean', 'dark', 'blur']);
if (VARIANTS.some(variant => !ALLOWED_VARIANTS.has(variant))) {
  throw new Error(`지원하지 않는 variant: ${VARIANTS.filter(variant => !ALLOWED_VARIANTS.has(variant)).join(', ')}`);
}

// ── sharp (선택) ───────────────────────────────────────────────────────────
// 앱은 브라우저 canvas로 1024px 리사이즈해서 보낸다. 평가도 같은 조건이어야
// 의미가 있으므로 sharp 로 동일하게 줄인다.  npm i -D sharp

let sharp = null;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.warn('⚠  sharp 없음 → 원본 그대로 전송한다. 실제 앱과 조건이 다르다.');
  console.warn('   npm i -D sharp\n');
}

async function toBase64(file, maxEdge, variant = 'clean') {
  const buf = await fs.readFile(file);
  if (!sharp) return buf.toString('base64');
  let pipeline = sharp(buf)
    .rotate()                                   // EXIF 회전 반영 (폰 사진 필수)
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true });
  if (variant === 'dark') pipeline = pipeline.modulate({ brightness: 0.42, saturation: 0.8 });
  if (variant === 'blur') pipeline = pipeline.blur(2.2);
  const out = await pipeline
    .jpeg({ quality: 85 })
    .toBuffer();
  return out.toString('base64');
}

// ── 채점 ───────────────────────────────────────────────────────────────────

const norm = s => candidateIdentityKey(String(s ?? '').replace(/\(.*?\)/g, ''));

/** 예측 항목과 정답 항목을 이름으로 1:1 매칭 (그리디) */
function match(pred, truth) {
  const remaining = truth.map((t, i) => ({ ...t, i, used: false }));
  const pairs = [];
  const unmatchedPred = [];

  for (const p of pred) {
    const hit = remaining.find(t => {
      if (t.used) return false;
      const accepted = [t.name, ...(Array.isArray(t.accepted_names) ? t.accepted_names : [])];
      return accepted.some(name => norm(name) === norm(p.food_name));
    });
    if (hit) {
      hit.used = true;
      pairs.push({ pred: p, truth: hit });
    } else {
      unmatchedPred.push(p);
    }
  }
  return {
    pairs,
    falsePositives: unmatchedPred,
    falseNegatives: remaining.filter(t => !t.used && !t.optional),
  };
}

function summarize(records) {
  let tp = 0, fp = 0, fn = 0;
  let isFoodCorrect = 0, isFoodTotal = 0;
  const gramErrors = [];
  const latencies = [];
  let duplicateItemsRemoved = 0;
  let requestsWithDuplicates = 0;
  let remainingSemanticDuplicates = 0;
  let requestsWithRemainingDuplicates = 0;
  // confidence 구간별 정확도 (calibration)
  const bins = [[0, .4], [.4, .6], [.6, .8], [.8, 1.01]].map(([lo, hi]) => ({ lo, hi, n: 0, correct: 0 }));

  for (const r of records) {
    if (r.error) continue;
    latencies.push(r.ms);
    const removed = Number(r.duplicatesRemoved ?? 0);
    duplicateItemsRemoved += removed;
    if (removed > 0) requestsWithDuplicates++;
    const remaining = Number(r.remainingSemanticDuplicates ?? 0);
    remainingSemanticDuplicates += remaining;
    if (remaining > 0) requestsWithRemainingDuplicates++;

    isFoodTotal++;
    if (r.pred_is_food === r.truth_is_food) isFoodCorrect++;
    if (!r.truth_is_food) continue;   // 비음식 사진은 항목 채점 제외

    tp += r.pairs.length;
    fp += r.falsePositives.length;
    fn += r.falseNegatives.length;

    for (const { pred, truth } of r.pairs) {
      if (truth.grams > 0) gramErrors.push(Math.abs(pred.grams - truth.grams) / truth.grams);
      const b = bins.find(b => pred.confidence >= b.lo && pred.confidence < b.hi);
      if (b) { b.n++; b.correct++; }
    }
    for (const p of r.falsePositives) {
      const b = bins.find(b => p.confidence >= b.lo && p.confidence < b.hi);
      if (b) b.n++;
    }
  }

  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  const sorted = [...latencies].sort((a, b) => a - b);

  return {
    items: { tp, fp, fn, precision, recall, f1 },
    is_food_accuracy: isFoodTotal ? isFoodCorrect / isFoodTotal : 0,
    grams: {
      n: gramErrors.length,
      mape: gramErrors.length ? gramErrors.reduce((a, b) => a + b, 0) / gramErrors.length : 0,
      within_30pct: gramErrors.length ? gramErrors.filter(e => e <= 0.3).length / gramErrors.length : 0,
      within_50pct: gramErrors.length ? gramErrors.filter(e => e <= 0.5).length / gramErrors.length : 0,
    },
    calibration: bins.map(b => ({
      range: `${b.lo.toFixed(1)}–${b.hi >= 1 ? '1.0' : b.hi.toFixed(1)}`,
      n: b.n,
      accuracy: b.n ? b.correct / b.n : null,
    })),
    latency_ms: {
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    },
    duplicates: {
      removed_items: duplicateItemsRemoved,
      affected_requests: requestsWithDuplicates,
      request_rate: latencies.length ? requestsWithDuplicates / latencies.length : 0,
      remaining_semantic_items: remainingSemanticDuplicates,
      remaining_affected_requests: requestsWithRemainingDuplicates,
      remaining_request_rate: latencies.length ? requestsWithRemainingDuplicates / latencies.length : 0,
    },
  };
}

// ── 실행 ───────────────────────────────────────────────────────────────────

async function recognize(file, size, variant) {
  const image = await toBase64(file, size, variant);
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, mimeType: 'image/jpeg' }),
  });
  const ms = Date.now() - t0;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error ?? `HTTP ${res.status}`, ms };
  return { ...json, ms, kb: Math.round((image.length * 3) / 4 / 1024) };
}

const pct = v => (v == null ? '  —  ' : `${(v * 100).toFixed(1)}%`);

async function runSize(labels, size) {
  const records = [];

  for (const label of labels) {
    const file = path.join(IMG_DIR, label.file);
    for (const variant of VARIANTS) {
      for (let rep = 0; rep < REPEAT; rep++) {
      const out = await recognize(file, size, variant);

      if (out.error) {
        console.log(`  ✗ ${label.file} [${variant}]  ${out.error}`);
        records.push({ file: label.file, variant, rep, error: out.error, ms: out.ms });
        if (DELAY_MS) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        continue;
      }

      const pred = out.items ?? [];
      // 동일 문자열뿐 아니라 김밥/참치김밥, 모듬튀김/돈까스처럼 같은 영역의
      // 상위·하위 음식 중복도 실제 서버와 같은 규칙으로 다시 검사한다.
      const remainingSemanticDuplicates = pred.length - dedupeDetectedFoods(pred).length;
      const { pairs, falsePositives, falseNegatives } = match(pred, label.items ?? []);
      records.push({
        file: label.file, variant, rep,
        truth_is_food: label.is_food, pred_is_food: out.is_food,
        pairs, falsePositives, falseNegatives,
        ms: out.ms, kb: out.kb,
        duplicatesRemoved: out.meta?.duplicates_removed ?? 0,
        remainingSemanticDuplicates,
        predNames: [...new Set(pred.map(p => norm(p.food_name)))].sort(),
        pred: pred.map(p => `${p.food_name} ${p.grams}g (${p.confidence.toFixed(2)}${p.matched ? '' : ', DB없음'})`),
      });

      if (rep === 0) {
        const ok = falsePositives.length === 0 && falseNegatives.length === 0;
        console.log(`  ${ok ? '✓' : '·'} ${label.file.padEnd(14)} [${variant.padEnd(5)}] ${out.ms}ms  ${out.kb}KB`);
        if (falseNegatives.length) console.log(`      놓침: ${falseNegatives.map(t => t.name).join(', ')}`);
        if (falsePositives.length) console.log(`      지어냄: ${falsePositives.map(p => p.food_name).join(', ')}`);
      }
      if (DELAY_MS) await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
  }

  // 음식명 재현성: 중량/신뢰도 변동과 분리해 같은 음식 목록인지 확인한다.
  let reproducible = null;
  if (REPEAT > 1) {
    const byFile = {};
    for (const r of records) {
      if (r.error) continue;
      const key = `${r.file}:${r.variant ?? 'clean'}`;
      (byFile[key] ??= []).push(JSON.stringify(r.predNames));
    }
    const files = Object.values(byFile);
    reproducible = files.length
      ? files.filter(runs => new Set(runs).size === 1).length / files.length
      : null;
  }

  return { size, summary: summarize(records), reproducible, records };
}

// ── main ───────────────────────────────────────────────────────────────────

const allLabels = JSON.parse(await fs.readFile(LABELS, 'utf-8'));
const labels = FILE_FILTER.size > 0
  ? allLabels.filter(label => FILE_FILTER.has(label.file))
  : allLabels;
console.log(`평가셋 ${labels.length}장 · 변형 ${VARIANTS.join('/')} · 반복 ${REPEAT}회 · 크기 ${SIZES.join('/')}px\n`);

const results = [];
for (const size of SIZES) {
  console.log(`── ${size}px ──────────────────────────────`);
  results.push(await runSize(labels, size));
  console.log('');
}

console.log('═══ 결과 ═══════════════════════════════════\n');
for (const { size, summary: s, reproducible } of results) {
  console.log(`[${size}px]`);
  console.log(`  항목 검출   P ${pct(s.items.precision)}  R ${pct(s.items.recall)}  F1 ${pct(s.items.f1)}`);
  console.log(`              (놓침 ${s.items.fn}개 · 지어냄 ${s.items.fp}개)`);
  console.log(`  is_food     ${pct(s.is_food_accuracy)}`);
  console.log(`  중량 오차   MAPE ${pct(s.grams.mape)}  ±30% 이내 ${pct(s.grams.within_30pct)}  ±50% 이내 ${pct(s.grams.within_50pct)}`);
  console.log(`  지연        p50 ${s.latency_ms.p50}ms  p95 ${s.latency_ms.p95}ms`);
  console.log(`  중복 예측   ${s.duplicates.removed_items}개 제거 · 요청 비율 ${pct(s.duplicates.request_rate)}`);
  console.log(`  잔여 중복   ${s.duplicates.remaining_semantic_items}개 · 요청 비율 ${pct(s.duplicates.remaining_request_rate)}`);
  if (reproducible != null) console.log(`  음식명 재현성 ${pct(reproducible)} (같은 사진 → 같은 음식 목록)`);
  console.log(`  confidence 구간별 정확도:`);
  for (const b of s.calibration) {
    console.log(`    ${b.range}  n=${String(b.n).padStart(3)}  ${pct(b.accuracy)}`);
  }
  console.log('');
}

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(results, null, 2));
console.log(`상세 결과 → ${OUT}`);
