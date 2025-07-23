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

  // Handle different file structures
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

function findSectionChanges(logs) {
  const sectionChanges = [];

  for (const logEntry of logs) {
    const beforeLength = getSectionsLength(logEntry.beforeData);
    const afterLength = getSectionsLength(logEntry.afterData);

    // Only track changes that affect sections length
    if (beforeLength !== afterLength) {
      const change = afterLength - beforeLength;
      sectionChanges.push({
        timestamp: new Date(logEntry.performedAt * 1000).toISOString(),
        performedByName: logEntry.performedByName || "Unknown",
        beforeLength,
        afterLength,
        lengthChange: change,
        beforeSections: logEntry.beforeData?.sections || [],
        afterSections: logEntry.afterData?.sections || [],
        shortDescription: logEntry.shortDescription || "No description",
        auditLog: logEntry,
      });
    }
  }

  // Sort by timestamp
  return sectionChanges.sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );
}

function compareSections(beforeSections, afterSections) {
  const comparison = {
    preserved: [],
    removed: [],
    added: [],
    totallyReplaced: false,
  };

  // Create maps for easier comparison using multiple identifiers
  const beforeMap = new Map();
  const afterMap = new Map();

  beforeSections.forEach((section, index) => {
    // Try multiple keys for matching: id, title, or combination
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

  // Find preserved sections (with priority for stronger matches)
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

function formatComparisonReport(change, comparison) {
  console.log("\n" + "=".repeat(100));
  console.log(`📅 ${change.timestamp}`);
  console.log(`👤 ${change.performedByName}`);
  console.log(
    `📊 Length Change: ${change.beforeLength} → ${change.afterLength} (${
      change.lengthChange > 0 ? "+" : ""
    }${change.lengthChange})`
  );
  console.log(
    `📝 ${change.shortDescription.substring(0, 120)}${
      change.shortDescription.length > 120 ? "..." : ""
    }`
  );
  console.log("=".repeat(100));

  if (comparison.totallyReplaced) {
    console.log(
      "🔄 **TOTAL REPLACEMENT**: All sections were completely replaced"
    );
  } else {
    console.log(`✅ Preserved: ${comparison.preserved.length} sections`);
    console.log(`❌ Removed: ${comparison.removed.length} sections`);
    console.log(`➕ Added: ${comparison.added.length} sections`);
  }

  // Show details for smaller changes
  const maxDisplay = 15;

  if (
    comparison.preserved.length > 0 &&
    comparison.preserved.length <= maxDisplay
  ) {
    console.log("\n📋 **PRESERVED SECTIONS:**");
    comparison.preserved.forEach((section) => {
      const title =
        section.title.length > 60
          ? section.title.substring(0, 60) + "..."
          : section.title;
      console.log(
        `  • [${section.beforeIndex}→${section.afterIndex}] ${title}`
      );
    });
  }

  if (
    comparison.removed.length > 0 &&
    comparison.removed.length <= maxDisplay
  ) {
    console.log("\n🗑️  **REMOVED SECTIONS:**");
    comparison.removed.forEach((section) => {
      const title =
        section.title.length > 60
          ? section.title.substring(0, 60) + "..."
          : section.title;
      console.log(`  • [${section.index}] ${title}`);
    });
  }

  if (comparison.added.length > 0 && comparison.added.length <= maxDisplay) {
    console.log("\n🆕 **ADDED SECTIONS:**");
    comparison.added.forEach((section) => {
      const title =
        section.title.length > 60
          ? section.title.substring(0, 60) + "..."
          : section.title;
      console.log(`  • [${section.index}] ${title}`);
    });
  }

  if (
    comparison.preserved.length > maxDisplay ||
    comparison.removed.length > maxDisplay ||
    comparison.added.length > maxDisplay
  ) {
    console.log(
      "\n💡 (Some lists truncated for readability - too many items to display)"
    );
  }
}

async function analyzeMajorSectionChanges(notebookId, minChange = 5) {
  console.log(`🔍 Analyzing major section changes for Notebook: ${notebookId}`);
  console.log(`🎯 Showing changes of ±${minChange} or more sections\n`);

  const auditLogs = loadAuditLogs(notebookId);

  if (auditLogs.length === 0) {
    console.log("❌ No audit logs found");
    return;
  }

  console.log(`📊 Total audit logs: ${auditLogs.length}`);

  const sectionChanges = findSectionChanges(auditLogs);
  console.log(`📊 Total section length changes: ${sectionChanges.length}`);

  const majorChanges = sectionChanges.filter(
    (change) => Math.abs(change.lengthChange) >= minChange
  );
  console.log(
    `🎯 Major section changes (±${minChange} or more): ${majorChanges.length}`
  );

  if (majorChanges.length === 0) {
    console.log("No major section changes found.");

    // Show the largest changes we do have
    const sortedChanges = sectionChanges.sort(
      (a, b) => Math.abs(b.lengthChange) - Math.abs(a.lengthChange)
    );
    if (sortedChanges.length > 0) {
      console.log(`\n📈 Largest section changes found:`);
      sortedChanges.slice(0, 5).forEach((change, i) => {
        console.log(
          `  ${i + 1}. ${change.timestamp}: ${
            change.lengthChange > 0 ? "+" : ""
          }${change.lengthChange} sections (${change.performedByName})`
        );
      });
    }
    return;
  }

  for (const change of majorChanges) {
    const comparison = compareSections(
      change.beforeSections,
      change.afterSections
    );
    formatComparisonReport(change, comparison);
  }

  console.log("\n" + "=".repeat(100));
  console.log("✅ Analysis complete!");
}

// Main execution
const notebookId = process.argv[2];
const minChange = parseInt(process.argv[3]) || 5;

if (!notebookId) {
  console.log("❌ Please provide a notebook ID");
  console.log("Usage: node sections_deep_analysis.js <notebookId> [minChange]");
  console.log(
    "Example: node sections_deep_analysis.js vv3EMActxg1pRD09Kfle 10"
  );
  process.exit(1);
}

analyzeMajorSectionChanges(notebookId, minChange);
