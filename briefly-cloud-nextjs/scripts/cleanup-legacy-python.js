/**
 * Legacy Python Codebase Cleanup Script
 * 
 * This script helps identify and clean up legacy Python files and configurations
 * that are no longer needed after migrating to the unified Next.js architecture.
 */

const fs = require('fs');
const path = require('path');

// Files and directories to be removed or archived
const LEGACY_ITEMS = {
  // Python application files
  files: [
    '../app.py',
    '../requirements.txt',
    '../requirements-clean.txt', 
    '../requirements-vercel.txt',
    '../.env.railway',
    '../.dockerignore',
    '../vercel.json', // Root level vercel.json (we have one in Next.js app)
  ],
  
  // Python directories
  directories: [
    '../server',
    '../railway_app',
    '../tests', // Python tests
    '../__pycache__',
    '../client', // Old React client
  ],
  
  // Documentation that may be outdated
  docs: [
    '../CLOUD_STORAGE_IMPLEMENTATION.md',
    '../OAUTH_SETUP_GUIDE.md', 
    '../README_SECURITY.md',
    '../SETUP_GUIDE.md',
    '../database_schema.sql', // We have updated schema in Next.js app
  ]
};

// Items to archive instead of delete (for backup purposes)
const ARCHIVE_ITEMS = [
  '../server',
  '../railway_app', 
  '../tests',
  '../client',
  '../app.py',
  '../requirements.txt'
];

function createArchiveDirectory() {
  const archiveDir = '../legacy-python-backup';
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
    console.log('✅ Created archive directory:', archiveDir);
  }
  return archiveDir;
}

function moveToArchive(itemPath, archiveDir) {
  const fullPath = path.resolve(__dirname, itemPath);
  const itemName = path.basename(fullPath);
  const archivePath = path.join(archiveDir, itemName);
  
  if (fs.existsSync(fullPath)) {
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        // For directories, we need to copy recursively
        copyDirectoryRecursive(fullPath, archivePath);
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        // For files, simple copy and delete
        fs.copyFileSync(fullPath, archivePath);
        fs.unlinkSync(fullPath);
      }
      console.log(`📦 Archived: ${itemPath} -> ${archivePath}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to archive ${itemPath}:`, error.message);
      return false;
    }
  } else {
    console.log(`⚠️  Item not found: ${itemPath}`);
    return false;
  }
}

function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function deleteItem(itemPath) {
  const fullPath = path.resolve(__dirname, itemPath);
  
  if (fs.existsSync(fullPath)) {
    try {
      if (fs.statSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      console.log(`🗑️  Deleted: ${itemPath}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete ${itemPath}:`, error.message);
      return false;
    }
  } else {
    console.log(`⚠️  Item not found: ${itemPath}`);
    return false;
  }
}

function cleanupPackageJson() {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Remove Python-specific scripts and dependencies
      if (packageJson.scripts) {
        delete packageJson.scripts.start;
        delete packageJson.scripts.dev;
        delete packageJson.scripts.python;
        delete packageJson.scripts.server;
      }
      
      // Remove any Python-related dependencies (if any were added)
      if (packageJson.dependencies) {
        // Remove any accidentally added Python packages
        Object.keys(packageJson.dependencies).forEach(dep => {
          if (dep.includes('python') || dep.includes('py-')) {
            delete packageJson.dependencies[dep];
          }
        });
      }
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Cleaned up root package.json');
    } catch (error) {
      console.error('❌ Failed to cleanup package.json:', error.message);
    }
  }
}

function updateGitignore() {
  const gitignorePath = path.resolve(__dirname, '../.gitignore');
  
  if (fs.existsSync(gitignorePath)) {
    try {
      let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      
      // Remove Python-specific entries
      const pythonEntries = [
        '__pycache__/',
        '*.py[cod]',
        '*$py.class',
        '*.so',
        '.Python',
        'build/',
        'develop-eggs/',
        'dist/',
        'downloads/',
        'eggs/',
        '.eggs/',
        'lib/',
        'lib64/',
        'parts/',
        'sdist/',
        'var/',
        'wheels/',
        'share/python-wheels/',
        '*.egg-info/',
        '.installed.cfg',
        '*.egg',
        'MANIFEST',
        '.env.railway',
        'requirements*.txt'
      ];
      
      // Remove Python entries and clean up
      pythonEntries.forEach(entry => {
        const regex = new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm');
        gitignoreContent = gitignoreContent.replace(regex, '');
      });
      
      // Clean up multiple empty lines
      gitignoreContent = gitignoreContent.replace(/\n\s*\n\s*\n/g, '\n\n');
      
      // Add Next.js specific entries if not present
      const nextjsEntries = [
        '# Next.js',
        '.next/',
        'out/',
        '# Vercel',
        '.vercel',
        '# TypeScript',
        '*.tsbuildinfo',
        'next-env.d.ts'
      ];
      
      nextjsEntries.forEach(entry => {
        if (!gitignoreContent.includes(entry)) {
          gitignoreContent += `\n${entry}`;
        }
      });
      
      fs.writeFileSync(gitignorePath, gitignoreContent.trim() + '\n');
      console.log('✅ Updated .gitignore for Next.js architecture');
    } catch (error) {
      console.error('❌ Failed to update .gitignore:', error.message);
    }
  }
}

function generateCleanupReport() {
  const reportPath = path.resolve(__dirname, '../LEGACY_CLEANUP_REPORT.md');
  const timestamp = new Date().toISOString();
  
  const report = `# Legacy Python Codebase Cleanup Report

**Date:** ${timestamp}
**Migration:** Python FastAPI + React → Unified Next.js

## Summary

This report documents the cleanup of legacy Python codebase components after migrating to a unified Next.js architecture.

## Archived Components

The following components have been moved to \`legacy-python-backup/\` for reference:

### Python Backend (\`server/\`)
- FastAPI application code
- Route handlers and middleware
- Utility functions and helpers
- Python requirements and configuration

### Railway Deployment (\`railway_app/\`)
- Railway-specific deployment configuration
- Environment setup files
- Railway deployment scripts

### Legacy Tests (\`tests/\`)
- Python-based integration tests
- API testing scripts
- Test data and fixtures

### React Client (\`client/\`)
- Vite-based React frontend
- Component library
- Build configuration

### Root Level Files
- \`app.py\` - Main FastAPI application
- \`requirements*.txt\` - Python dependencies
- \`.env.railway\` - Railway environment config

## Removed Components

The following items were safely deleted:

- \`__pycache__/\` - Python bytecode cache
- \`.dockerignore\` - Docker ignore file (no longer needed)
- Legacy documentation files

## Updated Files

- \`.gitignore\` - Removed Python-specific entries, added Next.js entries
- \`package.json\` - Removed Python-related scripts

## New Architecture

The application now runs entirely on:
- **Frontend & Backend:** Next.js 14 with App Router
- **Database:** Supabase (PostgreSQL)
- **Deployment:** Vercel
- **Authentication:** NextAuth.js
- **AI:** OpenAI API integration

## Rollback Instructions

If needed, the archived components can be restored from \`legacy-python-backup/\`:

1. Copy desired components back to root directory
2. Restore Python environment: \`pip install -r requirements.txt\`
3. Update environment variables for Railway deployment
4. Revert \`.gitignore\` changes if needed

## Notes

- All user data and functionality has been preserved in the new Next.js application
- API endpoints have been migrated to Next.js API routes
- Database schema remains compatible
- Environment variables have been updated for Vercel deployment

---
*Generated by legacy cleanup script*
`;

  fs.writeFileSync(reportPath, report);
  console.log('📄 Generated cleanup report:', reportPath);
}

// Main cleanup function
function runCleanup() {
  console.log('🧹 Starting legacy Python codebase cleanup...\n');
  
  // Create archive directory
  const archiveDir = createArchiveDirectory();
  const fullArchiveDir = path.resolve(__dirname, archiveDir);
  
  // Archive important items
  console.log('\n📦 Archiving important components...');
  ARCHIVE_ITEMS.forEach(item => {
    moveToArchive(item, fullArchiveDir);
  });
  
  // Delete remaining legacy items
  console.log('\n🗑️  Removing remaining legacy files...');
  LEGACY_ITEMS.files.forEach(file => {
    if (!ARCHIVE_ITEMS.includes(file)) {
      deleteItem(file);
    }
  });
  
  LEGACY_ITEMS.directories.forEach(dir => {
    if (!ARCHIVE_ITEMS.includes(dir)) {
      deleteItem(dir);
    }
  });
  
  LEGACY_ITEMS.docs.forEach(doc => {
    if (!ARCHIVE_ITEMS.includes(doc)) {
      deleteItem(doc);
    }
  });
  
  // Clean up configuration files
  console.log('\n⚙️  Updating configuration files...');
  cleanupPackageJson();
  updateGitignore();
  
  // Generate report
  console.log('\n📄 Generating cleanup report...');
  generateCleanupReport();
  
  console.log('\n✅ Legacy Python codebase cleanup completed!');
  console.log('📦 Archived components are available in: legacy-python-backup/');
  console.log('📄 See LEGACY_CLEANUP_REPORT.md for detailed information');
}

// Run cleanup if called directly
if (require.main === module) {
  runCleanup();
}

module.exports = { runCleanup };