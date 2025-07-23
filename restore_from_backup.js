/*
 * restore_from_backup.js – Restore a Firestore document from a JSON backup file
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node restore_from_backup.js <docId> <backupFilePath> [--confirm] [--create-backup]
 *
 * Example:
 *   node restore_from_backup.js vv3EMActxg1pRD09Kfle /externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json --confirm
 *
 * ------------------------------------------------------------
 * This script will:
 *   • Load the backup from the specified JSON file
 *   • Optionally create a backup of the current document before restoration
 *   • Restore the document to Firestore
 *   • Show detailed summary of the restoration
 *
 * WARNING: This is a destructive operation that will overwrite the current document!
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
const confirmFlag = args.includes("--confirm");
const createBackupFlag = args.includes("--create-backup");
const dryRun = !confirmFlag;

// Remove flags from args
const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
const [docId, backupFilePath] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle";
const defaultBackupPath =
  "/externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json";
const targetBackupPath = backupFilePath || defaultBackupPath;

if (!targetDocId || !targetBackupPath) {
  console.error(
    "\nUsage: node restore_from_backup.js <docId> <backupFilePath> [--confirm] [--create-backup]"
  );
  console.error("  docId: The document ID to restore");
  console.error("  backupFilePath: Path to the backup JSON file");
  console.error(
    "  --confirm: Required flag to actually perform the restoration"
  );
  console.error(
    "  --create-backup: Create a backup of current document before restoration"
  );
  console.error(
    "\nExample: node restore_from_backup.js vv3EMActxg1pRD09Kfle /externo/NICHOLAS/cosseno/backups/auto-backup-2025-04-14.json --confirm --create-backup"
  );
  console.error(
    "\nWARNING: This will completely overwrite the current document!"
  );
  process.exit(1);
}

// ---------- Helper functions ----------
function createBackupFileName(docId, stage, timestamp) {
  return `backup_${docId}_${stage}_${timestamp}.json`;
}

async function createCurrentBackup(docId) {
  try {
    console.log(chalk.blue("📁 Creating backup of current document..."));

    const docRef = db.collection("Notebooks").doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log(
        chalk.yellow("⚠️  Current document does not exist - no backup needed")
      );
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = createBackupFileName(docId, "before-restore", timestamp);

    const backupData = {
      metadata: {
        docId: docId,
        collection: "Notebooks",
        stage: "before-restore",
        timestamp: new Date().toISOString(),
        backupCreatedBy: "restore_from_backup.js",
      },
      document: {
        id: docSnap.id,
        data: docSnap.data(),
      },
    };

    fs.writeFileSync(fileName, JSON.stringify(backupData, null, 2));
    console.log(chalk.green(`✅ Current document backed up to: ${fileName}`));

    return { fileName, data: backupData };
  } catch (error) {
    console.error(
      chalk.red("Failed to create current document backup:"),
      error.message
    );
    throw error;
  }
}

function processFirestoreTimestamps(obj) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(processFirestoreTimestamps);
  }

  const processed = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      // Check if it's a Firestore timestamp object
      if (value._seconds !== undefined && value._nanoseconds !== undefined) {
        processed[key] = new Date(
          value._seconds * 1000 + value._nanoseconds / 1000000
        );
      } else if (
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)
      ) {
        // Handle ISO date strings
        processed[key] = new Date(value);
      } else {
        processed[key] = processFirestoreTimestamps(value);
      }
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

function analyzeBackupData(backupDoc) {
  const analysis = {
    hasId: !!backupDoc.id,
    hasSections: Array.isArray(backupDoc.sections),
    sectionsCount: Array.isArray(backupDoc.sections)
      ? backupDoc.sections.length
      : 0,
    hasTitle: !!backupDoc.title,
    hasUpdatedAt: !!(backupDoc.updatedAt || backupDoc.lastModified),
    fields: Object.keys(backupDoc),
    estimatedSize: JSON.stringify(backupDoc).length,
  };

  return analysis;
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold(`\n🔄 Document Restoration Process`));
    console.log(chalk.gray(`Document ID: ${targetDocId}`));
    console.log(chalk.gray(`Backup file: ${targetBackupPath}`));
    console.log(chalk.gray(`Mode: ${dryRun ? "DRY RUN" : "LIVE RESTORATION"}`));
    console.log(
      chalk.gray(`Create backup: ${createBackupFlag ? "Yes" : "No"}`)
    );

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

    // Step 2: Analyze backup data
    console.log(chalk.blue("\n🔍 Analyzing backup data..."));
    const analysis = analyzeBackupData(backupDoc);

    console.log(
      `• Fields in backup: ${chalk.cyan(
        analysis.fields.length
      )} (${analysis.fields.slice(0, 5).join(", ")}${
        analysis.fields.length > 5 ? "..." : ""
      })`
    );
    console.log(
      `• Has sections: ${
        analysis.hasSections ? chalk.green("Yes") : chalk.red("No")
      }`
    );
    console.log(`• Sections count: ${chalk.cyan(analysis.sectionsCount)}`);
    console.log(
      `• Has title: ${analysis.hasTitle ? chalk.green("Yes") : chalk.red("No")}`
    );
    console.log(
      `• Has timestamps: ${
        analysis.hasUpdatedAt ? chalk.green("Yes") : chalk.red("No")
      }`
    );
    console.log(
      `• Estimated size: ${chalk.cyan(
        Math.round(analysis.estimatedSize / 1024)
      )} KB`
    );

    // Step 3: Check current document
    console.log(chalk.blue("\n📄 Checking current document..."));
    const docRef = db.collection("Notebooks").doc(targetDocId);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const currentDoc = docSnap.data();
      const currentSectionsCount = Array.isArray(currentDoc.sections)
        ? currentDoc.sections.length
        : 0;
      console.log(
        chalk.yellow(
          `⚠️  Document exists with ${currentSectionsCount} sections`
        )
      );
      console.log(
        chalk.red(
          "This restoration will completely overwrite the current document!"
        )
      );
    } else {
      console.log(chalk.gray("Document does not exist - will be created"));
    }

    // Step 4: Create backup of current document if requested
    let currentBackup = null;
    if (createBackupFlag && !dryRun) {
      if (docSnap.exists) {
        currentBackup = await createCurrentBackup(targetDocId);
      } else {
        console.log(chalk.gray("📁 No current document to backup"));
      }
    } else if (createBackupFlag && dryRun) {
      console.log(
        chalk.yellow("📁 [DRY RUN] Would create backup of current document")
      );
    }

    // Step 5: Process the backup data for Firestore
    console.log(chalk.blue("\n⚙️  Processing backup data for Firestore..."));
    const processedDoc = processFirestoreTimestamps(backupDoc);

    // Add restoration metadata
    const restorationData = {
      ...processedDoc,
      restoredAt: new Date(),
      restoredFrom: targetBackupPath,
      restoredBy: "restore_from_backup.js",
      previouslyUpdatedAt: processedDoc.updatedAt || processedDoc.lastModified,
    };

    console.log(
      chalk.green("✅ Backup data processed and ready for restoration")
    );

    if (dryRun) {
      console.log(
        chalk.yellow.bold(`\n🚨 DRY RUN MODE - No changes will be made!`)
      );
      console.log(chalk.gray("The document would be restored with:"));
      console.log(chalk.gray(`• ${analysis.sectionsCount} sections`));
      console.log(chalk.gray(`• ${analysis.fields.length} fields`));
      console.log(chalk.gray(`• Restoration timestamp would be added`));
      console.log(
        chalk.gray(
          "\nTo actually perform the restoration, add the --confirm flag"
        )
      );
      process.exit(0);
    }

    // Step 6: Perform the restoration
    console.log(chalk.red.bold(`\n⚠️  PROCEEDING WITH RESTORATION`));
    console.log(chalk.blue("🔄 Writing document to Firestore..."));

    await docRef.set(restorationData);

    console.log(chalk.green.bold(`\n✅ Document successfully restored!`));

    // Step 7: Verify restoration
    console.log(chalk.blue("\n🔍 Verifying restoration..."));
    const verifySnap = await docRef.get();

    if (verifySnap.exists) {
      const restoredDoc = verifySnap.data();
      const restoredSectionsCount = Array.isArray(restoredDoc.sections)
        ? restoredDoc.sections.length
        : 0;

      console.log(chalk.green("✅ Restoration verified"));
      console.log(`• Document exists: ${chalk.green("Yes")}`);
      console.log(`• Sections count: ${chalk.cyan(restoredSectionsCount)}`);
      console.log(
        `• Restored at: ${chalk.cyan(restoredDoc.restoredAt?.toISOString())}`
      );
    } else {
      console.log(
        chalk.red(
          "❌ Verification failed - document not found after restoration"
        )
      );
    }

    // Step 8: Final summary
    console.log(chalk.blue.bold("\n🎉 Restoration completed successfully!"));
    console.log(chalk.yellow("\n📈 Summary:"));
    console.log(`• Document ID: ${chalk.cyan(targetDocId)}`);
    console.log(`• Sections restored: ${chalk.cyan(analysis.sectionsCount)}`);
    console.log(`• Fields restored: ${chalk.cyan(analysis.fields.length)}`);
    console.log(
      `• Backup source: ${chalk.gray(path.basename(targetBackupPath))}`
    );

    if (currentBackup) {
      console.log(
        `• Previous version backed up to: ${chalk.gray(currentBackup.fileName)}`
      );
    }

    console.log(
      chalk.green("\n✨ Document restoration completed successfully!")
    );
  } catch (error) {
    console.error(chalk.red("\n❌ Restoration failed:"), error.message);
    if (error.code) {
      console.error(chalk.red("Error code:"), error.code);
    }

    if (error.message.includes("permission")) {
      console.log(
        chalk.yellow(
          "\n💡 Tip: Make sure your service account has write permissions to Firestore"
        )
      );
    }

    process.exit(1);
  }
})();
