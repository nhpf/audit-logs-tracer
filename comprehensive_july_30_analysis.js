/*
 * comprehensive_july_30_analysis.js – Comprehensive analysis of ALL changes made to document vv3EMActxg1pRD09Kfle
 * on July 30, 2025, with multiple viewing modes and deep insights.
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node comprehensive_july_30_analysis.js [options]
 *
 * Options:
 *   --mode=MODE        Analysis mode: summary|timeline|fields|sections|meetings|full (default: full)
 *   --refresh          Force refresh the cache from Firestore
 *   --export=FORMAT    Export to file: json|csv|html (optional)
 *   --limit=N          Limit output to N changes (default: all)
 *
 * Modes:
 *   summary   - High-level overview with statistics
 *   timeline  - Chronological timeline of all changes
 *   fields    - Field-by-field change analysis
 *   sections  - Focus on sections array changes
 *   meetings  - Focus on meeting-related changes
 *   full      - All of the above (default)
 *
 * Examples:
 *   node comprehensive_july_30_analysis.js --mode=summary
 *   node comprehensive_july_30_analysis.js --mode=sections --export=json
 *   node comprehensive_july_30_analysis.js --mode=timeline --limit=5
 *
 * ------------------------------------------------------------
 * Prerequisites:
 *   1. Node.js ≥ 18.x installed.
 *   2. Service‑account credentials for your Firebase/Google Cloud project.
 *   3. Install dependencies: npm install firebase-admin chalk
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
const TARGET_DOC_ID = "vv3EMActxg1pRD09Kfle";
const TARGET_DATE = "2025-07-30"; // July 30, 2025
const START_DATE_STR = "2025-07-29T23:59:00Z"; // inclusive lower bound
const START_EPOCH_SEC = Math.floor(new Date(START_DATE_STR).getTime() / 1000);
const CACHE_FILE = `audit_logs_recent_${TARGET_DATE.replace(/-/g, "")}.json`;

// ---------- CLI Args Parser ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: "full",
    refresh: false,
    export: null,
    limit: null,
  };

  args.forEach((arg) => {
    if (arg === "--refresh") {
      options.refresh = true;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--export=")) {
      options.export = arg.split("=")[1];
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.split("=")[1]);
    }
  });

  return options;
}

// ---------- Helper functions ----------

function isDateInRange(timestamp, targetDate) {
  const date = new Date(timestamp * 1000);
  const dateStr = date.toISOString().split("T")[0]; // Get YYYY-MM-DD format
  return dateStr === targetDate;
}

async function loadFromCache(refreshCache) {
  if (refreshCache) {
    console.log(chalk.yellow("Refresh flag detected, skipping cache..."));
    return null;
  }

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(data);
      console.log(
        chalk.gray(
          `Loading ${parsed.logs.length} cached audit logs from ${CACHE_FILE}`
        )
      );
      return parsed.logs;
    }
  } catch (error) {
    console.log(
      chalk.yellow(
        `Cache file exists but could not be parsed (${error.message}), fetching fresh data...`
      )
    );
  }
  return null;
}

async function saveToCache(logs) {
  const cacheData = {
    timestamp: new Date().toISOString(),
    startEpochSec: START_EPOCH_SEC,
    targetDate: TARGET_DATE,
    logs,
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log(chalk.gray(`Saved ${logs.length} audit logs to ${CACHE_FILE}`));
}

async function fetchAuditLogs(refreshCache) {
  // Try loading from cache first
  const cachedLogs = await loadFromCache(refreshCache);
  if (cachedLogs) {
    return cachedLogs;
  }

  console.log(
    chalk.gray(`Fetching audit logs since ${START_DATE_STR} from Firestore...`)
  );

  // Query by performedAt only (to avoid needing a composite index)
  const logsRef = db.collection("SchoolAuditLogs");
  const query = logsRef.where("performedAt", ">", START_EPOCH_SEC);
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

  // Save to cache
  await saveToCache(logs);
  return logs;
}

function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toISOString();
}

function formatTimeOnly(timestamp) {
  return new Date(timestamp * 1000).toISOString().split("T")[1].split(".")[0];
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

// ---------- Analysis Functions ----------

function generateSummaryAnalysis(logs) {
  console.log(chalk.blue.bold("\n📊 SUMMARY ANALYSIS"));
  console.log(chalk.blue("=" + "=".repeat(50)));

  const totalChanges = logs.length;
  const operations = {};
  const people = {};
  const fields = {};
  const timeSpan = {
    earliest: Math.min(...logs.map((l) => l.performedAt)),
    latest: Math.max(...logs.map((l) => l.performedAt)),
  };

  logs.forEach((log) => {
    // Count operations
    operations[log.operationType] = (operations[log.operationType] || 0) + 1;

    // Count people
    const person = log.performedByName || "Unknown";
    people[person] = (people[person] || 0) + 1;

    // Count field changes
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );
    changes.forEach((change) => {
      fields[change.field] = (fields[change.field] || 0) + 1;
    });
  });

  console.log(chalk.cyan(`📈 Total Changes: ${totalChanges}`));
  console.log(
    chalk.cyan(
      `⏰ Time Span: ${formatTimeOnly(timeSpan.earliest)} - ${formatTimeOnly(
        timeSpan.latest
      )}`
    )
  );
  console.log(
    chalk.cyan(
      `🕐 Duration: ${Math.round(
        (timeSpan.latest - timeSpan.earliest) / 60
      )} minutes`
    )
  );

  console.log(chalk.yellow("\n🔄 Operations:"));
  Object.entries(operations).forEach(([op, count]) => {
    console.log(chalk.yellow(`   ${op}: ${count}`));
  });

  console.log(chalk.magenta("\n👥 People:"));
  Object.entries(people).forEach(([person, count]) => {
    console.log(chalk.magenta(`   ${person}: ${count} changes`));
  });

  console.log(chalk.green("\n📝 Most Changed Fields:"));
  const sortedFields = Object.entries(fields)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  sortedFields.forEach(([field, count]) => {
    console.log(chalk.green(`   ${field}: ${count} times`));
  });
}

function generateTimelineAnalysis(logs, limit = null) {
  console.log(chalk.blue.bold("\n📅 TIMELINE ANALYSIS"));
  console.log(chalk.blue("=" + "=".repeat(50)));

  const logsToShow = limit ? logs.slice(0, limit) : logs;

  logsToShow.forEach((log, index) => {
    const person = log.performedByName || "Unknown";
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );

    console.log(
      chalk.blue.bold(
        `\n#${index + 1} — ${formatTimeOnly(
          log.performedAt
        )} — ${log.operationType.toUpperCase()}`
      )
    );
    console.log(chalk.cyan(`   👤 ${person}`));
    console.log(
      chalk.yellow(
        `   📝 ${changes.length} field(s) changed: ${changes
          .map((c) => c.field)
          .join(", ")}`
      )
    );

    if (changes.length > 0) {
      const majorChanges = changes.filter(
        (c) => c.field === "sections" || c.beforeStr.length > 100
      );
      if (majorChanges.length > 0) {
        console.log(
          chalk.red(
            `   🔥 Major changes in: ${majorChanges
              .map((c) => c.field)
              .join(", ")}`
          )
        );
      }
    }
  });

  if (limit && logs.length > limit) {
    console.log(chalk.gray(`\n... and ${logs.length - limit} more changes`));
  }
}

function generateFieldsAnalysis(logs) {
  console.log(chalk.blue.bold("\n🔍 FIELDS ANALYSIS"));
  console.log(chalk.blue("=" + "=".repeat(50)));

  const fieldChanges = {};

  logs.forEach((log, logIndex) => {
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );
    changes.forEach((change) => {
      if (!fieldChanges[change.field]) {
        fieldChanges[change.field] = [];
      }
      fieldChanges[change.field].push({
        logIndex: logIndex + 1,
        timestamp: log.performedAt,
        person: log.performedByName || "Unknown",
        change,
      });
    });
  });

  Object.entries(fieldChanges).forEach(([field, changes]) => {
    console.log(
      chalk.cyan(`\n📊 Field: ${chalk.bold(field)} (${changes.length} changes)`)
    );

    changes.forEach((item, index) => {
      console.log(
        chalk.gray(
          `   #${item.logIndex} ${formatTimeOnly(item.timestamp)} by ${
            item.person
          }`
        )
      );

      // Show sample of change for important fields
      if (field === "sections" && Array.isArray(item.change.after)) {
        console.log(
          chalk.yellow(
            `      Sections count: ${
              Array.isArray(item.change.before)
                ? item.change.before.length
                : "unknown"
            } → ${item.change.after.length}`
          )
        );
      } else if (field === "title" || field === "description") {
        console.log(
          chalk.yellow(`      "${item.change.before}" → "${item.change.after}"`)
        );
      } else if (typeof item.change.after === "number") {
        console.log(
          chalk.yellow(`      ${item.change.before} → ${item.change.after}`)
        );
      }
    });
  });
}

function generateSectionsAnalysis(logs) {
  console.log(chalk.blue.bold("\n📋 SECTIONS ANALYSIS"));
  console.log(chalk.blue("=" + "=".repeat(50)));

  const sectionChanges = logs.filter((log) => {
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );
    return changes.some((change) => change.field === "sections");
  });

  console.log(
    chalk.cyan(`Found ${sectionChanges.length} changes to sections array`)
  );

  sectionChanges.forEach((log, index) => {
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );
    const sectionsChange = changes.find(
      (change) => change.field === "sections"
    );

    if (sectionsChange) {
      console.log(
        chalk.yellow(
          `\n#${index + 1} — ${formatTimeOnly(log.performedAt)} by ${
            log.performedByName || "Unknown"
          }`
        )
      );

      const beforeSections = Array.isArray(sectionsChange.before)
        ? sectionsChange.before
        : [];
      const afterSections = Array.isArray(sectionsChange.after)
        ? sectionsChange.after
        : [];

      console.log(
        chalk.cyan(
          `   Sections count: ${beforeSections.length} → ${afterSections.length}`
        )
      );

      // Analyze what changed in sections
      if (afterSections.length > beforeSections.length) {
        console.log(
          chalk.green(
            `   ➕ Added ${
              afterSections.length - beforeSections.length
            } section(s)`
          )
        );
      } else if (afterSections.length < beforeSections.length) {
        console.log(
          chalk.red(
            `   ➖ Removed ${
              beforeSections.length - afterSections.length
            } section(s)`
          )
        );
      } else {
        console.log(chalk.yellow(`   ✏️ Modified existing sections`));
      }

      // Show titles of new/changed sections
      const newTitles = afterSections
        .slice(-3)
        .map((s) => s.title || s.id || "Untitled")
        .filter(Boolean);
      if (newTitles.length > 0) {
        console.log(chalk.gray(`   Recent sections: ${newTitles.join(", ")}`));
      }
    }
  });
}

function generateMeetingsAnalysis(logs) {
  console.log(chalk.blue.bold("\n👥 MEETINGS ANALYSIS"));
  console.log(chalk.blue("=" + "=".repeat(50)));

  let meetingRelatedChanges = 0;
  const meetingEvents = [];

  logs.forEach((log, index) => {
    const changes = analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    );
    const sectionsChange = changes.find(
      (change) => change.field === "sections"
    );

    if (sectionsChange && Array.isArray(sectionsChange.after)) {
      const sections = sectionsChange.after;
      const meetingSections = sections.filter((s) => s.meeting || s.hasMeeting);

      if (meetingSections.length > 0) {
        meetingRelatedChanges++;
        meetingEvents.push({
          logIndex: index + 1,
          timestamp: log.performedAt,
          person: log.performedByName || "Unknown",
          meetingSections: meetingSections.length,
          totalSections: sections.length,
          sampleMeetings: meetingSections.slice(0, 3).map((s) => ({
            title: s.title,
            meetingId: s.meeting?.meetingID,
            status: s.meeting?.status,
            startDate: s.meeting?.startDate,
          })),
        });
      }
    }
  });

  console.log(
    chalk.cyan(`Found ${meetingRelatedChanges} changes involving meetings`)
  );

  meetingEvents.forEach((event, index) => {
    console.log(
      chalk.yellow(
        `\n#${event.logIndex} — ${formatTimeOnly(event.timestamp)} by ${
          event.person
        }`
      )
    );
    console.log(
      chalk.cyan(
        `   ${event.meetingSections}/${event.totalSections} sections have meetings`
      )
    );

    event.sampleMeetings.forEach((meeting) => {
      console.log(
        chalk.gray(
          `   📅 "${meeting.title}" (${meeting.status || "unknown status"})`
        )
      );
      if (meeting.startDate) {
        console.log(chalk.gray(`      Start: ${meeting.startDate}`));
      }
    });
  });
}

function exportToFile(logs, format, mode) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `july_30_analysis_${mode}_${timestamp}.${format}`;

  try {
    if (format === "json") {
      fs.writeFileSync(filename, JSON.stringify(logs, null, 2));
    } else if (format === "csv") {
      const csvHeader =
        "Index,Timestamp,Person,Operation,FieldsChanged,Details\n";
      const csvRows = logs
        .map((log, index) => {
          const changes = analyzeFieldChanges(
            log.beforeData || {},
            log.afterData || {},
            log.updatedFields
          );
          const fieldsChanged = changes.map((c) => c.field).join(";");
          const details =
            changes.length > 0 ? `${changes.length} fields` : "No changes";
          return `${index + 1},"${formatTimestamp(log.performedAt)}","${
            log.performedByName || "Unknown"
          }","${log.operationType}","${fieldsChanged}","${details}"`;
        })
        .join("\n");
      fs.writeFileSync(filename, csvHeader + csvRows);
    } else if (format === "html") {
      const html = generateHtmlReport(logs, mode);
      fs.writeFileSync(filename, html);
    }

    console.log(chalk.green(`\n💾 Exported to: ${filename}`));
  } catch (error) {
    console.error(chalk.red(`Export failed: ${error.message}`));
  }
}

function generateHtmlReport(logs, mode) {
  const changes = logs.map((log) =>
    analyzeFieldChanges(
      log.beforeData || {},
      log.afterData || {},
      log.updatedFields
    )
  );

  return `
<!DOCTYPE html>
<html>
<head>
    <title>July 30, 2025 - Document Changes Analysis</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .change { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .timestamp { color: #666; font-size: 0.9em; }
        .person { color: #0066cc; font-weight: bold; }
        .field { background: #f0f0f0; padding: 2px 5px; margin: 2px; border-radius: 3px; }
        .summary { background: #e6f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Document vv3EMActxg1pRD09Kfle - Changes on July 30, 2025</h1>
    <div class="summary">
        <h2>Summary</h2>
        <p><strong>Total Changes:</strong> ${logs.length}</p>
        <p><strong>Analysis Mode:</strong> ${mode}</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>
    
    ${logs
      .map(
        (log, index) => `
        <div class="change">
            <h3>#${index + 1} - ${log.operationType.toUpperCase()}</h3>
            <div class="timestamp">${formatTimestamp(log.performedAt)}</div>
            <div class="person">By: ${log.performedByName || "Unknown"}</div>
            <div>
                <strong>Fields Changed:</strong>
                ${changes[index]
                  .map((c) => `<span class="field">${c.field}</span>`)
                  .join(" ")}
            </div>
        </div>
    `
      )
      .join("")}
</body>
</html>`;
}

// ---------- Main execution ----------
(async () => {
  try {
    const options = parseArgs();

    console.log(
      chalk.blue.bold(
        `\n🔍 Comprehensive Analysis: Document ${TARGET_DOC_ID} on ${TARGET_DATE}`
      )
    );
    console.log(
      chalk.gray(
        `   Mode: ${options.mode} | Export: ${
          options.export || "none"
        } | Limit: ${options.limit || "all"}\n`
      )
    );

    // Fetch all audit logs since the start date
    const allLogs = await fetchAuditLogs(options.refresh);

    // Filter for the specific document and collection first
    const documentLogs = allLogs.filter(
      (log) => log.docId === TARGET_DOC_ID && log.collectionName === "Notebooks"
    );

    // Filter for July 30, 2025
    const july30Logs = documentLogs.filter((log) =>
      isDateInRange(log.performedAt, TARGET_DATE)
    );

    if (july30Logs.length === 0) {
      console.log(chalk.yellow(`\n❌ No changes found for ${TARGET_DATE}`));
      return;
    }

    // Sort by timestamp
    const sortedLogs = [...july30Logs];
    sortedLogs.sort((a, b) => a.performedAt - b.performedAt);

    console.log(
      chalk.green(`✅ Found ${sortedLogs.length} changes on ${TARGET_DATE}`)
    );

    // Run analysis based on mode
    if (options.mode === "summary" || options.mode === "full") {
      generateSummaryAnalysis(sortedLogs);
    }

    if (options.mode === "timeline" || options.mode === "full") {
      generateTimelineAnalysis(sortedLogs, options.limit);
    }

    if (options.mode === "fields" || options.mode === "full") {
      generateFieldsAnalysis(sortedLogs);
    }

    if (options.mode === "sections" || options.mode === "full") {
      generateSectionsAnalysis(sortedLogs);
    }

    if (options.mode === "meetings" || options.mode === "full") {
      generateMeetingsAnalysis(sortedLogs);
    }

    // Export if requested
    if (options.export) {
      exportToFile(sortedLogs, options.export, options.mode);
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
