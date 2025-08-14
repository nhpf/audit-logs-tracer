import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadAuditLogs(notebookId) {
  const filePath = path.join(__dirname, `audit_logs_${notebookId}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Audit logs file not found: ${filePath}`);
    return [];
  }

  const data = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(data);

  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  } else {
    console.log(`❌ Unexpected audit logs file structure`);
    return [];
  }
}

function getSectionsLength(data) {
  if (!data || !data.sections || !Array.isArray(data.sections)) {
    return 0;
  }
  return data.sections.length;
}

function findSpecificChange(logs, targetTimestamp) {
  const targetTime = new Date(targetTimestamp).getTime();

  for (const logEntry of logs) {
    const logTime = new Date(logEntry.performedAt * 1000).getTime();
    if (Math.abs(logTime - targetTime) <= 5000) {
      // 5 second tolerance
      const beforeLength = getSectionsLength(logEntry.beforeData);
      const afterLength = getSectionsLength(logEntry.afterData);

      if (beforeLength !== afterLength) {
        return {
          timestamp: new Date(logEntry.performedAt * 1000).toISOString(),
          performedByName: logEntry.performedByName || "Unknown",
          beforeLength,
          afterLength,
          lengthChange: afterLength - beforeLength,
          beforeSections: logEntry.beforeData?.sections || [],
          afterSections: logEntry.afterData?.sections || [],
          shortDescription: logEntry.shortDescription || "No description",
          auditLog: logEntry,
        };
      }
    }
  }

  return null;
}

function compareAllFields(obj1, obj2, path = "") {
  const differences = [];
  const allKeys = new Set([
    ...Object.keys(obj1 || {}),
    ...Object.keys(obj2 || {}),
  ]);

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    const val1 = obj1?.[key];
    const val2 = obj2?.[key];

    if (val1 === val2) {
      continue; // Identical
    }

    if (
      typeof val1 === "object" &&
      typeof val2 === "object" &&
      val1 !== null &&
      val2 !== null
    ) {
      // Recursive comparison for nested objects
      differences.push(...compareAllFields(val1, val2, currentPath));
    } else {
      differences.push({
        field: currentPath,
        before: val1,
        after: val2,
        type:
          val1 === undefined
            ? "added"
            : val2 === undefined
            ? "removed"
            : "changed",
      });
    }
  }

  return differences;
}

function analyzeDetailedFieldChanges(beforeSections, afterSections) {
  console.log("🔬 **ULTRA-DETAILED FIELD-BY-FIELD ANALYSIS**\n");

  // Find title matches for detailed comparison
  const titleMatches = [];

  beforeSections.forEach((beforeSection, beforeIndex) => {
    afterSections.forEach((afterSection, afterIndex) => {
      if (
        beforeSection.title &&
        afterSection.title &&
        beforeSection.title === afterSection.title
      ) {
        titleMatches.push({
          title: beforeSection.title,
          beforeIndex,
          afterIndex,
          beforeSection,
          afterSection,
        });
      }
    });
  });

  console.log(
    `📋 Found ${titleMatches.length} sections with matching titles for detailed analysis:\n`
  );

  titleMatches.forEach((match, idx) => {
    console.log(
      `${idx + 1}. **${match.title}** [${match.beforeIndex}→${
        match.afterIndex
      }]`
    );

    const differences = compareAllFields(
      match.beforeSection,
      match.afterSection
    );

    if (differences.length === 0) {
      console.log("   ✅ **IDENTICAL**: All fields are exactly the same");
    } else {
      console.log(`   🔄 **${differences.length} FIELD DIFFERENCES FOUND**:`);

      differences.forEach((diff) => {
        const beforeStr = JSON.stringify(diff.before);
        const afterStr = JSON.stringify(diff.after);

        if (diff.type === "added") {
          console.log(
            `      ➕ ${diff.field}: ADDED → ${
              afterStr.length > 100
                ? afterStr.substring(0, 100) + "..."
                : afterStr
            }`
          );
        } else if (diff.type === "removed") {
          console.log(
            `      ➖ ${diff.field}: REMOVED ← ${
              beforeStr.length > 100
                ? beforeStr.substring(0, 100) + "..."
                : beforeStr
            }`
          );
        } else {
          console.log(`      🔄 ${diff.field}:`);
          console.log(
            `         Before: ${
              beforeStr.length > 100
                ? beforeStr.substring(0, 100) + "..."
                : beforeStr
            }`
          );
          console.log(
            `         After:  ${
              afterStr.length > 100
                ? afterStr.substring(0, 100) + "..."
                : afterStr
            }`
          );
        }
      });
    }
    console.log("");
  });

  // Analyze sections that were completely removed
  const removedTitles = [];
  beforeSections.forEach((section, index) => {
    const foundInAfter = afterSections.some(
      (afterSection) =>
        section.title &&
        afterSection.title &&
        section.title === afterSection.title
    );
    if (!foundInAfter) {
      removedTitles.push({
        title: section.title || `Section ${index}`,
        index,
        section,
      });
    }
  });

  console.log(`🗑️  **COMPLETELY REMOVED SECTIONS (${removedTitles.length})**:`);
  removedTitles.forEach((removed) => {
    console.log(`   • [${removed.index}] ${removed.title}`);
    // Show a few key fields to understand what was removed
    const keyFields = ["id", "description", "content", "type", "order"];
    keyFields.forEach((field) => {
      if (removed.section[field] !== undefined) {
        const value = JSON.stringify(removed.section[field]);
        console.log(
          `     ${field}: ${
            value.length > 60 ? value.substring(0, 60) + "..." : value
          }`
        );
      }
    });
    console.log("");
  });

  // Analyze sections that were completely added
  const addedTitles = [];
  afterSections.forEach((section, index) => {
    const foundInBefore = beforeSections.some(
      (beforeSection) =>
        section.title &&
        beforeSection.title &&
        section.title === beforeSection.title
    );
    if (!foundInBefore) {
      addedTitles.push({
        title: section.title || `Section ${index}`,
        index,
        section,
      });
    }
  });

  console.log(`🆕 **COMPLETELY NEW SECTIONS (${addedTitles.length})**:`);
  addedTitles.forEach((added) => {
    console.log(`   • [${added.index}] ${added.title}`);
    // Show a few key fields to understand what was added
    const keyFields = ["id", "description", "content", "type", "order"];
    keyFields.forEach((field) => {
      if (added.section[field] !== undefined) {
        const value = JSON.stringify(added.section[field]);
        console.log(
          `     ${field}: ${
            value.length > 60 ? value.substring(0, 60) + "..." : value
          }`
        );
      }
    });
    console.log("");
  });
}

async function analyzeUltraDetailed(notebookId) {
  console.log(`🔬 ULTRA-DETAILED FIELD ANALYSIS: Fagner's July 2th change\n`);
  console.log("=".repeat(100));

  const auditLogs = loadAuditLogs(notebookId);

  if (auditLogs.length === 0) {
    console.log("❌ No audit logs found");
    return;
  }

  // Fagner's change timestamp: 2025-07-02T20:28:24.000Z
  const fagnerChange = findSpecificChange(
    auditLogs,
    "2025-07-02T20:28:24.000Z"
  );

  if (!fagnerChange) {
    console.log("❌ Could not find Fagner's July 2th change");
    return;
  }

  console.log(`📅 ${fagnerChange.timestamp}`);
  console.log(`👤 ${fagnerChange.performedByName}`);
  console.log(
    `📊 Length Change: ${fagnerChange.beforeLength} → ${fagnerChange.afterLength} (${fagnerChange.lengthChange})`
  );
  console.log("=".repeat(100));
  console.log("");

  analyzeDetailedFieldChanges(
    fagnerChange.beforeSections,
    fagnerChange.afterSections
  );

  console.log("=".repeat(100));
  console.log("✅ ULTRA-DETAILED ANALYSIS COMPLETE!");
  console.log(
    "This analysis shows every single field difference for sections with matching titles."
  );
  console.log("=".repeat(100));
}

// Main execution
const notebookId = process.argv[2];

if (!notebookId) {
  console.log("❌ Please provide a notebook ID");
  console.log("Usage: node ultra_detailed_analysis.js <notebookId>");
  process.exit(1);
}

analyzeUltraDetailed(notebookId);
