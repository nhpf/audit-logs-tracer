/*
 * restore_from_audit_log.js – Restore a document from the "before data" of a specific audit log entry
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node restore_from_audit_log.js <docId> <userId> [--confirm] [--create-backup]
 *
 * Example:
 *   node restore_from_audit_log.js vv3EMActxg1pRD09Kfle RLwvc3eBht18ROvGmNHe --confirm --create-backup
 *
 * ------------------------------------------------------------
 * This script will:
 *   • Find the latest audit log entry performed by the specified user
 *   • Extract the "beforeData" from that audit log
 *   • Restore that data back to the Firestore document
 *   • Optionally create a backup before restoration
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import chalk from "chalk";
import fs from "fs";

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
const [docId, beforeDateStr] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle";

// Parse beforeDate - default to June 17, 2025
let beforeDate = null;
if (beforeDateStr) {
  beforeDate = new Date(beforeDateStr);
  if (isNaN(beforeDate.getTime())) {
    console.error(chalk.red(`Invalid date format: ${beforeDateStr}`));
    console.error("Use format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss");
    process.exit(1);
  }
} else {
  beforeDate = new Date("2025-06-17T00:00:00Z"); // Default to June 17, 2025
}

if (!targetDocId) {
  console.error(
    "\\nUsage: node restore_from_audit_log.js <docId> [beforeDate] [--confirm] [--create-backup]"
  );
  console.error("  docId: The document ID to restore");
  console.error(
    "  beforeDate: Find logs before this date (default: 2025-06-17)"
  );
  console.error(
    "  --confirm: Required flag to actually perform the restoration"
  );
  console.error(
    "  --create-backup: Create a backup of current document before restoration"
  );
  console.error(
    "\\nExample: node restore_from_audit_log.js vv3EMActxg1pRD09Kfle 2025-06-15 --confirm"
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
    const fileName = createBackupFileName(
      docId,
      "before-audit-restore",
      timestamp
    );

    const backupData = {
      metadata: {
        docId: docId,
        collection: "Notebooks",
        stage: "before-audit-restore",
        timestamp: new Date().toISOString(),
        backupCreatedBy: "restore_from_audit_log.js",
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

async function findLatestAuditLogBeforeDate(docId, beforeDate = null) {
  console.log(
    chalk.blue(`🔍 Searching for audit logs for document ${docId}...`)
  );

  // Use simpler query like in main.js - just query by docId and collectionName
  const logsRef = db.collection("SchoolAuditLogs");
  const query = logsRef
    .where("docId", "==", docId)
    .where("collectionName", "==", "Notebooks");

  const snap = await query.get();

  if (snap.empty) {
    console.log(chalk.yellow("No audit logs found for this document"));
    return null;
  }

  console.log(
    chalk.gray(
      `Found ${snap.docs.length} audit log entries, filtering by date...`
    )
  );

  // Convert beforeDate to timestamp if provided
  let beforeTimestamp = null;
  if (beforeDate) {
    beforeTimestamp = Math.floor(beforeDate.getTime() / 1000); // Convert to seconds
    console.log(
      chalk.blue(`🗓️  Looking for logs before: ${beforeDate.toISOString()}`)
    );
  }

  // Filter by date and find the latest one locally
  const filteredLogs = [];
  snap.docs.forEach((doc) => {
    const data = doc.data();

    // Filter by date if specified
    if (beforeTimestamp && data.performedAt >= beforeTimestamp) {
      return; // Skip logs that are too recent
    }

    filteredLogs.push({
      id: doc.id,
      ...data,
    });
  });

  if (filteredLogs.length === 0) {
    const dateMsg = beforeDate ? ` before ${beforeDate.toISOString()}` : "";
    console.log(chalk.yellow(`No audit logs found${dateMsg}`));
    return null;
  }

  // Sort by performedAt descending to get the latest (but still before the cutoff)
  filteredLogs.sort((a, b) => b.performedAt - a.performedAt);

  const dateMsg = beforeDate ? ` before ${beforeDate.toISOString()}` : "";
  console.log(
    chalk.green(`Found ${filteredLogs.length} audit log entries${dateMsg}`)
  );

  return filteredLogs[0]; // Return the latest one that meets criteria
}

function analyzeAfterData(afterData) {
  if (!afterData || typeof afterData !== "object") {
    return {
      isValid: false,
      reason: "After data is empty or not an object",
    };
  }

  const analysis = {
    isValid: true,
    hasSections: Array.isArray(afterData.sections),
    sectionsCount: Array.isArray(afterData.sections)
      ? afterData.sections.length
      : 0,
    hasTitle: !!afterData.title,
    hasId: !!afterData.id,
    fields: Object.keys(afterData),
    estimatedSize: JSON.stringify(afterData).length,
  };

  return analysis;
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold(`\\n🔄 Audit Log Restoration Process`));
    console.log(chalk.gray(`Document ID: ${targetDocId}`));
    console.log(chalk.gray(`Before date: ${beforeDate.toISOString()}`));
    console.log(chalk.gray(`Mode: ${dryRun ? "DRY RUN" : "LIVE RESTORATION"}`));
    console.log(
      chalk.gray(`Create backup: ${createBackupFlag ? "Yes" : "No"}`)
    );

    // Step 1: Find the latest audit log before the specified date (any user)
    const auditLog = await findLatestAuditLogBeforeDate(
      targetDocId,
      beforeDate
    );

    if (!auditLog) {
      console.error(
        chalk.red(
          `❌ No audit log entries found for document ${targetDocId} before ${beforeDate.toISOString()}`
        )
      );
      console.log(chalk.yellow("💡 Try:"));
      console.log(chalk.yellow("  • Using an earlier date"));
      console.log(chalk.yellow("  • Checking if the document ID is correct"));
      console.log(
        chalk.yellow(
          "  • Running without a date filter to see all available logs"
        )
      );
      process.exit(1);
    }

    console.log(chalk.green(`✅ Found audit log entry:`));
    console.log(`  • Entry ID: ${chalk.cyan(auditLog.id)}`);
    console.log(`  • Operation: ${chalk.cyan(auditLog.operationType)}`);
    console.log(
      `  • Performed at: ${chalk.cyan(
        Timestamp.fromMillis(auditLog.performedAt * 1000)
          .toDate()
          .toISOString()
      )}`
    );
    console.log(
      `  • Performed by: ${chalk.cyan(auditLog.performedByName)} (${
        auditLog.performedByUserId
      })`
    );

    // Step 2: Extract and analyze after data
    console.log(chalk.blue("\\n🔍 Analyzing after data from audit log..."));

    const afterData = auditLog.afterData;
    const analysis = analyzeAfterData(afterData);

    if (!analysis.isValid) {
      console.error(
        chalk.red(`❌ After data is not valid: ${analysis.reason}`)
      );
      process.exit(1);
    }

    console.log(chalk.green("✅ After data is valid"));
    console.log(
      `  • Fields: ${chalk.cyan(analysis.fields.length)} (${analysis.fields
        .slice(0, 5)
        .join(", ")}${analysis.fields.length > 5 ? "..." : ""})`
    );
    console.log(
      `  • Has sections: ${
        analysis.hasSections ? chalk.green("Yes") : chalk.red("No")
      }`
    );
    console.log(`  • Sections count: ${chalk.cyan(analysis.sectionsCount)}`);
    console.log(
      `  • Has title: ${
        analysis.hasTitle ? chalk.green("Yes") : chalk.red("No")
      }`
    );
    console.log(
      `  • Estimated size: ${chalk.cyan(
        Math.round(analysis.estimatedSize / 1024)
      )} KB`
    );

    // Step 3: Check current document
    console.log(chalk.blue("\\n📄 Checking current document..."));
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

      // Show what will change
      if (currentSectionsCount !== analysis.sectionsCount) {
        const sectionDiff = analysis.sectionsCount - currentSectionsCount;
        const changeText =
          sectionDiff > 0
            ? chalk.green(`+${sectionDiff} sections will be added`)
            : chalk.red(`${Math.abs(sectionDiff)} sections will be removed`);
        console.log(`  • Section count change: ${changeText}`);
      }
    } else {
      console.log(chalk.gray("Document does not exist - will be created"));
    }

    // Step 4: Create backup if requested
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

    // Step 5: Prepare restoration data
    console.log(chalk.blue("\\n⚙️  Preparing restoration data..."));

    // Add restoration metadata
    const restorationData = {
      ...afterData,
      restoredAt: new Date(),
      restoredFromAuditLog: auditLog.id,
      restoredFromOperation: auditLog.operationType,
      restoredFromTimestamp: Timestamp.fromMillis(
        auditLog.performedAt * 1000
      ).toDate(),
      restoredBy: "restore_from_audit_log.js",
      originalPerformedBy: auditLog.performedByName,
      originalPerformedByUserId: auditLog.performedByUserId,
    };

    console.log(chalk.green("✅ Restoration data prepared"));

    if (dryRun) {
      console.log(
        chalk.yellow.bold(`\\n🚨 DRY RUN MODE - No changes will be made!`)
      );
      console.log(
        chalk.gray(
          "The document would be restored to the state from the audit log:"
        )
      );
      console.log(chalk.gray(`  • From audit log: ${auditLog.id}`));
      console.log(
        chalk.gray(`  • Original operation: ${auditLog.operationType}`)
      );
      console.log(
        chalk.gray(`  • Original performed by: ${auditLog.performedByName}`)
      );
      console.log(
        chalk.gray(`  • ${analysis.sectionsCount} sections would be restored`)
      );
      console.log(
        chalk.gray(`  • ${analysis.fields.length} fields would be restored`)
      );
      console.log(
        chalk.gray(
          "\\nTo actually perform the restoration, add the --confirm flag"
        )
      );
      process.exit(0);
    }

    // Step 6: Perform the restoration
    console.log(
      chalk.red.bold(`\\n⚠️  PROCEEDING WITH RESTORATION FROM AUDIT LOG`)
    );
    console.log(chalk.blue("🔄 Writing document to Firestore..."));

    await docRef.set(restorationData);

    console.log(
      chalk.green.bold(`\\n✅ Document successfully restored from audit log!`)
    );

    // Step 7: Verify restoration
    console.log(chalk.blue("\\n🔍 Verifying restoration..."));
    const verifySnap = await docRef.get();

    if (verifySnap.exists) {
      const restoredDoc = verifySnap.data();
      const restoredSectionsCount = Array.isArray(restoredDoc.sections)
        ? restoredDoc.sections.length
        : 0;

      console.log(chalk.green("✅ Restoration verified"));
      console.log(`  • Document exists: ${chalk.green("Yes")}`);
      console.log(`  • Sections count: ${chalk.cyan(restoredSectionsCount)}`);

      // Safe date handling
      const restoredAtStr = restoredDoc.restoredAt
        ? restoredDoc.restoredAt.toDate
          ? restoredDoc.restoredAt.toDate().toISOString()
          : restoredDoc.restoredAt.toISOString
          ? restoredDoc.restoredAt.toISOString()
          : String(restoredDoc.restoredAt)
        : "Unknown";

      console.log(`  • Restored at: ${chalk.cyan(restoredAtStr)}`);
      console.log(
        `  • Restored from audit log: ${chalk.cyan(
          restoredDoc.restoredFromAuditLog || "Unknown"
        )}`
      );
    } else {
      console.log(
        chalk.red(
          "❌ Verification failed - document not found after restoration"
        )
      );
    }

    // Step 8: Final summary
    console.log(
      chalk.blue.bold("\\n🎉 Audit Log Restoration completed successfully!")
    );
    console.log(chalk.yellow("\\n📈 Summary:"));
    console.log(`  • Document ID: ${chalk.cyan(targetDocId)}`);
    console.log(`  • Restored from audit log: ${chalk.cyan(auditLog.id)}`);
    console.log(
      `  • Original operation: ${chalk.cyan(auditLog.operationType)}`
    );
    console.log(
      `  • Original performed by: ${chalk.cyan(auditLog.performedByName)}`
    );
    console.log(
      `  • Original timestamp: ${chalk.cyan(
        Timestamp.fromMillis(auditLog.performedAt * 1000)
          .toDate()
          .toISOString()
      )}`
    );
    console.log(`  • Sections restored: ${chalk.cyan(analysis.sectionsCount)}`);
    console.log(`  • Fields restored: ${chalk.cyan(analysis.fields.length)}`);

    if (currentBackup) {
      console.log(
        `  • Previous version backed up to: ${chalk.gray(
          currentBackup.fileName
        )}`
      );
    }

    console.log(
      chalk.green("\\n✨ Document restored to previous state successfully!")
    );
  } catch (error) {
    console.error(chalk.red("\\n❌ Restoration failed:"), error.message);
    if (error.code) {
      console.error(chalk.red("Error code:"), error.code);
    }

    if (error.message.includes("permission")) {
      console.log(
        chalk.yellow(
          "\\n💡 Tip: Make sure your service account has write permissions to Firestore"
        )
      );
    }

    if (error.message.includes("index")) {
      console.log(
        chalk.yellow(
          "\\n💡 Tip: You may need to create a composite index for the audit log query"
        )
      );
    }

    process.exit(1);
  }
})();
