import fs from "node:fs";
import path from "node:path";

/** Deterministic ids/names written by e2e/enrich_seed.py during global setup. */
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, ".tmp", "seed-manifest.json"), "utf8"),
) as {
  permalink_model_id: number;
  permalink_model_name: string;
  score_history_models: string[];
};

export const PERMALINK_MODEL_ID = String(manifest.permalink_model_id);
export const PERMALINK_MODEL_NAME = manifest.permalink_model_name;
export const SPARKLINE_MODEL = manifest.score_history_models[0] as string;
