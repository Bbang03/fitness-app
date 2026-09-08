import { NextRequest, NextResponse } from 'next/server';
import { fatsecretRequest } from '@/lib/fatsecret';

export const runtime = 'nodejs';

function numberValue(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();

  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  try {
    const data = (await fatsecretRequest({
      method: 'food.get.v2',
      food_id: id,
    })) as Record<string, unknown>;

    const food = data.food as Record<string, unknown> | undefined;

    if (!food) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const rawServings = (food.servings as Record<string, unknown> | undefined)?.serving;
    const servingList = Array.isArray(rawServings)
      ? rawServings
      : rawServings
        ? [rawServings]
        : [];

    const servings = servingList
      .map((rawServing, index) => {
        const serving = rawServing as Record<string, unknown>;
        const kcal = numberValue(serving.calories);

        if (kcal <= 0) return null;

        return {
          id: String(serving.serving_id ?? `serving-${index}`),
          description: String(serving.serving_description ?? '1 serving'),
          numberOfUnits: numberValue(serving.number_of_units) || 1,
          metricAmount: numberValue(serving.metric_serving_amount),
          metricUnit: String(serving.metric_serving_unit ?? ''),
          kcal: Math.round(kcal),
          carbs_g: roundOne(numberValue(serving.carbohydrate)),
          protein_g: roundOne(numberValue(serving.protein)),
          fat_g: roundOne(numberValue(serving.fat)),
          isDefault:
            serving.is_default === true ||
            String(serving.is_default ?? '') === '1' ||
            String(serving.is_default ?? '').toLowerCase() === 'true',
        };
      })
      .filter((serving): serving is NonNullable<typeof serving> => serving !== null);

    const foodType = String(food.food_type ?? 'Generic');

    return NextResponse.json({
      id: String(food.food_id ?? id),
      name: String(food.food_name ?? ''),
      brand: String(food.brand_name ?? ''),
      foodType,
      isBrand: foodType.toLowerCase() === 'brand',
      servings,
    });
  } catch (error) {
    console.error('[fatsecret/food]', error);
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 });
  }
}
