import { db, carCategoriesTable, vehicleBrandsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export interface CarCategoryResult {
  categoryId: number;
  slug: string;
  name: string;
}

export async function resolveCarCategory(
  year: number,
  brandId?: number | null,
): Promise<CarCategoryResult> {
  if (year < 2000) {
    throw new Error("Vehicle year not accepted");
  }

  let isChinese = false;
  if (brandId) {
    const [brand] = await db
      .select({ isChinese: vehicleBrandsTable.isChinese })
      .from(vehicleBrandsTable)
      .where(eq(vehicleBrandsTable.id, brandId));
    isChinese = brand?.isChinese ?? false;
  }

  const categories = await db
    .select()
    .from(carCategoriesTable)
    .where(eq(carCategoriesTable.isActive, true))
    .orderBy(carCategoriesTable.sortOrder);

  let targetSlug: string | undefined;

  if (isChinese) {
    if (year < 2014) targetSlug = "economy";
    else if (year < 2020) targetSlug = "economy_plus";
    else targetSlug = "comfort";
  } else {
    for (const cat of categories) {
      const maxY = cat.maxYear ?? new Date().getFullYear() + 1;
      if (year >= cat.minYear && year <= maxY) {
        targetSlug = cat.slug;
        break;
      }
    }
  }

  if (!targetSlug) throw new Error("Vehicle year not accepted for any category");

  const category = categories.find((c) => c.slug === targetSlug);
  if (!category) throw new Error(`Car category '${targetSlug}' not found in database`);

  return { categoryId: category.id, slug: category.slug, name: category.name };
}

export function getAllowedDriverCategorySlugs(requestedSlug: string): string[] {
  switch (requestedSlug) {
    case "economy":      return ["economy", "economy_plus", "comfort"];
    case "economy_plus": return ["economy_plus", "comfort"];
    case "comfort":      return ["comfort"];
    default:             return ["economy", "economy_plus", "comfort"];
  }
}
