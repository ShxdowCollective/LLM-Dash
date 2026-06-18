import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "..");
const TMP = path.join(__dirname, ".tmp");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const INIT_DB = path.join(REPO_ROOT, "scripts", "init_db.py");

// Seed a frozen, throwaway catalog before the web server starts so every run
// sees identical data. Never touches the real data/ or append-only changelogs/.
export default function globalSetup() {
  const dataDir = path.join(TMP, "data");
  const changelogsDir = path.join(TMP, "changelogs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(changelogsDir, { recursive: true });

  execFileSync(PY, [INIT_DB, "--force"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      LLM_DASH_DATA_DIR: dataDir,
      LLM_DASH_CHANGELOGS_DIR: changelogsDir,
    },
  });
}
