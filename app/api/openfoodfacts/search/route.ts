import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface OFFProduct {
  product_name?: string;
  product_name_ko?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    'energy-kcal'?: number;
    carbohydrates_100g?: number;
    proteins_100g?: number;
    fat_100g?: number;
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ foods: [] });

  try {
    const params = new URLSearchParams({
      search_terms: q.trim(),
      search_simple: '1',
      json: '1',
      page_size: '10',
      fields: 'product_name,product_name_ko,brands,serving_size,serving_quantity,nutriments',
    });
    const url = `https://world.openfoodfacts.org/cgi/search.pl?${params}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'ChaGok/1.0 (fitness-app)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`OFF ${res.status}`);

    const data = await res.json();
    const products: OFFProduct[] = data.products ?? [];

    const foods = products
      .map((p, i) => {
        const n = p.nutriments ?? {};
        const kcal = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0;
        if (!kcal) return null;

        const servingG =
          typeof p.serving_quantity === 'number' && p.serving_quantity > 0
            ? p.serving_quantity
            : typeof p.serving_quantity === 'string'
            ? parseFloat(p.serving_quantity) || 100
            : 100;

        const name = p.product_name_ko || p.product_name || '';
        if (!name) return null;

        return {
          id: `off-${i}-${name}`,
          name,
          brand: p.brands ?? '',
          servingG,
          per100g: {
            kcal:      Math.round(kcal),
            carbs_g:   Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
            protein_g: Math.round((n.proteins_100g ?? 0) * 10) / 10,
            fat_g:     Math.round((n.fat_100g ?? 0) * 10) / 10,
          },
        };
      })
      .filter(Boolean);

    return NextResponse.json({ foods });
  } catch (err) {
    console.error('[openfoodfacts/search]', err);
    return NextResponse.json({ foods: [] });
  }
}
