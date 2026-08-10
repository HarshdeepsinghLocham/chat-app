/**
 * Node-only Mongo warmup. Loaded from instrumentation.ts via absolute file URL so
 * Next/webpack never bundles mongoose (avoids "Can't resolve 'net'" / node: schemes).
 */
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const dbEntry = pathToFileURL(
    resolve(process.cwd(), "../../packages/db/dist/db.js")
).href;

const { connectToDatabase } = await import(dbEntry);
await connectToDatabase();
console.info(JSON.stringify({ event: "web.mongo.warmup_ok" }));
