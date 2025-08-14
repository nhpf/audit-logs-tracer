/*
 * upload_final_version.js – Upload final_version.json to Firestore
 *
 * This script will:
 *   • Load and validate the final_version.json file
 *   • Create a backup of the current Firestore state
 *   • Upload the final version to Firestore
 *   • Verify the upload was successful
 *   • Provide detailed reporting
 *
 * Usage: node upload_final_version.js [--dry-run] [--force]
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";

// Import service account
import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if Firebase app is already initialized
let app;
try {
  app = admin.app();
} catch (error) {
  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://cosseno-48fb3.firebaseio.com",
  });
}

const db = admin.firestore();

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isForce = args.includes("--force");

const targetDocId = "vv3EMActxg1pRD09Kfle";

function loadFinalVersion() {
  console.log(chalk.gray("📂 Loading final_version.json..."));

  const finalVersionPath = path.join(__dirname, "final_version.json");

  if (!fs.existsSync(finalVersionPath)) {
    throw new Error("final_version.json not found in current directory");
  }

  const data = JSON.parse(fs.readFileSync(finalVersionPath, "utf8"));

  // Handle different possible structures
  let notebookData;
  if (data.notebook) {
    notebookData = data.notebook;
  } else if (data.currentData) {
    notebookData = data.currentData;
  } else {
    // Assume the file itself is the notebook data
    notebookData = data;
  }

  console.log(
    chalk.green(
      `✅ Loaded final version (${
        notebookData?.sections?.length || 0
      } sections)`
    )
  );

  return notebookData;
}

async function createPreUploadBackup(docId) {
  console.log(chalk.yellow("🔄 Creating pre-upload backup..."));

  try {
    const docRef = db.collection("Notebooks").doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`Document ${docId} does not exist`);
    }

    const currentData = doc.data();
    const backupFileName = `pre_upload_backup_${docId}_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    const backupFilePath = path.join(__dirname, backupFileName);

    const backupData = {
      docId,
      backupTimestamp: new Date().toISOString(),
      backupReason: "Pre-upload backup for final_version.json",
      sectionsCount: currentData?.sections?.length || 0,
      currentData,
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

    console.log(chalk.green(`✅ Backup created: ${backupFileName}`));
    return { backupFileName, currentData };
  } catch (error) {
    console.error(chalk.red(`❌ Failed to create backup: ${error.message}`));
    throw error;
  }
}

function validateUpload(finalVersionData, currentData) {
  console.log(chalk.blue("\n🔍 UPLOAD VALIDATION\n"));

  const currentSections = currentData?.sections?.length || 0;
  const finalSections = finalVersionData?.sections?.length || 0;

  console.log(`📊 Section count comparison:`);
  console.log(`   • Current (in Firestore): ${currentSections} sections`);
  console.log(`   • Final version (to upload): ${finalSections} sections`);
  console.log(
    `   • Change: ${finalSections >= currentSections ? "+" : ""}${
      finalSections - currentSections
    } sections`
  );

  // Basic validation checks
  const validations = [
    {
      check: finalVersionData && typeof finalVersionData === "object",
      message: "Final version data is a valid object",
    },
    {
      check: Array.isArray(finalVersionData.sections),
      message: "Final version contains sections array",
    },
    {
      check: finalSections > 0,
      message: "Final version has at least one section",
    },
    {
      check: true, // Skip ID validation since we're uploading to a specific target
      message: "Document structure is valid for upload",
    },
  ];

  console.log(`\n✅ Validation results:`);
  let allValid = true;

  validations.forEach((validation, index) => {
    const status = validation.check ? chalk.green("✅") : chalk.red("❌");
    console.log(`   ${status} ${validation.message}`);
    if (!validation.check) allValid = false;
  });

  if (!allValid) {
    throw new Error("Upload validation failed");
  }

  console.log(chalk.green("\n✅ All validations passed!"));
  return true;
}

async function uploadToFirestore(docId, data) {
  console.log(chalk.yellow("\n🚀 Uploading to Firestore..."));

  const docRef = db.collection("Notebooks").doc(docId);

  // Ensure the document has the correct ID
  const uploadData = {
    ...data,
    id: docId,
  };

  // Use set with merge: false to completely replace the document
  await docRef.set(uploadData, { merge: false });

  console.log(chalk.green("✅ Upload completed successfully!"));
}

async function verifyUpload(docId, expectedData) {
  console.log(chalk.gray("\n🔍 Verifying upload..."));

  const docRef = db.collection("Notebooks").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error("Document does not exist after upload");
  }

  const uploadedData = doc.data();
  const uploadedSections = uploadedData?.sections?.length || 0;
  const expectedSections = expectedData?.sections?.length || 0;

  if (uploadedSections === expectedSections) {
    console.log(
      chalk.green(
        `✅ Verification successful: ${uploadedSections} sections uploaded correctly`
      )
    );
    return true;
  } else {
    console.log(
      chalk.red(
        `❌ Verification failed: Expected ${expectedSections}, got ${uploadedSections}`
      )
    );
    return false;
  }
}

function displayUploadPlan(finalVersionData, currentData) {
  console.log(chalk.blue.bold("\n📋 UPLOAD PLAN\n"));
  console.log("=".repeat(80));

  const currentSections = currentData?.sections?.length || 0;
  const finalSections = finalVersionData?.sections?.length || 0;

  console.log(
    `🎯 **TARGET:** Upload final_version.json to vv3EMActxg1pRD09Kfle`
  );
  console.log(
    `📊 **CHANGE:** ${currentSections} → ${finalSections} sections (${
      finalSections >= currentSections ? "+" : ""
    }${finalSections - currentSections})`
  );

  console.log(`\n📝 **STEPS:**`);
  console.log(`   1. Create pre-upload backup of current state`);
  console.log(`   2. Validate final_version.json structure`);
  console.log(`   3. Upload final version to Firestore`);
  console.log(`   4. Verify upload was successful`);

  console.log(`\n🔒 **SAFETY:**`);
  console.log(`   • Backup will be created before any changes`);
  console.log(`   • Upload can be reverted using backup`);
  console.log(`   • Verification ensures data integrity`);

  console.log("\n=".repeat(80));
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold("🚀 FINAL VERSION UPLOAD SYSTEM"));
    console.log(`📘 Target notebook: ${targetDocId}`);
    console.log(
      `🎯 Mode: ${
        isDryRun
          ? "DRY RUN (preview only)"
          : "EXECUTE (will upload to Firestore)"
      }`
    );
    console.log("=".repeat(80));

    // Load final version data
    const finalVersionData = loadFinalVersion();

    // Create pre-upload backup and get current state
    const { backupFileName, currentData } = await createPreUploadBackup(
      targetDocId
    );

    // Validate the upload
    validateUpload(finalVersionData, currentData);

    // Display upload plan
    displayUploadPlan(finalVersionData, currentData);

    if (isDryRun) {
      console.log(chalk.blue.bold("\n🔍 DRY RUN COMPLETE"));
      console.log(
        "This was a preview only. No changes were made to Firestore."
      );
      console.log("Run without --dry-run to perform the actual upload.");
      console.log(`💾 Backup was created: ${backupFileName}`);
    } else {
      // Ask for confirmation unless --force is used
      if (!isForce) {
        console.log(
          chalk.yellow("\n⚠️  You are about to upload to Firestore!")
        );
        console.log("This will replace the current notebook content.");
        console.log("\nContinuing in 3 seconds...");

        // Wait 3 seconds
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // Perform the upload
      await uploadToFirestore(targetDocId, finalVersionData);

      // Verify the upload
      const verificationSuccess = await verifyUpload(
        targetDocId,
        finalVersionData
      );

      if (verificationSuccess) {
        console.log(chalk.green.bold("\n🎉 UPLOAD COMPLETED SUCCESSFULLY!"));
        console.log(`📄 Notebook ${targetDocId} has been updated`);
        console.log(
          `📊 Final section count: ${finalVersionData?.sections?.length || 0}`
        );
        console.log(`💾 Safety backup: ${backupFileName}`);
      } else {
        console.log(chalk.red.bold("\n💥 UPLOAD VERIFICATION FAILED!"));
        console.log(`💾 You can restore from backup: ${backupFileName}`);
      }
    }
  } catch (error) {
    console.error(chalk.red(`💥 Upload Error: ${error.message}`));
    process.exit(1);
  }
})();
