import { config } from "dotenv";

// Load the database URL before src/lib/db.ts is imported.
config({ path: [".env.local", ".env"], quiet: true });
