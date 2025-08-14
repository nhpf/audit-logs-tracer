/*
 * compare_with_backup.js – Compare a Firestore document with a backup file
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node compare_with_backup.js <docId> <backupFilePath>
 *
 * Example:
 *   node compare_with_backup.js vv3EMActxg1pRD09Kfle /externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json
 *
 * ------------------------------------------------------------
 * This script will:
 *   • Fetch the current document from Firestore
 *   • Load the backup from the specified JSON file
 *   • Compare the two versions and show detailed differences
 *   • Focus on sections array changes and other key fields
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import chalk from "chalk";
import fs from "fs";
import path from "path";

import admin from "firebase-admin";
import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// ---------- Parse CLI args ----------
const args = process.argv.slice(2);
const [docId, backupFilePath] = args;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle";
const defaultBackupPath =
  "/externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json";
const targetBackupPath = backupFilePath || defaultBackupPath;

if (!targetDocId || !targetBackupPath) {
  console.error(
    "\nUsage: node compare_with_backup.js <docId> <backupFilePath>"
  );
  console.error("  docId: The document ID to compare");
  console.error("  backupFilePath: Path to the backup JSON file");
  console.error(
    "\nExample: node compare_with_backup.js vv3EMActxg1pRD09Kfle /externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json"
  );
  process.exit(1);
}

// ---------- Helper functions ----------
function deepEqual(obj1, obj2) {
  return JSON.stringify(obj1) === JSON.stringify(obj2);
}

function getFieldDifferences(current, backup, fieldName) {
  const currentValue = current[fieldName];
  const backupValue = backup[fieldName];

  if (deepEqual(currentValue, backupValue)) {
    return null; // No difference
  }

  return {
    field: fieldName,
    current: currentValue,
    backup: backupValue,
    currentType: Array.isArray(currentValue) ? "array" : typeof currentValue,
    backupType: Array.isArray(backupValue) ? "array" : typeof backupValue,
  };
}

function calculateSectionSimilarity(section1, section2) {
  if (!section1 || !section2) return 0;

  let score = 0;
  let totalChecks = 0;

  // Compare key identifying fields
  const fieldsToCompare = [
    "title",
    "name",
    "id",
    "content",
    "text",
    "description",
    "type",
  ];

  for (const field of fieldsToCompare) {
    if (section1[field] !== undefined || section2[field] !== undefined) {
      totalChecks++;
      if (section1[field] === section2[field]) {
        score++;
      } else if (
        typeof section1[field] === "string" &&
        typeof section2[field] === "string"
      ) {
        // Calculate string similarity for text fields
        const similarity = getStringSimilarity(
          section1[field],
          section2[field]
        );
        score += similarity;
      }
    }
  }

  // If no fields to compare, compare the entire objects
  if (totalChecks === 0) {
    return deepEqual(section1, section2) ? 1 : 0;
  }

  return totalChecks > 0 ? score / totalChecks : 0;
}

function getStringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  // Simple Levenshtein distance based similarity
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function findBestMatches(currentSections, backupSections) {
  const matches = [];
  const usedBackupIndices = new Set();
  const usedCurrentIndices = new Set();

  // Find exact matches first
  for (let i = 0; i < currentSections.length; i++) {
    for (let j = 0; j < backupSections.length; j++) {
      if (usedBackupIndices.has(j) || usedCurrentIndices.has(i)) continue;

      if (deepEqual(currentSections[i], backupSections[j])) {
        matches.push({
          currentIndex: i,
          backupIndex: j,
          similarity: 1,
          type: "exact",
        });
        usedCurrentIndices.add(i);
        usedBackupIndices.add(j);
        break;
      }
    }
  }

  // Find similar matches for remaining sections
  for (let i = 0; i < currentSections.length; i++) {
    if (usedCurrentIndices.has(i)) continue;

    let bestMatch = null;
    let bestSimilarity = 0;

    for (let j = 0; j < backupSections.length; j++) {
      if (usedBackupIndices.has(j)) continue;

      const similarity = calculateSectionSimilarity(
        currentSections[i],
        backupSections[j]
      );
      if (similarity > bestSimilarity && similarity > 0.3) {
        // Threshold for considering a match
        bestSimilarity = similarity;
        bestMatch = j;
      }
    }

    if (bestMatch !== null) {
      matches.push({
        currentIndex: i,
        backupIndex: bestMatch,
        similarity: bestSimilarity,
        type: bestSimilarity > 0.8 ? "similar" : "partial",
      });
      usedCurrentIndices.add(i);
      usedBackupIndices.add(bestMatch);
    }
  }

  return {
    matches,
    unmatchedCurrent: currentSections
      .map((_, i) => i)
      .filter((i) => !usedCurrentIndices.has(i)),
    unmatchedBackup: backupSections
      .map((_, i) => i)
      .filter((i) => !usedBackupIndices.has(i)),
  };
}

function analyzeSectionsChanges(currentSections, backupSections) {
  const currentLength = Array.isArray(currentSections)
    ? currentSections.length
    : 0;
  const backupLength = Array.isArray(backupSections)
    ? backupSections.length
    : 0;

  const analysis = {
    lengthChange: currentLength - backupLength,
    currentLength,
    backupLength,
    addedSections: [],
    removedSections: [],
    modifiedSections: [],
    exactMatches: [],
    similarMatches: [],
    partialMatches: [],
    newSections: [],
    matchingAnalysis: null,
  };

  if (!Array.isArray(currentSections) || !Array.isArray(backupSections)) {
    return analysis;
  }

  // Perform deep matching analysis
  const matchingResult = findBestMatches(currentSections, backupSections);
  analysis.matchingAnalysis = matchingResult;

  // Categorize matches
  matchingResult.matches.forEach((match) => {
    const matchData = {
      currentIndex: match.currentIndex,
      backupIndex: match.backupIndex,
      similarity: match.similarity,
      currentSection: currentSections[match.currentIndex],
      backupSection: backupSections[match.backupIndex],
    };

    switch (match.type) {
      case "exact":
        analysis.exactMatches.push(matchData);
        break;
      case "similar":
        analysis.similarMatches.push(matchData);
        break;
      case "partial":
        analysis.partialMatches.push(matchData);
        break;
    }
  });

  // Identify truly new sections
  matchingResult.unmatchedCurrent.forEach((index) => {
    analysis.newSections.push({
      index,
      section: currentSections[index],
    });
  });

  // Identify removed sections
  matchingResult.unmatchedBackup.forEach((index) => {
    analysis.removedSections.push({
      index,
      section: backupSections[index],
    });
  });

  // For backward compatibility, populate modifiedSections with similar+partial matches
  analysis.modifiedSections = [
    ...analysis.similarMatches,
    ...analysis.partialMatches,
  ];

  return analysis;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Unknown";

  // Handle Firestore Timestamp objects
  if (timestamp && typeof timestamp === "object" && timestamp._seconds) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }

  // Handle regular Date objects or strings
  try {
    return new Date(timestamp).toISOString();
  } catch {
    return String(timestamp);
  }
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold(`\n🔍 Comparing document with backup`));
    console.log(chalk.gray(`Document ID: ${targetDocId}`));
    console.log(chalk.gray(`Backup file: ${targetBackupPath}`));

    // Step 1: Load backup data
    console.log(chalk.blue("\n📁 Loading backup data..."));

    if (!fs.existsSync(targetBackupPath)) {
      console.error(chalk.red(`❌ Backup file not found: ${targetBackupPath}`));
      process.exit(1);
    }

    const backupContent = fs.readFileSync(targetBackupPath, "utf8");
    const backupData = JSON.parse(backupContent);

    // Navigate to the specific notebook in the backup
    const backupPath = `.Notebooks.${targetDocId}`;
    const pathParts = backupPath.split(".").filter((part) => part);

    let backupDoc = backupData;
    for (const part of pathParts) {
      if (backupDoc && typeof backupDoc === "object" && part in backupDoc) {
        backupDoc = backupDoc[part];
      } else {
        console.error(
          chalk.red(
            `❌ Document ${targetDocId} not found in backup at path: ${backupPath}`
          )
        );
        console.log(
          chalk.gray("Available keys at root level:"),
          Object.keys(backupData).slice(0, 10)
        );
        process.exit(1);
      }
    }

    console.log(
      chalk.green(`✅ Backup document loaded from path: ${backupPath}`)
    );

    // Step 2: Fetch current document
    console.log(chalk.blue("\n📄 Fetching current document from Firestore..."));

    const docRef = db.collection("Notebooks").doc(targetDocId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.error(
        chalk.red(`❌ Current document ${targetDocId} not found in Firestore`)
      );
      process.exit(1);
    }

    const currentDoc = docSnap.data();
    console.log(chalk.green(`✅ Current document loaded from Firestore`));

    // Step 3: Compare basic info
    console.log(chalk.blue.bold("\n📊 Basic Information Comparison"));
    console.log(`Document ID: ${chalk.cyan(targetDocId)}`);
    console.log(
      `Current last modified: ${chalk.cyan(
        formatTimestamp(currentDoc.updatedAt || currentDoc.lastModified)
      )}`
    );
    console.log(
      `Backup timestamp: ${chalk.cyan(
        formatTimestamp(backupDoc.updatedAt || backupDoc.lastModified)
      )}`
    );

    // Step 4: Deep Sections Analysis
    console.log(chalk.blue.bold("\n📚 Deep Sections Analysis"));

    const sectionsAnalysis = analyzeSectionsChanges(
      currentDoc.sections,
      backupDoc.sections
    );

    console.log(
      `Current sections count: ${chalk.cyan(sectionsAnalysis.currentLength)}`
    );
    console.log(
      `Backup sections count: ${chalk.cyan(sectionsAnalysis.backupLength)}`
    );

    if (sectionsAnalysis.lengthChange !== 0) {
      const changeText =
        sectionsAnalysis.lengthChange > 0
          ? chalk.green(`+${sectionsAnalysis.lengthChange} sections difference`)
          : chalk.red(`${sectionsAnalysis.lengthChange} sections difference`);
      console.log(`Net change: ${changeText}`);
    } else {
      console.log(`Net change: ${chalk.gray("No length change")}`);
    }

    // Show matching statistics
    console.log(chalk.blue.bold("\n🔍 Section Matching Analysis"));
    console.log(
      `Exact matches: ${chalk.green(
        sectionsAnalysis.exactMatches.length
      )} sections`
    );
    console.log(
      `Similar matches: ${chalk.yellow(
        sectionsAnalysis.similarMatches.length
      )} sections (80%+ similarity)`
    );
    console.log(
      `Partial matches: ${chalk.orange(
        sectionsAnalysis.partialMatches.length
      )} sections (30-80% similarity)`
    );
    console.log(
      `Completely new: ${chalk.blue(
        sectionsAnalysis.newSections.length
      )} sections`
    );
    console.log(
      `Completely removed: ${chalk.red(
        sectionsAnalysis.removedSections.length
      )} sections`
    );

    // Show exact matches
    if (sectionsAnalysis.exactMatches.length > 0) {
      console.log(
        chalk.green.bold(
          `\n✅ Exact Matches (${sectionsAnalysis.exactMatches.length}):`
        )
      );
      sectionsAnalysis.exactMatches.slice(0, 5).forEach((match) => {
        const title =
          match.currentSection.title ||
          match.currentSection.name ||
          `Section ${match.currentIndex + 1}`;
        console.log(
          `  ${chalk.green(`[${match.currentIndex + 1}]`)} ↔ ${chalk.gray(
            `[${match.backupIndex + 1}]`
          )} ${title.substring(0, 50)}${title.length > 50 ? "..." : ""}`
        );
      });
      if (sectionsAnalysis.exactMatches.length > 5) {
        console.log(
          `  ${chalk.gray(
            `... and ${
              sectionsAnalysis.exactMatches.length - 5
            } more exact matches`
          )}`
        );
      }
    }

    // Show similar matches
    if (sectionsAnalysis.similarMatches.length > 0) {
      console.log(
        chalk.yellow.bold(
          `\n🔄 Similar Matches (${sectionsAnalysis.similarMatches.length}):`
        )
      );
      sectionsAnalysis.similarMatches.slice(0, 5).forEach((match) => {
        const currentTitle =
          match.currentSection.title ||
          match.currentSection.name ||
          `Section ${match.currentIndex + 1}`;
        const backupTitle =
          match.backupSection.title ||
          match.backupSection.name ||
          `Section ${match.backupIndex + 1}`;
        const similarity = Math.round(match.similarity * 100);
        console.log(
          `  ${chalk.yellow(`[${match.currentIndex + 1}]`)} ↔ ${chalk.gray(
            `[${match.backupIndex + 1}]`
          )} ${similarity}% similar`
        );
        console.log(
          `    Current: ${currentTitle.substring(0, 45)}${
            currentTitle.length > 45 ? "..." : ""
          }`
        );
        if (currentTitle !== backupTitle) {
          console.log(
            `    Backup:  ${chalk.gray(backupTitle.substring(0, 45))}${
              backupTitle.length > 45 ? chalk.gray("...") : ""
            }`
          );
        }
      });
      if (sectionsAnalysis.similarMatches.length > 5) {
        console.log(
          `  ${chalk.gray(
            `... and ${
              sectionsAnalysis.similarMatches.length - 5
            } more similar matches`
          )}`
        );
      }
    }

    // Show partial matches
    if (sectionsAnalysis.partialMatches.length > 0) {
      console.log(
        chalk
          .hex("#FFA500")
          .bold(
            `\n� Partial Matches (${sectionsAnalysis.partialMatches.length}):`
          )
      );
      sectionsAnalysis.partialMatches.slice(0, 3).forEach((match) => {
        const currentTitle =
          match.currentSection.title ||
          match.currentSection.name ||
          `Section ${match.currentIndex + 1}`;
        const backupTitle =
          match.backupSection.title ||
          match.backupSection.name ||
          `Section ${match.backupIndex + 1}`;
        const similarity = Math.round(match.similarity * 100);
        console.log(
          `  ${chalk.hex("#FFA500")(
            `[${match.currentIndex + 1}]`
          )} ↔ ${chalk.gray(
            `[${match.backupIndex + 1}]`
          )} ${similarity}% similar`
        );
        console.log(
          `    Current: ${currentTitle.substring(0, 45)}${
            currentTitle.length > 45 ? "..." : ""
          }`
        );
        console.log(
          `    Backup:  ${chalk.gray(backupTitle.substring(0, 45))}${
            backupTitle.length > 45 ? chalk.gray("...") : ""
          }`
        );
      });
      if (sectionsAnalysis.partialMatches.length > 3) {
        console.log(
          `  ${chalk.gray(
            `... and ${
              sectionsAnalysis.partialMatches.length - 3
            } more partial matches`
          )}`
        );
      }
    }

    // Show completely new sections
    if (sectionsAnalysis.newSections.length > 0) {
      console.log(
        chalk.blue.bold(
          `\n🆕 Completely New Sections (${sectionsAnalysis.newSections.length}):`
        )
      );
      sectionsAnalysis.newSections
        .slice(0, 10)
        .forEach(({ index, section }) => {
          const title = section.title || section.name || `Section ${index + 1}`;
          console.log(
            `  ${chalk.blue(`[${index + 1}]`)} ${title.substring(0, 60)}${
              title.length > 60 ? "..." : ""
            }`
          );
        });
      if (sectionsAnalysis.newSections.length > 10) {
        console.log(
          `  ${chalk.gray(
            `... and ${
              sectionsAnalysis.newSections.length - 10
            } more new sections`
          )}`
        );
      }
    }

    // Show removed sections
    if (sectionsAnalysis.removedSections.length > 0) {
      console.log(
        chalk.red.bold(
          `\n🗑️  Completely Removed Sections (${sectionsAnalysis.removedSections.length}):`
        )
      );
      sectionsAnalysis.removedSections
        .slice(0, 10)
        .forEach(({ index, section }) => {
          const title = section.title || section.name || `Section ${index + 1}`;
          console.log(
            `  ${chalk.red(`[${index + 1}]`)} ${title.substring(0, 60)}${
              title.length > 60 ? "..." : ""
            }`
          );
        });
      if (sectionsAnalysis.removedSections.length > 10) {
        console.log(
          `  ${chalk.gray(
            `... and ${
              sectionsAnalysis.removedSections.length - 10
            } more removed sections`
          )}`
        );
      }
    }

    // Step 5: Compare other key fields
    console.log(chalk.blue.bold("\n🔍 Other Field Changes"));

    const fieldsToCheck = [
      "title",
      "description",
      "tags",
      "metadata",
      "settings",
      "permissions",
    ];
    let hasOtherChanges = false;

    for (const field of fieldsToCheck) {
      const diff = getFieldDifferences(currentDoc, backupDoc, field);
      if (diff) {
        hasOtherChanges = true;
        console.log(`${chalk.yellow(field)}:`);
        console.log(
          `  Current: ${chalk.cyan(
            JSON.stringify(diff.current).substring(0, 100)
          )}${JSON.stringify(diff.current).length > 100 ? "..." : ""}`
        );
        console.log(
          `  Backup:  ${chalk.gray(
            JSON.stringify(diff.backup).substring(0, 100)
          )}${JSON.stringify(diff.backup).length > 100 ? "..." : ""}`
        );
      }
    }

    if (!hasOtherChanges) {
      console.log(chalk.gray("No changes detected in other key fields"));
    }

    // Step 6: Enhanced Summary
    console.log(chalk.blue.bold("\n📋 Detailed Summary"));
    console.log(
      `• Exact matches: ${chalk.green(
        sectionsAnalysis.exactMatches.length
      )} sections (unchanged)`
    );
    console.log(
      `• Similar matches: ${chalk.yellow(
        sectionsAnalysis.similarMatches.length
      )} sections (80%+ similarity, likely modified)`
    );
    console.log(
      `• Partial matches: ${chalk.hex("#FFA500")(
        sectionsAnalysis.partialMatches.length
      )} sections (30-80% similarity, significantly changed)`
    );
    console.log(
      `• Completely new: ${chalk.blue(
        sectionsAnalysis.newSections.length
      )} sections`
    );
    console.log(
      `• Completely removed: ${chalk.red(
        sectionsAnalysis.removedSections.length
      )} sections`
    );
    console.log(
      `• Net section change: ${
        sectionsAnalysis.lengthChange > 0 ? chalk.green("+") : ""
      }${sectionsAnalysis.lengthChange}`
    );
    console.log(
      `• Other fields changed: ${
        hasOtherChanges ? chalk.yellow("Yes") : chalk.gray("No")
      }`
    );

    // Content preservation analysis
    const totalOriginalSections = sectionsAnalysis.backupLength;
    const preservedSections =
      sectionsAnalysis.exactMatches.length +
      sectionsAnalysis.similarMatches.length +
      sectionsAnalysis.partialMatches.length;
    const preservationRate =
      totalOriginalSections > 0
        ? ((preservedSections / totalOriginalSections) * 100).toFixed(1)
        : 0;

    console.log(chalk.blue.bold("\n📊 Content Preservation Analysis"));
    console.log(
      `• Total original sections: ${chalk.cyan(totalOriginalSections)}`
    );
    console.log(
      `• Sections with some preservation: ${chalk.cyan(preservedSections)}`
    );
    console.log(
      `• Content preservation rate: ${chalk.cyan(preservationRate + "%")}`
    );

    if (preservationRate < 50) {
      console.log(
        chalk.red(
          "⚠️  Low preservation rate - significant content loss detected"
        )
      );
    } else if (preservationRate < 80) {
      console.log(
        chalk.yellow(
          "⚠️  Moderate preservation rate - some content changes detected"
        )
      );
    } else {
      console.log(
        chalk.green("✅ High preservation rate - most content retained")
      );
    }
  } catch (error) {
    console.error(chalk.red("\n❌ Comparison failed:"), error.message);
    if (error.code) {
      console.error(chalk.red("Error code:"), error.code);
    }
    process.exit(1);
  }
})();
