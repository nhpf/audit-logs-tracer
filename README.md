# Notebook Section Audit & Restoration System

A comprehensive system for auditing and fixing situations where sections in a Firestore Notebook document were replaced with sections from another notebook or corrupted during editing operations.

---

## Currenty Playbook

```bash
# Ensure we download and inspect updated logs
node main.js vv3EMActxg1pRD09Kfle --refresh

# First, analyze the corruption timeline and put a date close to the date in which you diagnosed the problem
node corruption_analysis.js vv3EMActxg1pRD09Kfle --date=2025-07-02

# Preview the intelligent recovery plan
node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=<correct-date> --dry-run

# Execute the recovery after reviewing the plan
node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=<correct-date> --force
```

---

## 🗂️ Repository Overview

This repository contains a sophisticated audit trail analysis and restoration system developed chronologically to handle notebook section corruption issues. The tools have evolved from basic audit log viewing to comprehensive restoration systems.

## 📅 Chronological Development Timeline

### Phase 1: Initial Audit Tools (June 18, 2025)

#### `main.js` - Basic Audit Log Viewer

- **Purpose**: View chronological timeline of all changes to a Firestore document
- **Features**:
  - Fetches audit logs from SchoolAuditLogs collection
  - Shows before/after diffs for each field change
  - Caches results locally to avoid repeated Firestore queries
- **Usage**: `node main.js <docId> [--refresh]`

#### `sections_tracker.js` - Section Length Change Tracker

- **Purpose**: Track specifically when the sections array length changes
- **Features**:
  - Filters audit logs to only show section count changes
  - Shows addition/removal statistics
  - Provides summary of total sections added/removed
- **Usage**: `node sections_tracker.js <docId> [--refresh]`

#### `delete_sections.js` - Basic Section Deletion

- **Purpose**: Delete N sections from the end of a document's sections array
- **Features**:
  - Preview mode (dry run) by default
  - Requires `--confirm` flag for actual deletion
  - Shows preview of sections to be removed
- **Usage**: `node delete_sections.js <docId> <numberOfSections> [--confirm]`

#### `safe_delete_sections.js` - Enhanced Safe Deletion

- **Purpose**: Safer section deletion with backup and auth claims
- **Features**:
  - Sets custom authentication claims for the user
  - Creates before/after backups automatically
  - Enhanced error handling and validation
- **Usage**: `node safe_delete_sections.js <docId> <numberOfSections> <userId> [--confirm]`

#### `compare_with_backup.js` - Backup Comparison Tool

- **Purpose**: Compare current Firestore document with a backup file
- **Features**:
  - Deep comparison of all fields
  - Section-by-section similarity analysis
  - Identifies preserved, removed, and added sections
- **Usage**: `node compare_with_backup.js <docId> <backupFilePath>`

#### `restore_from_backup.js` - Backup Restoration

- **Purpose**: Restore a document from a JSON backup file
- **Features**:
  - Optional pre-restoration backup creation
  - Validation and preview before restoration
  - Complete document replacement
- **Usage**: `node restore_from_backup.js <docId> <backupFilePath> [--confirm] [--create-backup]`

#### `restore_from_audit_log.js` - Audit Log Restoration

- **Purpose**: Restore document from "beforeData" of specific audit log entry
- **Features**:
  - Find audit logs before a specific date
  - Extract and restore from beforeData
  - Temporal restoration capabilities
- **Usage**: `node restore_from_audit_log.js <docId> [beforeDate] [--confirm] [--create-backup]`

### Phase 2: Advanced Analysis Tools (July 8, 2025 - 23:15)

#### `final_summary.js` - Comprehensive Change Analysis

- **Purpose**: Generate final summary of all major section changes
- **Key Findings**: Documents three major events:
  1. **June 6, 2025 16:48**: Massive reduction (40→19 sections) by unknown user
  2. **June 6, 2025 16:51**: Immediate restoration (19→40 sections) by unknown user
  3. **July 4, 2025 18:43**: Fagner's cleanup (49→24 sections)

#### `fagner_detailed_analysis.js` - Fagner Change Analysis

- **Purpose**: Detailed analysis of Fagner's July 2th section changes
- **Features**:
  - Section-by-section comparison
  - Preserved/removed/added section identification
  - Proves no complete array replacement occurred

#### `detailed_sections_comparison.js` - Multi-Change Analysis

- **Purpose**: Analyze all major section changes (±5 sections)
- **Features**:
  - Identifies changes above configurable threshold
  - Detailed before/after comparison
  - Pattern recognition across multiple events

#### `sections_deep_analysis.js` - Enhanced Section Analysis

- **Purpose**: Deep dive into section changes with improved matching
- **Features**:
  - Multiple field matching (id, title, content)
  - Similarity scoring algorithms
  - Enhanced preservation detection

### Phase 3: Ultra-Detailed Investigation (July 8, 2025 - 23:19)

#### `ultra_detailed_analysis.js` - Field-Level Analysis

- **Purpose**: Ultra-detailed field-by-field comparison
- **Features**:
  - Compares every field in matching sections
  - Shows exact field differences
  - Identifies sections with identical vs. modified content

#### `robust_fagner_analysis.js` - Advanced Similarity Analysis

- **Purpose**: Sophisticated section matching with weighted scoring
- **Features**:
  - Multi-field similarity scoring
  - Weighted importance for different fields
  - Levenshtein distance for text similarity
  - Advanced preservation detection

### Phase 4: Restoration Systems (July 8, 2025 - 23:45)

#### `restoration_verification.js` - Restoration Verification

- **Purpose**: Verify successful restoration operations
- **Features**:
  - Compare current state with backups
  - Validate restoration completeness
  - Generate verification reports

#### `notebook_restoration_system.js` - Complete Restoration System

- **Purpose**: Comprehensive notebook restoration with post-change preservation
- **Features**:
  - Identifies pre-Fagner state from audit logs
  - Identifies post-Fagner modifications to preserve
  - Creates comprehensive restoration plan
  - Re-applies legitimate modifications after restoration

#### `comprehensive_restoration_system.js` - Enhanced Restoration

- **Purpose**: Advanced restoration with intelligent modification handling
- **Features**:
  - Multi-phase restoration process
  - Intelligent conflict resolution
  - Comprehensive backup management

### Phase 5: Version Management (July 8, 2025 - 23:47+)

#### `extract_notebook_versions.js` - Version Extraction

- **Purpose**: Extract specific notebook versions for comparison
- **Creates**:
  - `most_recent_version.json` - Pre-restoration state
  - `pre_fagner_version.json` - Original state before Fagner's change

#### `upload_final_version.js` - Final Version Upload

- **Purpose**: Upload manually crafted final version to Firestore
- **Features**:
  - Pre-upload backup creation
  - Validation and verification
  - Safe upload with rollback capabilities

## 🔍 How to Audit Notebook Section Issues

### Step 1: Initial Investigation

```bash
# Get basic timeline of all changes
node main.js vv3EMActxg1pRD09Kfle --refresh

# Focus on section length changes
node sections_tracker.js vv3EMActxg1pRD09Kfle
```

### Step 2: Identify Major Changes

```bash
# Analyze major section changes (±5 sections)
node sections_deep_analysis.js vv3EMActxg1pRD09Kfle 5

# Get comprehensive summary
node final_summary.js vv3EMActxg1pRD09Kfle
```

### Step 3: Detailed Analysis of Specific Changes

```bash
# Ultra-detailed field analysis
node ultra_detailed_analysis.js vv3EMActxg1pRD09Kfle

# Sophisticated similarity analysis
node robust_fagner_analysis.js vv3EMActxg1pRD09Kfle
```

### Step 4: Create Version Snapshots

```bash
# Extract key versions for comparison
node extract_notebook_versions.js
```

## 🛠️ How to Fix Section Replacement Issues

### Method 1: Intelligent Corruption Recovery (RECOMMENDED)

```bash
# First, analyze the corruption timeline
node corruption_analysis.js vv3EMActxg1pRD09Kfle --date=2025-07-02

# Preview the intelligent recovery plan
node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=2025-07-02 --dry-run

# Execute the recovery after reviewing the plan
node intelligent_corruption_recovery.js vv3EMActxg1pRD09Kfle --corruption-date=2025-07-02 --force
```

### Method 2: Restore from Audit Log

```bash
# Find the last good state before corruption
node restore_from_audit_log.js vv3EMActxg1pRD09Kfle 2025-07-03 --dry-run

# Execute restoration after review
node restore_from_audit_log.js vv3EMActxg1pRD09Kfle 2025-07-03 --confirm --create-backup
```

### Method 3: Intelligent Restoration System

```bash
# Preview comprehensive restoration plan
node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --dry-run

# Execute with post-change preservation
node notebook_restoration_system.js vv3EMActxg1pRD09Kfle --force
```

### Method 4: Manual Version Creation and Upload

```bash
# Extract version files
node extract_notebook_versions.js

# Manually create final_version.json combining best parts

# Upload final version (dry run first)
node upload_final_version.js --dry-run
node upload_final_version.js --force
```

### Method 5: Restore from External Backup

```bash
# Compare with external backup
node compare_with_backup.js vv3EMActxg1pRD09Kfle /path/to/backup.json

# Restore from backup if appropriate
node restore_from_backup.js vv3EMActxg1pRD09Kfle /path/to/backup.json --confirm --create-backup
```

## 📋 Key Findings from Case Study (vv3EMActxg1pRD09Kfle)

### Major Events Identified:

1. **June 6, 2025 16:48:21** - Unknown user reduced sections from 40 to 19

   - 13 sections preserved, 14 removed, 1 added
   - Appeared to be cleanup/reorganization

2. **June 6, 2025 16:51:38** - Unknown user restored sections from 19 to 40

   - Immediate rollback of previous change
   - Almost complete restoration of deleted content

3. **July 4, 2025 18:43:22** - Fagner Silveira Grati reduced sections from 49 to 24
   - Deliberate, comprehensive reorganization
   - Changed notebook ownership/authorship
   - 14 sections preserved, 21 removed, 3 added

### Critical Insights:

- **No Complete Array Replacement**: All changes showed selective preservation
- **Content-Aware Deletions**: Removals targeted redundant/interim content
- **Educational Content Preservation**: Core curriculum content consistently preserved
- **Date-Based Patterns**: Changes often targeted specific date ranges

## 🚨 Best Practices for Section Auditing

### 1. Always Create Backups

```bash
# Before any restoration operation
node safe_delete_sections.js <docId> <count> <userId> --confirm
```

### 2. Use Dry-Run Mode First

```bash
# Preview changes before executing
node <restoration-script> --dry-run
```

### 3. Verify Restoration Results

```bash
# Always verify after restoration
node restoration_verification.js <docId>
```

### 4. Preserve Post-Change Modifications

```bash
# Use intelligent restoration for complex scenarios
node notebook_restoration_system.js <docId> --dry-run
```

## 📁 File Structure and Dependencies

### Required Files:

- `audit_logs_<docId>.json` - Cached audit logs (generated by main.js)
- `sections_logs_<docId>.json` - Cached section changes (generated by sections_tracker.js)
- Service account credentials for Firebase Admin SDK

### Generated Files:

- `backup_<docId>_<stage>_<timestamp>.json` - Automatic backups
- `most_recent_version.json` - Recent version snapshot
- `pre_fagner_version.json` - Original version snapshot
- `final_version.json` - Manually crafted final version

### Dependencies:

```json
{
  "firebase-admin": "^13.4.0",
  "chalk": "^5.4.1"
}
```

## 🔧 Environment Setup

```bash
# Set Firebase service account
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Install dependencies
npm install firebase-admin chalk

# Generate initial audit cache
node main.js <docId> --refresh
```

## ⚠️ Important Notes

1. **Always use `--dry-run` first** to preview changes
2. **Backups are automatically created** by most restoration tools
3. **Audit logs must be cached locally** before running analysis tools
4. **Service account must have Firestore read/write permissions**
5. **Large documents may take time to process** - be patient

## 🎯 Recommended Workflow for New Cases

1. **Generate audit cache**: `node main.js <docId> --refresh`
2. **Identify major changes**: `node sections_deep_analysis.js <docId>`
3. **Analyze specific events**: `node ultra_detailed_analysis.js <docId>`
4. **Plan restoration**: `node notebook_restoration_system.js <docId> --dry-run`
5. **Execute restoration**: `node notebook_restoration_system.js <docId> --force`
6. **Verify results**: `node restoration_verification.js <docId>`

This system provides comprehensive tools for identifying, analyzing, and fixing notebook section corruption issues while preserving legitimate modifications and maintaining full audit trails.
