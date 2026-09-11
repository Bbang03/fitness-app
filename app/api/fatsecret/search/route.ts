import { NextRequest, NextResponse } from 'next/server';
import { fatsecretRequest } from '@/lib/fatsecret';

export const runtime = 'nodejs';

interface FsRawFood {
  food_id?: unknown;
  food_name?: unknown;
  food_type?: unknown;
  brand_name?: unknown;
  food_description?: unknown;
}

export async function GET(req: NextRequest) {
  const fatSecretEnabled =
    process.env.NEXT_PUBLIC_FATSECRET_ENABLED === 'true';

  if (!fatSecretEnabled) {
    return NextResponse.json({
      foods: [],
      meta: {
        source: 'fatsecret-disabled',
        count: 0,
        enabled: false,
      },
    });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (q.length < 2) {
    return NextResponse.json({ foods: [] });
  }

  try {
    const data = (await fatsecretRequest({
      method: 'foods.search',
      search_expression: q,
      max_results: '20',
      page_number: '0',
    })) as Record<string, unknown>;

    const rawFoods = (data.foods as Record<string, unknown> | undefined)?.food;

    if (!rawFoods) {
      return NextResponse.json({ foods: [] });
    }

    const list: FsRawFood[] = Array.isArray(rawFoods)
      ? (rawFoods as FsRawFood[])
      : [rawFoods as FsRawFood];

    const foods = list
      .map((food) => {
        const id = String(food.food_id ?? '').trim();
        const name = String(food.food_name ?? '').trim();

        if (!id || !name) return null;

        const foodType = String(food.food_type ?? 'Generic');

        return {
          id,
          name,
          brand: String(food.brand_name ?? '').trim(),
          foodType,
          description: String(food.food_description ?? '').trim(),
          isBrand: foodType.toLowerCase() === 'brand',
        };
      })
      .filter((food): food is NonNullable<typeof food> => food !== null)
      .sort((a, b) => Number(b.isBrand) - Number(a.isBrand));

    return NextResponse.json({
      foods,
      meta: {
        source: 'fatsecret-basic',
        count: foods.length,
        enabled: true,
      },
    });
  } catch (error) {
    console.error('[fatsecret/search]', error);
    return NextResponse.json({ foods: [] });
  }
}