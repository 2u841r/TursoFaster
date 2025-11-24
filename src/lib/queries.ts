import { cookies } from "next/headers";
import { verifyToken } from "./session";
import {
  categories,
  products,
  subcategories,
  subcollections,
  users,
} from "@/db/schema";
import { db } from "@/db";
import { eq, and, count } from "drizzle-orm";
import { unstable_cache } from "./unstable-cache";
import { sql } from "drizzle-orm";

export async function getUser() {
  const sessionCookie = (await cookies()).get("session");
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== "number"
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export const getProductsForSubcategory = unstable_cache(
  (subcategorySlug: string) =>
    db.query.products.findMany({
      where: (products, { eq, and }) =>
        and(eq(products.subcategory_slug, subcategorySlug)),
      orderBy: (products, { asc }) => asc(products.slug),
    }),
  ["subcategory-products"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getCollections = unstable_cache(
  () =>
    db.query.collections.findMany({
      with: {
        categories: true,
      },
      orderBy: (collections, { asc }) => asc(collections.name),
    }),
  ["collections"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getProductDetails = unstable_cache(
  (productSlug: string) =>
    db.query.products.findFirst({
      where: (products, { eq }) => eq(products.slug, productSlug),
    }),
  ["product"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getSubcategory = unstable_cache(
  (subcategorySlug: string) =>
    db.query.subcategories.findFirst({
      where: (subcategories, { eq }) => eq(subcategories.slug, subcategorySlug),
    }),
  ["subcategory"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getCategory = unstable_cache(
  (categorySlug: string) =>
    db.query.categories.findFirst({
      where: (categories, { eq }) => eq(categories.slug, categorySlug),
      with: {
        subcollections: {
          with: {
            subcategories: true,
          },
        },
      },
    }),
  ["category"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getCollectionDetails = unstable_cache(
  async (collectionSlug: string) =>
    db.query.collections.findMany({
      with: {
        categories: true,
      },
      where: (collections, { eq }) => eq(collections.slug, collectionSlug),
      orderBy: (collections, { asc }) => asc(collections.slug),
    }),
  ["collection"],
  {
    revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 24, // no cache in dev, two hours in prod
  },
);

export const getProductCount = unstable_cache(
  () => db.select({ count: count() }).from(products),
  ["total-product-count"],
  {
    revalidate: 60 * 60 * 24, // two hours,
  },
);

// could be optimized by storing category slug on the products table
export const getCategoryProductCount = unstable_cache(
  (categorySlug: string) =>
    db
      .select({ count: count() })
      .from(categories)
      .leftJoin(
        subcollections,
        eq(categories.slug, subcollections.category_slug),
      )
      .leftJoin(
        subcategories,
        eq(subcollections.id, subcategories.subcollection_id),
      )
      .leftJoin(products, eq(subcategories.slug, products.subcategory_slug))
      .where(eq(categories.slug, categorySlug)),
  ["category-product-count"],
  {
    revalidate: 60 * 60 * 24, // two hours,
  },
);

export const getSubcategoryProductCount = unstable_cache(
  (subcategorySlug: string) =>
    db
      .select({ count: count() })
      .from(products)
      .where(eq(products.subcategory_slug, subcategorySlug)),
  ["subcategory-product-count"],
  {
    revalidate: 60 * 60 * 24, // two hours,
  },
);

export const getSearchResults = unstable_cache(
  async (searchTerm: string) => {
    // Optimized SQLite search using COLLATE NOCASE for case-insensitive matching
    // This allows index usage unlike LOWER()
    const trimmedTerm = searchTerm.trim();
    
    // For multiple words, create AND conditions
    const searchTerms = trimmedTerm
      .split(" ")
      .filter((term) => term.trim() !== "")
      .map((term) => term.trim());

    if (searchTerms.length === 0) {
      return [];
    }

    let whereCondition;
    if (searchTerms.length === 1) {
      // Single term: use prefix matching when possible (can use index)
      // Fall back to contains matching for short terms
      const term = searchTerms[0];
      if (term.length >= 3) {
        // Prefix match can use index: "term%"
        whereCondition = sql`${products.name} COLLATE NOCASE LIKE ${term + "%"}`;
      } else {
        // Short terms: use contains but limit results early
        whereCondition = sql`${products.name} COLLATE NOCASE LIKE ${"%" + term + "%"}`;
      }
    } else {
      // Multiple terms: all must match (AND condition)
      // Use prefix matching for first term when possible
      const firstTerm = searchTerms[0];
      const firstPattern = firstTerm.length >= 3 ? firstTerm + "%" : "%" + firstTerm + "%";
      let condition = sql`${products.name} COLLATE NOCASE LIKE ${firstPattern}`;
      
      for (let i = 1; i < searchTerms.length; i++) {
        const term = searchTerms[i];
        const pattern = term.length >= 3 ? term + "%" : "%" + term + "%";
        condition = sql`${condition} AND ${products.name} COLLATE NOCASE LIKE ${pattern}`;
      }
      whereCondition = condition;
    }

    // Apply limit early to reduce rows processed
    const results = await db
      .select()
      .from(products)
      .where(whereCondition)
      .limit(5)
      .innerJoin(
        subcategories,
        sql`${products.subcategory_slug} = ${subcategories.slug}`,
      )
      .innerJoin(
        subcollections,
        sql`${subcategories.subcollection_id} = ${subcollections.id}`,
      )
      .innerJoin(
        categories,
        sql`${subcollections.category_slug} = ${categories.slug}`,
      );

    return results;
  },
  ["search-results"],
  { revalidate: process.env.NODE_ENV === "development" ? false : 60 * 60 * 2 }, // no cache in dev, two hours in prod
);
