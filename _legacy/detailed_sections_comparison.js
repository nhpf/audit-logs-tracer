import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadAuditLogs(notebookId) {
  const filePath = path.join(__dirname, `audit_logs_${notebookId}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Audit logs file not found: ${filePath}`);
    return [];
  }
  
  const data = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(data);
  
  // Handle different file structures
  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  } else {
    console.log(`❌ Unexpected audit logs file structure`);
    return [];
  }
}

function loadSectionsLogs(notebookId) {
  const filePath = path.join(__dirname, `sections_logs_${notebookId}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Sections logs file not found: ${filePath}`);
    return [];
  }
  
  const data = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(data);
  
  // Handle different file structures
  if (Array.isArray(parsed)) {
    return parsed;
  } else if (parsed.logs && Array.isArray(parsed.logs)) {
    return parsed.logs;
  } else {
    console.log(`❌ Unexpected sections logs file structure`);
    return [];
  }
}

function findMajorSectionChanges(sectionsLogs, threshold = 5) {
  const majorChanges = [];
  
  for (let i = 0; i < sectionsLogs.length; i++) {
    const log = sectionsLogs[i];
    const lengthChange = Math.abs(log.lengthChange || 0);
    
    if (lengthChange >= threshold) {
      majorChanges.push({
        index: i,
        timestamp: log.timestamp,
        performedByName: log.performedByName || 'Unknown',
        beforeLength: log.beforeLength,
        afterLength: log.afterLength,
        lengthChange: log.lengthChange,
        description: log.shortDescription || 'No description'
      });
    }
  }
  
  return majorChanges.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function extractSectionsFromAuditLog(auditLog) {
  const before = auditLog.before || {};
  const after = auditLog.after || {};
  
  return {
    beforeSections: before.sections || [],
    afterSections: after.sections || []
  };
}

function findAuditLogByTimestamp(auditLogs, timestamp, tolerance = 5000) {
  const targetTime = new Date(timestamp).getTime();
  
  return auditLogs.find(log => {
    const logTime = new Date(log.timestamp).getTime();
    return Math.abs(logTime - targetTime) <= tolerance;
  });
}

function compareSections(beforeSections, afterSections) {
  const comparison = {
    preserved: [],
    removed: [],
    added: [],
    totallyReplaced: false
  };
  
  // Create maps for easier comparison
  const beforeMap = new Map();
  const afterMap = new Map();
  
  beforeSections.forEach((section, index) => {
    const key = section.id || section.title || `index_${index}`;
    beforeMap.set(key, { ...section, originalIndex: index });
  });
  
  afterSections.forEach((section, index) => {
    const key = section.id || section.title || `index_${index}`;
    afterMap.set(key, { ...section, originalIndex: index });
  });
  
  // Find preserved sections (same id/title)
  for (const [key, beforeSection] of beforeMap) {
    if (afterMap.has(key)) {
      comparison.preserved.push({
        key,
        beforeIndex: beforeSection.originalIndex,
        afterIndex: afterMap.get(key).originalIndex,
        title: beforeSection.title || key
      });
    } else {
      comparison.removed.push({
        key,
        index: beforeSection.originalIndex,
        title: beforeSection.title || key
      });
    }
  }
  
  // Find added sections
  for (const [key, afterSection] of afterMap) {
    if (!beforeMap.has(key)) {
      comparison.added.push({
        key,
        index: afterSection.originalIndex,
        title: afterSection.title || key
      });
    }
  }
  
  // Check if it's a total replacement (no preserved sections and both arrays non-empty)
  comparison.totallyReplaced = comparison.preserved.length === 0 && 
                              beforeSections.length > 0 && 
                              afterSections.length > 0;
  
  return comparison;
}

function formatComparisonReport(change, comparison, beforeSections, afterSections) {
  console.log('\n' + '='.repeat(80));
  console.log(`📅 ${change.timestamp}`);
  console.log(`👤 ${change.performedByName}`);
  console.log(`📊 Length Change: ${change.beforeLength} → ${change.afterLength} (${change.lengthChange > 0 ? '+' : ''}${change.lengthChange})`);
  console.log(`📝 ${change.description}`);
  console.log('='.repeat(80));
  
  if (comparison.totallyReplaced) {
    console.log('🔄 **TOTAL REPLACEMENT**: All sections were completely replaced');
  } else {
    console.log(`✅ Preserved: ${comparison.preserved.length} sections`);
    console.log(`❌ Removed: ${comparison.removed.length} sections`);
    console.log(`➕ Added: ${comparison.added.length} sections`);
  }
  
  if (comparison.preserved.length > 0 && comparison.preserved.length <= 10) {
    console.log('\n📋 **PRESERVED SECTIONS:**');
    comparison.preserved.forEach(section => {
      console.log(`  • [${section.beforeIndex}→${section.afterIndex}] ${section.title}`);
    });
  }
  
  if (comparison.removed.length > 0 && comparison.removed.length <= 15) {
    console.log('\n🗑️  **REMOVED SECTIONS:**');
    comparison.removed.forEach(section => {
      console.log(`  • [${section.index}] ${section.title}`);
    });
  }
  
  if (comparison.added.length > 0 && comparison.added.length <= 15) {
    console.log('\n🆕 **ADDED SECTIONS:**');
    comparison.added.forEach(section => {
      console.log(`  • [${section.index}] ${section.title}`);
    });
  }
  
  if (comparison.preserved.length > 10 || comparison.removed.length > 15 || comparison.added.length > 15) {
    console.log('\n💡 (Some lists truncated for readability - too many items to display)');
  }
}

async function analyzeMajorSectionChanges(notebookId) {
  console.log(`🔍 Analyzing major section changes for Notebook: ${notebookId}`);
  
  const auditLogs = loadAuditLogs(notebookId);
  const sectionsLogs = loadSectionsLogs(notebookId);
  
  if (auditLogs.length === 0 || sectionsLogs.length === 0) {
    console.log('❌ No audit logs or sections logs found');
    return;
  }
  
  console.log(`📊 Total audit logs: ${auditLogs.length}`);
  console.log(`📊 Total section changes: ${sectionsLogs.length}`);
  
  const majorChanges = findMajorSectionChanges(sectionsLogs, 5);
  console.log(`🎯 Found ${majorChanges.length} major section changes (±5 or more sections)`);
  
  for (const change of majorChanges) {
    const auditLog = findAuditLogByTimestamp(auditLogs, change.timestamp);
    
    if (!auditLog) {
      console.log(`\n⚠️  Could not find audit log for change at ${change.timestamp}`);
      continue;
    }
    
    const { beforeSections, afterSections } = extractSectionsFromAuditLog(auditLog);
    
    if (beforeSections.length === 0 && afterSections.length === 0) {
      console.log(`\n⚠️  No sections data found in audit log for ${change.timestamp}`);
      continue;
    }
    
    const comparison = compareSections(beforeSections, afterSections);
    formatComparisonReport(change, comparison, beforeSections, afterSections);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis complete!');
}

// Main execution
const notebookId = process.argv[2];
if (!notebookId) {
  console.log('❌ Please provide a notebook ID');
  console.log('Usage: node detailed_sections_comparison.js <notebookId>');
  process.exit(1);
}

analyzeMajorSectionChanges(notebookId);
