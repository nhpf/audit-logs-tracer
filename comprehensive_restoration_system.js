/*
 * notebook_restoration_system.js – Restore vv3EMActxg1pRD09Kfle to pre-Fagner state and re-apply modifications
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node notebook_restoration_system.js <docId> [--dry-run] [--execute]
 *
 * Example:
 *   node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --dry-run
 *   node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --execute
 *
 * ------------------------------------------------------------
 * This script will:
 *   • Analyze audit logs to find the pre-Fagner state (before July 2th change)
 *   • Identify all post-Fagner modifications that should be preserved
 *   • Create a local backup of the current state
 *   • Restore the notebook to its pre-Fagner content
 *   • Re-apply the legitimate post-Fagner modifications in order
 *   • Provide detailed reporting of all actions taken
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// ---------- Parse CLI args ----------
const args = process.argv.slice(2);
const [docId] = args;
const isDryRun = args.includes("--dry-run");
const isExecute = args.includes("--execute");

const targetDocId = docId || "vv3EMActxg1pRD09Kfle";

if (!targetDocId) {
  console.error(
    "\nUsage: node notebook_restoration_system.js <docId> [--dry-run] [--execute]"
  );
  console.error("  docId: The document ID to restore");
  console.error(
    "  --dry-run: Preview the restoration plan without making changes"
  );
  console.error("  --execute: Execute the restoration (creates backup first)");
  console.error(
    "\nExample: node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --dry-run"
  );
  process.exit(1);
}

if (!isDryRun && !isExecute) {
  console.error("\nPlease specify either --dry-run or --execute");
  console.error("Use --dry-run first to preview the restoration plan");
  process.exit(1);
}

// ---------- Helper functions ----------
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

function findFagnerChange(logs) {
  // Fagner's change timestamp: 2025-07-02T20:28:24.000Z
  const targetTime = new Date("2025-07-02T20:28:24.000Z").getTime();

  for (const logEntry of logs) {
    const logTime = new Date(logEntry.performedAt * 1000).getTime();
    if (Math.abs(logTime - targetTime) <= 5000) {
      // 5 second tolerance
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

function findPreFagnerState(logs) {
  const fagnerChange = findFagnerChange(logs);
  if (!fagnerChange) {
    throw new Error("Could not find Fagner's July 2th change in audit logs");
  }

  // The pre-Fagner state is in the beforeData of Fagner's change
  return {
    fagnerChange,
    preFagnerState: fagnerChange.beforeData,
    fagnerTimestamp: fagnerChange.performedAt * 1000,
  };
}

function findPostFagnerModifications(logs, fagnerTimestamp) {
  const postFagnerMods = [];

  // Sort logs by timestamp to ensure chronological order
  const sortedLogs = logs.sort((a, b) => a.performedAt - b.performedAt);

  for (const logEntry of sortedLogs) {
    const logTime = logEntry.performedAt * 1000;

    // Only include modifications that happened AFTER Fagner's change
    if (logTime > fagnerTimestamp) {
      postFagnerMods.push({
        timestamp: logTime,
        performedAt: logEntry.performedAt,
        performedByName: logEntry.performedByName,
        performedByUserId: logEntry.performedByUserId,
        beforeData: logEntry.beforeData,
        afterData: logEntry.afterData,
        updatedFields: logEntry.updatedFields,
        operationType: logEntry.operationType,
        shortDescription: `${logEntry.operationType} by ${logEntry.performedByName}`,
        fullLogEntry: logEntry,
      });
    }
  }

  return postFagnerMods;
}

async function createLocalBackup(docId) {
  console.log(
    chalk.yellow("🔄 Creating local backup of current notebook state...")
  );

  try {
    const docRef = db.collection("Notebooks").doc(docId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`Document ${docId} does not exist`);
    }

    const currentData = doc.data();
    const backupFileName = `backup_${docId}_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    const backupFilePath = path.join(__dirname, backupFileName);

    const backupData = {
      docId,
      backupTimestamp: new Date().toISOString(),
      backupReason: "Pre-restoration backup",
      currentData,
    };

    fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

    console.log(chalk.green(`✅ Backup created: ${backupFileName}`));
    return backupFilePath;
  } catch (error) {
    console.error(chalk.red(`❌ Failed to create backup: ${error.message}`));
    throw error;
  }
}

function analyzeRestoration(auditLogs) {
  console.log(chalk.blue.bold("\n🔍 ANALYZING RESTORATION REQUIREMENTS\n"));

  // Find pre-Fagner state
  const { fagnerChange, preFagnerState, fagnerTimestamp } =
    findPreFagnerState(auditLogs);

  console.log(`📅 Fagner's change: ${new Date(fagnerTimestamp).toISOString()}`);
  console.log(`👤 Performed by: ${fagnerChange.performedByName}`);
  console.log(
    `📊 Fagner's change: ${fagnerChange.beforeData?.sections?.length || 0} → ${
      fagnerChange.afterData?.sections?.length || 0
    } sections`
  );

  // Find post-Fagner modifications
  const postFagnerMods = findPostFagnerModifications(
    auditLogs,
    fagnerTimestamp
  );

  console.log(
    `\n🔄 Found ${postFagnerMods.length} post-Fagner modifications to preserve:\n`
  );

  postFagnerMods.forEach((mod, index) => {
    console.log(
      `${index + 1}. ${chalk.cyan(new Date(mod.timestamp).toISOString())}`
    );
    console.log(`   👤 ${mod.performedByName}`);
    console.log(`   📝 ${mod.shortDescription}`);
    console.log(
      `   📊 ${mod.beforeData?.sections?.length || 0} → ${
        mod.afterData?.sections?.length || 0
      } sections`
    );
    console.log("");
  });

  return {
    fagnerChange,
    preFagnerState,
    fagnerTimestamp,
    postFagnerMods,
  };
}

function generateRestorationPlan(analysis) {
  const plan = {
    steps: [],
    summary: {
      totalSteps: 0,
      willRestoreToSections: analysis.preFagnerState?.sections?.length || 0,
      willPreserveModifications: analysis.postFagnerMods.length,
      estimatedFinalSections: 0,
    },
  };

  // Step 1: Create backup
  plan.steps.push({
    stepNumber: 1,
    action: "create_backup",
    description: "Create local backup of current notebook state",
    riskLevel: "low",
    reversible: true,
  });

  // Step 2: Restore to pre-Fagner state
  plan.steps.push({
    stepNumber: 2,
    action: "restore_pre_fagner",
    description: `Restore notebook to pre-Fagner state (${
      analysis.preFagnerState?.sections?.length || 0
    } sections)`,
    riskLevel: "high",
    reversible: true,
    targetState: analysis.preFagnerState,
  });

  // Step 3+: Re-apply each post-Fagner modification
  analysis.postFagnerMods.forEach((mod, index) => {
    plan.steps.push({
      stepNumber: 3 + index,
      action: "apply_modification",
      description: `Re-apply modification by ${mod.performedByName} (${new Date(
        mod.timestamp
      )
        .toISOString()
        .substring(0, 19)})`,
      riskLevel: "medium",
      reversible: true,
      modification: mod,
      expectedSectionChange: `${mod.beforeData?.sections?.length || 0} → ${
        mod.afterData?.sections?.length || 0
      }`,
    });
  });

  plan.summary.totalSteps = plan.steps.length;

  // Estimate final section count (this is approximate)
  if (analysis.postFagnerMods.length > 0) {
    const lastMod = analysis.postFagnerMods[analysis.postFagnerMods.length - 1];
    plan.summary.estimatedFinalSections =
      lastMod.afterData?.sections?.length || 0;
  } else {
    plan.summary.estimatedFinalSections =
      analysis.preFagnerState?.sections?.length || 0;
  }

  return plan;
}

function displayRestorationPlan(plan) {
  console.log(chalk.blue.bold("\n📋 RESTORATION PLAN\n"));
  console.log("=".repeat(80));

  console.log(`📊 Summary:`);
  console.log(`   • Total steps: ${plan.summary.totalSteps}`);
  console.log(
    `   • Will restore to: ${plan.summary.willRestoreToSections} sections (pre-Fagner)`
  );
  console.log(
    `   • Will preserve: ${plan.summary.willPreserveModifications} post-Fagner modifications`
  );
  console.log(
    `   • Estimated final: ${plan.summary.estimatedFinalSections} sections`
  );
  console.log("");

  plan.steps.forEach((step) => {
    const riskColor =
      step.riskLevel === "high"
        ? "red"
        : step.riskLevel === "medium"
        ? "yellow"
        : "green";

    console.log(`${step.stepNumber}. ${chalk.bold(step.description)}`);
    console.log(
      `   Risk: ${chalk[riskColor](
        step.riskLevel.toUpperCase()
      )} | Reversible: ${step.reversible ? "✅" : "❌"}`
    );

    if (step.expectedSectionChange) {
      console.log(`   Expected: ${step.expectedSectionChange} sections`);
    }

    console.log("");
  });

  console.log("=".repeat(80));
}

async function executeRestoration(plan, docId) {
  console.log(chalk.red.bold("\n🚀 EXECUTING RESTORATION\n"));
  console.log("⚠️  This will modify the Firestore document!");
  console.log("=".repeat(80));

  let backupPath = null;

  try {
    for (const step of plan.steps) {
      console.log(
        chalk.yellow(`\n⏳ Step ${step.stepNumber}: ${step.description}`)
      );

      switch (step.action) {
        case "create_backup":
          backupPath = await createLocalBackup(docId);
          break;

        case "restore_pre_fagner":
          await restoreToState(docId, step.targetState);
          console.log(
            chalk.green(
              `✅ Restored to pre-Fagner state (${
                step.targetState?.sections?.length || 0
              } sections)`
            )
          );
          break;

        case "apply_modification":
          await applyModification(docId, step.modification);
          console.log(
            chalk.green(
              `✅ Applied modification by ${step.modification.performedByName}`
            )
          );
          break;

        default:
          console.log(chalk.yellow(`⚠️  Unknown action: ${step.action}`));
      }
    }

    console.log(chalk.green.bold("\n🎉 RESTORATION COMPLETED SUCCESSFULLY!"));
    console.log(`💾 Backup saved at: ${backupPath}`);
  } catch (error) {
    console.error(chalk.red.bold(`\n💥 RESTORATION FAILED: ${error.message}`));

    if (backupPath) {
      console.log(
        chalk.yellow(`💾 You can restore from backup: ${backupPath}`)
      );
    }

    throw error;
  }
}

async function restoreToState(docId, targetState) {
  console.log(chalk.gray("   → Updating Firestore document..."));

  const docRef = db.collection("Notebooks").doc(docId);

  // Use the exact state from the audit log
  await docRef.set(targetState, { merge: false }); // merge: false = complete replacement

  console.log(chalk.gray("   → Document updated successfully"));
}

async function applyModification(docId, modification) {
  console.log(
    chalk.gray(`   → Applying ${modification.operationType} operation...`)
  );

  const docRef = db.collection("Notebooks").doc(docId);

  if (modification.operationType === "update") {
    // For updates, we'll use the afterData state
    await docRef.set(modification.afterData, { merge: false });
  } else if (modification.operationType === "create") {
    // For creates, use afterData
    await docRef.set(modification.afterData, { merge: false });
  } else {
    console.log(
      chalk.yellow(
        `   ⚠️  Unsupported operation type: ${modification.operationType}`
      )
    );
  }

  console.log(chalk.gray("   → Modification applied successfully"));
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold("🔧 NOTEBOOK RESTORATION SYSTEM"));
    console.log(`📘 Target notebook: ${targetDocId}`);
    console.log(
      `🎯 Mode: ${
        isDryRun ? "DRY RUN (preview only)" : "EXECUTE (will modify Firestore)"
      }`
    );
    console.log("=".repeat(80));

    // Load audit logs
    console.log(chalk.gray("Loading audit logs..."));
    const auditLogs = loadAuditLogs(targetDocId);

    if (auditLogs.length === 0) {
      console.error("❌ No audit logs found");
      process.exit(1);
    }

    console.log(chalk.green(`✅ Loaded ${auditLogs.length} audit log entries`));

    // Analyze restoration requirements
    const analysis = analyzeRestoration(auditLogs);

    // Generate restoration plan
    const plan = generateRestorationPlan(analysis);

    // Display the plan
    displayRestorationPlan(plan);

    if (isDryRun) {
      console.log(chalk.blue.bold("\n🔍 DRY RUN COMPLETE"));
      console.log("This was a preview only. No changes were made.");
      console.log("Run with --execute to perform the actual restoration.");
    } else if (isExecute) {
      // Ask for confirmation
      console.log(
        chalk.yellow("\n⚠️  You are about to modify the Firestore document!")
      );
      console.log("This operation will:");
      console.log("1. Create a local backup");
      console.log("2. Replace the current content with pre-Fagner content");
      console.log("3. Re-apply all post-Fagner modifications");
      console.log("\nContinuing in 3 seconds...");

      // Wait 3 seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Execute the restoration
      await executeRestoration(plan, targetDocId);
    }
  } catch (error) {
    console.error(chalk.red(`💥 Error: ${error.message}`));
    process.exit(1);
  }
})();
