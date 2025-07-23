/*
 * intelligent_corruption_recovery.js – Advanced system to recover from data corruption
 * by identifying the corruption point and restoring from before it while preserving
 * all legitimate subsequent changes
 *
 * ------------------------------------------------------------
 * Usage:
 *   node intelligent_corruption_recovery.js <notebookId> [--corruption-date=YYYY-MM-DD] [--dry-run] [--force]
 *
 * Example:
 *   node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=2025-07-02 --dry-run
 *   node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=2025-07-02 --force
 *
 * ------------------------------------------------------------
 * This system will:
 *   • Identify the exact corruption event on the specified date
 *   • Find the last clean state before the corruption
 *   • Identify all legitimate changes made after the corruption
 *   • Restore to the clean state and re-apply legitimate changes
 *   • Provide detailed analysis and preview of all operations
 *
 * © 2025 Cosseno.com – Intelligent Recovery System
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

// Parse corruption date
let corruptionDate = null;
const corruptionDateArg = args.find((arg) =>
  arg.startsWith("--corruption-date=")
);
if (corruptionDateArg) {
  corruptionDate = corruptionDateArg.split("=")[1];
} else {
  corruptionDate = "2025-07-02"; // Default based on your findings
}

if (!notebookId) {
  console.error(
    "\n❌ Usage: node intelligent_corruption_recovery.js <notebookId> [--corruption-date=YYYY-MM-DD] [--dry-run] [--force]"
  );
  console.error("  notebookId: The document ID to recover");
  console.error(
    "  --corruption-date: Date when corruption occurred (default: 2025-07-02)"
  );
  console.error("  --dry-run: Preview recovery plan without applying changes");
  console.error("  --force: Skip confirmation prompts");
  console.error(
    "\nExample: node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=2025-07-02 --dry-run"
  );
  process.exit(1);
}

// Constants
const BACKUP_DIR = path.join(__dirname, "recovery_backups");
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

function isLegitimateChange(logEntry, corruptionTimestamp) {
  // A change is legitimate if:
  // 1. It happened after corruption
  // 2. It shows reasonable section operations (add/remove/update, not mass replacement)
  // 3. It preserves existing section IDs where appropriate

  if (logEntry.performedAt <= corruptionTimestamp) {
    return false; // Before or during corruption
  }

  const beforeSections = logEntry.beforeData?.sections || [];
  const afterSections = logEntry.afterData?.sections || [];
  const beforeCount = beforeSections.length;
  const afterCount = afterSections.length;
  const sectionChange = Math.abs(afterCount - beforeCount);

  // Analyze the nature of the change by comparing section IDs
  const beforeIds = new Set(beforeSections.map((s) => s.id).filter(Boolean));
  const afterIds = new Set(afterSections.map((s) => s.id).filter(Boolean));

  const preservedIds = new Set([...beforeIds].filter((id) => afterIds.has(id)));
  const addedIds = new Set([...afterIds].filter((id) => !beforeIds.has(id)));
  const removedIds = new Set([...beforeIds].filter((id) => !afterIds.has(id)));

  const preservationRate =
    beforeIds.size > 0 ? preservedIds.size / beforeIds.size : 1;

  console.log(
    chalk.gray(
      `      Analyzing change: ${beforeCount} → ${afterCount} sections`
    )
  );
  console.log(
    chalk.gray(
      `      Preserved: ${preservedIds.size}/${beforeIds.size} (${Math.round(
        preservationRate * 100
      )}%), Added: ${addedIds.size}, Removed: ${removedIds.size}`
    )
  );

  // Red flags for suspicious changes:

  // 1. Mass replacement with low preservation rate
  if (beforeCount > 10 && preservationRate < 0.3) {
    console.log(
      chalk.yellow(
        `⚠️  Suspicious: Low preservation rate (${Math.round(
          preservationRate * 100
        )}%) in large change by ${logEntry.performedByName}`
      )
    );
    return false;
  }

  // 2. Complete array replacement (no preserved IDs but both arrays are non-empty)
  if (beforeCount > 0 && afterCount > 0 && preservedIds.size === 0) {
    console.log(
      chalk.yellow(
        `⚠️  Suspicious: Complete array replacement by ${logEntry.performedByName}`
      )
    );
    return false;
  }

  // 3. Massive deletions (removing more than 50% of sections)
  if (beforeCount > 5 && removedIds.size > beforeCount * 0.5) {
    console.log(
      chalk.yellow(
        `⚠️  Suspicious: Massive deletion (${removedIds.size}/${beforeCount}) by ${logEntry.performedByName}`
      )
    );
    return false;
  }

  // Green flags for legitimate changes:

  // 1. Pure additions (no removals)
  if (removedIds.size === 0 && addedIds.size > 0) {
    console.log(
      chalk.green(`✅ Legitimate: Pure addition of ${addedIds.size} sections`)
    );
    return true;
  }

  // 2. Small modifications with high preservation
  if (sectionChange <= 5) {
    console.log(
      chalk.green(`✅ Legitimate: Small change (±${sectionChange} sections)`)
    );
    return true;
  }

  // 3. High preservation rate
  if (preservationRate >= 0.8) {
    console.log(
      chalk.green(
        `✅ Legitimate: High preservation rate (${Math.round(
          preservationRate * 100
        )}%)`
      )
    );
    return true;
  }

  // 4. Check if it's updates to existing sections (same IDs, different content)
  if (
    beforeIds.size === afterIds.size &&
    preservedIds.size === beforeIds.size
  ) {
    console.log(
      chalk.green(`✅ Legitimate: Section updates without structural changes`)
    );
    return true;
  }

  // Default: consider it legitimate but flag for review
  console.log(
    chalk.yellow(
      `❓ Uncertain: Change needs review (${beforeCount} → ${afterCount}, ${Math.round(
        preservationRate * 100
      )}% preserved)`
    )
  );
  return true;
}

// Core recovery logic
class IntelligentCorruptionRecovery {
  constructor(notebookId, corruptionDate) {
    this.notebookId = notebookId;
    this.corruptionDate = corruptionDate;
    this.auditLogs = [];
    this.currentState = null;
    this.corruptionEvent = null;
    this.preCorruptionState = null;
    this.legitimateChanges = [];
    this.suspiciousChanges = [];
    this.backupPath = null;
  }

  async initialize() {
    console.log(
      chalk.blue.bold("🔧 INITIALIZING INTELLIGENT CORRUPTION RECOVERY")
    );
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

    // Identify corruption event
    console.log(`🔍 Identifying corruption event on ${this.corruptionDate}...`);
    this.identifyCorruptionEvent();

    // Find pre-corruption state
    console.log("⏰ Finding last clean state before corruption...");
    this.findPreCorruptionState();

    // Analyze post-corruption changes
    console.log("📝 Analyzing post-corruption changes...");
    this.analyzePostCorruptionChanges();

    console.log(chalk.green("✅ Analysis complete!\n"));
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

  identifyCorruptionEvent() {
    const corruptionStart = new Date(
      `${this.corruptionDate}T00:00:00.000Z`
    ).getTime();
    const corruptionEnd = new Date(
      `${this.corruptionDate}T23:59:59.999Z`
    ).getTime();

    console.log(
      chalk.gray(
        `   Searching for events between ${this.corruptionDate}T00:00:00Z and ${this.corruptionDate}T23:59:59Z`
      )
    );

    const candidateEvents = [];

    for (const logEntry of this.auditLogs) {
      const logTime = new Date(logEntry.performedAt * 1000).getTime();

      if (logTime >= corruptionStart && logTime <= corruptionEnd) {
        const beforeSections = getSectionsLength(logEntry.beforeData);
        const afterSections = getSectionsLength(logEntry.afterData);

        if (beforeSections !== afterSections) {
          candidateEvents.push({
            ...logEntry,
            beforeSections,
            afterSections,
            sectionChange: afterSections - beforeSections,
          });
        }
      }
    }

    if (candidateEvents.length === 0) {
      throw new Error(`❌ No section changes found on ${this.corruptionDate}`);
    }

    // Sort by magnitude of change (largest first) to find the most likely corruption event
    candidateEvents.sort(
      (a, b) => Math.abs(b.sectionChange) - Math.abs(a.sectionChange)
    );

    this.corruptionEvent = candidateEvents[0];

    console.log(chalk.red(`   🚨 Corruption event identified:`));
    console.log(
      chalk.gray(
        `      Time: ${formatTimestamp(this.corruptionEvent.performedAt)}`
      )
    );
    console.log(
      chalk.gray(
        `      User: ${this.corruptionEvent.performedByName || "Unknown"}`
      )
    );
    console.log(
      chalk.gray(
        `      Sections: ${this.corruptionEvent.beforeSections} → ${
          this.corruptionEvent.afterSections
        } (${this.corruptionEvent.sectionChange >= 0 ? "+" : ""}${
          this.corruptionEvent.sectionChange
        })`
      )
    );

    if (candidateEvents.length > 1) {
      console.log(
        chalk.yellow(
          `   ⚠️  Found ${candidateEvents.length} candidate events. Using largest change.`
        )
      );
    }
  }

  findPreCorruptionState() {
    // Find the last clean state before corruption
    for (let i = this.auditLogs.length - 1; i >= 0; i--) {
      const logEntry = this.auditLogs[i];

      if (logEntry.performedAt < this.corruptionEvent.performedAt) {
        this.preCorruptionState = logEntry.afterData || logEntry.beforeData;

        console.log(chalk.green(`   ✅ Found clean state:`));
        console.log(
          chalk.gray(`      Time: ${formatTimestamp(logEntry.performedAt)}`)
        );
        console.log(
          chalk.gray(`      User: ${logEntry.performedByName || "Unknown"}`)
        );
        console.log(
          chalk.gray(
            `      Sections: ${getSectionsLength(this.preCorruptionState)}`
          )
        );
        return;
      }
    }

    throw new Error("❌ Could not find pre-corruption state in audit logs");
  }

  analyzePostCorruptionChanges() {
    for (const logEntry of this.auditLogs) {
      if (logEntry.performedAt > this.corruptionEvent.performedAt) {
        const change = {
          timestamp: logEntry.performedAt,
          performedBy: logEntry.performedByName,
          beforeData: logEntry.beforeData,
          afterData: logEntry.afterData,
          updatedFields: logEntry.updatedFields || [],
          beforeSections: getSectionsLength(logEntry.beforeData),
          afterSections: getSectionsLength(logEntry.afterData),
        };

        if (isLegitimateChange(logEntry, this.corruptionEvent.performedAt)) {
          this.legitimateChanges.push(change);
        } else {
          this.suspiciousChanges.push(change);
        }
      }
    }

    console.log(
      chalk.green(
        `   ✅ Found ${this.legitimateChanges.length} legitimate changes`
      )
    );
    console.log(
      chalk.yellow(
        `   ⚠️  Found ${this.suspiciousChanges.length} suspicious changes`
      )
    );

    // Show legitimate changes
    this.legitimateChanges.forEach((change, idx) => {
      console.log(
        chalk.gray(
          `      ${idx + 1}. ${formatTimestamp(change.timestamp)} by ${
            change.performedBy
          }`
        )
      );
      console.log(
        chalk.gray(
          `         Sections: ${change.beforeSections} → ${
            change.afterSections
          } (${change.afterSections - change.beforeSections >= 0 ? "+" : ""}${
            change.afterSections - change.beforeSections
          })`
        )
      );
    });

    // Show suspicious changes for review
    if (this.suspiciousChanges.length > 0) {
      console.log(
        chalk.yellow(`\n   ⚠️  SUSPICIOUS CHANGES (will be skipped):`)
      );
      this.suspiciousChanges.forEach((change, idx) => {
        console.log(
          chalk.yellow(
            `      ${idx + 1}. ${formatTimestamp(change.timestamp)} by ${
              change.performedBy
            }`
          )
        );
        console.log(
          chalk.yellow(
            `         Sections: ${change.beforeSections} → ${
              change.afterSections
            } (${change.afterSections - change.beforeSections >= 0 ? "+" : ""}${
              change.afterSections - change.beforeSections
            })`
          )
        );
      });
    }
  }

  async createBackup() {
    createBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.backupPath = path.join(
      BACKUP_DIR,
      `${this.notebookId}_recovery_backup_${timestamp}.json`
    );

    const backupData = {
      timestamp: new Date().toISOString(),
      notebookId: this.notebookId,
      currentState: this.currentState,
      corruptionAnalysis: {
        corruptionDate: this.corruptionDate,
        corruptionEvent: this.corruptionEvent,
        preCorruptionSections: getSectionsLength(this.preCorruptionState),
        legitimateChangesCount: this.legitimateChanges.length,
        suspiciousChangesCount: this.suspiciousChanges.length,
      },
      metadata: {
        sectionsCount: getSectionsLength(this.currentState),
        backupReason: "Pre-corruption-recovery backup",
      },
    };

    fs.writeFileSync(this.backupPath, JSON.stringify(backupData, null, 2));
    console.log(chalk.green(`✅ Recovery backup created: ${this.backupPath}`));
  }

  generateRecoveryPlan() {
    console.log(chalk.blue.bold("\n📋 CORRUPTION RECOVERY PLAN"));
    console.log("=".repeat(80));

    const currentSections = getSectionsLength(this.currentState);
    const preCorruptionSections = getSectionsLength(this.preCorruptionState);

    console.log(`📊 Current state: ${currentSections} sections (corrupted)`);
    console.log(
      `🔄 Pre-corruption state: ${preCorruptionSections} sections (clean)`
    );
    console.log(
      `📝 Legitimate changes to re-apply: ${this.legitimateChanges.length}`
    );
    console.log(
      `⚠️  Suspicious changes to skip: ${this.suspiciousChanges.length}`
    );

    console.log("\n🎯 PLANNED OPERATIONS:");
    console.log(
      `1. 📥 Restore to pre-corruption state (${preCorruptionSections} sections)`
    );

    this.legitimateChanges.forEach((change, idx) => {
      const sectionChange = change.afterSections - change.beforeSections;
      console.log(
        `${idx + 2}. 🔄 Re-apply legitimate change by ${change.performedBy}`
      );
      console.log(`     ${formatTimestamp(change.timestamp)}`);
      console.log(
        `     Sections: ${change.beforeSections} → ${change.afterSections} (${
          sectionChange >= 0 ? "+" : ""
        }${sectionChange})`
      );
      console.log(
        `     Updated fields: ${change.updatedFields.join(", ") || "sections"}`
      );
    });

    const finalSections = this.calculateFinalSectionsCount();
    console.log(`\n🎯 Expected final state: ${finalSections} sections`);

    return {
      currentSections,
      preCorruptionSections,
      legitimateChangesCount: this.legitimateChanges.length,
      suspiciousChangesCount: this.suspiciousChanges.length,
      finalSections,
    };
  }

  calculateFinalSectionsCount() {
    let count = getSectionsLength(this.preCorruptionState);

    for (const change of this.legitimateChanges) {
      count += change.afterSections - change.beforeSections;
    }

    return count;
  }

  async executeRecovery() {
    if (isDryRun) {
      console.log(
        chalk.yellow.bold("\n🧪 DRY RUN MODE - No changes will be applied")
      );
      return;
    }

    console.log(
      chalk.red.bold(
        "\n⚠️  EXECUTING CORRUPTION RECOVERY - This will modify Firestore!"
      )
    );

    if (!isForce) {
      console.log("Use --force flag to execute the recovery");
      return;
    }

    try {
      // Step 1: Restore to pre-corruption state
      console.log("\n📥 Step 1: Restoring to pre-corruption state...");
      await this.restoreToPreCorruptionState();

      // Step 2: Re-apply legitimate changes
      console.log("\n🔄 Step 2: Re-applying legitimate changes...");
      await this.reapplyLegitimateChanges();

      console.log(
        chalk.green.bold("\n✅ CORRUPTION RECOVERY COMPLETED SUCCESSFULLY!")
      );

      // Verify final state
      await this.verifyRecovery();
    } catch (error) {
      console.error(chalk.red.bold("\n❌ RECOVERY FAILED!"));
      console.error("Error:", error.message);
      console.log(
        chalk.yellow(`\n💾 You can restore from backup: ${this.backupPath}`)
      );
      throw error;
    }
  }

  async restoreToPreCorruptionState() {
    const docRef = db.collection("Notebooks").doc(this.notebookId);

    const restorationData = {
      ...this.preCorruptionState,
      restoredAt: Timestamp.now(),
      restoredBy: "intelligent_corruption_recovery",
      corruptionRecoveryNote: `Restored to pre-corruption state from ${this.corruptionDate}`,
      originalCorruptionTimestamp: formatTimestamp(
        this.corruptionEvent.performedAt
      ),
    };

    await docRef.set(restorationData);
    console.log(chalk.green("   ✅ Pre-corruption state restored"));
  }

  async reapplyLegitimateChanges() {
    const docRef = db.collection("Notebooks").doc(this.notebookId);

    for (let i = 0; i < this.legitimateChanges.length; i++) {
      const change = this.legitimateChanges[i];
      console.log(
        `   🔄 Applying change ${i + 1}/${this.legitimateChanges.length}`
      );
      console.log(
        `      By: ${change.performedBy} at ${formatTimestamp(
          change.timestamp
        )}`
      );

      // Get current state
      const currentDoc = await docRef.get();
      const currentData = currentDoc.data();

      // Apply the change intelligently
      const updatedData = this.mergeChange(currentData, change);

      await docRef.set(updatedData);
      console.log(chalk.green(`      ✅ Applied successfully`));
    }
  }

  mergeChange(currentData, change) {
    const updatedData = { ...currentData };

    // Handle sections array specially - we need to preserve clean sections and add new ones
    if (
      change.updatedFields.includes("sections") ||
      change.updatedFields.length === 0
    ) {
      if (change.afterData && change.afterData.sections) {
        updatedData.sections = this.mergeSectionsIntelligently(
          currentData.sections || [],
          change.beforeData?.sections || [],
          change.afterData.sections || []
        );
      }
    }

    // Apply other fields normally (non-sections fields)
    for (const field of change.updatedFields) {
      if (
        field !== "sections" &&
        change.afterData &&
        change.afterData[field] !== undefined
      ) {
        updatedData[field] = change.afterData[field];
      }
    }

    // Add metadata
    updatedData.lastModifiedAt = Timestamp.now();
    updatedData.changeReappliedBy = "intelligent_corruption_recovery";
    updatedData.originalChangeTimestamp = formatTimestamp(change.timestamp);

    return updatedData;
  }

  mergeSectionsIntelligently(
    currentSections,
    changeBeforeSections,
    changeAfterSections
  ) {
    // currentSections = what we have now (clean state + previously added sections)
    // changeBeforeSections = what the sections looked like before this change
    // changeAfterSections = what the sections looked like after this change

    console.log(
      `      Merging sections: ${currentSections.length} current, ${changeBeforeSections.length} → ${changeAfterSections.length} in change`
    );

    // Create ID maps for efficient lookup
    const currentSectionsMap = new Map();
    const beforeChangeMap = new Map();
    const afterChangeMap = new Map();

    currentSections.forEach((section) => {
      if (section.id) {
        currentSectionsMap.set(section.id, section);
      }
    });

    changeBeforeSections.forEach((section) => {
      if (section.id) {
        beforeChangeMap.set(section.id, section);
      }
    });

    changeAfterSections.forEach((section) => {
      if (section.id) {
        afterChangeMap.set(section.id, section);
      }
    });

    // Start with current sections (clean state + previously added)
    const resultSections = [...currentSections];
    let addedCount = 0;
    let updatedCount = 0;

    // Find sections that were added in this change (exist in after but not in before)
    for (const [sectionId, afterSection] of afterChangeMap) {
      if (!beforeChangeMap.has(sectionId)) {
        // This is a new section added in this change
        if (!currentSectionsMap.has(sectionId)) {
          // And we don't already have it, so add it
          resultSections.push(afterSection);
          addedCount++;
          console.log(
            `        ➕ Adding new section: ${
              afterSection.title || afterSection.id
            }`
          );
        } else {
          console.log(
            `        ↻ Section already exists: ${
              afterSection.title || afterSection.id
            }`
          );
        }
      } else {
        // This section existed before the change - check if it was updated
        const beforeSection = beforeChangeMap.get(sectionId);
        if (JSON.stringify(beforeSection) !== JSON.stringify(afterSection)) {
          // Section was updated in this change
          const currentIndex = resultSections.findIndex(
            (s) => s.id === sectionId
          );
          if (currentIndex >= 0) {
            // Update the existing section with the new data
            resultSections[currentIndex] = afterSection;
            updatedCount++;
            console.log(
              `        🔄 Updating section: ${
                afterSection.title || afterSection.id
              }`
            );
          }
        }
      }
    }

    // Check for sections that were removed in this change
    let removedCount = 0;
    for (const [sectionId, beforeSection] of beforeChangeMap) {
      if (!afterChangeMap.has(sectionId)) {
        // This section was removed in this change
        const currentIndex = resultSections.findIndex(
          (s) => s.id === sectionId
        );
        if (currentIndex >= 0) {
          // Remove it from our result
          resultSections.splice(currentIndex, 1);
          removedCount++;
          console.log(
            `        ➖ Removing section: ${
              beforeSection.title || beforeSection.id
            }`
          );
        }
      }
    }

    console.log(
      `        📊 Merge result: +${addedCount} added, ~${updatedCount} updated, -${removedCount} removed, total: ${resultSections.length}`
    );

    return resultSections;
  }

  async verifyRecovery() {
    console.log("\n🔍 Verifying recovery...");

    const docRef = db.collection("Notebooks").doc(this.notebookId);
    const doc = await docRef.get();
    const finalState = doc.data();

    const finalSections = getSectionsLength(finalState);
    const expectedSections = this.calculateFinalSectionsCount();

    console.log(`   Final sections count: ${finalSections}`);
    console.log(`   Expected sections count: ${expectedSections}`);

    if (finalSections === expectedSections) {
      console.log(chalk.green("   ✅ Recovery verification PASSED"));
    } else {
      console.log(
        chalk.yellow(
          "   ⚠️  Recovery verification WARNING: Section count mismatch"
        )
      );
    }
  }

  generateReport() {
    console.log(chalk.blue.bold("\n📊 CORRUPTION RECOVERY REPORT"));
    console.log("=".repeat(80));

    console.log(`📘 Notebook: ${this.notebookId}`);
    console.log(`📅 Corruption date: ${this.corruptionDate}`);
    console.log(
      `🚨 Corruption time: ${formatTimestamp(this.corruptionEvent.performedAt)}`
    );
    console.log(
      `👤 Corruption by: ${this.corruptionEvent.performedByName || "Unknown"}`
    );
    console.log(`💾 Backup location: ${this.backupPath || "Not created yet"}`);
    console.log(`🧪 Mode: ${isDryRun ? "DRY RUN" : "LIVE EXECUTION"}`);

    const plan = this.generateRecoveryPlan();

    console.log("\n📈 SECTION ANALYSIS:");
    console.log(
      `   Before corruption: ${getSectionsLength(this.preCorruptionState)}`
    );
    console.log(`   After corruption: ${this.corruptionEvent.afterSections}`);
    console.log(`   Current state: ${plan.currentSections}`);
    console.log(`   Expected after recovery: ${plan.finalSections}`);

    console.log("\n🔄 CHANGES TO PROCESS:");
    console.log(
      `   Legitimate changes to re-apply: ${plan.legitimateChangesCount}`
    );
    console.log(
      `   Suspicious changes to skip: ${plan.suspiciousChangesCount}`
    );

    console.log("\n" + "=".repeat(80));
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.blue.bold("🚀 INTELLIGENT CORRUPTION RECOVERY SYSTEM"));
    console.log(chalk.gray(`Notebook ID: ${notebookId}`));
    console.log(chalk.gray(`Corruption Date: ${corruptionDate}`));
    console.log(chalk.gray(`Mode: ${isDryRun ? "DRY RUN" : "LIVE EXECUTION"}`));
    console.log("=".repeat(80));

    const recoverySystem = new IntelligentCorruptionRecovery(
      notebookId,
      corruptionDate
    );

    // Initialize the system
    await recoverySystem.initialize();

    // Create backup of current state
    if (!isDryRun) {
      console.log("\n💾 Creating recovery backup...");
      await recoverySystem.createBackup();
    }

    // Generate recovery plan and report
    recoverySystem.generateReport();

    // Execute recovery if not dry run
    await recoverySystem.executeRecovery();
  } catch (error) {
    console.error(chalk.red.bold("\n❌ SYSTEM ERROR:"), error.message);
    process.exit(1);
  }
}

main();
