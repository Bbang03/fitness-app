import { NextRequest, NextResponse } from 'next/server';
import { resolveMx } from 'node:dns/promises';

export const runtime = 'nodejs';

const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MX_TIMEOUT_MS = 3000;

async function resolveMxWithTimeout(
  domain: string,
) {
  return Promise.race([
    resolveMx(domain),

    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            'MX_LOOKUP_TIMEOUT',
          ),
        );
      }, MX_TIMEOUT_MS);
    }),
  ]);
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      await request.json();

    const email =
      typeof body.email === 'string'
        ? body.email
            .trim()
            .toLowerCase()
        : '';

    // 1. 기본 이메일 문법 검사
    if (
      !EMAIL_REGEX.test(email)
    ) {
      return NextResponse.json(
        {
          valid: false,
          reason:
            'invalid_format',
          message:
            '올바른 이메일 형식이 아닙니다.',
        },
        {
          status: 400,
        },
      );
    }

    const atIndex =
      email.lastIndexOf('@');

    if (atIndex === -1) {
      return NextResponse.json(
        {
          valid: false,
          reason:
            'invalid_format',
          message:
            '올바른 이메일 형식이 아닙니다.',
        },
        {
          status: 400,
        },
      );
    }

    const domain = email
      .slice(atIndex + 1)
      .trim();

    if (!domain) {
      return NextResponse.json(
        {
          valid: false,
          reason:
            'invalid_domain',
          message:
            '이메일 도메인을 확인할 수 없습니다.',
        },
        {
          status: 400,
        },
      );
    }

    /*
     * 2. MX 확인
     *
     * 중요:
     * MX 조회는 보조 검증이다.
     *
     * DNS 서버 장애, VPN, 회사/학교 네트워크,
     * 보안 프로그램 등으로 resolveMx 자체가
     * 실패할 수 있으므로 DNS 오류만으로
     * 회원가입을 차단하지 않는다.
     *
     * 실제 이메일 소유 여부는 Supabase의
     * confirmation email로 최종 확인한다.
     */
    try {
      const records =
        await resolveMxWithTimeout(
          domain,
        );

      const usableRecords =
        records.filter(
          (record) =>
            Boolean(
              record.exchange,
            ) &&
            record.exchange !== '.',
        );

      /*
       * 명시적인 Null MX(".")만 존재하거나
       * 정상적인 MX 응답에서 usable record가
       * 전혀 없는 경우.
       *
       * 다만 사용자 등록의 최종 검증은
       * confirmation email이 담당한다.
       */
      if (
        records.length > 0 &&
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
    } catch (error) {
      /*
       * DNS lookup 자체의 실패와
       * 잘못된 이메일 주소를 구분한다.
       *
       * 여기서는 fail-open.
       * Supabase 이메일 인증이 최종 검증 역할을 한다.
       */

      const errorCode =
        error &&
        typeof error ===
          'object' &&
        'code' in error
          ? String(
              (
                error as {
                  code?: unknown;
                }
              ).code,
            )
          : 'UNKNOWN';

      console.warn(
        `[email-validation] MX lookup skipped for ${domain}: ${errorCode}`,
      );

      return NextResponse.json({
        valid: true,
        reason:
          'mx_check_skipped',
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
        reason:
          'server_error',
        message:
          '이메일 주소를 확인하는 중 문제가 발생했습니다.',
      },
      {
        status: 500,
      },
    );
  }
}