import {
  NextRequest,
  NextResponse,
} from 'next/server';


export const runtime =
  'nodejs';

export const maxDuration =
  60;


const MAX_FILE_BYTES =
  12 * 1024 * 1024;


function getOcrBaseUrl() {
  return (
    process.env
      .INBODY_OCR_URL
      ?.trim() ||
    'http://127.0.0.1:8001'
  ).replace(
    /\/$/,
    '',
  );
}


export async function POST(
  request: NextRequest,
) {
  try {
    const incoming =
      await request.formData();

    const image =
      incoming.get(
        'image',
      );

    if (
      !(image instanceof File)
    ) {
      return NextResponse.json(
        {
          error:
            'image_missing',

          message:
            '인바디 이미지를 선택해주세요.',
        },

        {
          status: 400,
        },
      );
    }

    if (
      image.size === 0
    ) {
      return NextResponse.json(
        {
          error:
            'empty_image',

          message:
            '빈 이미지 파일입니다.',
        },

        {
          status: 400,
        },
      );
    }

    if (
      image.size >
      MAX_FILE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            'image_too_large',

          message:
            '이미지는 12MB 이하로 업로드해주세요.',
        },

        {
          status: 413,
        },
      );
    }

    if (
      !image.type.startsWith(
        'image/',
      )
    ) {
      return NextResponse.json(
        {
          error:
            'unsupported_file',

          message:
            '이미지 파일만 업로드할 수 있습니다.',
        },

        {
          status: 415,
        },
      );
    }

    const body =
      new FormData();

    body.append(
      'image',
      image,
      image.name ||
        'inbody-image',
    );

    const response =
      await fetch(
        `${getOcrBaseUrl()}/parse-inbody`,
        {
          method:
            'POST',

          body,

          cache:
            'no-store',

          signal:
            AbortSignal.timeout(
              60_000,
            ),
        },
      );

    const responseText =
      await response.text();

    let payload:
      unknown;

    try {
      payload =
        JSON.parse(
          responseText,
        );
    } catch {
      console.error(
        '[api/inbody/parse] OCR server returned invalid JSON:',
        responseText.slice(
          0,
          1000,
        ),
      );

      return NextResponse.json(
        {
          error:
            'ocr_invalid_response',

          message:
            'OCR 서버 응답 형식이 올바르지 않습니다.',
        },

        {
          status: 502,
        },
      );
    }

    if (
      !response.ok
    ) {
      console.error(
        '[api/inbody/parse] OCR server error:',
        response.status,
        payload,
      );

      const detail =
        typeof payload ===
          'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof (
          payload as {
            detail?: unknown;
          }
        ).detail ===
          'string'

          ? (
              payload as {
                detail:
                  string;
              }
            ).detail

          :
            'OCR 분석에 실패했습니다.';

      return NextResponse.json(
        {
          error:
            'ocr_server_error',

          message:
            detail,
        },

        {
          status:
            response.status,
        },
      );
    }

    return NextResponse.json(
      payload,

      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );

  } catch (
    error
  ) {
    if (
      error instanceof Error &&
      (
        error.name ===
          'TimeoutError' ||
        error.name ===
          'AbortError'
      )
    ) {
      return NextResponse.json(
        {
          error:
            'ocr_timeout',

          message:
            'OCR 분석 시간이 초과되었습니다. 다시 시도해주세요.',
        },

        {
          status: 504,
        },
      );
    }

    console.error(
      '[api/inbody/parse]',
      error,
    );

    return NextResponse.json(
      {
        error:
          'ocr_unavailable',

        message:
          '로컬 OCR 서버에 연결하지 못했습니다. PaddleOCR 서버가 실행 중인지 확인해주세요.',
      },

      {
        status: 503,
      },
    );
  }
}