export interface GroundedNutritionEstimate {
  name: string;
  per100g: {
    kcal: number;
    carbs_g: number;
    protein_g: number;
    fat_g: number;
  };
  confidence: number;
  summary: string;
  sources: Array<{ title: string; url: string }>;
  search_queries: string[];
}

export interface PublicWebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

type GeminiGroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiPart = { text?: string };

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return named[entity.toLowerCase()] ?? '';
  });
}

export function stripWebHtml(value: string) {
  return decodeHtml(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDuckDuckGoUrl(value: string) {
  try {
    const decoded = decodeHtml(value);
    const redirect = new URL(decoded.startsWith('//') ? `https:${decoded}` : decoded);
    const target = redirect.hostname.endsWith('duckduckgo.com')
      ? redirect.searchParams.get('uddg')
      : redirect.href;
    if (!target) return null;
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1') return null;
    if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function parseDuckDuckGoResults(html: string, limit = 6): PublicWebSearchResult[] {
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    const attrs = match[1];
    const className = attrs.match(/class=["']([^"']+)["']/i)?.[1] ?? '';
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1];
    return /(?:^|\s)(?:result__a|result-link)(?:\s|$)/.test(className) && href
      ? [{ href, content: match[2] }]
      : [];
  });
  const snippets = [...html.matchAll(/<(?:a|td)\b[^>]*class=["'][^"']*(?:result__snippet|result-snippet)[^"']*["'][^>]*>[\s\S]*?<\/(?:a|td)>/gi)]
    .map(match => stripWebHtml(match[0]));

  return links.flatMap((match, index) => {
    const url = unwrapDuckDuckGoUrl(match.href);
    const title = stripWebHtml(match.content);
    if (!url || !title) return [];
    return [{ title, url, snippet: snippets[index] ?? '' }];
  }).filter((item, index, all) => all.findIndex(other => other.url === item.url) === index)
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

export function nutritionEvidenceExcerpt(value: string, maxLength = 3500) {
  const text = stripWebHtml(value);
  const keyword = /100\s*g|kcal|칼로리|탄수화물|단백질|지방|carbohydrate|protein|fat/gi;
  const windows: string[] = [];
  for (const match of text.matchAll(keyword)) {
    const start = Math.max(0, (match.index ?? 0) - 450);
    const end = Math.min(text.length, (match.index ?? 0) + 850);
    const window = text.slice(start, end).trim();
    if (window && !windows.some(existing => existing.includes(window) || window.includes(existing))) windows.push(window);
    if (windows.join('\n').length >= maxLength) break;
  }
  return (windows.length ? windows.join('\n…\n') : text).slice(0, maxLength);
}

export function parsePublicWebNutritionResponse(
  text: string,
  fallbackName: string,
  results: PublicWebSearchResult[],
  searchQuery: string | string[],
): GroundedNutritionEstimate | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (parsed.supported !== true) return null;

  const indexes = Array.isArray(parsed.source_indexes)
    ? [...new Set(parsed.source_indexes.map(Number).filter(index => Number.isInteger(index) && index >= 1 && index <= results.length))]
    : [];
  const sources = indexes.map(index => results[index - 1]);
  let distinctHosts = 0;
  try {
    distinctHosts = new Set(sources.map(source => new URL(source.url).hostname)).size;
  } catch {
    return null;
  }
  if (sources.length < 2 || distinctHosts < 2) return null;

  const values = [parsed.kcal, parsed.carbs_g, parsed.protein_g, parsed.fat_g].map(Number);
  const valid = values.every(number => Number.isFinite(number) && number >= 0)
    && values[0] <= 900
    && values.slice(1).every(number => number <= 100);
  if (!valid) return null;

  return {
    name: String(parsed.name || fallbackName).trim(),
    per100g: {
      kcal: Math.round(values[0]),
      carbs_g: Math.round(values[1] * 10) / 10,
      protein_g: Math.round(values[2] * 10) / 10,
      fat_g: Math.round(values[3] * 10) / 10,
    },
    confidence: Math.max(0, Math.min(0.8, Number(parsed.confidence) || 0)),
    summary: String(parsed.summary || '').trim(),
    sources: sources.map(source => ({ title: source.title, url: source.url })),
    search_queries: Array.isArray(searchQuery) ? searchQuery : [searchQuery],
  };
}

export function parseGroundedNutritionResponse(
  value: unknown,
  fallbackName: string,
): GroundedNutritionEstimate | null {
  const json = value as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      groundingMetadata?: {
        groundingChunks?: GeminiGroundingChunk[];
        webSearchQueries?: unknown[];
      };
    }>;
  };
  const candidate = json?.candidates?.[0];
  const text = candidate?.content?.parts?.find(part => typeof part.text === 'string')?.text;
  const grounding = candidate?.groundingMetadata;
  const sources = (Array.isArray(grounding?.groundingChunks) ? grounding.groundingChunks : [])
    .flatMap(chunk => {
      const url = chunk?.web?.uri?.trim();
      if (!url) return [];
      return [{ title: chunk.web?.title?.trim() || '웹 출처', url }];
    })
    .filter((source, index, all) => all.findIndex(other => other.url === source.url) === index)
    .slice(0, 5);
  const searchQueries = Array.isArray(grounding?.webSearchQueries)
    ? grounding.webSearchQueries.filter((item): item is string => typeof item === 'string')
    : [];

  let distinctHosts = 0;
  try {
    distinctHosts = new Set(sources.map(source => new URL(source.url).hostname)).size;
  } catch {
    return null;
  }

  // "웹 평균"이라는 표시는 단일 페이지 값을 뜻하면 안 된다. 서로 독립적인
  // 도메인 두 곳 이상의 근거가 있을 때만 사용자에게 평균값으로 노출한다.
  if (!text || sources.length < 2 || distinctHosts < 2 || searchQueries.length === 0) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }

  const values = [parsed.kcal, parsed.carbs_g, parsed.protein_g, parsed.fat_g].map(Number);
  const valid = values.every(number => Number.isFinite(number) && number >= 0)
    && values[0] <= 900
    && values.slice(1).every(number => number <= 100);
  if (!valid) return null;

  return {
    name: String(parsed.name || fallbackName).trim(),
    per100g: {
      kcal: Math.round(values[0]),
      carbs_g: Math.round(values[1] * 10) / 10,
      protein_g: Math.round(values[2] * 10) / 10,
      fat_g: Math.round(values[3] * 10) / 10,
    },
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    summary: String(parsed.summary || '').trim(),
    sources,
    search_queries: searchQueries,
  };
}
