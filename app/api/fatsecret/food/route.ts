import { NextRequest, NextResponse } from 'next/server';
import { fatsecretRequest } from '@/lib/fatsecret';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  try {
    const data = await fatsecretRequest({
      method: 'food.get.v2',
      food_id: id,
    }) as Record<string, unknown>;

    const food = data?.food as Record<string, unknown> | undefined;
    if (!food) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const rawServings = (food.servings as Record<string, unknown>)?.serving;
    const servingList = Array.isArray(rawServings)
      ? rawServings
      : rawServings
      ? [rawServings]
      : [];

    const servings = servingList.map((s: Record<string, unknown>) => ({
      id: String(s.serving_id ?? ''),
      description: String(s.serving_description ?? ''),
      metric_amount: parseFloat(String(s.metric_serving_amount ?? '0')) || 0,
      metric_unit: String(s.metric_serving_unit ?? 'g'),
      kcal: Math.round(parseFloat(String(s.calories ?? '0')) || 0),
      carbs_g: Math.round((parseFloat(String(s.carbohydrate ?? '0')) || 0) * 10) / 10,
      protein_g: Math.round((parseFloat(String(s.protein ?? '0')) || 0) * 10) / 10,
      fat_g: Math.round((parseFloat(String(s.fat ?? '0')) || 0) * 10) / 10,
    }));

    return NextResponse.json({
      id: String(food.food_id ?? ''),
      name: String(food.food_name ?? ''),
      servings,
    });
  } catch (err) {
    console.error('[fatsecret/food]', err);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
