/*
 * find_section_origin.js – Find which notebook currently contains a section ID
 *
 * Fetches live notebook documents from Firestore (no audit logs needed).
 * Results are cached in notebooks_snapshot_<schoolId>.json to avoid
 * re-downloading on every run.
 *
 * Usage:
 *   node find_section_origin.js <sectionId> [<sectionId2> ...] [--school=<schoolId>] [--refresh]
 *
 * Examples:
 *   node find_section_origin.js _ybd44i73r
 *   node find_section_origin.js _ybd44i73r _weismuxyj --school=azambuja
 *   node find_section_origin.js _ybd44i73r --refresh
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// --- CLI args ---
const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const schoolArg = args.find((a) => a.startsWith("--school="));
const schoolId = schoolArg ? schoolArg.split("=")[1] : null;
const targetIds = args.filter((a) => !a.startsWith("--"));

if (targetIds.length === 0) {
  console.error(
    "Usage: node find_section_origin.js <sectionId> [<sectionId2> ...] [--school=<schoolId>] [--refresh]"
  );
  process.exit(1);
}

const cacheFile = path.join(
  __dirname,
  `notebooks_snapshot${schoolId ? `_${schoolId}` : ""}.json`
);

async function loadNotebooks() {
  if (!refresh && fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    console.log(
      chalk.gray(
        `Loaded ${cached.notebooks.length} notebooks from cache (${cached.fetchedAt}). Use --refresh to update.`
      )
    );
    return cached.notebooks;
  }

  console.log(
    chalk.gray(
      `Fetching notebooks from Firestore${schoolId ? ` (school: ${schoolId})` : ""}...`
    )
  );

  let query = db.collection("Notebooks");
  if (schoolId) {
    query = query.where("schoolId", "==", schoolId);
  }

  const snap = await query.get();
  const notebooks = snap.docs.map((doc) => ({ _id: doc.id, ...doc.data() }));

  fs.writeFileSync(
    cacheFile,
    JSON.stringify({ fetchedAt: new Date().toISOString(), notebooks }, null, 2)
  );
  console.log(
    chalk.gray(`Fetched and cached ${notebooks.length} notebooks → ${path.basename(cacheFile)}`)
  );

  return notebooks;
}

(async () => {
  const notebooks = await loadNotebooks();

  console.log(chalk.bold(`\n🔍 SECTION ORIGIN SEARCH`));
  console.log(chalk.gray(`Target section IDs: ${targetIds.join(", ")}`));
  console.log("=".repeat(72));

  // Build index: sectionId → [{ notebookId, notebookTitle, section }]
  const index = Object.fromEntries(targetIds.map((id) => [id, []]));

  for (const notebook of notebooks) {
    const sections = Array.isArray(notebook.sections) ? notebook.sections : [];
    for (const section of sections) {
      if (section?.id && index[section.id]) {
        index[section.id].push({
          notebookId: notebook._id,
          notebookTitle: notebook.title || null,
          notebookSchool: notebook.schoolId || null,
          section,
        });
      }
    }
  }

  let anyFound = false;

  for (const sectionId of targetIds) {
    const hits = index[sectionId];
    console.log(`\n${chalk.cyan.bold(`Section ID: ${sectionId}`)}`);

    if (hits.length === 0) {
      console.log(chalk.red(`  ✗ Not found in any notebook.`));
      continue;
    }

    anyFound = true;
    for (const hit of hits) {
      console.log(`  ${chalk.green("✓")} Notebook: ${chalk.bold(hit.notebookId)}`);
      if (hit.notebookTitle)
        console.log(`    Notebook title: ${hit.notebookTitle}`);
      if (hit.notebookSchool)
        console.log(`    School:         ${hit.notebookSchool}`);
      console.log(`    Section title:  ${hit.section.title || "(no title)"}`);
    }
  }

  if (!anyFound) {
    console.log(
      chalk.red("\n✗ None of the section IDs were found in any current notebook.")
    );
    console.log(
      chalk.gray(
        "  The source notebook may have been deleted, or its sections replaced."
      )
    );
    console.log(
      chalk.gray(
        "  Try --refresh to re-fetch, or use audit log search if you need historical data."
      )
    );
  }

  console.log("\n" + "=".repeat(72));
  process.exit(0);
})();
