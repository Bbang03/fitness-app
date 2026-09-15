import { NextResponse } from 'next/server';

import {
  buildDailyCommentAiPrompt,
  dailyCommentAiFallback,
  isDailyCommentAiJudgement,
  parseDailyCommentAiCopy,
  type DailyCommentAiJudgement,
} from '@/lib/dailyCommentAi';

export const runtime = 'nodejs';
export const maxDuration = 15;

const MODEL =
  process.env.GEMINI_DAILY_COMMENT_MODEL?.trim() ||
  process.env.GEMINI_NUTRITION_MODEL?.trim() ||
  'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const responseSchema = {
  type: 'OBJECT',
  properties: {
    comment: { type: 'STRING' },
    positivePoint: { type: 'STRING' },
    nextAction: { type: 'STRING' },
  },
  required: ['comment', 'positivePoint', 'nextAction'],
};

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function deterministicResponse(judgement: DailyCommentAiJudgement) {
  return noStoreJson({
    copy: dailyCommentAiFallback(judgement),
    source: 'deterministic',
  });
}

function modelText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidates = (value as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> };
    }>;
  }).candidates;

  const text = candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.text === 'string',
  )?.text;

  return typeof text === 'string' ? text : null;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: '잘못된 요청입니다.' }, 400);
  }

  if (!isDailyCommentAiJudgement(body)) {
    return noStoreJson({ error: '코치 판정 형식이 올바르지 않습니다.' }, 400);
  }

  const judgement = body;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  // Missing configuration is a normal local-development state. The UI can
  // render the deterministic copy without exposing provider configuration.
  if (!apiKey) {
    return deterministicResponse(judgement);
  }

  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: buildDailyCommentAiPrompt(judgement) }],
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return deterministicResponse(judgement);
    }

    const responseBody: unknown = await response.json();
    const text = modelText(responseBody);
    if (!text) return deterministicResponse(judgement);

    let parsed: unknown;
    try {
      // Markdown fences and trailing prose are deliberately rejected.
      parsed = JSON.parse(text);
    } catch {
      return deterministicResponse(judgement);
    }

    const copy = parseDailyCommentAiCopy(parsed, judgement);
    if (!copy) return deterministicResponse(judgement);

    return noStoreJson({ copy, source: 'llm' });
  } catch {
    // Timeout, provider errors, and network errors all preserve the rule result.
    return deterministicResponse(judgement);
  }
}
