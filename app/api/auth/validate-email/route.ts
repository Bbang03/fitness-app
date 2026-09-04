import { NextRequest, NextResponse } from 'next/server';
import { resolveMx } from 'node:dns/promises';

export const runtime = 'nodejs';

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';

    // 1. 기본 이메일 문법 검사
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        {
          valid: false,
          reason: 'invalid_format',
          message:
            '올바른 이메일 형식이 아닙니다.',
        },
        {
          status: 400,
        },
      );
    }

    const atIndex = email.lastIndexOf('@');

    if (atIndex === -1) {
      return NextResponse.json(
        {
          valid: false,
          reason: 'invalid_format',
          message:
            '올바른 이메일 형식이 아닙니다.',
        },
        {
          status: 400,
        },
      );
    }

    const domain =
      email.slice(atIndex + 1);

    if (!domain) {
      return NextResponse.json(
        {
          valid: false,
          reason: 'invalid_domain',
          message:
            '이메일 도메인을 확인할 수 없습니다.',
        },
        {
          status: 400,
        },
      );
    }

    // 2. 실제 이메일 수신이 가능한 도메인인지 MX 확인
    try {
      const records =
        await resolveMx(domain);

      const usableRecords =
        records.filter(
          (record) =>
            Boolean(record.exchange) &&
            record.exchange !== '.',
        );

      if (
        usableRecords.length === 0
      ) {
        return NextResponse.json({
          valid: false,
          reason: 'no_mx',
          message:
            '이 도메인은 이메일을 받을 수 없습니다. 이메일 주소를 다시 확인해주세요.',
        });
      }

      return NextResponse.json({
        valid: true,
        reason: 'valid',
      });
    } catch {
      return NextResponse.json({
        valid: false,
        reason: 'no_mx',
        message:
          '존재하지 않거나 이메일을 받을 수 없는 도메인입니다.',
      });
    }
  } catch (error) {
    console.error(
      'Email validation failed:',
      error,
    );

    return NextResponse.json(
      {
        valid: false,
        reason: 'server_error',
        message:
          '이메일 주소를 확인하는 중 문제가 발생했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}