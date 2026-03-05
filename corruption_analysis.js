/*
 * corruption_analysis.js – Analyze corruption event and timeline
 *
 * Usage:
 *   node corruption_analysis.js <notebookId> [--date=YYYY-MM-DD] [--show-sections]
 *                               [--full-sections-timeline] [--max-section-names=N]
 *
 * Examples:
 *   node corruption_analysis.js vv3EMActxg1pRD09Kfle --date=2025-07-02
 *   node corruption_analysis.js vv3EMActxg1pRD09Kfle --date=2025-07-02 --show-sections
 *   node corruption_analysis.js vv3EMActxg1pRD09Kfle --full-sections-timeline
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

const showSections = args.includes("--show-sections");
const showFullSectionsTimeline = args.includes("--full-sections-timeline");

let maxSectionNames = 50;
const maxSectionNamesArg = args.find((arg) =>
  arg.startsWith("--max-section-names=")
);
if (maxSectionNamesArg) {
  const parsedValue = Number.parseInt(maxSectionNamesArg.split("=")[1], 10);
  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    maxSectionNames = parsedValue;
  } else {
    console.log(
      chalk.yellow(
        `⚠️  Invalid --max-section-names value. Using default (${maxSectionNames}).`
      )
    );
  }
}

if (!notebookId) {
  console.error(
    "Usage: node corruption_analysis.js <notebookId> [--date=YYYY-MM-DD] [--show-sections] [--full-sections-timeline] [--max-section-names=N]"
  );
  process.exit(1);
}

function loadAuditLogs(notebookId) {
  const filePath = path.join(__dirname, `audit_logs_${notebookId}.json`);
  const data = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(data);

  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  }
  return [];
}

function getSections(data) {
  if (!data || !Array.isArray(data.sections)) {
    return [];
  }
  return data.sections;
}

function getSectionsLength(data) {
  return getSections(data).length;
}

function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date(timestamp).toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractSectionTitle(section, index) {
  if (!section || typeof section !== "object") {
    return `[Untitled #${index + 1}]`;
  }

  if (typeof section.title === "string" && section.title.trim()) {
    return section.title.trim();
  }

  if (typeof section.name === "string" && section.name.trim()) {
    return section.name.trim();
  }

  if (typeof section.id === "string" && section.id.trim()) {
    return `[id:${section.id.trim()}]`;
  }

  return `[Untitled #${index + 1}]`;
}

function buildSectionEntries(data) {
  const sections = getSections(data);
  const titleOccurrences = new Map();

  return sections.map((section, index) => {
    const title = extractSectionTitle(section, index);
    const id =
      typeof section?.id === "string" && section.id.trim()
        ? section.id.trim()
        : null;

    if (id) {
      return {
        key: `id:${id}`,
        id,
        title,
        index,
      };
    }

    const normalizedTitle = normalizeText(title) || `[untitled-${index + 1}]`;
    const occurrence = (titleOccurrences.get(normalizedTitle) || 0) + 1;
    titleOccurrences.set(normalizedTitle, occurrence);

    return {
      key: `title:${normalizedTitle}#${occurrence}`,
      id: null,
      title,
      index,
    };
  });
}

function diffSections(beforeData, afterData) {
  const beforeEntries = buildSectionEntries(beforeData);
  const afterEntries = buildSectionEntries(afterData);

  const beforeMap = new Map(beforeEntries.map((entry) => [entry.key, entry]));
  const afterMap = new Map(afterEntries.map((entry) => [entry.key, entry]));

  const preserved = [];
  const removed = [];
  const added = [];

  for (const entry of beforeEntries) {
    const matchingAfter = afterMap.get(entry.key);
    if (matchingAfter) {
      preserved.push({ before: entry, after: matchingAfter });
    } else {
      removed.push(entry);
    }
  }

  for (const entry of afterEntries) {
    if (!beforeMap.has(entry.key)) {
      added.push(entry);
    }
  }

  const beforeCount = beforeEntries.length;
  const afterCount = afterEntries.length;
  const sectionChange = afterCount - beforeCount;
  const preservationRate =
    beforeCount > 0 ? preserved.length / beforeCount : afterCount > 0 ? 0 : 1;
  const hasStructuralChange =
    sectionChange !== 0 || removed.length > 0 || added.length > 0;
  const potentialReplacement =
    beforeCount >= 5 &&
    afterCount >= 5 &&
    removed.length > 0 &&
    added.length > 0 &&
    preservationRate < 0.35;
  const magnitude = Math.max(Math.abs(sectionChange), removed.length + added.length);

  return {
    beforeEntries,
    afterEntries,
    preserved,
    removed,
    added,
    beforeCount,
    afterCount,
    sectionChange,
    preservationRate,
    hasStructuralChange,
    potentialReplacement,
    magnitude,
  };
}

function printSectionList(label, entries, maxEntries = 50, color = (value) => value) {
  console.log(color(label));

  if (entries.length === 0) {
    console.log(color("      (none)"));
    return;
  }

  const visibleEntries = entries.slice(0, maxEntries);
  for (const entry of visibleEntries) {
    const idSuffix = entry.id ? ` [${entry.id}]` : "";
    console.log(color(`      [${entry.index + 1}] ${entry.title}${idSuffix}`));
  }

  if (entries.length > visibleEntries.length) {
    console.log(
      color(`      ... ${entries.length - visibleEntries.length} more section names`)
    );
  }
}

function printSectionChangeDetails(sectionDiff, maxEntries) {
  const preservationPercentage = Math.round(sectionDiff.preservationRate * 100);
  console.log(
    `   Identity: preserved ${sectionDiff.preserved.length}/${sectionDiff.beforeCount} (${preservationPercentage}%), added ${sectionDiff.added.length}, removed ${sectionDiff.removed.length}`
  );

  printSectionList(
    "   Before section titles:",
    sectionDiff.beforeEntries,
    maxEntries,
    chalk.gray
  );
  printSectionList(
    "   After section titles:",
    sectionDiff.afterEntries,
    maxEntries,
    chalk.gray
  );

  if (sectionDiff.removed.length > 0) {
    printSectionList(
      "   Removed titles:",
      sectionDiff.removed,
      maxEntries,
      chalk.red
    );
  }

  if (sectionDiff.added.length > 0) {
    printSectionList(
      "   Added titles:",
      sectionDiff.added,
      maxEntries,
      chalk.green
    );
  }
}

function printFullSectionsTimeline(auditLogs, maxEntries) {
  const timelineEvents = auditLogs
    .map((log) => ({
      ...log,
      sectionDiff: diffSections(log.beforeData, log.afterData),
    }))
    .filter((log) => log.sectionDiff.hasStructuralChange);

  console.log(chalk.blue.bold("🧭 FULL SECTION TITLE TIMELINE (STRUCTURAL CHANGES):"));
  console.log("-".repeat(80));

  if (timelineEvents.length === 0) {
    console.log(chalk.yellow("No structural section changes found in full history."));
    console.log("");
    return;
  }

  timelineEvents.forEach((event, index) => {
    const diff = event.sectionDiff;
    const isPotentialReplacement = diff.potentialReplacement
      ? chalk.red(" (potential replacement)")
      : "";

    console.log(`${index + 1}. ${formatTimestamp(event.performedAt)}${isPotentialReplacement}`);
    console.log(`   By: ${event.performedByName || "Unknown"}`);
    console.log(
      `   Sections: ${diff.beforeCount} → ${diff.afterCount} (${
        diff.sectionChange >= 0 ? "+" : ""
      }${diff.sectionChange})`
    );
    console.log(
      `   Identity: preserved ${diff.preserved.length}/${diff.beforeCount}, added ${diff.added.length}, removed ${diff.removed.length}`
    );
    printSectionList("   Resulting section titles:", diff.afterEntries, maxEntries, chalk.cyan);
    console.log("");
  });
}

function analyzeCorruption() {
  console.log(chalk.blue.bold(`🔍 CORRUPTION ANALYSIS FOR ${notebookId}`));
  console.log(chalk.gray(`Target date: ${targetDate}`));
  if (showSections) {
    console.log(chalk.gray(`Detailed section titles: enabled (max ${maxSectionNames})`));
  }
  if (showFullSectionsTimeline) {
    console.log(chalk.gray("Full section title timeline: enabled"));
  }
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

  const corruptionCandidates = [];

  relevantEvents.forEach((log) => {
    const logTime = new Date(log.performedAt * 1000).getTime();
    const isTargetDate = logTime >= targetStart && logTime <= targetEnd;
    const beforeSections = getSectionsLength(log.beforeData);
    const afterSections = getSectionsLength(log.afterData);
    const sectionChange = afterSections - beforeSections;
    const sectionDiff = diffSections(log.beforeData, log.afterData);

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

    if (log.updatedFields?.includes("sections") && !showSections) {
      console.log(
        `   Identity: preserved ${sectionDiff.preserved.length}/${sectionDiff.beforeCount}, added ${sectionDiff.added.length}, removed ${sectionDiff.removed.length}`
      );
    }

    if (showSections && log.updatedFields?.includes("sections")) {
      printSectionChangeDetails(sectionDiff, maxSectionNames);
    }

    // Check if this could be corruption (count change OR same-count replacement)
    if (isTargetDate && sectionDiff.hasStructuralChange) {
      const severityScore =
        sectionDiff.magnitude + (sectionDiff.potentialReplacement ? 1000 : 0);
      corruptionCandidates.push({
        ...log,
        sectionDiff,
        beforeSections,
        afterSections,
        sectionChange,
        magnitude: sectionDiff.magnitude,
        severityScore,
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

    corruptionCandidates.sort((a, b) => b.severityScore - a.severityScore);

    corruptionCandidates.forEach((candidate, index) => {
      const replacementTag = candidate.sectionDiff.potentialReplacement
        ? chalk.red(" (potential replacement)")
        : "";

      console.log(
        `${index + 1}. ${chalk.red(formatTimestamp(candidate.performedAt))}${replacementTag}`
      );
      console.log(`   User: ${candidate.performedByName || "Unknown"}`);
      console.log(
        `   Sections: ${candidate.beforeSections} → ${
          candidate.afterSections
        } (${candidate.sectionChange >= 0 ? "+" : ""}${
          candidate.sectionChange
        })`
      );
      if (!showSections) {
        console.log(
          `   Identity: preserved ${candidate.sectionDiff.preserved.length}/${candidate.sectionDiff.beforeCount}, added ${candidate.sectionDiff.added.length}, removed ${candidate.sectionDiff.removed.length}`
        );
      }
      console.log(`   Magnitude: ${candidate.magnitude} section identity changes`);

      if (index === 0) {
        console.log(
          chalk.red("   👆 LIKELY CORRUPTION EVENT (highest severity score)")
        );
      }

      if (showSections) {
        printSectionChangeDetails(candidate.sectionDiff, maxSectionNames);
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
        const preDiff = diffSections(preState.beforeData, preState.afterData);
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
        if (showSections) {
          printSectionList(
            "Previous clean section titles:",
            preDiff.afterEntries,
            maxSectionNames,
            chalk.gray
          );
        }
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
        const sectionDiff = diffSections(log.beforeData, log.afterData);

        console.log(`${index + 1}. ${formatTimestamp(log.performedAt)}`);
        console.log(`   By: ${log.performedByName || "Unknown"}`);
        console.log(
          `   Sections: ${sectionDiff.beforeCount} → ${sectionDiff.afterCount} (${
            sectionDiff.sectionChange >= 0 ? "+" : ""
          }${sectionDiff.sectionChange})`
        );
        if (!showSections || !sectionDiff.hasStructuralChange) {
          console.log(
            `   Identity: preserved ${sectionDiff.preserved.length}/${sectionDiff.beforeCount}, added ${sectionDiff.added.length}, removed ${sectionDiff.removed.length}`
          );
        }

        if (sectionDiff.potentialReplacement || sectionDiff.magnitude > 20) {
          console.log(
            chalk.yellow("   ⚠️  Large structural change - potentially suspicious")
          );
        } else if (sectionDiff.hasStructuralChange) {
          console.log(chalk.green("   ✅ Structural change - likely legitimate"));
        } else {
          console.log(chalk.gray("   → No structural section changes"));
        }

        if (showSections && sectionDiff.hasStructuralChange) {
          printSectionChangeDetails(sectionDiff, maxSectionNames);
        }
        console.log("");
      });
    } else {
      console.log("No changes after corruption event.");
    }
  } else {
    console.log(
      chalk.yellow("⚠️  No structural section changes found on target date")
    );
  }

  if (!showSections) {
    console.log(
      chalk.gray(
        "Tip: Add --show-sections to print before/after section title lists."
      )
    );
  }

  if (showFullSectionsTimeline) {
    console.log("");
    printFullSectionsTimeline(auditLogs, maxSectionNames);
  } else {
    console.log(
      chalk.gray(
        "Tip: Add --full-sections-timeline to list resulting section titles through the entire history."
      )
    );
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
