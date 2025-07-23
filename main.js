/*
 * audit_timeline.js – Print a readable timeline of all changes made to a single Firestore document
 * using your custom SchoolAuditLogs collection.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node audit_timeline.js <schoolId> <collectionName> <docId>
 *
 * Example:
 *   node audit_timeline.js azambuja Notebooks vv3EMActxg1pRD09Kfle
 *
 * ------------------------------------------------------------
 * Prerequisites:
 *   1. Node.js ≥ 18.x installed.
 *   2. Service‑account credentials for your Firebase/Google Cloud project.
 *      Set the path to the JSON key in the environment variable
 *        GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
 *   3. Install dependencies once in the folder that contains this file:
 *        npm install firebase-admin chalk
 *
 * The script will:
 *   • Connect to Firestore using the Admin SDK.
 *   • Query SchoolAuditLogs for the requested (schoolId, collectionName, docId),
 *     ordered chronologically by performedAt.
 *   • For every audit entry it prints:
 *       – sequential number, ISO timestamp and operation type (create/update/delete)
 *       – who performed the action (name + uid)
 *       – A neat before → after diff for each updated field
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import chalk from "chalk";
import fs from "fs";
import path from "path";

import admin from "firebase-admin";
import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// ---------- 2. Parse CLI args ----------
const args = process.argv.slice(2);
const refreshCache = args.includes("--refresh");

// Remove --refresh from args if present
const filteredArgs = args.filter((arg) => arg !== "--refresh");
const [docId] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle"; // Replace with your document ID

if (!targetDocId) {
  console.error("\nUsage: node audit_timeline.js <docId> [--refresh]");
  console.error("  docId: The document ID to track changes for");
  console.error("  --refresh: Force refresh the cache from Firestore");
  console.error("\nExample: node audit_timeline.js vv3EMActxg1pRD09Kfle");
  process.exit(1);
}

// ---------- 3. Helper functions ----------
const cacheFileName = `audit_logs_${targetDocId}.json`;

async function loadFromCache() {
  if (refreshCache) {
    console.log(chalk.yellow("Refresh flag detected, skipping cache..."));
    return null;
  }

  try {
    if (fs.existsSync(cacheFileName)) {
      const data = fs.readFileSync(cacheFileName, "utf8");
      const parsed = JSON.parse(data);
      console.log(
        chalk.gray(
          `Loading ${parsed.logs.length} cached audit logs from ${cacheFileName}`
        )
      );
      return parsed.logs;
    }
  } catch (error) {
    console.log(
      chalk.yellow(
        "Cache file exists but could not be parsed, fetching fresh data..."
      )
    );
  }
  return null;
}

async function saveToCache(logs) {
  const cacheData = {
    timestamp: new Date().toISOString(),
    docId: targetDocId,
    logs,
  };
  fs.writeFileSync(cacheFileName, JSON.stringify(cacheData, null, 2));
  console.log(
    chalk.gray(`Saved ${logs.length} audit logs to ${cacheFileName}`)
  );
}

async function fetchAuditLogs() {
  // Try loading from cache first
  const cachedLogs = await loadFromCache();
  if (cachedLogs) {
    return cachedLogs;
  }

  console.log(
    chalk.gray(
      `Fetching audit logs for Notebooks document ${targetDocId} from Firestore...`
    )
  );

  // Query by both docId AND collectionName to be specific
  const logsRef = db.collection("SchoolAuditLogs");
  const query = logsRef
    .where("docId", "==", targetDocId)
    .where("collectionName", "==", "Notebooks");

  const snap = await query.get();
  const logs = [];

  snap.docs.forEach((doc) => {
    const data = doc.data();
    logs.push({
      id: doc.id,
      ...data,
    });
  });

  // Save to cache
  await saveToCache(logs);

  return logs;
}

// ---------- 4. Build query and filter ----------
// ---------- 4. Fetch & print timeline ----------
(async () => {
  try {
    // Fetch audit logs for the specific document
    const logs = await fetchAuditLogs();

    // Sort by performedAt ascending
    const sortedLogs = logs.sort((a, b) => a.performedAt - b.performedAt);

    if (sortedLogs.length === 0) {
      console.log(`No audit log entries found for document ${targetDocId}.`);
      return;
    }

    // Get collection name from first log entry for display
    const collectionName = sortedLogs[0]?.collectionName || "unknown";
    const schoolId = sortedLogs[0]?.schoolId || "unknown";

    console.log(
      chalk.green(
        `\nFound ${sortedLogs.length} audit log entries for document ${targetDocId}`
      )
    );
    console.log(
      chalk.gray(`Collection: ${collectionName}, School: ${schoolId}\n`)
    );

    let counter = 0;
    for (const data of sortedLogs) {
      // Convert seconds to Date
      const iso = Timestamp.fromMillis(data.performedAt * 1000)
        .toDate()
        .toISOString();
      console.log(
        chalk.blue.bold(`\n#${++counter}  ${iso}  —  ${data.operationType}`)
      );
      console.log(
        `Performed by ${data.performedByName} (${
          data.performedByUserId || "unknown‑uid"
        })`
      );

      const before = data.beforeData ?? {};
      const after = data.afterData ?? {};
      const changed = data.updatedFields ?? Object.keys(after);

      changed.forEach((field) => {
        // stringify to show nested objects/arrays nicely
        const beforeVal = JSON.stringify(before[field]);
        const afterVal = JSON.stringify(after[field]);
        if (beforeVal !== afterVal) {
          console.log(
            `  ${chalk.yellow(field)}: ${chalk.red(beforeVal)} → ${chalk.green(
              afterVal
            )}`
          );
        }
      });
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();
