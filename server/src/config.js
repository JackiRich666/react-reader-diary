import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, "data");
const workspaceRoot = path.resolve(rootDir, "..");
const clientDistPath = path.resolve(workspaceRoot, "client", "dist");

const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || "reader-diary-local-secret",
  dbPath: process.env.DB_PATH || path.resolve(dataDir, "reader-diary.db"),
  dataDir,
  workspaceRoot,
  clientDistPath,
  clientIndexPath: path.resolve(clientDistPath, "index.html"),
  serveClient: fs.existsSync(clientDistPath),
};

export default config;
