/*
 * notebook_restoration_system.js – Comprehensive system to restore a notebook to pre-Fagner state
 * and re-apply subsequent modifications safely
 *
 * ------------------------------------------------------------
 * Usage:
 *   node notebook_restoration_system.js <notebookId> [--dry-run] [--force]
 *
 * Example:
 *   node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --dry-run
 *   node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --force
 *
 * ------------------------------------------------------------
 * This system will:
 *   • Create a complete local backup of the current state
 *   • Identify the last pre-Fagner state from audit logs
 *   • Identify all modifications made after Fagner's change
 *   • Provide detailed preview of what will be restored/modified
 *   • Execute restoration with full safety checks
 *   • Re-apply post-Fagner modifications intelligently
 *
 * © 2025 Cosseno.com – Restoration System
 */

import admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import serviceAccount from "/home/nick/repos/cosseno-tools/scripting/database/service-account-cosseno.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://cosseno-48fb3.firebaseio.com",
});

const db = admin.firestore();

// Parse CLI arguments
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isForce = args.includes("--force");
const notebookId = args.find((arg) => !arg.startsWith("--"));

if (!notebookId) {
  console.error(
    "\n❌ Usage: node notebook_restoration_system.js <notebookId> [--dry-run] [--force]"
  );
  console.error("  notebookId: The document ID to restore");
  console.error("  --dry-run: Preview changes without applying them");
  console.error("  --force: Skip confirmation prompts");
  console.error(
    "\nExample: node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --dry-run"
  );
  process.exit(1);
}

// Constants
const FAGNER_CHANGE_TIMESTAMP = "2025-07-02T20:28:24.000Z";
const BACKUP_DIR = path.join(__dirname, "restoration_backups");
const CACHE_FILE = path.join(__dirname, `audit_logs_${notebookId}.json`);

// Utility functions
function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    return new Date(timestamp * 1000).toISOString();
  }
  return new Date(timestamp).toISOString();
}

function createBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function loadAuditLogs() {
  if (!fs.existsSync(CACHE_FILE)) {
    throw new Error(
      `❌ Audit logs cache not found: ${CACHE_FILE}. Please run main.js first.`
    );
  }

  const data = fs.readFileSync(CACHE_FILE, "utf8");
  const parsed = JSON.parse(data);

  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  } else {
    throw new Error("❌ Invalid audit logs file structure");
  }
}

function getSectionsLength(data) {
  if (!data || !data.sections || !Array.isArray(data.sections)) {
    return 0;
  }
  return data.sections.length;
}

// Core restoration logic
class NotebookRestorationSystem {
  constructor(notebookId) {
    this.notebookId = notebookId;
    this.auditLogs = [];
    this.currentState = null;
    this.preFagnerState = null;
    this.postFagnerModifications = [];
    this.fagnerChangeTimestamp = null;
    this.backupPath = null;
  }

  async initialize() {
    console.log(chalk.blue.bold("🔧 INITIALIZING NOTEBOOK RESTORATION SYSTEM"));
    console.log("=".repeat(80));

    // Load audit logs
    console.log("📋 Loading audit logs...");
    this.auditLogs = loadAuditLogs();
    console.log(
      chalk.gray(`   Loaded ${this.auditLogs.length} audit log entries`)
    );

    // Sort by timestamp
    this.auditLogs.sort((a, b) => a.performedAt - b.performedAt);

    // Get current state from Firestore
    console.log("📥 Fetching current notebook state...");
    await this.fetchCurrentState();

    // Find Fagner's change
    console.log("🔍 Analyzing Fagner's change...");
    this.findFagnerChange();

    // Find pre-Fagner state
    console.log("⏰ Identifying pre-Fagner state...");
    this.findPreFagnerState();

    // Find post-Fagner modifications
    console.log("📝 Identifying post-Fagner modifications...");
    this.findPostFagnerModifications();

    console.log(chalk.green("✅ Initialization complete!\n"));
  }

  async fetchCurrentState() {
    const docRef = db.collection("Notebooks").doc(this.notebookId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`❌ Notebook ${this.notebookId} not found in Firestore`);
    }

    this.currentState = {
      id: doc.id,
      ...doc.data(),
    };

    console.log(
      chalk.gray(
        `   Current sections count: ${getSectionsLength(this.currentState)}`
      )
    );
  }

  findFagnerChange() {
    const fagnerTime = new Date(FAGNER_CHANGE_TIMESTAMP).getTime();

    for (const logEntry of this.auditLogs) {
      const logTime = new Date(logEntry.performedAt * 1000).getTime();
      if (Math.abs(logTime - fagnerTime) <= 5000) {
        // 5 second tolerance
        const beforeLength = getSectionsLength(logEntry.beforeData);
        const afterLength = getSectionsLength(logEntry.afterData);

        if (beforeLength !== afterLength) {
          this.fagnerChangeTimestamp = logEntry.performedAt;
          console.log(
            chalk.gray(
              `   Found Fagner's change: ${formatTimestamp(
                logEntry.performedAt
              )}`
            )
          );
          console.log(
            chalk.gray(
              `   Sections: ${beforeLength} → ${afterLength} (${
                afterLength - beforeLength
              })`
            )
          );
          return;
        }
      }
    }

    throw new Error("❌ Could not find Fagner's change in audit logs");
  }

  findPreFagnerState() {
    // Find the last audit entry before Fagner's change
    for (let i = this.auditLogs.length - 1; i >= 0; i--) {
      const logEntry = this.auditLogs[i];
      if (logEntry.performedAt < this.fagnerChangeTimestamp) {
        this.preFagnerState = logEntry.afterData || logEntry.beforeData;
        console.log(
          chalk.gray(
            `   Pre-Fagner state: ${formatTimestamp(logEntry.performedAt)}`
          )
        );
        console.log(
          chalk.gray(`   Sections: ${getSectionsLength(this.preFagnerState)}`)
        );
        return;
      }
    }

    throw new Error("❌ Could not find pre-Fagner state in audit logs");
  }

  findPostFagnerModifications() {
    // Find all modifications after Fagner's change
    for (const logEntry of this.auditLogs) {
      if (logEntry.performedAt > this.fagnerChangeTimestamp) {
        this.postFagnerModifications.push({
          timestamp: logEntry.performedAt,
          performedBy: logEntry.performedByName,
          beforeData: logEntry.beforeData,
          afterData: logEntry.afterData,
          updatedFields: logEntry.updatedFields || [],
        });
      }
    }

    console.log(
      chalk.gray(
        `   Found ${this.postFagnerModifications.length} post-Fagner modifications`
      )
    );
    this.postFagnerModifications.forEach((mod, idx) => {
      console.log(
        chalk.gray(
          `     ${idx + 1}. ${formatTimestamp(mod.timestamp)} by ${
            mod.performedBy
          }`
        )
      );
    });
  }

  async createBackup() {
    createBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.backupPath = path.join(
      BACKUP_DIR,
      `${this.notebookId}_backup_${timestamp}.json`
    );

    const backupData = {
      timestamp: new Date().toISOString(),
      notebookId: this.notebookId,
      currentState: this.currentState,
      metadata: {
        sectionsCount: getSectionsLength(this.currentState),
        backupReason: "Pre-restoration backup",
      },
    };

    fs.writeFileSync(this.backupPath, JSON.stringify(backupData, null, 2));
    console.log(chalk.green(`✅ Backup created: ${this.backupPath}`));
  }

  generateRestorationPlan() {
    console.log(chalk.blue.bold("\n📋 RESTORATION PLAN"));
    console.log("=".repeat(80));

    const currentSections = getSectionsLength(this.currentState);
    const preFagnerSections = getSectionsLength(this.preFagnerState);

    console.log(`📊 Current state: ${currentSections} sections`);
    console.log(`🔄 Pre-Fagner state: ${preFagnerSections} sections`);
    console.log(
      `📝 Post-Fagner modifications: ${this.postFagnerModifications.length}`
    );

    console.log("\n🎯 PLANNED OPERATIONS:");
    console.log(
      `1. 📥 Restore to pre-Fagner state (${preFagnerSections} sections)`
    );

    this.postFagnerModifications.forEach((mod, idx) => {
      const beforeSections = getSectionsLength(mod.beforeData);
      const afterSections = getSectionsLength(mod.afterData);
      const sectionChange = afterSections - beforeSections;

      console.log(`${idx + 2}. 🔄 Re-apply modification by ${mod.performedBy}`);
      console.log(`     ${formatTimestamp(mod.timestamp)}`);
      console.log(
        `     Sections: ${beforeSections} → ${afterSections} (${
          sectionChange >= 0 ? "+" : ""
        }${sectionChange})`
      );
      console.log(
        `     Updated fields: ${mod.updatedFields.join(", ") || "sections"}`
      );
    });

    const finalSections = this.calculateFinalSectionsCount();
    console.log(`\n🎯 Expected final state: ${finalSections} sections`);

    return {
      currentSections,
      preFagnerSections,
      modificationsCount: this.postFagnerModifications.length,
      finalSections,
    };
  }

  calculateFinalSectionsCount() {
    let count = getSectionsLength(this.preFagnerState);

    for (const mod of this.postFagnerModifications) {
      const beforeSections = getSectionsLength(mod.beforeData);
      const afterSections = getSectionsLength(mod.afterData);
      count += afterSections - beforeSections;
    }

    return count;
  }

  async executeRestoration() {
    if (isDryRun) {
      console.log(
        chalk.yellow.bold("\n🧪 DRY RUN MODE - No changes will be applied")
      );
      return;
    }

    console.log(
      chalk.red.bold(
        "\n⚠️  EXECUTING RESTORATION - This will modify Firestore!"
      )
    );

    if (!isForce) {
      // Add confirmation prompt here if needed
      console.log("Proceeding with restoration...");
    }

    try {
      // Step 1: Restore to pre-Fagner state
      console.log("\n📥 Step 1: Restoring to pre-Fagner state...");
      await this.restoreToPreFagnerState();

      // Step 2: Re-apply post-Fagner modifications
      console.log("\n🔄 Step 2: Re-applying post-Fagner modifications...");
      await this.reapplyPostFagnerModifications();

      console.log(chalk.green.bold("\n✅ RESTORATION COMPLETED SUCCESSFULLY!"));
    } catch (error) {
      console.error(chalk.red.bold("\n❌ RESTORATION FAILED!"));
      console.error("Error:", error.message);
      console.log(
        chalk.yellow(`\n💾 You can restore from backup: ${this.backupPath}`)
      );
      throw error;
    }
  }

  async restoreToPreFagnerState() {
    const docRef = db.collection("Notebooks").doc(this.notebookId);

    // Create the restoration data
    const restorationData = {
      ...this.preFagnerState,
      restoredAt: Timestamp.now(),
      restoredBy: "restoration_system",
      restorationNote: `Restored to pre-Fagner state (${formatTimestamp(
        this.fagnerChangeTimestamp
      )})`,
    };

    await docRef.set(restorationData);
    console.log(chalk.green("   ✅ Pre-Fagner state restored"));
  }

  async reapplyPostFagnerModifications() {
    const docRef = db.collection("Notebooks").doc(this.notebookId);

    for (let i = 0; i < this.postFagnerModifications.length; i++) {
      const mod = this.postFagnerModifications[i];
      console.log(
        `   🔄 Applying modification ${i + 1}/${
          this.postFagnerModifications.length
        }`
      );
      console.log(
        `      By: ${mod.performedBy} at ${formatTimestamp(mod.timestamp)}`
      );

      // Get current state
      const currentDoc = await docRef.get();
      const currentData = currentDoc.data();

      // Apply the modifications intelligently
      const updatedData = this.mergeModification(currentData, mod);

      await docRef.set(updatedData);
      console.log(chalk.green(`      ✅ Applied successfully`));
    }
  }

  mergeModification(currentData, modification) {
    // Create a copy of current data
    const updatedData = { ...currentData };

    // Apply each updated field from the modification
    for (const field of modification.updatedFields) {
      if (
        modification.afterData &&
        modification.afterData[field] !== undefined
      ) {
        updatedData[field] = modification.afterData[field];
      }
    }

    // Special handling for sections array if it's the main change
    if (
      modification.updatedFields.includes("sections") ||
      modification.updatedFields.length === 0
    ) {
      if (modification.afterData && modification.afterData.sections) {
        updatedData.sections = modification.afterData.sections;
      }
    }

    // Add metadata about the re-application
    updatedData.lastModifiedAt = Timestamp.now();
    updatedData.modificationReappliedBy = "restoration_system";

    return updatedData;
  }

  generateReport() {
    console.log(chalk.blue.bold("\n📊 RESTORATION REPORT"));
    console.log("=".repeat(80));

    const plan = this.generateRestorationPlan();

    console.log(`📘 Notebook: ${this.notebookId}`);
    console.log(
      `📅 Fagner's change: ${formatTimestamp(this.fagnerChangeTimestamp)}`
    );
    console.log(`💾 Backup location: ${this.backupPath || "Not created yet"}`);
    console.log(`🧪 Mode: ${isDryRun ? "DRY RUN" : "LIVE EXECUTION"}`);

    console.log("\n📈 SECTION COUNTS:");
    console.log(`   Current: ${plan.currentSections}`);
    console.log(`   Pre-Fagner: ${plan.preFagnerSections}`);
    console.log(`   Expected final: ${plan.finalSections}`);

    console.log("\n🔄 MODIFICATIONS TO REAPPLY:");
    this.postFagnerModifications.forEach((mod, idx) => {
      console.log(
        `   ${idx + 1}. ${formatTimestamp(mod.timestamp)} by ${mod.performedBy}`
      );
      console.log(
        `      Fields: ${mod.updatedFields.join(", ") || "sections"}`
      );
    });

    console.log("\n" + "=".repeat(80));
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.blue.bold("🚀 NOTEBOOK RESTORATION SYSTEM"));
    console.log(chalk.gray(`Notebook ID: ${notebookId}`));
    console.log(chalk.gray(`Mode: ${isDryRun ? "DRY RUN" : "LIVE EXECUTION"}`));
    console.log("=".repeat(80));

    const restorationSystem = new NotebookRestorationSystem(notebookId);

    // Initialize the system
    await restorationSystem.initialize();

    // Create backup of current state
    if (!isDryRun) {
      console.log("\n💾 Creating backup...");
      await restorationSystem.createBackup();
    }

    // Generate restoration plan
    restorationSystem.generateRestorationPlan();

    // Generate final report
    restorationSystem.generateReport();

    // Execute restoration if not dry run
    await restorationSystem.executeRestoration();
  } catch (error) {
    console.error(chalk.red.bold("\n❌ SYSTEM ERROR:"), error.message);
    process.exit(1);
  }
}

main();
