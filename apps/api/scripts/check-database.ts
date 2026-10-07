import "../src/env";
import { verifyDatabaseSchema } from "../src/lib/db/compatibility";
import { closeDatabase } from "../src/lib/db";
try { console.info(await verifyDatabaseSchema()); } finally { await closeDatabase(); }
