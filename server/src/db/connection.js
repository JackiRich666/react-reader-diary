import fs from "node:fs";
import Database from "better-sqlite3";
import config from "../config.js";

fs.mkdirSync(config.dataDir, { recursive: true });

const db = new Database(config.dbPath);

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

export default db;

