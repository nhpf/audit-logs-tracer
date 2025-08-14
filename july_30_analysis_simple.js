/*
 * july_30_analysis_simple.js – Analyze ALL changes made to document vv3EMActxg1pRD09Kfle
 * on July 30, 2025, using any available audit log data.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node july_30_analysis_simple.js [audit_log_file.json]
 *
 * If no file is provided, it will look for audit_logs_vv3EMActxg1pRD09Kfle.json
 * or audit_logs_azambuja.json in the current directory.
 *
 * ------------------------------------------------------------
 * The script will:
 *   • Load audit logs from a JSON file (if available)
 *   • Filter for changes that occurred on July 30, 2025
 *   • Show detailed before/after diffs for every field change
 *   • Group by person and show chronological timeline
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import chalk from "chalk";
import fs from "fs";

// Constants
const TARGET_DOC_ID = "vv3EMActxg1pRD09Kfle";
const TARGET_DATE = "2025-07-30"; // July 30, 2025

// ---------- Helper functions ----------

function isDateInRange(timestamp, targetDate) {
  const date = new Date(timestamp * 1000);
  const dateStr = date.toISOString().split("T")[0]; // Get YYYY-MM-DD format
  return dateStr === targetDate;
}

function findAuditLogFile() {
  const args = process.argv.slice(2);

  // If file specified as argument
  if (args.length > 0 && fs.existsSync(args[0])) {
    return args[0];
  }

  // Try common file names
  const possibleFiles = [
    `audit_logs_${TARGET_DOC_ID}.json`,
    "audit_logs_azambuja.json",
    "audit_logs_vv3EMActxg1pRD09Kfle.json",
  ];

  for (const file of possibleFiles) {
    if (fs.existsSync(file)) {
      return file;
    }
  }

  return null;
}

function loadAuditLogs(filename) {
  console.log(chalk.gray(`Loading audit logs from ${filename}...`));

  const data = fs.readFileSync(filename, "utf8");
  const parsed = JSON.parse(data);

  // Handle different file structures
  let logs = [];
  if (Array.isArray(parsed)) {
    logs = parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    logs = parsed.logs;
  } else if (parsed.data && Array.isArray(parsed.data)) {
    logs = parsed.data;
  } else {
    throw new Error("Could not find logs array in file structure");
  }

  console.log(chalk.gray(`Loaded ${logs.length} audit logs from ${filename}`));
  return logs;
}

function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString();
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

  // For large objects/arrays, show a summary first
  if (change.beforeStr.length > 200 || change.afterStr.length > 200) {
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

  // Show a truncated version for very large changes
  const maxLength = 500;
  let beforeDisplay = change.beforeStr;
  let afterDisplay = change.afterStr;

  if (beforeDisplay.length > maxLength) {
    beforeDisplay =
      beforeDisplay.substring(0, maxLength) + "\n      ... (truncated)";
  }
  if (afterDisplay.length > maxLength) {
    afterDisplay =
      afterDisplay.substring(0, maxLength) + "\n      ... (truncated)";
  }

  console.log(chalk.red("      BEFORE:"));
  console.log(
    chalk.red(
      `      ${beforeDisplay
        .split("\n")
        .map((line) => "      " + line)
        .join("\n")}`
    )
  );
  console.log(chalk.green("      AFTER:"));
  console.log(
    chalk.green(
      `      ${afterDisplay
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
      chalk.blue.bold(
        `\n🔍 Analyzing ALL changes to document ${TARGET_DOC_ID} on ${TARGET_DATE}`
      )
    );
    console.log(chalk.gray("   Collection: Notebooks\n"));

    // Find and load audit log file
    const logFile = findAuditLogFile();
    if (!logFile) {
      console.error(chalk.red("❌ No audit log file found."));
      console.error(
        chalk.yellow(
          "Please provide a JSON file as argument or ensure one of these files exists:"
        )
      );
      console.error(chalk.yellow(`  - audit_logs_${TARGET_DOC_ID}.json`));
      console.error(chalk.yellow("  - audit_logs_azambuja.json"));
      console.error(chalk.yellow("  - audit_logs_vv3EMActxg1pRD09Kfle.json"));
      process.exit(1);
    }

    const allLogs = loadAuditLogs(logFile);

    // Filter for July 30, 2025 and the specific document
    let july30Logs = allLogs.filter((log) => {
      // Filter by document ID and date
      const matchesDoc = log.docId === TARGET_DOC_ID || !log.docId; // Include if no docId or matches
      const matchesDate = isDateInRange(log.performedAt, TARGET_DATE);
      return matchesDoc && matchesDate;
    });

    if (july30Logs.length === 0) {
      console.log(chalk.yellow(`\n❌ No changes found for ${TARGET_DATE}`));
      console.log(chalk.gray(`   Total logs in file: ${allLogs.length}`));

      // Show date range of available logs
      if (allLogs.length > 0) {
        const tempSorted = [...allLogs];
        tempSorted.sort((a, b) => a.performedAt - b.performedAt);
        const earliest = formatTimestamp(tempSorted[0].performedAt);
        const latest = formatTimestamp(
          tempSorted[tempSorted.length - 1].performedAt
        );
        console.log(
          chalk.gray(
            `   Available date range: ${earliest.split("T")[0]} to ${
              latest.split("T")[0]
            }`
          )
        );

        // Show sample of document IDs
        const docIds = [
          ...new Set(allLogs.map((log) => log.docId).filter(Boolean)),
        ];
        console.log(
          chalk.gray(
            `   Document IDs found: ${docIds.slice(0, 5).join(", ")}${
              docIds.length > 5 ? "..." : ""
            }`
          )
        );
      }
      return;
    }

    // Sort by timestamp
    const sortedLogs = [...july30Logs];
    sortedLogs.sort((a, b) => a.performedAt - b.performedAt);

    console.log(
      chalk.green(`✅ Found ${sortedLogs.length} changes on ${TARGET_DATE}\n`)
    );

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
        `\n✨ Analysis complete! Found ${sortedLogs.length} total changes on ${TARGET_DATE}`
      )
    );
  } catch (error) {
    console.error(chalk.red("❌ Error:"), error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
