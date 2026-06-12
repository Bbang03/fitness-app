import { NextRequest, NextResponse } from 'next/server';
import { fatsecretRequest } from '@/lib/fatsecret';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ foods: [] });

  try {
    const data = await fatsecretRequest({
      method: 'foods.search',
      search_expression: q.trim(),
      max_results: '10',
      page_number: '0',
    }) as Record<string, unknown>;

    const rawFoods = (data?.foods as Record<string, unknown>)?.food;
    if (!rawFoods) return NextResponse.json({ foods: [] });

    const list = Array.isArray(rawFoods) ? rawFoods : [rawFoods];
    const foods = list.map((f: Record<string, unknown>) => ({
      id: String(f.food_id ?? ''),
      name: String(f.food_name ?? ''),
      description: String(f.food_description ?? ''),
      type: String(f.food_type ?? ''),
    }));

    return NextResponse.json({ foods });
  } catch (err) {
    console.error('[fatsecret/search]', err);
    return NextResponse.json({ foods: [] });
  }
}
