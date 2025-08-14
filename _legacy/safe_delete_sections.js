/*
 * safe_delete_sections.js – Safely delete sections with backup and auth claims setup
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node safe_delete_sections.js <docId> <numberOfSections> <userId> [--confirm]
 *
 * Example:
 *   node safe_delete_sections.js vv3EMActxg1pRD09Kfle 87 RLwvc3eBht18ROvGmNHe --confirm
 *
 * ------------------------------------------------------------
 * This script will:
 *   1. Set custom auth claims for the specified user
 *   2. Create a backup of the document before modification
 *   3. Delete the specified number of sections from the end
 *   4. Create a backup of the document after modification
 *   5. Show detailed summary of the operation
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth();

// ---------- Parse CLI args ----------
const args = process.argv.slice(2);
const confirmFlag = args.includes("--confirm");
const dryRun = !confirmFlag;

// Remove flags from args
const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
const [docId, numberOfSectionsStr, userId] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle";
const numberOfSections = parseInt(numberOfSectionsStr) || 87;
const targetUserId = userId || "RLwvc3eBht18ROvGmNHe";

if (!targetDocId || !numberOfSectionsStr || !targetUserId) {
  console.error(
    "\nUsage: node safe_delete_sections.js <docId> <numberOfSections> <userId> [--confirm]"
  );
  console.error("  docId: The document ID to modify");
  console.error(
    "  numberOfSections: Number of sections to remove from the end"
  );
  console.error("  userId: User ID to set custom auth claims for");
  console.error("  --confirm: Required flag to actually perform the operation");
  console.error(
    "\nExample: node safe_delete_sections.js vv3EMActxg1pRD09Kfle 87 RLwvc3eBht18ROvGmNHe --confirm"
  );
  process.exit(1);
}

if (isNaN(numberOfSections) || numberOfSections <= 0) {
  console.error(
    chalk.red("Error: numberOfSections must be a positive integer")
  );
  process.exit(1);
}

// ---------- Helper functions ----------
function createBackupFileName(docId, stage, timestamp) {
  return `backup_${docId}_${stage}_${timestamp}.json`;
}

async function backupDocument(docId, stage) {
  try {
    const docRef = db.collection("Notebooks").doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new Error(`Document ${docId} not found`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = createBackupFileName(docId, stage, timestamp);

    const backupData = {
      metadata: {
        docId: docId,
        collection: "Notebooks",
        stage: stage,
        timestamp: new Date().toISOString(),
        backupCreatedBy: "safe_delete_sections.js",
      },
      document: {
        id: docSnap.id,
        data: docSnap.data(),
      },
    };

    fs.writeFileSync(fileName, JSON.stringify(backupData, null, 2));
    console.log(chalk.green(`✅ Backup created: ${fileName}`));

    return { fileName, data: backupData };
  } catch (error) {
    console.error(
      chalk.red(`Failed to create ${stage} backup:`),
      error.message
    );
    throw error;
  }
}

async function setCustomAuthClaims(userId) {
  try {
    console.log(
      chalk.blue(`🔐 Setting custom auth claims for user: ${userId}`)
    );

    // Set custom claims - adjust these based on your needs
    const customClaims = {
      admin: false,
      schoolId: "azambuja",
      completeProfile: true,
    };

    await auth.setCustomUserClaims(userId, customClaims);
    console.log(chalk.green("✅ Custom auth claims set successfully"));

    // Verify the claims were set
    const userRecord = await auth.getUser(userId);
    console.log(
      chalk.gray("📋 Current custom claims:"),
      JSON.stringify(userRecord.customClaims, null, 2)
    );

    return customClaims;
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      console.error(chalk.red(`❌ User ${userId} not found in Authentication`));
    } else {
      console.error(
        chalk.red("Failed to set custom auth claims:"),
        error.message
      );
    }
    throw error;
  }
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold(`\n🚀 Starting safe section deletion process`));
    console.log(chalk.gray(`Document: ${targetDocId}`));
    console.log(chalk.gray(`Sections to delete: ${numberOfSections}`));
    console.log(chalk.gray(`User ID: ${targetUserId}`));
    console.log(chalk.gray(`Mode: ${dryRun ? "DRY RUN" : "LIVE OPERATION"}`));

    // Step 1: Set custom auth claims
    if (!dryRun) {
      await setCustomAuthClaims(targetUserId);
    } else {
      console.log(
        chalk.yellow("🔐 [DRY RUN] Would set custom auth claims for user")
      );
    }

    // Step 2: Create pre-operation backup
    console.log(chalk.blue("\n📁 Creating pre-operation backup..."));
    let preBackup;
    if (!dryRun) {
      preBackup = await backupDocument(targetDocId, "before");
    } else {
      console.log(
        chalk.yellow("📁 [DRY RUN] Would create pre-operation backup")
      );
    }

    // Step 3: Analyze the document
    console.log(chalk.blue("\n🔍 Analyzing document..."));
    const docRef = db.collection("Notebooks").doc(targetDocId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.error(
        chalk.red(
          `Error: Document ${targetDocId} not found in Notebooks collection`
        )
      );
      process.exit(1);
    }

    const currentData = docSnap.data();
    const currentSections = currentData.sections || [];

    console.log(
      chalk.cyan(`Current sections count: ${currentSections.length}`)
    );

    if (currentSections.length === 0) {
      console.log(chalk.yellow("Document has no sections to delete."));
      process.exit(0);
    }

    if (numberOfSections >= currentSections.length) {
      console.log(
        chalk.red(
          `Error: Cannot delete ${numberOfSections} sections. Document only has ${currentSections.length} sections.`
        )
      );
      process.exit(1);
    }

    // Calculate changes
    const sectionsToRemove = currentSections.slice(-numberOfSections);
    const remainingSections = currentSections.slice(
      0,
      currentSections.length - numberOfSections
    );

    console.log(chalk.yellow(`\n📊 Operation Summary:`));
    console.log(
      `  • Will remove: ${chalk.red(numberOfSections)} sections (from the end)`
    );
    console.log(
      `  • Will remain: ${chalk.green(remainingSections.length)} sections`
    );

    // Step 4: Show preview
    console.log(chalk.yellow(`\n🗑️  Preview of sections to be removed:`));
    sectionsToRemove.slice(0, 5).forEach((section, index) => {
      const actualIndex = currentSections.length - numberOfSections + index;
      const title =
        section.title || section.name || `Section ${actualIndex + 1}`;
      console.log(
        `  ${chalk.red(`[${actualIndex + 1}]`)} ${title.substring(0, 60)}${
          title.length > 60 ? "..." : ""
        }`
      );
    });

    if (numberOfSections > 5) {
      console.log(
        `  ${chalk.gray(`... and ${numberOfSections - 5} more sections`)}`
      );
    }

    if (dryRun) {
      console.log(
        chalk.yellow.bold(`\n🚨 DRY RUN MODE - No changes will be made!`)
      );
      console.log(
        chalk.gray("To actually perform this operation, add the --confirm flag")
      );
      process.exit(0);
    }

    // Step 5: Perform the deletion
    console.log(chalk.red.bold(`\n⚠️  PROCEEDING WITH DELETION`));
    console.log(chalk.blue("🔄 Updating document..."));

    await docRef.update({
      sections: remainingSections,
      updatedAt: new Date(),
      lastModified: new Date(),
      lastModifiedBy: targetUserId,
      sectionsDeletedCount: numberOfSections,
      sectionsDeletedAt: new Date(),
    });

    console.log(
      chalk.green.bold(
        `\n✅ Successfully deleted ${numberOfSections} sections!`
      )
    );

    // Step 6: Create post-operation backup
    console.log(chalk.blue("\n📁 Creating post-operation backup..."));
    const postBackup = await backupDocument(targetDocId, "after");

    // Step 7: Final summary
    console.log(chalk.blue.bold("\n🎉 Operation completed successfully!"));
    console.log(chalk.yellow("\n📈 Summary:"));
    console.log(`  • Sections before: ${chalk.cyan(currentSections.length)}`);
    console.log(`  • Sections deleted: ${chalk.red(numberOfSections)}`);
    console.log(
      `  • Sections remaining: ${chalk.green(remainingSections.length)}`
    );
    console.log(`  • User claims updated: ${chalk.green(targetUserId)}`);

    if (preBackup && postBackup) {
      console.log(`\n📁 Backup files created:`);
      console.log(`  • Before: ${chalk.gray(preBackup.fileName)}`);
      console.log(`  • After:  ${chalk.gray(postBackup.fileName)}`);
    }

    console.log(chalk.green("\n✨ All operations completed successfully!"));
  } catch (error) {
    console.error(chalk.red("\n❌ Operation failed:"), error.message);
    if (error.code) {
      console.error(chalk.red("Error code:"), error.code);
    }
    console.log(
      chalk.yellow(
        "\n🔄 If backups were created, you can use them to restore the document if needed."
      )
    );
    process.exit(1);
  }
})();
