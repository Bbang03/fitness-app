import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_OCR_API_URL =
  'https://chagok-ocr-595235641783.asia-northeast3.run.app';

export async function POST(request: NextRequest) {
  try {
    const incomingFormData = await request.formData();

    // 기존 프론트가 "image" 또는 "file" 중 무엇을 보내더라도 대응
    const uploaded =
      incomingFormData.get('image') ??
      incomingFormData.get('file');

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        {
          error: '이미지 파일이 필요합니다.',
        },
        {
          status: 400,
        },
      );
    }

    if (uploaded.size === 0) {
      return NextResponse.json(
        {
          error: '빈 이미지 파일입니다.',
        },
        {
          status: 400,
        },
      );
    }

    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);

    if (!allowedTypes.has(uploaded.type)) {
      return NextResponse.json(
        {
          error:
            'JPG, PNG, WEBP 이미지만 지원합니다.',
        },
        {
          status: 415,
        },
      );
    }

    const maxFileSize = 12 * 1024 * 1024;

    if (uploaded.size > maxFileSize) {
      return NextResponse.json(
        {
          error:
            '이미지는 12MB 이하로 업로드해주세요.',
        },
        {
          status: 413,
        },
      );
    }

    const ocrApiUrl =
      process.env.INBODY_OCR_API_URL?.trim() ||
      DEFAULT_OCR_API_URL;

    const upstreamFormData = new FormData();

    // Cloud Run FastAPI는 반드시 "image" 필드로 받는다.
    upstreamFormData.append(
      'image',
      uploaded,
      uploaded.name || 'inbody-image',
    );

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 290_000);

    let upstreamResponse: Response;

    try {
      upstreamResponse = await fetch(
        `${ocrApiUrl.replace(/\/+$/, '')}/parse-inbody`,
        {
          method: 'POST',
          body: upstreamFormData,
          cache: 'no-store',
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    const responseText =
      await upstreamResponse.text();

    let responseBody: unknown;

    try {
      responseBody =
        JSON.parse(responseText);
    } catch {
      responseBody = {
        error:
          responseText ||
          'OCR 서버에서 올바르지 않은 응답을 반환했습니다.',
      };
    }

    if (!upstreamResponse.ok) {
      console.error(
        '[InBody OCR Proxy] upstream error:',
        upstreamResponse.status,
        responseBody,
      );

      return NextResponse.json(
        responseBody,
        {
          status:
            upstreamResponse.status,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    return NextResponse.json(
      responseBody,
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      console.error(
        '[InBody OCR Proxy] request timeout',
      );

      return NextResponse.json(
        {
          error:
            'OCR 분석 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.',
        },
        {
          status: 504,
        },
      );
    }

    console.error(
      '[InBody OCR Proxy] request failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          'OCR 서버에 연결하지 못했습니다.',
      },
      {
        status: 503,
      },
    );
  }
}