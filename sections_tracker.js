/*
 * sections_tracker.js – Track changes to the sections array length in a Firestore document
 * using your custom SchoolAuditLogs collection.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node sections_tracker.js <docId> [--refresh]
 *
 * Example:
 *   node sections_tracker.js vv3EMActxg1pRD09Kfle
 *
 * ------------------------------------------------------------
 * This script will:
 *   • Query SchoolAuditLogs for the requested docId in the Notebooks collection
 *   • Track specifically when the 'sections' array changes in length
 *   • Show a timeline of section additions/removals with before/after counts
 *   • Cache results to avoid repeated Firestore queries
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

// ---------- Parse CLI args ----------
const args = process.argv.slice(2);
const refreshCache = args.includes("--refresh");

// Remove --refresh from args if present
const filteredArgs = args.filter((arg) => arg !== "--refresh");
const [docId] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle"; // Replace with your document ID

if (!targetDocId) {
  console.error("\nUsage: node sections_tracker.js <docId> [--refresh]");
  console.error("  docId: The document ID to track sections changes for");
  console.error("  --refresh: Force refresh the cache from Firestore");
  console.error("\nExample: node sections_tracker.js vv3EMActxg1pRD09Kfle");
  process.exit(1);
}

// ---------- Helper functions ----------
const cacheFileName = `sections_logs_${targetDocId}.json`;

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

function getSectionsLength(data) {
  if (!data || !data.sections || !Array.isArray(data.sections)) {
    return 0;
  }
  return data.sections.length;
}

function analyzeSectionsChanges(logs) {
  const sectionsChanges = [];

  for (const logEntry of logs) {
    const beforeLength = getSectionsLength(logEntry.beforeData);
    const afterLength = getSectionsLength(logEntry.afterData);

    // Only track changes that affect sections length
    if (beforeLength !== afterLength) {
      sectionsChanges.push({
        ...logEntry,
        beforeSectionsLength: beforeLength,
        afterSectionsLength: afterLength,
        change: afterLength - beforeLength,
      });
    }
  }

  return sectionsChanges;
}

// ---------- Fetch & print sections timeline ----------
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

    // Analyze sections changes
    const sectionsChanges = analyzeSectionsChanges(sortedLogs);

    if (sectionsChanges.length === 0) {
      console.log(
        chalk.yellow(
          `No sections array length changes found for document ${targetDocId}.`
        )
      );
      console.log(
        chalk.gray(`Total audit entries checked: ${sortedLogs.length}`)
      );
      return;
    }

    // Get collection name from first log entry for display
    const collectionName = sortedLogs[0]?.collectionName || "unknown";
    const schoolId = sortedLogs[0]?.schoolId || "unknown";

    console.log(
      chalk.green(
        `\nFound ${sectionsChanges.length} sections array length changes for document ${targetDocId}`
      )
    );
    console.log(
      chalk.gray(`Collection: ${collectionName}, School: ${schoolId}`)
    );
    console.log(chalk.gray(`Total audit entries: ${sortedLogs.length}\n`));

    let counter = 0;
    for (const data of sectionsChanges) {
      // Convert seconds to Date
      const iso = Timestamp.fromMillis(data.performedAt * 1000)
        .toDate()
        .toISOString();

      const changeText =
        data.change > 0
          ? chalk.green(
              `+${data.change} section${data.change > 1 ? "s" : ""} added`
            )
          : chalk.red(
              `${data.change} section${
                Math.abs(data.change) > 1 ? "s" : ""
              } removed`
            );

      console.log(
        chalk.blue.bold(`\n#${++counter}  ${iso}  —  ${data.operationType}`)
      );
      console.log(
        `Performed by ${data.performedByName} (${
          data.performedByUserId || "unknown‑uid"
        })`
      );
      console.log(
        `${chalk.yellow("sections array")}: ${chalk.cyan(
          data.beforeSectionsLength
        )} → ${chalk.cyan(data.afterSectionsLength)} (${changeText})`
      );

      // Show additional context if sections field was explicitly updated
      if (data.updatedFields && data.updatedFields.includes("sections")) {
        console.log(chalk.gray("  ↳ sections field was explicitly updated"));
      }
    }

    // Summary
    const totalAdded = sectionsChanges.reduce(
      (sum, change) => sum + Math.max(0, change.change),
      0
    );
    const totalRemoved = sectionsChanges.reduce(
      (sum, change) => sum + Math.abs(Math.min(0, change.change)),
      0
    );

    console.log(chalk.blue.bold("\n--- Summary ---"));
    console.log(`Total sections added: ${chalk.green(totalAdded)}`);
    console.log(`Total sections removed: ${chalk.red(totalRemoved)}`);
    console.log(
      `Net change: ${totalAdded - totalRemoved > 0 ? chalk.green("+") : ""}${
        totalAdded - totalRemoved
      }`
    );
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();
