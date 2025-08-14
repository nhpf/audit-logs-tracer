/*
 * july_30_analysis.js – Analyze ALL changes made to document vv3EMActxg1pRD09Kfle
 * on July 30, 2025, showing every data change and person who did it.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node july_30_analysis.js [--refresh]
 *
 * Options:
 *   --refresh  Force refresh the cache from Firestore
 *
 * ------------------------------------------------------------
 * Prerequisites:
 *   1. Node.js ≥ 18.x installed.
 *   2. Service‑account credentials for your Firebase/Google Cloud project.
 *   3. Install dependencies once in the folder that contains this file:
 *        npm install firebase-admin chalk
 *
 * The script will:
 *   • Connect to Firestore using the Admin SDK.
 *   • Query SchoolAuditLogs for document vv3EMActxg1pRD09Kfle in Notebooks collection
 *   • Filter for changes that occurred on July 30, 2025
 *   • Show detailed before/after diffs for every field change
 *   • Group by person and show chronological timeline
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import admin from "firebase-admin";
import chalk from "chalk";
import fs from "fs";

// Initialize Firebase Admin - Note: Adjust path as needed for your environment
import serviceAccount from "../cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// Constants
const TARGET_COLLECTION = "Notebooks";
const TARGET_DOC_ID = "jfxllVTeMPCs265BB7Uu";
const CACHE_FILE = `audit_logs_recent_${TARGET_DOC_ID}.json`;

// ---------- Helper functions ----------

function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString();
}

async function fetchAuditLogs() {
  console.log(
    chalk.gray(`Fetching audit logs from ${TARGET_DOC_ID} from Firestore...`)
  );

  // Query by performedAt only (to avoid needing a composite index)
  const logsRef = db.collection("SchoolAuditLogs");
  const query = logsRef
    .where("collectionName", "==", TARGET_COLLECTION)
    .where("docId", "==", TARGET_DOC_ID);
  const snap = await query.get();
  const logs = [];

  snap.docs.forEach((doc) => {
    const data = doc.data();
    logs.push({
      id: doc.id,
      ...data,
    });
  });

  console.log(
    chalk.gray(`Fetched ${logs.length} total audit logs from Firestore`)
  );

  // Save to file
  fs.writeFileSync(CACHE_FILE, JSON.stringify({ logs }, null, 2));
  console.log(chalk.gray(`Cached logs to ${CACHE_FILE}`));
  return logs;
}

function analyzeFieldChanges(before, after, updatedFields) {
  const changes = [];
  const fieldsToCheck = updatedFields || Object.keys({ ...before, ...after });

  fieldsToCheck.forEach((field) => {
    const beforeVal = before[field];
    const afterVal = after[field];

    // Deep comparison for objects/arrays
    const beforeStr = JSON.stringify(beforeVal, null, 2);
    const afterStr = JSON.stringify(afterVal, null, 2);

    if (beforeStr !== afterStr) {
      changes.push({
        field,
        before: beforeVal,
        after: afterVal,
        beforeStr,
        afterStr,
      });
    }
  });

  return changes;
}

function printDetailedChange(change, index, total) {
  console.log(
    chalk.cyan(`\n    Field ${index + 1}/${total}: ${chalk.bold(change.field)}`)
  );

  // If any of beforeStr or afterStr do not exist, skip the detailed print
  if (!change.beforeStr || !change.afterStr) {
    console.log(chalk.gray("      (No detailed data available)"));
    return;
  }

  // For large objects/arrays, show a summary first
  if (change?.beforeStr?.length > 200 || change?.afterStr?.length > 200) {
    console.log(chalk.gray("      (Large data change - showing summary)"));

    // Try to show meaningful differences for common field types
    if (change.field === "sections" && Array.isArray(change.after)) {
      console.log(
        chalk.yellow(
          `      Sections count: ${
            Array.isArray(change.before) ? change.before.length : "unknown"
          } → ${change.after.length}`
        )
      );
    } else if (
      change.field === "lastModified" ||
      change.field === "createdAt"
    ) {
      console.log(
        chalk.yellow(`      Timestamp: ${change.before} → ${change.after}`)
      );
    } else {
      console.log(
        chalk.yellow(
          `      Type: ${typeof change.before} → ${typeof change.after}`
        )
      );
    }
  }

  // Always show the raw before/after for detailed analysis
  console.log(chalk.red("      BEFORE:"));
  console.log(
    chalk.red(
      `      ${change.beforeStr
        .split("\n")
        .map((line) => "      " + line)
        .join("\n")}`
    )
  );
  console.log(chalk.green("      AFTER:"));
  console.log(
    chalk.green(
      `      ${change.afterStr
        .split("\n")
        .map((line) => "      " + line)
        .join("\n")}`
    )
  );
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(
      chalk.blue.bold(`\n🔍 Analyzing ALL changes to document ${TARGET_DOC_ID}`)
    );

    let allLogs = [];
    // Check if cache file exists
    if (fs.existsSync(CACHE_FILE)) {
      console.log(chalk.gray(`Using cached logs from ${CACHE_FILE}`));
      const cachedData = fs.readFileSync(CACHE_FILE, "utf-8");
      const { logs } = JSON.parse(cachedData);
      allLogs = logs;
    } else {
      allLogs = await fetchAuditLogs();
    }

    // Filter for the specific document and collection first
    const documentLogs = allLogs.filter(
      (log) => log.docId === TARGET_DOC_ID && log.collectionName === "Notebooks"
    );

    console.log(
      chalk.gray(
        `Found ${documentLogs.length} logs for document ${TARGET_DOC_ID} in Notebooks collection`
      )
    );

    // Sort by timestamp
    const sortedLogs = [...documentLogs];
    sortedLogs.sort((a, b) => a.performedAt - b.performedAt);

    console.log(chalk.green(`✅ Found ${sortedLogs.length} changes\n`));

    // Group by person for summary
    const byPerson = {};
    sortedLogs.forEach((log) => {
      const person = log.performedByName || "Unknown";
      if (!byPerson[person]) {
        byPerson[person] = [];
      }
      byPerson[person].push(log);
    });

    // Print summary by person
    console.log(chalk.magenta.bold("👥 SUMMARY BY PERSON:"));
    Object.entries(byPerson).forEach(([person, logs]) => {
      console.log(chalk.magenta(`   ${person}: ${logs.length} change(s)`));
    });

    // Print detailed timeline
    console.log(chalk.blue.bold("\n📅 DETAILED TIMELINE:"));

    let changeCounter = 0;
    for (const log of sortedLogs) {
      changeCounter++;
      const timestamp = formatTimestamp(log.performedAt);
      const person = log.performedByName || "Unknown";
      const userId = log.performedByUserId || "unknown-uid";

      console.log(
        chalk.blue.bold(
          `\n#${changeCounter} — ${timestamp} — ${log.operationType.toUpperCase()}`
        )
      );
      console.log(chalk.cyan(`   👤 Performed by: ${person} (${userId})`));

      // Analyze field changes
      const before = log.beforeData || {};
      const after = log.afterData || {};
      const updatedFields = log.updatedFields;

      const changes = analyzeFieldChanges(before, after, updatedFields);

      if (changes.length === 0) {
        console.log(chalk.gray("   📝 No field changes detected"));
      } else {
        console.log(chalk.yellow(`   📝 ${changes.length} field(s) changed:`));
        changes.forEach((change, index) => {
          printDetailedChange(change, index, changes.length);
        });
      }
    }

    console.log(
      chalk.green.bold(
        `\n✨ Analysis complete! Found ${sortedLogs.length} total changes`
      )
    );
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
