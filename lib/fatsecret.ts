// Server-side only — do not import in client components

let tokenCache: {
  token: string;
  expiresAt: number;
} | null = null;

export async function getFatsecretToken(): Promise<string> {
  if (
    tokenCache &&
    Date.now() < tokenCache.expiresAt - 60_000
  ) {
    return tokenCache.token;
  }

  const clientId =
    process.env.FATSECRET_CLIENT_ID?.trim();

  const clientSecret =
    process.env.FATSECRET_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      'FatSecret credentials missing',
    );
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`,
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'basic',
  });

  const res = await fetch(
    'https://oauth.fatsecret.com/connect/token',
    {
      method: 'POST',

      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type':
          'application/x-www-form-urlencoded',
      },

      body: body.toString(),

      cache: 'no-store',
    },
  );

  const responseText =
    await res.text();

  if (!res.ok) {
    throw new Error(
      `FatSecret token error ${res.status}: ${responseText}`,
    );
  }

  let json: {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  try {
    json = JSON.parse(responseText);
  } catch {
    throw new Error(
      `FatSecret token response is not valid JSON: ${responseText}`,
    );
  }

  if (!json.access_token) {
    throw new Error(
      `FatSecret token missing access_token: ${responseText}`,
    );
  }

  tokenCache = {
    token: json.access_token,

    expiresAt:
      Date.now() +
      (json.expires_in ?? 86_400) * 1000,
  };

  return tokenCache.token;
}

const FS_API =
  'https://platform.fatsecret.com/rest/server.api';

export async function fatsecretRequest(
  params: Record<string, string>,
): Promise<unknown> {
  const token =
    await getFatsecretToken();

  const url =
    `${FS_API}?${new URLSearchParams({
      ...params,
      format: 'json',
    })}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },

    cache: 'no-store',
  });

  const responseText =
    await res.text();

  if (!res.ok) {
    throw new Error(
      `FatSecret API error ${res.status}: ${responseText}`,
    );
  }

  let json: unknown;

  try {
    json = JSON.parse(
      responseText,
    );
  } catch {
    throw new Error(
      `FatSecret API response is not valid JSON: ${responseText}`,
    );
  }

  if (
    json &&
    typeof json === 'object' &&
    'error' in json
  ) {
    const error = (
      json as {
        error: {
          code?: number | string;
          message?: string;
        };
      }
    ).error;

    throw new Error(
      `FatSecret error ${error.code ?? 'unknown'}: ${
        error.message ?? 'unknown error'
      }`,
    );
  }

  return json;
}