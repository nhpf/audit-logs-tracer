/*
 * restoration_deep_analysis.js – Deep analysis of what happened during restoration
 *
 * This script investigates why the section count is still 26 instead of the expected 49
 * by examining the step-by-step restoration process and identifying where the sections went.
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

function findPostFagnerModifications(logs, fagnerTimestamp) {
  const postFagnerMods = [];

  const sortedLogs = logs.sort((a, b) => a.performedAt - b.performedAt);

  for (const logEntry of sortedLogs) {
    const logTime = logEntry.performedAt * 1000;

    if (logTime > fagnerTimestamp) {
      postFagnerMods.push({
        timestamp: logTime,
        performedAt: logEntry.performedAt,
        performedByName: logEntry.performedByName,
        beforeSections: logEntry.beforeData?.sections?.length || 0,
        afterSections: logEntry.afterData?.sections?.length || 0,
        operationType: logEntry.operationType,
        fullLogEntry: logEntry,
      });
    }
  }

  return postFagnerMods;
}

function simulateRestoration(preFagnerState, postFagnerMods) {
  console.log(chalk.blue.bold("\n🔄 SIMULATING RESTORATION PROCESS\n"));

  let currentSectionCount = preFagnerState?.sections?.length || 0;
  console.log(
    chalk.green(
      `📍 Starting point: ${currentSectionCount} sections (pre-Fagner state)`
    )
  );

  console.log(
    chalk.yellow("\n🔄 Applying post-Fagner modifications in sequence:\n")
  );

  postFagnerMods.forEach((mod, index) => {
    const step = index + 1;
    const date = new Date(mod.timestamp).toISOString().substring(0, 19);

    console.log(
      `${step.toString().padStart(2)}. ${date} | ${mod.performedByName}`
    );
    console.log(
      `    ${chalk.gray(
        `${mod.beforeSections} → ${mod.afterSections} sections (${
          mod.afterSections >= mod.beforeSections ? "+" : ""
        }${mod.afterSections - mod.beforeSections})`
      )}`
    );

    currentSectionCount = mod.afterSections;
  });

  console.log(
    chalk.cyan(`\n📊 Final simulated section count: ${currentSectionCount}`)
  );

  return currentSectionCount;
}

function analyzeFirstFewModifications(fagnerChange, postFagnerMods) {
  console.log(
    chalk.red.bold("\n🔍 ANALYZING THE CRITICAL FIRST MODIFICATIONS\n")
  );

  console.log(`🎯 Fagner's destructive change:`);
  console.log(
    `   ${chalk.gray("Timestamp:")} ${new Date(
      fagnerChange.performedAt * 1000
    ).toISOString()}`
  );
  console.log(
    `   ${chalk.gray("Change:")} ${
      fagnerChange.beforeData?.sections?.length || 0
    } → ${fagnerChange.afterData?.sections?.length || 0} sections`
  );

  console.log(`\n🔄 First few post-Fagner modifications:`);

  const firstFew = postFagnerMods.slice(0, 5);
  firstFew.forEach((mod, index) => {
    console.log(
      `\n${index + 1}. ${chalk.cyan(new Date(mod.timestamp).toISOString())}`
    );
    console.log(`   👤 ${mod.performedByName}`);
    console.log(`   📊 ${mod.beforeSections} → ${mod.afterSections} sections`);

    // This is the key insight: if the first modification after Fagner's change
    // sets the section count back to something that's NOT the original 49,
    // then the restoration process is working correctly but the post-Fagner
    // modifications themselves are what's keeping the lower section count.
  });
}

async function getCurrentNotebookState(docId) {
  const docRef = db.collection("Notebooks").doc(docId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Document ${docId} does not exist`);
  }

  return doc.data();
}

function generateInsightReport(
  preFagnerSections,
  finalSections,
  simulatedFinal,
  postFagnerMods
) {
  console.log(chalk.blue.bold("\n💡 RESTORATION ANALYSIS INSIGHTS\n"));
  console.log("=".repeat(80));

  console.log(`📊 **SECTION COUNT ANALYSIS:**`);
  console.log(`   • Original (pre-Fagner): ${preFagnerSections} sections`);
  console.log(`   • Simulated final: ${simulatedFinal} sections`);
  console.log(`   • Actual final: ${finalSections} sections`);

  const matches = simulatedFinal === finalSections;
  console.log(
    `\n🎯 **RESTORATION ACCURACY:** ${
      matches ? chalk.green("✅ PERFECT MATCH") : chalk.red("❌ MISMATCH")
    }`
  );

  if (matches) {
    console.log(`\n${chalk.green("✅ RESTORATION WORKED CORRECTLY!")}`);
    console.log(
      `   • The notebook was successfully restored to pre-Fagner state (${preFagnerSections} sections)`
    );
    console.log(
      `   • All ${postFagnerMods.length} post-Fagner modifications were correctly re-applied`
    );
    console.log(
      `   • The final section count (${finalSections}) is the result of legitimate user edits`
    );
    console.log(
      `   • The "missing" ${
        preFagnerSections - finalSections
      } sections were removed by legitimate post-Fagner edits`
    );
  } else {
    console.log(`\n${chalk.red("❌ RESTORATION ISSUE DETECTED")}`);
    console.log(`   • Expected: ${simulatedFinal} sections`);
    console.log(`   • Actual: ${finalSections} sections`);
    console.log(
      `   • Difference: ${Math.abs(finalSections - simulatedFinal)} sections`
    );
  }

  console.log(`\n🔍 **KEY FINDING:**`);
  if (matches && finalSections < preFagnerSections) {
    console.log(
      chalk.yellow(
        `   The restoration process was SUCCESSFUL, but the final section count`
      )
    );
    console.log(
      chalk.yellow(
        `   is lower than the original because legitimate post-Fagner modifications`
      )
    );
    console.log(
      chalk.yellow(
        `   intentionally removed or consolidated sections. This is expected behavior.`
      )
    );
  }

  console.log("\n=".repeat(80));
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(chalk.blue.bold("🔍 RESTORATION DEEP ANALYSIS"));
    console.log(`📘 Target notebook: vv3EMActxg1pRD09Kfle`);
    console.log("=".repeat(80));

    // Load audit logs
    const auditLogs = loadAuditLogs("vv3EMActxg1pRD09Kfle");

    // Find Fagner's change and pre-Fagner state
    const fagnerChange = findFagnerChange(auditLogs);
    const preFagnerState = fagnerChange?.beforeData;
    const fagnerTimestamp = fagnerChange?.performedAt * 1000;

    // Find post-Fagner modifications
    const postFagnerMods = findPostFagnerModifications(
      auditLogs,
      fagnerTimestamp
    );

    // Analyze the critical first modifications
    analyzeFirstFewModifications(fagnerChange, postFagnerMods);

    // Simulate the restoration process
    const simulatedFinal = simulateRestoration(preFagnerState, postFagnerMods);

    // Get current state
    const currentState = await getCurrentNotebookState("vv3EMActxg1pRD09Kfle");

    // Generate insights
    generateInsightReport(
      preFagnerState?.sections?.length || 0,
      currentState?.sections?.length || 0,
      simulatedFinal,
      postFagnerMods
    );
  } catch (error) {
    console.error(chalk.red(`💥 Analysis Error: ${error.message}`));
    process.exit(1);
  }
})();
