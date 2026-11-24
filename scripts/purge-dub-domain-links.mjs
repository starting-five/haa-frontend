#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const API_BASE = "https://api.dub.co";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_BATCH_SIZE = 100;

function readEnvValueFromFile(filePath, key) {
  if (!existsSync(filePath)) return "";

  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const name = trimmed.slice(0, eqIndex).trim();
    if (name !== key) continue;

    const rawValue = trimmed.slice(eqIndex + 1).trim();
    return rawValue.replace(/^['"]|['"]$/g, "");
  }

  return "";
}

function resolveDubApiKey() {
  const fromEnv = process.env.DUB_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  const cwd = process.cwd();
  const candidates = [join(cwd, ".env.local"), join(cwd, ".env")];
  for (const candidate of candidates) {
    const value = readEnvValueFromFile(candidate, "DUB_API_KEY");
    if (value) return value;
  }

  return "";
}

function parseArgs(argv) {
  const args = {
    domain: "",
    dryRun: true,
    yes: false,
    includeArchived: true,
    pageSize: DEFAULT_PAGE_SIZE,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === "--domain" || token === "-d") {
      args.domain = (argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }

    if (token === "--execute") {
      args.dryRun = false;
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--yes" || token === "-y") {
      args.yes = true;
      continue;
    }

    if (token === "--exclude-archived") {
      args.includeArchived = false;
      continue;
    }

    if (token === "--page-size") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isNaN(value) && value >= 1 && value <= 100) args.pageSize = value;
      i += 1;
      continue;
    }

    if (token === "--batch-size") {
      const value = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isNaN(value) && value >= 1 && value <= 100) args.batchSize = value;
      i += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`\nPurge Dub links for a specific domain.\n\nUsage:\n  node scripts/purge-dub-domain-links.mjs --domain go.example.com [--dry-run]\n  node scripts/purge-dub-domain-links.mjs --domain go.example.com --execute\n\nOptions:\n  -d, --domain <domain>      Domain to purge (required)\n      --execute              Actually delete links (default is dry-run)\n      --dry-run              List what would be deleted (default)\n  -y, --yes                  Skip interactive confirmation\n      --exclude-archived     Do not include archived links in query\n      --page-size <1-100>    Page size for list calls (default: 100)\n      --batch-size <1-100>   IDs per bulk delete call (default: 100)\n  -h, --help                 Show this help\n\nEnv required:\n  DUB_API_KEY\n`);
}

async function dubRequest(pathWithQuery, token, init = {}) {
  const response = await fetch(`${API_BASE}${pathWithQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "error" in parsed &&
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : `HTTP ${response.status}`;
    throw new Error(`Dub API ${pathWithQuery} failed: ${message}`);
  }

  return parsed;
}

async function listAllDomainLinks({ domain, token, pageSize, includeArchived }) {
  const links = [];
  let startingAfter = null;

  while (true) {
    const qs = new URLSearchParams();
    qs.set("domain", domain);
    qs.set("pageSize", String(pageSize));
    if (includeArchived) qs.set("showArchived", "true");
    if (startingAfter) qs.set("startingAfter", startingAfter);

    const page = await dubRequest(`/links?${qs.toString()}`, token);
    if (!Array.isArray(page)) {
      throw new Error("Unexpected /links response shape");
    }

    if (page.length === 0) break;

    links.push(...page);

    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    if (!last || typeof last.id !== "string") {
      throw new Error("Missing link id in paginated response");
    }
    startingAfter = last.id;
  }

  return links;
}

function toChunks(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function confirmOrExit({ yes, domain, count, dryRun }) {
  if (yes || dryRun) return;

  const rl = createInterface({ input, output });
  try {
    const prompt = `Type the domain exactly to delete ${count} link(s) from ${domain}: `;
    const typed = (await rl.question(prompt)).trim();
    if (typed !== domain) {
      throw new Error("Confirmation did not match domain. Aborted.");
    }
  } finally {
    rl.close();
  }
}

function summarizeLinks(links, domain) {
  console.log(`\nFound ${links.length} link(s) for domain ${domain}.`);
  for (const link of links.slice(0, 20)) {
    const id = typeof link.id === "string" ? link.id : "<missing-id>";
    const shortLink = typeof link.shortLink === "string" ? link.shortLink : "<no-short-link>";
    console.log(`- ${id} :: ${shortLink}`);
  }
  if (links.length > 20) {
    console.log(`...and ${links.length - 20} more.`);
  }
}

async function deleteLinksInBatches(ids, token, batchSize) {
  const chunks = toChunks(ids, batchSize);
  let deletedCount = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const batch = chunks[i];
    const qs = new URLSearchParams();
    qs.set("linkIds", batch.join(","));

    const result = await dubRequest(`/links/bulk?${qs.toString()}`, token, {
      method: "DELETE",
    });

    const countFromApi =
      typeof result === "object" && result && typeof result.deletedCount === "number"
        ? result.deletedCount
        : batch.length;

    deletedCount += countFromApi;
    console.log(`Deleted batch ${i + 1}/${chunks.length}: ${countFromApi} link(s)`);
  }

  return deletedCount;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.domain) {
    printHelp();
    throw new Error("Missing required --domain");
  }

  const token = resolveDubApiKey();
  if (!token) {
    throw new Error("Missing DUB_API_KEY (set env var or add it to .env.local/.env)");
  }

  console.log(`Mode: ${args.dryRun ? "dry-run" : "execute"}`);
  console.log(`Target domain: ${args.domain}`);

  const links = await listAllDomainLinks({
    domain: args.domain,
    token,
    pageSize: args.pageSize,
    includeArchived: args.includeArchived,
  });

  summarizeLinks(links, args.domain);

  if (links.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  await confirmOrExit({
    yes: args.yes,
    domain: args.domain,
    count: links.length,
    dryRun: args.dryRun,
  });

  if (args.dryRun) {
    console.log("\nDry-run complete. Re-run with --execute to delete.");
    return;
  }

  const ids = links
    .map((link) => (typeof link.id === "string" ? link.id : ""))
    .filter(Boolean);

  if (ids.length === 0) {
    throw new Error("No link IDs found to delete");
  }

  const deleted = await deleteLinksInBatches(ids, token, args.batchSize);
  console.log(`\nDone. Deleted ${deleted} link(s) from ${args.domain}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
