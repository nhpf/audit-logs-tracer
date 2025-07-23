/*
 * extract_notebook_versions.js – Extract specific versions of the notebook for comparison
 *
 * This script will create:
 * 1. most_recent_version.json - The notebook state before our restoration (from backup)
 * 2. pre_fagner_version.json - The original notebook state before Fagner's July 2th change
 */

import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function loadBackupFile() {
  // Find the most recent backup file
  const files = fs.readdirSync(__dirname);
  const backupFiles = files.filter((file) =>
    file.startsWith("backup_vv3EMActxg1pRD09Kfle_")
  );

  if (backupFiles.length === 0) {
    throw new Error("No backup file found");
  }

  // Sort by filename (which includes timestamp) to get the most recent
  backupFiles.sort();
  const latestBackup = backupFiles[backupFiles.length - 1];

  console.log(chalk.green(`✅ Found backup: ${latestBackup}`));

  const backupPath = path.join(__dirname, latestBackup);
  const backupData = JSON.parse(fs.readFileSync(backupPath, "utf8"));

  return backupData.currentData;
}

function findFagnerChange(logs) {
  const targetTime = new Date("2025-07-02T20:28:24.000Z").getTime();

  for (const logEntry of logs) {
    const logTime = new Date(logEntry.performedAt * 1000).getTime();
    if (Math.abs(logTime - targetTime) <= 5000) {
      if (
        logEntry.performedByName &&
        logEntry.performedByName.toLowerCase().includes("fagner")
      ) {
        return logEntry;
      }
    }
  }

  return null;
}

function createVersionFiles() {
  console.log(chalk.blue.bold("📁 EXTRACTING NOTEBOOK VERSIONS\n"));

  // 1. Load the most recent version (from backup)
  console.log("📥 Loading most recent version from backup...");
  const mostRecentVersion = loadBackupFile();

  // 2. Load the pre-Fagner version (from audit logs)
  console.log("📥 Loading pre-Fagner version from audit logs...");
  const auditLogs = loadAuditLogs("vv3EMActxg1pRD09Kfle");
  const fagnerChange = findFagnerChange(auditLogs);

  if (!fagnerChange) {
    throw new Error("Could not find Fagner's change in audit logs");
  }

  const preFagnerVersion = fagnerChange.beforeData;

  // 3. Create the JSON files
  console.log("\n💾 Creating version files...");

  // Most recent version file
  const mostRecentPath = path.join(__dirname, "most_recent_version.json");
  const mostRecentData = {
    description:
      "Most recent version of vv3EMActxg1pRD09Kfle before restoration",
    extractedAt: new Date().toISOString(),
    source: "Pre-restoration backup",
    sectionsCount: mostRecentVersion?.sections?.length || 0,
    notebook: mostRecentVersion,
  };

  fs.writeFileSync(mostRecentPath, JSON.stringify(mostRecentData, null, 2));
  console.log(
    chalk.green(
      `✅ Created: most_recent_version.json (${mostRecentData.sectionsCount} sections)`
    )
  );

  // Pre-Fagner version file
  const preFagnerPath = path.join(__dirname, "pre_fagner_version.json");
  const preFagnerData = {
    description:
      "Original version of vv3EMActxg1pRD09Kfle before Fagner's July 2th change",
    extractedAt: new Date().toISOString(),
    source: "Audit log beforeData from Fagner's change",
    fagnerChangeTimestamp: "2025-07-02T20:28:24.000Z",
    sectionsCount: preFagnerVersion?.sections?.length || 0,
    notebook: preFagnerVersion,
  };

  fs.writeFileSync(preFagnerPath, JSON.stringify(preFagnerData, null, 2));
  console.log(
    chalk.green(
      `✅ Created: pre_fagner_version.json (${preFagnerData.sectionsCount} sections)`
    )
  );

  // Summary
  console.log(chalk.blue.bold("\n📊 SUMMARY:"));
  console.log(
    `📁 most_recent_version.json: ${mostRecentData.sectionsCount} sections`
  );
  console.log(
    `📁 pre_fagner_version.json: ${preFagnerData.sectionsCount} sections`
  );
  console.log(
    `📈 Difference: ${
      preFagnerData.sectionsCount - mostRecentData.sectionsCount
    } sections`
  );

  console.log(
    chalk.yellow(
      "\n💡 You can now create your third version manually and I'll help you upload it!"
    )
  );
}

// Main execution
try {
  createVersionFiles();
} catch (error) {
  console.error(chalk.red(`💥 Error: ${error.message}`));
  process.exit(1);
}
