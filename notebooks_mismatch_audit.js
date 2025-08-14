/*
 * notebooks_mismatch_audit.js – Find when notebook-class linking mismatches occurred
 *
 * This script analyzes audit logs to identify when notebooks and classes became unlinked,
 * helping to diagnose relationship integrity issues between Notebooks and SchoolClasses collections.
 *
 * ------------------------------------------------------------
 * Usage:
 *   node notebooks_mismatch_audit.js [--refresh] [--notebook=<notebookId>] [--class=<classId>]
 *
 * Examples:
 *   node notebooks_mismatch_audit.js                                    # Analyze all mismatches
 *   node notebooks_mismatch_audit.js --notebook=vv3EMActxg1pRD09Kfle   # Focus on specific notebook
 *   node notebooks_mismatch_audit.js --class=azambuja_6ano_turma_a     # Focus on specific class
 *   node notebooks_mismatch_audit.js --refresh                         # Force refresh all caches
 *
 * ------------------------------------------------------------
 * Prerequisites:
 *   1. Node.js ≥ 18.x installed
 *   2. Service account credentials for Firebase/Google Cloud project
 *   3. Install dependencies: npm install firebase-admin chalk
 *
 * The script will:
 *   • Fetch current state of notebooks and classes from Firestore
 *   • Identify mismatches between notebook.classes and class.notebooks arrays
 *   • Analyze audit logs to find when these mismatches were introduced
 *   • Provide timeline of linking/unlinking events
 *   • Suggest recovery actions
 *
 * © 2025 Cosseno.com – Notebook-Class Relationship Auditor
 */

import admin from "firebase-admin";
import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// Parse CLI arguments
const args = process.argv.slice(2);
const refreshCache = args.includes("--refresh");
const specificNotebook = args
  .find((arg) => arg.startsWith("--notebook="))
  ?.split("=")[1];
const specificClass = args
  .find((arg) => arg.startsWith("--class="))
  ?.split("=")[1];

// Cache file names
const NOTEBOOKS_CACHE = "notebooks_cache.json";
const CLASSES_CACHE = "classes_cache.json";

// Helper functions
function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date(timestamp).toISOString();
}

async function loadFromCache(fileName) {
  if (refreshCache) {
    console.log(chalk.yellow(`Refresh flag detected, skipping ${fileName}...`));
    return null;
  }

  try {
    if (fs.existsSync(fileName)) {
      const data = fs.readFileSync(fileName, "utf8");
      const parsed = JSON.parse(data);
      console.log(
        chalk.gray(`Loading cached data from ${fileName} (${parsed.timestamp})`)
      );
      return parsed.data;
    }
  } catch (error) {
    console.log(error);
    console.log(
      chalk.yellow(
        `Cache file ${fileName} could not be parsed, fetching fresh data...`
      )
    );
  }
  return null;
}

async function saveToCache(fileName, data) {
  const cacheData = {
    timestamp: new Date().toISOString(),
    data,
  };
  fs.writeFileSync(fileName, JSON.stringify(cacheData, null, 2));
  console.log(chalk.gray(`Saved data to ${fileName}`));
}

async function fetchNotebooks() {
  const cachedData = await loadFromCache(NOTEBOOKS_CACHE);
  if (cachedData) {
    return cachedData;
  }

  console.log(chalk.gray("Fetching notebooks from Firestore..."));
  const notebooksRef = db.collection("Notebooks");
  const snapshot = await notebooksRef.get();

  const notebooks = {};
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    notebooks[doc.id] = {
      id: doc.id,
      title: data.title || "Untitled",
      classes: data.classes || [],
      schoolId: data.schoolId || "unknown",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });

  await saveToCache(NOTEBOOKS_CACHE, notebooks);
  return notebooks;
}

async function fetchSchoolClasses() {
  const cachedData = await loadFromCache(CLASSES_CACHE);
  if (cachedData) {
    return cachedData;
  }

  console.log(chalk.gray("Fetching school classes from Firestore..."));
  const classesRef = db.collection("SchoolClasses");
  const snapshot = await classesRef.get();

  const classes = {};
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    classes[doc.id] = {
      id: doc.id,
      name: data.name || "Unnamed Class",
      notebooks: data.notebooks || [],
      schoolId: data.schoolId || "unknown",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  });

  await saveToCache(CLASSES_CACHE, classes);
  return classes;
}

async function fetchAuditLogs(docId, collectionName) {
  const cacheFileName = `audit_logs_${docId}.json`;

  // Try loading from cache first
  if (!refreshCache && fs.existsSync(cacheFileName)) {
    const data = fs.readFileSync(cacheFileName, "utf8");
    const parsed = JSON.parse(data);
    const logs = Array.isArray(parsed) ? parsed : parsed.logs || [];
    return logs;
  }

  console.log(
    chalk.gray(`Fetching audit logs for ${collectionName} document ${docId}...`)
  );

  const logsRef = db.collection("SchoolAuditLogs");
  const query = logsRef
    .where("docId", "==", docId)
    .where("collectionName", "==", collectionName);

  const snap = await query.get();
  const logs = [];

  snap.docs.forEach((doc) => {
    const data = doc.data();
    logs.push({
      id: doc.id,
      ...data,
    });
  });

  // Cache the logs
  const cacheData = {
    timestamp: new Date().toISOString(),
    docId: docId,
    collectionName: collectionName,
    logs,
  };
  fs.writeFileSync(cacheFileName, JSON.stringify(cacheData, null, 2));

  return logs;
}

function findMismatches(notebooks, classes) {
  const mismatches = {
    notebookHasClass: [], // Notebook has class but class doesn't have notebook
    classHasNotebook: [], // Class has notebook but notebook doesn't have class
    nonExistentReferences: [], // References to non-existent documents
  };

  console.log(chalk.blue("🔍 Analyzing notebook-class relationships..."));

  // Check each notebook's classes
  for (const [notebookId, notebook] of Object.entries(notebooks)) {
    if (specificNotebook && notebookId !== specificNotebook) continue;

    for (const classId of notebook.classes) {
      if (!classes[classId]) {
        // Notebook references non-existent class
        mismatches.nonExistentReferences.push({
          type: "notebook_to_missing_class",
          notebookId,
          classId,
          notebookTitle: notebook.title,
        });
      } else if (!classes[classId].notebooks.includes(notebookId)) {
        // Notebook has class but class doesn't have notebook
        mismatches.notebookHasClass.push({
          notebookId,
          classId,
          notebookTitle: notebook.title,
          className: classes[classId].name,
        });
      }
    }
  }

  // Check each class's notebooks
  for (const [classId, schoolClass] of Object.entries(classes)) {
    if (specificClass && classId !== specificClass) continue;

    for (const notebookId of schoolClass.notebooks) {
      if (!notebooks[notebookId]) {
        // Class references non-existent notebook
        mismatches.nonExistentReferences.push({
          type: "class_to_missing_notebook",
          classId,
          notebookId,
          className: schoolClass.name,
        });
      } else if (!notebooks[notebookId].classes.includes(classId)) {
        // Class has notebook but notebook doesn't have class
        mismatches.classHasNotebook.push({
          notebookId,
          classId,
          notebookTitle: notebooks[notebookId].title,
          className: schoolClass.name,
        });
      }
    }
  }

  return mismatches;
}

async function analyzeAuditTrail(mismatches) {
  console.log(chalk.blue.bold("\n📋 AUDIT TRAIL ANALYSIS"));
  console.log("=".repeat(80));

  const auditResults = {};

  // Analyze notebook-side mismatches
  for (const mismatch of mismatches.notebookHasClass) {
    const { notebookId, classId, notebookTitle, className } = mismatch;

    console.log(
      chalk.red(
        `\n🔍 MISMATCH: Notebook "${notebookTitle}" (${notebookId}) has class "${className}" (${classId}), but class doesn't have notebook`
      )
    );

    // Get audit logs for both documents
    const notebookLogs = await fetchAuditLogs(notebookId, "Notebooks");
    const classLogs = await fetchAuditLogs(classId, "SchoolClasses");

    // Analyze when the link was added to notebook
    const notebookClassChanges = analyzeClassesFieldChanges(
      notebookLogs,
      classId
    );

    // Analyze when the link was removed from class (or never added)
    const classNotebookChanges = analyzeNotebooksFieldChanges(
      classLogs,
      notebookId
    );

    auditResults[`${notebookId}-${classId}`] = {
      type: "notebook_has_class",
      notebookId,
      classId,
      notebookTitle,
      className,
      notebookChanges: notebookClassChanges,
      classChanges: classNotebookChanges,
    };

    reportMismatchHistory(
      notebookClassChanges,
      classNotebookChanges,
      "notebook_has_class"
    );
  }

  // Analyze class-side mismatches
  for (const mismatch of mismatches.classHasNotebook) {
    const { notebookId, classId, notebookTitle, className } = mismatch;

    console.log(
      chalk.red(
        `\n🔍 MISMATCH: Class "${className}" (${classId}) has notebook "${notebookTitle}" (${notebookId}), but notebook doesn't have class`
      )
    );

    // Skip if we already analyzed this pair
    if (auditResults[`${notebookId}-${classId}`]) {
      console.log(chalk.gray("   (Already analyzed above)"));
      continue;
    }

    // Get audit logs for both documents
    const notebookLogs = await fetchAuditLogs(notebookId, "Notebooks");
    const classLogs = await fetchAuditLogs(classId, "SchoolClasses");

    // Analyze when the link was removed from notebook (or never added)
    const notebookClassChanges = analyzeClassesFieldChanges(
      notebookLogs,
      classId
    );

    // Analyze when the link was added to class
    const classNotebookChanges = analyzeNotebooksFieldChanges(
      classLogs,
      notebookId
    );

    auditResults[`${notebookId}-${classId}`] = {
      type: "class_has_notebook",
      notebookId,
      classId,
      notebookTitle,
      className,
      notebookChanges: notebookClassChanges,
      classChanges: classNotebookChanges,
    };

    reportMismatchHistory(
      notebookClassChanges,
      classNotebookChanges,
      "class_has_notebook"
    );
  }

  return auditResults;
}

function analyzeClassesFieldChanges(auditLogs, targetClassId) {
  const changes = [];

  auditLogs.sort((a, b) => a.performedAt - b.performedAt);

  for (const log of auditLogs) {
    const beforeClasses = log.beforeData?.classes || [];
    const afterClasses = log.afterData?.classes || [];

    const beforeHasClass = beforeClasses.includes(targetClassId);
    const afterHasClass = afterClasses.includes(targetClassId);

    if (beforeHasClass !== afterHasClass) {
      changes.push({
        timestamp: log.performedAt,
        performedBy: log.performedByName || "Unknown",
        performedByUserId: log.performedByUserId,
        action: afterHasClass ? "added" : "removed",
        beforeClasses,
        afterClasses,
        operationType: log.operationType,
      });
    }
  }

  return changes;
}

function analyzeNotebooksFieldChanges(auditLogs, targetNotebookId) {
  const changes = [];

  auditLogs.sort((a, b) => a.performedAt - b.performedAt);

  for (const log of auditLogs) {
    const beforeNotebooks = log.beforeData?.notebooks || [];
    const afterNotebooks = log.afterData?.notebooks || [];

    const beforeHasNotebook = beforeNotebooks.includes(targetNotebookId);
    const afterHasNotebook = afterNotebooks.includes(targetNotebookId);

    if (beforeHasNotebook !== afterHasNotebook) {
      changes.push({
        timestamp: log.performedAt,
        performedBy: log.performedByName || "Unknown",
        performedByUserId: log.performedByUserId,
        action: afterHasNotebook ? "added" : "removed",
        beforeNotebooks,
        afterNotebooks,
        operationType: log.operationType,
      });
    }
  }

  return changes;
}

function reportMismatchHistory(notebookChanges, classChanges, mismatchType) {
  console.log(chalk.yellow("   📊 Change History:"));

  // Combine and sort all changes by timestamp
  const allChanges = [
    ...notebookChanges.map((c) => ({ ...c, source: "notebook" })),
    ...classChanges.map((c) => ({ ...c, source: "class" })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  if (allChanges.length === 0) {
    console.log(
      chalk.gray("   No linking/unlinking events found in audit logs")
    );
    return;
  }

  allChanges.forEach((change, index) => {
    const timeStr = formatTimestamp(change.timestamp);
    const sourceStr = change.source === "notebook" ? "Notebook" : "Class";
    const actionColor = change.action === "added" ? chalk.green : chalk.red;

    console.log(
      `   ${index + 1}. ${chalk.bold(timeStr)} - ${sourceStr} ${actionColor(
        change.action
      )} link`
    );
    console.log(`      👤 By: ${change.performedBy}`);

    if (change.source === "notebook") {
      const beforeCount = change.beforeClasses.length;
      const afterCount = change.afterClasses.length;
      console.log(
        `      📚 Notebook's classes: ${beforeCount} → ${afterCount}`
      );

      if (change.action === "added") {
        const addedClasses = change.afterClasses.filter(
          (id) => !change.beforeClasses.includes(id)
        );
        console.log(
          chalk.green(`         ➕ Added: ${addedClasses.join(", ")}`)
        );
      } else {
        const removedClasses = change.beforeClasses.filter(
          (id) => !change.afterClasses.includes(id)
        );
        console.log(
          chalk.red(`         ➖ Removed: ${removedClasses.join(", ")}`)
        );
      }
    } else {
      const beforeCount = change.beforeNotebooks.length;
      const afterCount = change.afterNotebooks.length;
      console.log(`      📓 Class's notebooks: ${beforeCount} → ${afterCount}`);

      if (change.action === "added") {
        const addedNotebooks = change.afterNotebooks.filter(
          (id) => !change.beforeNotebooks.includes(id)
        );
        console.log(
          chalk.green(`         ➕ Added: ${addedNotebooks.join(", ")}`)
        );
      } else {
        const removedNotebooks = change.beforeNotebooks.filter(
          (id) => !change.afterNotebooks.includes(id)
        );
        console.log(
          chalk.red(`         ➖ Removed: ${removedNotebooks.join(", ")}`)
        );
        if (removedNotebooks.length === change.beforeNotebooks.length) {
          console.log(
            chalk.red.bold(
              `         ⚠️  MASS DELETION: All ${beforeCount} notebooks removed!`
            )
          );
        }
      }
    }
    console.log("");
  });

  // Provide enhanced diagnosis
  console.log(chalk.blue.bold("   � DIAGNOSIS:"));
  const lastNotebookChange = notebookChanges[notebookChanges.length - 1];
  const lastClassChange = classChanges[classChanges.length - 1];

  // Analyze the sequence of events
  if (allChanges.length === 1) {
    const onlyChange = allChanges[0];
    if (onlyChange.source === "notebook" && onlyChange.action === "added") {
      console.log(
        chalk.yellow(
          "      → INCOMPLETE LINKING: Notebook was linked to class, but class was never updated reciprocally"
        )
      );
      console.log(
        chalk.gray(
          "        This suggests the linking operation was only done on one side"
        )
      );
    } else if (
      onlyChange.source === "class" &&
      onlyChange.action === "removed"
    ) {
      console.log(
        chalk.yellow(
          "      → INCOMPLETE UNLINKING: Class removed notebook, but notebook still references class"
        )
      );
      console.log(
        chalk.gray(
          "        This suggests the unlinking operation was only done on one side"
        )
      );
    }
  } else if (allChanges.length === 2) {
    const first = allChanges[0];
    const second = allChanges[1];

    if (
      first.source === "notebook" &&
      first.action === "added" &&
      second.source === "class" &&
      second.action === "removed"
    ) {
      const timeDiff =
        (second.timestamp - first.timestamp) / 1000 / 60 / 60 / 24; // days
      console.log(chalk.yellow("      → TWO-PHASE PROBLEM:"));
      console.log(
        chalk.gray(
          `        1. Notebook linked to class (${formatTimestamp(
            first.timestamp
          )})`
        )
      );
      console.log(
        chalk.gray(
          `        2. Class cleared all notebooks ${Math.round(
            timeDiff
          )} days later (${formatTimestamp(second.timestamp)})`
        )
      );
      console.log(
        chalk.red(
          "        ⚠️  Neither operation updated both sides of the relationship"
        )
      );
    }
  }

  // Final assessment
  if (mismatchType === "notebook_has_class") {
    if (
      lastClassChange &&
      lastClassChange.action === "removed" &&
      lastClassChange.beforeNotebooks.length > 3
    ) {
      console.log(
        chalk.red.bold(
          "      💥 ROOT CAUSE: Mass deletion event removed all notebooks from class without updating the notebooks"
        )
      );
    }
  }
}

function generateSummaryReport(mismatches, auditResults) {
  console.log(chalk.blue.bold("\n📈 SUMMARY REPORT"));
  console.log("=".repeat(80));

  const totalMismatches =
    mismatches.notebookHasClass.length +
    mismatches.classHasNotebook.length +
    mismatches.nonExistentReferences.length;

  console.log(`${chalk.red("Total mismatches found:")} ${totalMismatches}`);
  console.log(
    `  • Notebooks have classes but classes don't have notebooks: ${mismatches.notebookHasClass.length}`
  );
  console.log(
    `  • Classes have notebooks but notebooks don't have classes: ${mismatches.classHasNotebook.length}`
  );
  console.log(
    `  • Non-existent references: ${mismatches.nonExistentReferences.length}`
  );

  if (mismatches.nonExistentReferences.length > 0) {
    console.log(chalk.red("\n⚠️  Non-existent references found:"));
    mismatches.nonExistentReferences.forEach((ref) => {
      if (ref.type === "notebook_to_missing_class") {
        console.log(
          `   Notebook "${ref.notebookTitle}" (${ref.notebookId}) → Missing class ${ref.classId}`
        );
      } else {
        console.log(
          `   Class "${ref.className}" (${ref.classId}) → Missing notebook ${ref.notebookId}`
        );
      }
    });
  }

  // Add detailed analysis of what really happened
  console.log(chalk.blue.bold("\n🔍 WHAT REALLY HAPPENED:"));

  // Analyze patterns in the audit results
  let massDeleteEvents = [];
  let incompleteLinks = [];

  Object.values(auditResults).forEach((result) => {
    // Look for mass deletion events
    const classDeletions = result.classChanges.filter(
      (c) => c.action === "removed" && c.beforeNotebooks.length > 3
    );
    if (classDeletions.length > 0) {
      massDeleteEvents.push(
        ...classDeletions.map((c) => ({
          ...c,
          className: result.className,
          classId: result.classId,
        }))
      );
    }

    // Look for incomplete links (notebook added but class never updated)
    const notebookAdds = result.notebookChanges.filter(
      (c) => c.action === "added"
    );
    const correspondingClassAdds = result.classChanges.filter(
      (c) => c.action === "added"
    );
    if (notebookAdds.length > 0 && correspondingClassAdds.length === 0) {
      incompleteLinks.push({
        notebookId: result.notebookId,
        classId: result.classId,
        notebookTitle: result.notebookTitle,
        className: result.className,
        when: notebookAdds[0].timestamp,
      });
    }
  });

  if (massDeleteEvents.length > 0) {
    console.log(chalk.red("1. 🗑️  MASS DELETION EVENTS:"));
    const uniqueEvents = [
      ...new Map(massDeleteEvents.map((e) => [e.timestamp, e])).values(),
    ];
    uniqueEvents.forEach((event) => {
      console.log(`   📅 ${formatTimestamp(event.timestamp)}`);
      console.log(`   👤 By: ${event.performedBy}`);
      console.log(`   🏫 Class: "${event.className}" (${event.classId})`);
      console.log(
        `   📊 Removed ${event.beforeNotebooks.length} notebooks but didn't update their classes arrays`
      );
      console.log("");
    });
  }

  if (incompleteLinks.length > 0) {
    console.log(chalk.yellow("2. 🔗 INCOMPLETE LINKING OPERATIONS:"));
    incompleteLinks.forEach((link) => {
      console.log(`   📅 ${formatTimestamp(link.when)}`);
      console.log(
        `   📚 Notebook "${link.notebookTitle}" linked to class "${link.className}"`
      );
      console.log(`   ⚠️  But class was never updated to include the notebook`);
      console.log("");
    });
  }

  console.log(chalk.green("\n🔧 Recommended Actions:"));
  console.log(
    "1. Review the audit trail above to understand when mismatches occurred"
  );
  console.log("2. Use the Python script to fix bidirectional linking issues");
  console.log("3. Clean up non-existent references manually");
  console.log(
    "4. Consider implementing validation hooks to prevent future mismatches"
  );

  if (massDeleteEvents.length > 0) {
    console.log(chalk.red("\n🚨 URGENT: Mass deletion events detected!"));
    console.log(
      "   These events removed multiple notebooks from classes without updating the notebooks."
    );
    console.log(
      "   This suggests a system-wide operation that didn't properly maintain referential integrity."
    );
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.blue.bold("🔍 NOTEBOOK-CLASS MISMATCH AUDIT"));
    console.log("=".repeat(80));

    if (specificNotebook) {
      console.log(chalk.gray(`Focusing on notebook: ${specificNotebook}`));
    }
    if (specificClass) {
      console.log(chalk.gray(`Focusing on class: ${specificClass}`));
    }
    console.log("");

    // Fetch current state
    const [notebooks, classes] = await Promise.all([
      fetchNotebooks(),
      fetchSchoolClasses(),
    ]);

    console.log(
      chalk.gray(
        `Loaded ${Object.keys(notebooks).length} notebooks and ${
          Object.keys(classes).length
        } classes\n`
      )
    );

    // Find mismatches
    const mismatches = findMismatches(notebooks, classes);

    if (
      mismatches.notebookHasClass.length === 0 &&
      mismatches.classHasNotebook.length === 0 &&
      mismatches.nonExistentReferences.length === 0
    ) {
      console.log(
        chalk.green(
          "✅ No mismatches found! All notebook-class relationships are properly synchronized."
        )
      );
      return;
    }

    // Analyze audit trail
    const auditResults = await analyzeAuditTrail(mismatches);

    // Generate summary report
    generateSummaryReport(mismatches, auditResults);
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error.message);
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

main();
