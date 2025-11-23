import { sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";
import "../drizzle/envConfig";

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

  console.log("🔍 Checking image data in database...\n");

  // Check products
  const products = await db.select().from(schema.products).limit(5);
  console.log("📦 Sample Products:");
  products.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name}`);
    console.log(
      `     image_url: ${p.image_url ? "✅ " + p.image_url.substring(0, 60) + "..." : "❌ NULL"}`,
    );
  });

  // Check categories
  const categories = await db.select().from(schema.categories).limit(5);
  console.log("\n📁 Sample Categories:");
  categories.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name}`);
    console.log(
      `     image_url: ${c.image_url ? "✅ " + c.image_url.substring(0, 60) + "..." : "❌ NULL"}`,
    );
  });

  // Check subcategories
  const subcategories = await db.select().from(schema.subcategories).limit(5);
  console.log("\n📋 Sample Subcategories:");
  subcategories.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.name}`);
    console.log(
      `     image_url: ${s.image_url ? "✅ " + s.image_url.substring(0, 60) + "..." : "❌ NULL"}`,
    );
  });

  // Count products with images
  const productsWithImages = await db
    .select()
    .from(schema.products)
    .where(sql`${schema.products.image_url} IS NOT NULL`);
  console.log(`\n📊 Products with images: ${productsWithImages.length}`);

  const totalProducts = await db.select().from(schema.products);
  console.log(`📊 Total products: ${totalProducts.length}`);
  console.log(
    `📊 Products without images: ${totalProducts.length - productsWithImages.length}`,
  );

  client.close();
}

main().catch(console.error);
