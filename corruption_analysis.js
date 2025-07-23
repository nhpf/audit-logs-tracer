/*
 * corruption_analysis.js – Analyze corruption event and timeline
 *
 * Usage: node corruption_analysis.js <notebookId> [--date=YYYY-MM-DD]
 * Example: node corruption_analysis.js vv3EMActxg1pRD09Kfle --date=2025-07-02
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments
const args = process.argv.slice(2);
const notebookId = args.find((arg) => !arg.startsWith("--"));

let targetDate = "2025-07-02";
const dateArg = args.find((arg) => arg.startsWith("--date="));
if (dateArg) {
  targetDate = dateArg.split("=")[1];
}

if (!notebookId) {
  console.error(
    "Usage: node corruption_analysis.js <notebookId> [--date=YYYY-MM-DD]"
  );
  process.exit(1);
}

function loadAuditLogs(notebookId) {
  const filePath = path.join(__dirname, `audit_logs_${notebookId}.json`);
  const data = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(data);

  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  } else {
    return [];
  }
}

function getSectionsLength(data) {
  if (!data || !data.sections || !Array.isArray(data.sections)) {
    return 0;
  }
  return data.sections.length;
}

function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date(timestamp).toISOString();
}

function analyzeCorruption() {
  console.log(chalk.blue.bold(`🔍 CORRUPTION ANALYSIS FOR ${notebookId}`));
  console.log(chalk.gray(`Target date: ${targetDate}`));
  console.log("=".repeat(80));

  const auditLogs = loadAuditLogs(notebookId);
  auditLogs.sort((a, b) => a.performedAt - b.performedAt);

  // Find events around the target date
  const targetStart = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  const targetEnd = new Date(`${targetDate}T23:59:59.999Z`).getTime();

  // Also look 1 day before and after for context
  const contextStart =
    new Date(`${targetDate}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000;
  const contextEnd =
    new Date(`${targetDate}T23:59:59.999Z`).getTime() + 24 * 60 * 60 * 1000;

  console.log("📅 TIMELINE AROUND CORRUPTION DATE:");
  console.log("-".repeat(80));

  const relevantEvents = auditLogs.filter((log) => {
    const logTime = new Date(log.performedAt * 1000).getTime();
    return logTime >= contextStart && logTime <= contextEnd;
  });

  let corruptionCandidates = [];

  relevantEvents.forEach((log, index) => {
    const logTime = new Date(log.performedAt * 1000).getTime();
    const isTargetDate = logTime >= targetStart && logTime <= targetEnd;
    const beforeSections = getSectionsLength(log.beforeData);
    const afterSections = getSectionsLength(log.afterData);
    const sectionChange = afterSections - beforeSections;

    const prefix = isTargetDate ? chalk.red("🚨") : "  ";
    const timeColor = isTargetDate ? chalk.red : chalk.gray;

    console.log(`${prefix} ${timeColor(formatTimestamp(log.performedAt))}`);
    console.log(`   By: ${log.performedByName || "Unknown"}`);
    console.log(
      `   Sections: ${beforeSections} → ${afterSections} (${
        sectionChange >= 0 ? "+" : ""
      }${sectionChange})`
    );

    if (log.shortDescription) {
      console.log(
        `   Description: ${log.shortDescription.substring(0, 100)}...`
      );
    }

    // Check if this could be corruption
    if (isTargetDate && beforeSections !== afterSections) {
      corruptionCandidates.push({
        ...log,
        beforeSections,
        afterSections,
        sectionChange,
        magnitude: Math.abs(sectionChange),
      });
    }

    console.log("");
  });

  // Analyze corruption candidates
  if (corruptionCandidates.length > 0) {
    console.log(
      chalk.red.bold("🚨 POTENTIAL CORRUPTION EVENTS ON TARGET DATE:")
    );
    console.log("-".repeat(80));

    corruptionCandidates.sort((a, b) => b.magnitude - a.magnitude);

    corruptionCandidates.forEach((candidate, index) => {
      console.log(
        `${index + 1}. ${chalk.red(formatTimestamp(candidate.performedAt))}`
      );
      console.log(`   User: ${candidate.performedByName || "Unknown"}`);
      console.log(
        `   Sections: ${candidate.beforeSections} → ${
          candidate.afterSections
        } (${candidate.sectionChange >= 0 ? "+" : ""}${
          candidate.sectionChange
        })`
      );
      console.log(`   Magnitude: ${candidate.magnitude} sections changed`);

      if (index === 0) {
        console.log(
          chalk.red("   👆 LIKELY CORRUPTION EVENT (largest change)")
        );
      }
      console.log("");
    });

    // Show pre-corruption state
    const mainCorruption = corruptionCandidates[0];
    console.log(chalk.green.bold("📋 PRE-CORRUPTION STATE:"));
    console.log("-".repeat(80));
    console.log(`Sections count: ${mainCorruption.beforeSections}`);
    console.log(
      `Last clean timestamp: ${formatTimestamp(
        mainCorruption.performedAt
      )} (before this event)`
    );

    // Find the actual pre-corruption state by looking for the previous entry
    for (let i = auditLogs.length - 1; i >= 0; i--) {
      if (auditLogs[i].performedAt < mainCorruption.performedAt) {
        const preState = auditLogs[i];
        console.log(
          `Previous clean state: ${formatTimestamp(preState.performedAt)}`
        );
        console.log(
          `Previous clean user: ${preState.performedByName || "Unknown"}`
        );
        console.log(
          `Previous clean sections: ${getSectionsLength(
            preState.afterData || preState.beforeData
          )}`
        );
        break;
      }
    }

    console.log("");
    console.log(chalk.blue.bold("🔄 POST-CORRUPTION CHANGES:"));
    console.log("-".repeat(80));

    const postCorruption = auditLogs.filter(
      (log) => log.performedAt > mainCorruption.performedAt
    );

    if (postCorruption.length > 0) {
      postCorruption.forEach((log, index) => {
        const beforeSections = getSectionsLength(log.beforeData);
        const afterSections = getSectionsLength(log.afterData);
        const sectionChange = afterSections - beforeSections;

        console.log(`${index + 1}. ${formatTimestamp(log.performedAt)}`);
        console.log(`   By: ${log.performedByName || "Unknown"}`);
        console.log(
          `   Sections: ${beforeSections} → ${afterSections} (${
            sectionChange >= 0 ? "+" : ""
          }${sectionChange})`
        );

        // Analyze if this looks legitimate
        if (Math.abs(sectionChange) > 20) {
          console.log(
            chalk.yellow("   ⚠️  Large change - potentially suspicious")
          );
        } else if (sectionChange !== 0) {
          console.log(chalk.green("   ✅ Small change - likely legitimate"));
        } else {
          console.log(chalk.gray("   → No section changes"));
        }
        console.log("");
      });
    } else {
      console.log("No changes after corruption event.");
    }
  } else {
    console.log(chalk.yellow("⚠️  No section changes found on target date"));
  }

  console.log("=".repeat(80));
  console.log(chalk.blue.bold("💡 RECOMMENDED NEXT STEPS:"));
  console.log("1. Run the intelligent corruption recovery:");
  console.log(
    `   node intelligent_corruption_recovery.js ${notebookId} --corruption-date=${targetDate} --dry-run`
  );
  console.log("2. Review the recovery plan carefully");
  console.log("3. Execute with --force flag if the plan looks correct");
}

analyzeCorruption();
