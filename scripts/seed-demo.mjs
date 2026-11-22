// Real-data demo seed script: runs live searches via POST /api/search.
// Requires MongoDB and API keys in .env. Never inserts fabricated records.
import { spawn } from "node:child_process";

const PORT = Number(process.env.SEED_PORT || 3098);
const BASE = `http://127.0.0.1:${PORT}`;

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  cwd: process.cwd(),
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Server failed to start. Run `npm run build` first.");
}

async function seedSearch(label, payload) {
  console.log(`Seeding ${label}...`);
  const res = await fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${label} failed: ${data.error || res.status}`);
  }
  console.log(
    `${label}: ${data.leads?.length ?? 0} leads (inserted ${data.insertedCount}, updated ${data.updatedCount})`
  );
}

try {
  await waitForServer();
  await seedSearch("Default Workspace", {
    workspaceId: "default",
    niche: "fashion, food, real estate",
    clientTypes: ["local_brand", "creator", "coach", "youtuber", "agency"],
    countries: ["United States", "United Kingdom", "Germany"],
    excludedCountries: ["India", "Pakistan", "Bangladesh"],
    country: "United States",
    city: "",
    count: 50,
  });
} finally {
  server.kill("SIGTERM");
  process.exit(0);
}
