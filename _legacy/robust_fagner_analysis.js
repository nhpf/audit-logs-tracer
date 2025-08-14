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

// Enhanced section comparison that checks multiple fields
function calculateSectionSimilarity(section1, section2) {
  if (!section1 || !section2) return 0;

  let matches = 0;
  let totalComparisons = 0;

  // Define all possible fields to compare with different weights
  const fieldComparisons = [
    { field: "id", weight: 3, type: "exact" }, // ID match is very strong
    { field: "title", weight: 2, type: "exact" }, // Title match is strong
    { field: "name", weight: 2, type: "exact" }, // Name match is strong
    { field: "description", weight: 1.5, type: "text" }, // Description similarity
    { field: "content", weight: 1.5, type: "text" }, // Content similarity
    { field: "text", weight: 1.5, type: "text" }, // Text similarity
    { field: "type", weight: 1, type: "exact" }, // Type match
    { field: "categoryId", weight: 1, type: "exact" }, // Category match
    { field: "order", weight: 0.5, type: "exact" }, // Order match (less important)
    { field: "createdAt", weight: 0.5, type: "exact" }, // Creation time match
    { field: "duration", weight: 0.5, type: "exact" }, // Duration match
    { field: "videoUrl", weight: 1, type: "exact" }, // Video URL match
    { field: "imageUrl", weight: 1, type: "exact" }, // Image URL match
  ];

  for (const comparison of fieldComparisons) {
    const val1 = section1[comparison.field];
    const val2 = section2[comparison.field];

    // Skip if both values are undefined/null
    if (
      (val1 === undefined || val1 === null) &&
      (val2 === undefined || val2 === null)
    ) {
      continue;
    }

    totalComparisons += comparison.weight;

    if (comparison.type === "exact") {
      if (val1 === val2) {
        matches += comparison.weight;
      }
    } else if (comparison.type === "text") {
      const similarity = getTextSimilarity(val1, val2);
      matches += similarity * comparison.weight;
    }
  }

  // If we have no comparisons, fall back to full object comparison
  if (totalComparisons === 0) {
    return JSON.stringify(section1) === JSON.stringify(section2) ? 1 : 0;
  }

  return totalComparisons > 0 ? matches / totalComparisons : 0;
}

function getTextSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  if (text1 === text2) return 1;

  // Convert to strings and normalize
  const str1 = String(text1).toLowerCase().trim();
  const str2 = String(text2).toLowerCase().trim();

  if (str1 === str2) return 1;

  // Calculate Levenshtein distance based similarity
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const distance = levenshteinDistance(longer, shorter);
  return Math.max(0, (longer.length - distance) / longer.length);
}

function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }

  return matrix[str2.length][str1.length];
}

// Enhanced section comparison with stricter matching
function compareSections(beforeSections, afterSections) {
  const comparison = {
    preserved: [],
    removed: [],
    added: [],
    totallyReplaced: false,
    highConfidenceMatches: 0,
    mediumConfidenceMatches: 0,
    lowConfidenceMatches: 0,
  };

  const beforeMatched = new Set();
  const afterMatched = new Set();

  // Phase 1: Find high confidence matches (similarity >= 0.8)
  for (let i = 0; i < beforeSections.length; i++) {
    if (beforeMatched.has(i)) continue;

    let bestMatch = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < afterSections.length; j++) {
      if (afterMatched.has(j)) continue;

      const similarity = calculateSectionSimilarity(
        beforeSections[i],
        afterSections[j]
      );
      if (similarity > bestSimilarity && similarity >= 0.8) {
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestMatch !== -1) {
      comparison.preserved.push({
        beforeIndex: i,
        afterIndex: bestMatch,
        similarity: bestSimilarity,
        confidence: "high",
        title:
          beforeSections[i].title || beforeSections[i].id || `Section ${i}`,
        id: beforeSections[i].id,
        beforeSection: beforeSections[i],
        afterSection: afterSections[bestMatch],
      });

      beforeMatched.add(i);
      afterMatched.add(bestMatch);
      comparison.highConfidenceMatches++;
    }
  }

  // Phase 2: Find medium confidence matches (similarity 0.5-0.8)
  for (let i = 0; i < beforeSections.length; i++) {
    if (beforeMatched.has(i)) continue;

    let bestMatch = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < afterSections.length; j++) {
      if (afterMatched.has(j)) continue;

      const similarity = calculateSectionSimilarity(
        beforeSections[i],
        afterSections[j]
      );
      if (
        similarity > bestSimilarity &&
        similarity >= 0.5 &&
        similarity < 0.8
      ) {
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestMatch !== -1) {
      comparison.preserved.push({
        beforeIndex: i,
        afterIndex: bestMatch,
        similarity: bestSimilarity,
        confidence: "medium",
        title:
          beforeSections[i].title || beforeSections[i].id || `Section ${i}`,
        id: beforeSections[i].id,
        beforeSection: beforeSections[i],
        afterSection: afterSections[bestMatch],
      });

      beforeMatched.add(i);
      afterMatched.add(bestMatch);
      comparison.mediumConfidenceMatches++;
    }
  }

  // Phase 3: Find low confidence matches (similarity 0.2-0.5) - only if title or ID matches
  for (let i = 0; i < beforeSections.length; i++) {
    if (beforeMatched.has(i)) continue;

    let bestMatch = -1;
    let bestSimilarity = 0;

    for (let j = 0; j < afterSections.length; j++) {
      if (afterMatched.has(j)) continue;

      const similarity = calculateSectionSimilarity(
        beforeSections[i],
        afterSections[j]
      );

      // Only consider low confidence if there's at least a title or ID match
      const hasKeyMatch =
        (beforeSections[i].id &&
          beforeSections[i].id === afterSections[j].id) ||
        (beforeSections[i].title &&
          beforeSections[i].title === afterSections[j].title);

      if (
        similarity > bestSimilarity &&
        similarity >= 0.2 &&
        similarity < 0.5 &&
        hasKeyMatch
      ) {
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestMatch !== -1) {
      comparison.preserved.push({
        beforeIndex: i,
        afterIndex: bestMatch,
        similarity: bestSimilarity,
        confidence: "low",
        title:
          beforeSections[i].title || beforeSections[i].id || `Section ${i}`,
        id: beforeSections[i].id,
        beforeSection: beforeSections[i],
        afterSection: afterSections[bestMatch],
      });

      beforeMatched.add(i);
      afterMatched.add(bestMatch);
      comparison.lowConfidenceMatches++;
    }
  }

  // Find removed sections
  for (let i = 0; i < beforeSections.length; i++) {
    if (!beforeMatched.has(i)) {
      comparison.removed.push({
        index: i,
        title:
          beforeSections[i].title || beforeSections[i].id || `Section ${i}`,
        id: beforeSections[i].id,
        fullSection: beforeSections[i],
      });
    }
  }

  // Find added sections
  for (let j = 0; j < afterSections.length; j++) {
    if (!afterMatched.has(j)) {
      comparison.added.push({
        index: j,
        title: afterSections[j].title || afterSections[j].id || `Section ${j}`,
        id: afterSections[j].id,
        fullSection: afterSections[j],
      });
    }
  }

  // Check if it's a total replacement (no high confidence matches and both arrays non-empty)
  comparison.totallyReplaced =
    comparison.highConfidenceMatches === 0 &&
    beforeSections.length > 0 &&
    afterSections.length > 0;

  return comparison;
}

async function analyzeFagnerChangeRobust(notebookId) {
  console.log(
    `🔍 ROBUST ANALYSIS: Fagner's July 2th section change for Notebook: ${notebookId}\n`
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

  console.log(`✅ Total Preserved: ${comparison.preserved.length} sections`);
  console.log(
    `   🟢 High confidence (≥80% similar): ${comparison.highConfidenceMatches}`
  );
  console.log(
    `   🟡 Medium confidence (50-80% similar): ${comparison.mediumConfidenceMatches}`
  );
  console.log(
    `   🟠 Low confidence (20-50% similar, key field match): ${comparison.lowConfidenceMatches}`
  );
  console.log(`❌ Removed: ${comparison.removed.length} sections`);
  console.log(`➕ Added: ${comparison.added.length} sections`);

  if (comparison.totallyReplaced) {
    console.log(
      `\n🔄 **TOTAL REPLACEMENT DETECTED**: No high-confidence matches found!`
    );
  } else {
    console.log(
      `\n✅ **SELECTIVE MODIFICATION**: ${comparison.highConfidenceMatches} sections clearly preserved`
    );
  }

  console.log("\n📋 **HIGH CONFIDENCE PRESERVED SECTIONS (≥80% similarity):**");
  comparison.preserved
    .filter((s) => s.confidence === "high")
    .forEach((section) => {
      console.log(
        `  • [${section.beforeIndex}→${section.afterIndex}] ${
          section.title
        } (${(section.similarity * 100).toFixed(1)}% match)`
      );
    });

  if (comparison.mediumConfidenceMatches > 0) {
    console.log(
      "\n📋 **MEDIUM CONFIDENCE PRESERVED SECTIONS (50-80% similarity):**"
    );
    comparison.preserved
      .filter((s) => s.confidence === "medium")
      .forEach((section) => {
        console.log(
          `  • [${section.beforeIndex}→${section.afterIndex}] ${
            section.title
          } (${(section.similarity * 100).toFixed(1)}% match)`
        );
      });
  }

  if (comparison.lowConfidenceMatches > 0) {
    console.log(
      "\n📋 **LOW CONFIDENCE PRESERVED SECTIONS (20-50% similarity, key field match):**"
    );
    comparison.preserved
      .filter((s) => s.confidence === "low")
      .forEach((section) => {
        console.log(
          `  • [${section.beforeIndex}→${section.afterIndex}] ${
            section.title
          } (${(section.similarity * 100).toFixed(1)}% match)`
        );
      });
  }

  console.log("\n🗑️  **ALL REMOVED SECTIONS:**");
  comparison.removed.forEach((section) => {
    console.log(`  • [${section.index}] ${section.title}`);
  });

  console.log("\n🆕 **ALL ADDED SECTIONS:**");
  comparison.added.forEach((section) => {
    console.log(`  • [${section.index}] ${section.title}`);
  });

  // Detailed field analysis for a few high-confidence matches
  const highConfidenceMatches = comparison.preserved.filter(
    (s) => s.confidence === "high"
  );
  if (highConfidenceMatches.length > 0) {
    console.log(
      "\n🔬 **DETAILED FIELD ANALYSIS (First 3 high-confidence matches):**"
    );
    highConfidenceMatches.slice(0, 3).forEach((match, idx) => {
      console.log(
        `\n   ${idx + 1}. [${match.beforeIndex}→${match.afterIndex}] ${
          match.title
        }:`
      );

      const before = match.beforeSection;
      const after = match.afterSection;

      // Check specific fields
      const fieldsToCheck = [
        "id",
        "title",
        "description",
        "content",
        "type",
        "order",
      ];
      fieldsToCheck.forEach((field) => {
        if (before[field] !== undefined || after[field] !== undefined) {
          const beforeVal = before[field];
          const afterVal = after[field];
          if (beforeVal === afterVal) {
            console.log(`      ✅ ${field}: identical`);
          } else {
            const similarity = getTextSimilarity(beforeVal, afterVal);
            console.log(
              `      🔄 ${field}: ${(similarity * 100).toFixed(1)}% similar`
            );
            if (similarity < 0.8) {
              console.log(
                `         Before: ${String(beforeVal).substring(0, 50)}${
                  String(beforeVal).length > 50 ? "..." : ""
                }`
              );
              console.log(
                `         After:  ${String(afterVal).substring(0, 50)}${
                  String(afterVal).length > 50 ? "..." : ""
                }`
              );
            }
          }
        }
      });
    });
  }

  console.log("\n" + "=".repeat(100));
  console.log("✅ ROBUST DETAILED ANALYSIS COMPLETE!");
  console.log(
    `📈 Confidence Level: ${
      comparison.highConfidenceMatches > 0
        ? "HIGH"
        : comparison.mediumConfidenceMatches > 0
        ? "MEDIUM"
        : "LOW"
    }`
  );
  console.log(
    `🎯 Assessment: ${
      comparison.totallyReplaced
        ? "TOTAL REPLACEMENT"
        : "SELECTIVE MODIFICATION"
    }`
  );
}

// Main execution
const notebookId = process.argv[2];

if (!notebookId) {
  console.log("❌ Please provide a notebook ID");
  console.log("Usage: node robust_fagner_analysis.js <notebookId>");
  process.exit(1);
}

analyzeFagnerChangeRobust(notebookId);
