import { readFile } from "node:fs/promises";
import { join } from "node:path";

let cached: string | undefined;

// SYSTEM_PROMPT_FILE lets each workspace run its own persona from the same build.
export async function loadSystemPrompt(): Promise<string> {
  if (!cached) {
    const file = process.env.SYSTEM_PROMPT_FILE || "system_prompt.txt";
    cached = await readFile(join(__dirname, "..", "..", file), "utf-8");
  }
  return cached;
}
