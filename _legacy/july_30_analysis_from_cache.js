/*
 * july_30_analysis_from_cache.js – Analyze ALL changes made to document vv3EMActxg1pRD09Kfle
 * on July 30, 2025, using existing cached data, showing every data change and person who did it.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node july_30_analysis_from_cache.js
 *
 * ------------------------------------------------------------
 * Prerequisites:
 *   1. Node.js ≥ 18.x installed.
 *   2. Existing audit_logs_vv3EMActxg1pRD09Kfle.json file from previous queries
 *   3. Install dependencies: npm install chalk
 *
 * The script will:
 *   • Load cached audit logs from the existing JSON file
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
const CACHE_FILE = `audit_logs_${TARGET_DOC_ID}.json`;

// ---------- Helper functions ----------

function isDateInRange(timestamp, targetDate) {
  const date = new Date(timestamp * 1000);
  const dateStr = date.toISOString().split("T")[0]; // Get YYYY-MM-DD format
  return dateStr === targetDate;
}

function loadCachedLogs() {
  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error(
      `Cache file ${CACHE_FILE} not found. Please run the main script first to generate cached data.`
    );
  }

  const data = fs.readFileSync(CACHE_FILE, "utf8");
  const parsed = JSON.parse(data);
  console.log(
    chalk.gray(
      `Loading ${parsed.logs.length} cached audit logs from ${CACHE_FILE}`
    )
  );
  return parsed.logs;
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
      chalk.blue.bold(
        `\n🔍 Analyzing ALL changes to document ${TARGET_DOC_ID} on ${TARGET_DATE}`
      )
    );
    console.log(chalk.gray("   Collection: Notebooks (using cached data)\n"));

    // Load cached audit logs
    const allLogs = loadCachedLogs();

    // Filter for July 30, 2025
    const july30Logs = allLogs.filter((log) =>
      isDateInRange(log.performedAt, TARGET_DATE)
    );

    if (july30Logs.length === 0) {
      console.log(chalk.yellow(`\n❌ No changes found for ${TARGET_DATE}`));
      console.log(chalk.gray(`   Total logs in cache: ${allLogs.length}`));

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
    if (error.message.includes("Cache file")) {
      console.error(
        chalk.yellow(
          "\n💡 Tip: Run 'node main.js vv3EMActxg1pRD09Kfle' first to generate the cache file."
        )
      );
    }
    process.exit(1);
  }
})();
