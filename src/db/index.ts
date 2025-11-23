import * as schema from "./schema";
// import { neon } from "@neondatabase/serverless";

// const sql = neon(process.env.DATABASE_URL!);
// export const db = drizzle({ client: sql, schema });


import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

const client = createClient({ 
  url: process.env.TURSO_DATABASE_URL!, 
  authToken: process.env.TURSO_AUTH_TOKEN!
});
export const db = drizzle({ client, schema });
