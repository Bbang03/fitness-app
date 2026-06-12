// Server-side only — do not import in client components

let tokenCache: { token: string; expiresAt: number } | null = null;

export async function getFatsecretToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('FatSecret credentials missing');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`FatSecret token error: ${res.status}`);

  const { access_token, expires_in } = await res.json();
  tokenCache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return tokenCache.token;
}

const FS_API = 'https://platform.fatsecret.com/rest/server.api';

export async function fatsecretRequest(params: Record<string, string>): Promise<unknown> {
  const token = await getFatsecretToken();
  const url = `${FS_API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`FatSecret API error: ${res.status}`);
  return res.json();
}
