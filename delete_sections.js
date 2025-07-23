/*
 * delete_sections.js – Delete the last N sections from a Firestore document's sections array
 *
 * ------------------------------------------------------------
 * Usage (from your terminal):
 *   node delete_sections.js <docId> <numberOfSections> [--confirm]
 *
 * Example:
 *   node delete_sections.js vv3EMActxg1pRD09Kfle 87 --confirm
 *
 * ------------------------------------------------------------
 * WARNING: This is a destructive operation! It will permanently remove sections.
 * The script requires --confirm flag to actually perform the deletion.
 *
 * © 2025 Cosseno.com – MIT licence, edit freely.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import chalk from "chalk";

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
const dryRun = !confirmFlag;

// Remove flags from args
const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
const [docId, numberOfSectionsStr] = filteredArgs;

// Default values
const targetDocId = docId || "vv3EMActxg1pRD09Kfle"; // Replace with your document ID
const numberOfSections = parseInt(numberOfSectionsStr) || 87;

if (!targetDocId || !numberOfSectionsStr) {
  console.error(
    "\nUsage: node delete_sections.js <docId> <numberOfSections> [--confirm]"
  );
  console.error("  docId: The document ID to modify");
  console.error(
    "  numberOfSections: Number of sections to remove from the end"
  );
  console.error(
    "  --confirm: Required flag to actually perform the deletion (without this, it's a dry run)"
  );
  console.error(
    "\nExample: node delete_sections.js vv3EMActxg1pRD09Kfle 87 --confirm"
  );
  console.error(
    "\nWARNING: This is a destructive operation that will permanently remove sections!"
  );
  process.exit(1);
}

if (isNaN(numberOfSections) || numberOfSections <= 0) {
  console.error(
    chalk.red("Error: numberOfSections must be a positive integer")
  );
  process.exit(1);
}

// ---------- Main execution ----------
(async () => {
  try {
    console.log(
      chalk.blue.bold(
        `\n🔍 Analyzing document ${targetDocId} in Notebooks collection`
      )
    );

    // Get the current document
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
      console.log(
        chalk.yellow(
          "This would delete ALL sections. If that's intended, use a number equal to the current sections count."
        )
      );
      process.exit(1);
    }

    // Calculate what will be removed and what will remain
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

    // Show a preview of what will be removed (first few and last few)
    console.log(
      chalk.yellow(`\n🗑️  Sections to be removed (showing first 3 and last 3):`)
    );
    const previewStart = sectionsToRemove.slice(0, 3);
    const previewEnd = sectionsToRemove.slice(-3);

    previewStart.forEach((section, index) => {
      const actualIndex = currentSections.length - numberOfSections + index;
      const title =
        section.title || section.name || `Section ${actualIndex + 1}`;
      console.log(
        `  ${chalk.red(`[${actualIndex + 1}]`)} ${title.substring(0, 50)}${
          title.length > 50 ? "..." : ""
        }`
      );
    });

    if (numberOfSections > 6) {
      console.log(
        `  ${chalk.gray("...")} (${
          numberOfSections - 6
        } more sections) ${chalk.gray("...")}`
      );
    }

    if (numberOfSections > 3 && previewEnd.length > 0) {
      previewEnd.forEach((section, index) => {
        const actualIndex = currentSections.length - 3 + index;
        const title =
          section.title || section.name || `Section ${actualIndex + 1}`;
        console.log(
          `  ${chalk.red(`[${actualIndex + 1}]`)} ${title.substring(0, 50)}${
            title.length > 50 ? "..." : ""
          }`
        );
      });
    }

    if (dryRun) {
      console.log(
        chalk.yellow.bold(`\n🚨 DRY RUN MODE - No changes will be made!`)
      );
      console.log(
        chalk.gray(
          "To actually perform this operation, add the --confirm flag:"
        )
      );
      console.log(
        chalk.gray(
          `node delete_sections.js ${targetDocId} ${numberOfSections} --confirm`
        )
      );
      process.exit(0);
    }

    // Final confirmation for destructive operation
    console.log(
      chalk.red.bold(
        `\n⚠️  WARNING: This will permanently delete ${numberOfSections} sections!`
      )
    );
    console.log(chalk.yellow("This operation cannot be undone."));

    // Perform the update
    console.log(chalk.blue("\n🔄 Updating document..."));

    await docRef.update({
      sections: remainingSections,
      updatedAt: new Date(),
      lastModified: new Date(),
    });

    console.log(
      chalk.green.bold(
        `\n✅ Successfully deleted ${numberOfSections} sections!`
      )
    );
    console.log(
      chalk.cyan(
        `Document now has ${remainingSections.length} sections remaining.`
      )
    );

    // Show final state
    console.log(chalk.yellow(`\n📈 Final state:`));
    console.log(`  • Sections before: ${chalk.cyan(currentSections.length)}`);
    console.log(`  • Sections deleted: ${chalk.red(numberOfSections)}`);
    console.log(
      `  • Sections remaining: ${chalk.green(remainingSections.length)}`
    );
  } catch (error) {
    console.error(chalk.red("Error:"), error.message);
    if (error.code) {
      console.error(chalk.red("Error code:"), error.code);
    }
    process.exit(1);
  }
})();
