import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const config = {
  host: process.env.VPS_HOST,
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USER || "root",
  password: process.env.VPS_PASSWORD,
  baseDir: process.env.VPS_BASE_DIR || "/opt/reader-diary",
  appPort: Number(process.env.APP_PORT || 4000),
  syncLocalDb: process.env.SYNC_LOCAL_DB === "1",
  localDbPath:
    process.env.LOCAL_DB_PATH || path.resolve(workspaceRoot, "server", "data", "reader-diary.db"),
};

if (!config.host || !config.password) {
  console.error("Missing VPS_HOST or VPS_PASSWORD environment variables.");
  process.exit(1);
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function runLocal(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`Local command failed: ${command} ${args.join(" ")}`);
  }
}

function createArchive() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reader-diary-"));
  const archivePath = path.join(tempDir, "reader-diary.tgz");

  runLocal("tar", [
    "-czf",
    archivePath,
    "--exclude",
    "node_modules",
    "--exclude",
    ".npm-cache",
    "--exclude",
    "client/dist",
    "--exclude",
    "server/data",
    "--exclude",
    ".git",
    "--exclude",
    "*.log",
    ".",
  ]);

  return { tempDir, archivePath };
}

function connectSsh() {
  return new Promise((resolve, reject) => {
    const client = new Client();
    client
      .on("ready", () => resolve(client))
      .on("error", reject)
      .connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 20000,
      });
  });
}

function execRemote(client, command, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    client.exec(`bash -lc ${shellEscape(command)}`, (error, stream) => {
      if (error) {
        reject(error);
        return;
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        if (!quiet) {
          process.stdout.write(text);
        }
      });

      stream.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        if (!quiet) {
          process.stderr.write(text);
        }
      });

      stream.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }

        reject(new Error(`Remote command failed with code ${code}\n${stderr || stdout}`));
      });
    });
  });
}

function uploadFile(client, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    client.sftp((error, sftp) => {
      if (error) {
        reject(error);
        return;
      }

      sftp.fastPut(localPath, remotePath, (putError) => {
        sftp.end();
        if (putError) {
          reject(putError);
          return;
        }

        resolve();
      });
    });
  });
}

async function main() {
  const { tempDir, archivePath } = createArchive();
  const client = await connectSsh();
  const remoteArchive = "/tmp/reader-diary.tgz";
  const remoteDbUpload = "/tmp/reader-diary-sync.db";
  const codeDir = `${config.baseDir}/app`;
  const dataDir = `${config.baseDir}/data`;
  const envFile = `${config.baseDir}/.env.production`;
  const dbPath = `${dataDir}/reader-diary.db`;
  const backupDir = `${dataDir}/backups`;
  const publicUrl =
    config.appPort === 80 ? `http://${config.host}` : `http://${config.host}:${config.appPort}`;

  if (config.syncLocalDb && !fs.existsSync(config.localDbPath)) {
    throw new Error(`Local database file not found: ${config.localDbPath}`);
  }

  try {
    console.log(`Connected to ${config.host}`);
    await execRemote(client, "mkdir -p /tmp");
    await uploadFile(client, archivePath, remoteArchive);
    console.log("Archive uploaded");

    if (config.syncLocalDb) {
      await uploadFile(client, config.localDbPath, remoteDbUpload);
      console.log(`Local database uploaded from ${config.localDbPath}`);
    }

    const syncLocalDbBlock = config.syncLocalDb
      ? `
mkdir -p ${shellEscape(backupDir)}

if [ -f ${shellEscape(dbPath)} ]; then
  BACKUP_PATH=${shellEscape(backupDir)}/reader-diary-$(date +%Y%m%d-%H%M%S).db
  cp ${shellEscape(dbPath)} "$BACKUP_PATH"
fi

cp ${shellEscape(remoteDbUpload)} ${shellEscape(dbPath)}
`
      : "";

    const remoteSetup = `
set -e
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg build-essential

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(\".\")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p ${shellEscape(config.baseDir)} ${shellEscape(dataDir)}
systemctl stop reader-diary.service || true
rm -rf ${shellEscape(codeDir)}
mkdir -p ${shellEscape(codeDir)}
tar -xzf ${shellEscape(remoteArchive)} -C ${shellEscape(codeDir)}

cd ${shellEscape(codeDir)}
npm install
npm run build:prod

JWT_SECRET=""
if [ -f ${shellEscape(envFile)} ]; then
  JWT_SECRET="$(sed -n 's/^JWT_SECRET=//p' ${shellEscape(envFile)} | tail -n 1)"
fi

if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

cat > ${shellEscape(envFile)} <<EOF
PORT=${config.appPort}
DB_PATH=${dbPath}
JWT_SECRET=$JWT_SECRET
EOF

set -a
. ${shellEscape(envFile)}
set +a

${syncLocalDbBlock}

node --input-type=module -e "import('./server/src/db/initDatabase.js').then(m => m.initDatabase())"

cat > /etc/systemd/system/reader-diary.service <<EOF
[Unit]
Description=Reader Diary
After=network.target

[Service]
Type=simple
WorkingDirectory=${codeDir}
EnvironmentFile=${envFile}
ExecStart=/usr/bin/npm run start:prod
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

if command -v ufw >/dev/null 2>&1; then
  ufw allow ${config.appPort}/tcp || true
fi

systemctl daemon-reload
systemctl enable reader-diary.service
systemctl restart reader-diary.service
systemctl --no-pager --full status reader-diary.service

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:${config.appPort}/api/health; then
    break
  fi
  sleep 2
done

curl -fsS http://127.0.0.1:${config.appPort}/api/health
`;

    await execRemote(client, remoteSetup);
    console.log(`Deployment finished: ${publicUrl}`);
  } finally {
    client.end();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
