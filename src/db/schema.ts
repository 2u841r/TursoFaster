import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
});

export type Collection = typeof collections.$inferSelect;

export const categories = sqliteTable(
  "categories",
  {
    slug: text("slug").notNull().primaryKey(),
    name: text("name").notNull(),
    collection_id: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    image_url: text("image_url"),
  },
  (table) => ({
    collectionIdIdx: index("categories_collection_id_idx").on(
      table.collection_id,
    ),
  }),
);

export type Category = typeof categories.$inferSelect;

export const subcollections = sqliteTable(
  "subcollections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    category_slug: text("category_slug")
      .notNull()
      .references(() => categories.slug, { onDelete: "cascade" }),
  },
  (table) => ({
    categorySlugIdx: index("subcollections_category_slug_idx").on(
      table.category_slug,
    ),
  }),
);

export type Subcollection = typeof subcollections.$inferSelect;

export const subcategories = sqliteTable(
  "subcategories",
  {
    slug: text("slug").notNull().primaryKey(),
    name: text("name").notNull(),
    subcollection_id: integer("subcollection_id")
      .notNull()
      .references(() => subcollections.id, { onDelete: "cascade" }),
    image_url: text("image_url"),
  },
  (table) => ({
    subcollectionIdIdx: index("subcategories_subcollection_id_idx").on(
      table.subcollection_id,
    ),
  }),
);

export type Subcategory = typeof subcategories.$inferSelect;

export const products = sqliteTable(
  "products",
  {
    slug: text("slug").notNull().primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    price: real("price").notNull(),
    subcategory_slug: text("subcategory_slug")
      .notNull()
      .references(() => subcategories.slug, { onDelete: "cascade" }),
    image_url: text("image_url"),
  },
  (table) => ({
    nameSearchIndex: index("name_search_index").on(table.name),
    subcategorySlugIdx: index("products_subcategory_slug_idx").on(
      table.subcategory_slug,
    ),
  }),
);

export type Product = typeof products.$inferSelect;

export const collectionsRelations = relations(collections, ({ many }) => ({
  categories: many(categories),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  collection: one(collections, {
    fields: [categories.collection_id],
    references: [collections.id],
  }),
  subcollections: many(subcollections),
}));

export const subcollectionRelations = relations(
  subcollections,
  ({ one, many }) => ({
    category: one(categories, {
      fields: [subcollections.category_slug],
      references: [categories.slug],
    }),
    subcategories: many(subcategories),
  }),
);

export const subcategoriesRelations = relations(
  subcategories,
  ({ one, many }) => ({
    subcollection: one(subcollections, {
      fields: [subcategories.subcollection_id],
      references: [subcollections.id],
    }),
    products: many(products),
  }),
);

export const productsRelations = relations(products, ({ one }) => ({
  subcategory: one(subcategories, {
    fields: [products.subcategory_slug],
    references: [subcategories.slug],
  }),
}));

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
