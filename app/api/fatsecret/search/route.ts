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

// "Per 100g - Calories: 350kcal | Fat: 7.00g | Carbs: 55.00g | Protein: 15.00g"
// "Per 1 serving (250g) - Calories: 875kcal | ..."
function parseDescription(desc: string) {
  let servingG = 100;
  const gMatch = desc.match(/Per\s+(\d+\.?\d*)\s*g\s*[-–]/i);
  if (gMatch) {
    servingG = parseFloat(gMatch[1]);
  } else {
    const sMatch = desc.match(/\((\d+\.?\d*)\s*g\)/i);
    if (sMatch) servingG = parseFloat(sMatch[1]);
  }
  if (!servingG || servingG <= 0) return null;

  const kcal    = parseFloat(desc.match(/Calories:\s*([\d.]+)/i)?.[1] ?? '0');
  const fat     = parseFloat(desc.match(/Fat:\s*([\d.]+)/i)?.[1] ?? '0');
  const carbs   = parseFloat(desc.match(/Carbs:\s*([\d.]+)/i)?.[1] ?? '0');
  const protein = parseFloat(desc.match(/Protein:\s*([\d.]+)/i)?.[1] ?? '0');
  if (isNaN(kcal)) return null;

  const r = 100 / servingG;
  return {
    servingG,
    per100g: {
      kcal:      Math.round(kcal * r),
      carbs_g:   Math.round(carbs * r * 10) / 10,
      protein_g: Math.round(protein * r * 10) / 10,
      fat_g:     Math.round(fat * r * 10) / 10,
    },
  };
}

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

    const list: FsRawFood[] = Array.isArray(rawFoods) ? rawFoods : [rawFoods];
    const foods = list
      .map((f) => {
        const parsed = parseDescription(String(f.food_description ?? ''));
        if (!parsed) return null;
        return {
          id:       String(f.food_id ?? ''),
          name:     String(f.food_name ?? ''),
          brand:    String(f.brand_name ?? ''),
          servingG: parsed.servingG,
          per100g:  parsed.per100g,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ foods });
  } catch (err) {
    console.error('[fatsecret/search]', err);
    return NextResponse.json({ foods: [] });
  }
}
