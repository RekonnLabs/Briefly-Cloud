#!/usr/bin/env node

/**
 * Clean Build Artifacts
 * 
 * Removes build artifacts and ensures clean state for deployment
 */

const fs = require('fs');
const path = require('path');

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    console.log(`🗑️  Removing ${dirPath}...`);
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`✅ Removed ${dirPath}`);
  } else {
    console.log(`ℹ️  ${dirPath} does not exist, skipping`);
  }
}

function cleanBuildArtifacts() {
  console.log('🧹 Cleaning build artifacts...');
  
  const artifactPaths = [
    '.next',
    'out',
    'build',
    'dist',
    '.vercel',
    'node_modules/.cache',
    'coverage',
    '*.tsbuildinfo'
  ];
  
  artifactPaths.forEach(artifactPath => {
    const fullPath = path.resolve(artifactPath);
    
    if (artifactPath.includes('*')) {
      // Handle glob patterns
      const dir = path.dirname(fullPath);
      const pattern = path.basename(fullPath);
      
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          if (file.includes(pattern.replace('*', ''))) {
            const filePath = path.join(dir, file);
            console.log(`🗑️  Removing ${filePath}...`);
            fs.rmSync(filePath, { force: true });
          }
        });
      }
    } else {
      removeDirectory(fullPath);
    }
  });
  
  console.log('✨ Build artifacts cleaned successfully!');
}

// CLI execution
if (require.main === module) {
  cleanBuildArtifacts();
}

module.exports = { cleanBuildArtifacts };