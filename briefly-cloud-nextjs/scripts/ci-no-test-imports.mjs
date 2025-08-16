#!/usr/bin/env node

/**
 * CI Prebuild Guard
 * 
 * Fails the build if any src/ file contains test/data imports or 
 * require('fs') at top-level to prevent build-time issues.
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'

const srcDir = 'src'
const errors = []

function scanDirectory(dir) {
  const items = readdirSync(dir)
  
  for (const item of items) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath)
    } else if (stat.isFile() && ['.ts', '.tsx', '.js', '.jsx'].includes(extname(item))) {
      scanFile(fullPath)
    }
  }
}

function scanFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const lineNum = i + 1
      
      // Check for test/data imports
      if (line.includes('test/data') || line.includes('test\\data')) {
        errors.push(`${filePath}:${lineNum} - Contains test/data reference: ${line}`)
      }
      
      // Check for top-level fs require (not in functions)
      if (line.includes("require('fs')") || line.includes('require("fs")')) {
        // Check if it's at top level (not inside a function)
        const beforeLine = lines.slice(0, i).join('\n')
        const functionDepth = (beforeLine.match(/\{/g) || []).length - (beforeLine.match(/\}/g) || []).length
        
        if (functionDepth === 0) {
          errors.push(`${filePath}:${lineNum} - Top-level fs require: ${line}`)
        }
      }
      
      // Check for top-level fs import
      if (line.startsWith('import') && line.includes('from \'fs\'')) {
        errors.push(`${filePath}:${lineNum} - Top-level fs import: ${line}`)
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not scan ${filePath}: ${error.message}`)
  }
}

console.log('🔍 Scanning for problematic imports...')

try {
  scanDirectory(srcDir)
  
  if (errors.length > 0) {
    console.error('❌ Build guard failed! Found problematic imports:')
    errors.forEach(error => console.error(`  ${error}`))
    console.error('\nThese imports can cause build-time issues. Please fix them before deploying.')
    process.exit(1)
  } else {
    console.log('✅ No problematic imports found!')
  }
} catch (error) {
  console.error('❌ Build guard error:', error.message)
  process.exit(1)
}