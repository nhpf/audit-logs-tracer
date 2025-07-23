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

function compareSections(beforeSections, afterSections) {
  const comparison = {
    preserved: [],
    removed: [],
    added: [],
    totallyReplaced: false,
  };

  // Create maps for easier comparison
  const beforeMap = new Map();
  const afterMap = new Map();

  beforeSections.forEach((section, index) => {
    const keys = [];
    if (section.id) keys.push(`id:${section.id}`);
    if (section.title) keys.push(`title:${section.title}`);
    if (section.id && section.title)
      keys.push(`both:${section.id}:${section.title}`);
    if (keys.length === 0) keys.push(`index:${index}`);

    keys.forEach((key) => {
      beforeMap.set(key, { ...section, originalIndex: index, keys });
    });
  });

  afterSections.forEach((section, index) => {
    const keys = [];
    if (section.id) keys.push(`id:${section.id}`);
    if (section.title) keys.push(`title:${section.title}`);
    if (section.id && section.title)
      keys.push(`both:${section.id}:${section.title}`);
    if (keys.length === 0) keys.push(`index:${index}`);

    keys.forEach((key) => {
      afterMap.set(key, { ...section, originalIndex: index, keys });
    });
  });

  // Find preserved sections
  const matched = new Set();
  const preservedSections = [];

  for (const [key, beforeSection] of beforeMap) {
    if (afterMap.has(key) && !matched.has(beforeSection.originalIndex)) {
      const afterSection = afterMap.get(key);
      if (!matched.has(afterSection.originalIndex)) {
        preservedSections.push({
          key,
          beforeIndex: beforeSection.originalIndex,
          afterIndex: afterSection.originalIndex,
          title:
            beforeSection.title ||
            beforeSection.id ||
            `Section ${beforeSection.originalIndex}`,
          id: beforeSection.id,
        });
        matched.add(beforeSection.originalIndex);
        matched.add(afterSection.originalIndex);
      }
    }
  }

  comparison.preserved = preservedSections;

  // Find removed sections
  beforeSections.forEach((section, index) => {
    if (!matched.has(index)) {
      comparison.removed.push({
        index,
        title: section.title || section.id || `Section ${index}`,
        id: section.id,
        fullSection: section,
      });
    }
  });

  // Find added sections
  afterSections.forEach((section, index) => {
    if (!matched.has(index)) {
      comparison.added.push({
        index,
        title: section.title || section.id || `Section ${index}`,
        id: section.id,
        fullSection: section,
      });
    }
  });

  // Check if it's a total replacement
  comparison.totallyReplaced =
    comparison.preserved.length === 0 &&
    beforeSections.length > 0 &&
    afterSections.length > 0;

  return comparison;
}

async function analyzeFagnerChange(notebookId) {
  console.log(
    `🔍 Analyzing Fagner's July 2th section change for Notebook: ${notebookId}\n`
  );

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

  console.log("=".repeat(100));
  console.log(`📅 ${fagnerChange.timestamp}`);
  console.log(`👤 ${fagnerChange.performedByName}`);
  console.log(
    `📊 Length Change: ${fagnerChange.beforeLength} → ${fagnerChange.afterLength} (${fagnerChange.lengthChange})`
  );
  console.log(`📝 ${fagnerChange.shortDescription}`);
  console.log("=".repeat(100));

  const comparison = compareSections(
    fagnerChange.beforeSections,
    fagnerChange.afterSections
  );

  console.log(`✅ Preserved: ${comparison.preserved.length} sections`);
  console.log(`❌ Removed: ${comparison.removed.length} sections`);
  console.log(`➕ Added: ${comparison.added.length} sections`);

  console.log("\n📋 **ALL PRESERVED SECTIONS:**");
  comparison.preserved.forEach((section) => {
    console.log(
      `  • [${section.beforeIndex}→${section.afterIndex}] ${section.title}`
    );
  });

  console.log("\n🗑️  **ALL REMOVED SECTIONS:**");
  comparison.removed.forEach((section) => {
    console.log(`  • [${section.index}] ${section.title}`);
  });

  console.log("\n🆕 **ALL ADDED SECTIONS:**");
  comparison.added.forEach((section) => {
    console.log(`  • [${section.index}] ${section.title}`);
  });

  console.log("\n" + "=".repeat(100));
  console.log("✅ Detailed analysis complete!");
}

// Main execution
const notebookId = process.argv[2];

if (!notebookId) {
  console.log("❌ Please provide a notebook ID");
  console.log("Usage: node fagner_detailed_analysis.js <notebookId>");
  process.exit(1);
}

analyzeFagnerChange(notebookId);
