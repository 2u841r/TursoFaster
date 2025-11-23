import { createReadStream } from "fs";
import { readFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";
import "../drizzle/envConfig";

const BATCH_SIZE = 1000; // Batch size for inserts
const PRODUCT_BATCH_SIZE = 1000; // Batch size for products

interface ConvexCollection {
  _id: string;
  _creationTime: number;
  external_id: number;
  name: string;
  slug: string;
}

interface ConvexCategory {
  _id: string;
  _creationTime: number;
  collection_id: number;
  name: string;
  slug: string;
  image_url?: string;
}

interface ConvexSubcollection {
  _id: string;
  _creationTime: number;
  external_id: number;
  category_slug: string;
  name: string;
}

interface ConvexSubcategory {
  _id: string;
  _creationTime: number;
  subcollection_id: number;
  name: string;
  slug: string;
  image_url?: string;
}

interface ConvexProduct {
  _id: string;
  _creationTime: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  subcategory_slug: string;
  image_url?: string;
}

async function readJSONL<T = unknown>(filePath: string): Promise<T[]> {
  const content = readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

async function readJSONLStream<T = unknown>(filePath: string): Promise<T[]> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const data: T[] = [];
  for await (const line of rl) {
    if (line.trim()) {
      data.push(JSON.parse(line) as T);
    }
  }
  return data;
}

async function importCollections(db: ReturnType<typeof drizzle>) {
  console.log("📦 Importing collections...");
  const filePath = join(
    process.cwd(),
    "data/convex/collections/documents.jsonl",
  );
  const data = (await readJSONL(filePath)) as ConvexCollection[];

  console.log(`   Found ${data.length} collections`);

  // Insert collections
  const collectionsToInsert = data.map((item) => ({
    name: item.name,
    slug: item.slug,
  }));

  // Insert in batches
  for (let i = 0; i < collectionsToInsert.length; i += BATCH_SIZE) {
    const batch = collectionsToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(schema.collections).values(batch);
    console.log(
      `   Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(collectionsToInsert.length / BATCH_SIZE)}`,
    );
  }

  // Build mapping: external_id -> new id
  const allCollections = await db.select().from(schema.collections);
  const collectionMap = new Map<number, number>();
  const slugToIdMap = new Map<string, number>();

  // Build slug -> id map for fast lookup
  for (const dbItem of allCollections) {
    slugToIdMap.set(dbItem.slug, dbItem.id);
  }

  // Match by slug to build external_id -> new id mapping
  for (const convexItem of data) {
    const dbId = slugToIdMap.get(convexItem.slug);
    if (dbId) {
      collectionMap.set(convexItem.external_id, dbId);
    } else {
      console.warn(
        `   ⚠️  Warning: Collection with slug ${convexItem.slug} not found after insert`,
      );
    }
  }

  console.log(`   ✓ Imported ${data.length} collections`);
  return collectionMap;
}

async function importCategories(
  db: ReturnType<typeof drizzle>,
  collectionMap: Map<number, number>,
) {
  console.log("📁 Importing categories...");
  const filePath = join(
    process.cwd(),
    "data/convex/categories/documents.jsonl",
  );
  const data = (await readJSONL(filePath)) as ConvexCategory[];

  console.log(`   Found ${data.length} categories`);

  const categoriesToInsert = data
    .map((item) => {
      const collectionId = collectionMap.get(item.collection_id);
      if (!collectionId) {
        console.warn(
          `   ⚠️  Warning: Collection ID ${item.collection_id} not found for category ${item.slug}`,
        );
        return null;
      }
      return {
        slug: item.slug,
        name: item.name,
        collection_id: collectionId,
        image_url: item.image_url || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Insert in batches
  for (let i = 0; i < categoriesToInsert.length; i += BATCH_SIZE) {
    const batch = categoriesToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(schema.categories).values(batch);
    console.log(
      `   Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(categoriesToInsert.length / BATCH_SIZE)}`,
    );
  }

  console.log(`   ✓ Imported ${categoriesToInsert.length} categories`);
}

async function importSubcollections(db: ReturnType<typeof drizzle>) {
  console.log("📂 Importing subcollections...");
  const filePath = join(
    process.cwd(),
    "data/convex/subcollections/documents.jsonl",
  );
  const data = (await readJSONL(filePath)) as ConvexSubcollection[];

  console.log(`   Found ${data.length} subcollections`);

  const subcollectionsToInsert = data.map((item) => ({
    name: item.name,
    category_slug: item.category_slug,
  }));

  // Insert in batches
  for (let i = 0; i < subcollectionsToInsert.length; i += BATCH_SIZE) {
    const batch = subcollectionsToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(schema.subcollections).values(batch);
    console.log(
      `   Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subcollectionsToInsert.length / BATCH_SIZE)}`,
    );
  }

  // Build mapping: external_id -> new id
  const allSubcollections = await db.select().from(schema.subcollections);
  const subcollectionMap = new Map<number, number>();
  const keyToIdMap = new Map<string, number>();

  // Build composite key -> id map for fast lookup
  for (const dbItem of allSubcollections) {
    const key = `${dbItem.name}::${dbItem.category_slug}`;
    keyToIdMap.set(key, dbItem.id);
  }

  // Match by composite key to build external_id -> new id mapping
  for (const convexItem of data) {
    const key = `${convexItem.name}::${convexItem.category_slug}`;
    const dbId = keyToIdMap.get(key);
    if (dbId) {
      subcollectionMap.set(convexItem.external_id, dbId);
    } else {
      console.warn(
        `   ⚠️  Warning: Subcollection with key ${key} not found after insert`,
      );
    }
  }

  console.log(`   ✓ Imported ${data.length} subcollections`);
  return subcollectionMap;
}

async function importSubcategories(
  db: ReturnType<typeof drizzle>,
  subcollectionMap: Map<number, number>,
) {
  console.log("📋 Importing subcategories...");
  const filePath = join(
    process.cwd(),
    "data/convex/subcategories/documents.jsonl",
  );
  const data = (await readJSONL(filePath)) as ConvexSubcategory[];

  console.log(`   Found ${data.length} subcategories`);

  const subcategoriesToInsert = data
    .map((item) => {
      const subcollectionId = subcollectionMap.get(item.subcollection_id);
      if (!subcollectionId) {
        console.warn(
          `   ⚠️  Warning: Subcollection ID ${item.subcollection_id} not found for subcategory ${item.slug}`,
        );
        return null;
      }
      return {
        slug: item.slug,
        name: item.name,
        subcollection_id: subcollectionId,
        image_url: item.image_url || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Insert in batches
  for (let i = 0; i < subcategoriesToInsert.length; i += BATCH_SIZE) {
    const batch = subcategoriesToInsert.slice(i, i + BATCH_SIZE);
    await db.insert(schema.subcategories).values(batch);
    console.log(
      `   Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subcategoriesToInsert.length / BATCH_SIZE)}`,
    );
  }

  console.log(`   ✓ Imported ${subcategoriesToInsert.length} subcategories`);
}

async function importProducts(db: ReturnType<typeof drizzle>) {
  console.log("🛍️  Importing products...");
  const filePath = join(process.cwd(), "data/convex/products/documents.jsonl");

  // Use streaming for large product file
  console.log(
    "   Reading products file (this may take a moment for large files)...",
  );
  const data = (await readJSONLStream(filePath)) as ConvexProduct[];

  console.log(`   Found ${data.length} products`);

  const productsToInsert = data.map((item) => ({
    slug: item.slug,
    name: item.name,
    description: item.description,
    price: item.price, // real type accepts number
    subcategory_slug: item.subcategory_slug,
    image_url: item.image_url || null,
  }));

  // Insert in batches for products
  const totalBatches = Math.ceil(productsToInsert.length / PRODUCT_BATCH_SIZE);
  for (let i = 0; i < productsToInsert.length; i += PRODUCT_BATCH_SIZE) {
    const batch = productsToInsert.slice(i, i + PRODUCT_BATCH_SIZE);
    await db.insert(schema.products).values(batch);
    const currentBatch = Math.floor(i / PRODUCT_BATCH_SIZE) + 1;
    const progress = (
      ((i + batch.length) / productsToInsert.length) *
      100
    ).toFixed(1);
    console.log(
      `   Inserted batch ${currentBatch}/${totalBatches} (${i + batch.length}/${productsToInsert.length} products, ${progress}%)`,
    );
  }

  console.log(`   ✓ Imported ${productsToInsert.length} products`);
}

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error(
      "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables",
    );
  }

  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const db = drizzle({ client, schema });

  console.log("🚀 Starting data import...\n");

  try {
    const startTime = Date.now();

    // Import in order: collections -> categories -> subcollections -> subcategories -> products
    const collectionMap = await importCollections(db);
    console.log();

    await importCategories(db, collectionMap);
    console.log();

    const subcollectionMap = await importSubcollections(db);
    console.log();

    await importSubcategories(db, subcollectionMap);
    console.log();

    await importProducts(db);
    console.log();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`✅ Import completed in ${duration} seconds!`);
  } catch (error) {
    console.error("❌ Error during import:", error);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
