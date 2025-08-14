#!/usr/bin/env node

/**
 * ChromaDB to pgvector Migration Script
 * 
 * This script helps migrate from ChromaDB to pgvector by:
 * 1. Updating environment variables
 * 2. Cleaning up ChromaDB dependencies
 * 3. Verifying pgvector setup
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Starting ChromaDB to pgvector Migration');
console.log('=====================================');

/**
 * Update environment variables
 */
function updateEnvironmentVariables() {
  console.log('\n📝 Updating environment variables...');
  
  const envFiles = ['.env.local', '.env.example'];
  
  envFiles.forEach(envFile => {
    const envPath = path.join(process.cwd(), envFile);
    
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      
      // Update VECTOR_BACKEND to pgvector
      if (content.includes('VECTOR_BACKEND=')) {
        content = content.replace(/VECTOR_BACKEND=.*/g, 'VECTOR_BACKEND=pgvector');
      } else {
        content += '\n# Vector Storage Backend\nVECTOR_BACKEND=pgvector\n';
      }
      
      // Comment out ChromaDB variables
      content = content.replace(/^(CHROMA_.*=)/gm, '# $1');
      
      // Add pgvector configuration
      if (!content.includes('VECTOR_MAX_CONNECTIONS=')) {
        content += '\n# pgvector Configuration\nVECTOR_MAX_CONNECTIONS=10\nVECTOR_TIMEOUT=30000\n';
      }
      
      fs.writeFileSync(envPath, content);
      console.log(`✅ Updated ${envFile}`);
    } else {
      console.log(`⚠️  ${envFile} not found, skipping`);
    }
  });
}

/**
 * Update package.json to remove ChromaDB dependencies
 */
function updatePackageJson() {
  console.log('\n📦 Updating package.json...');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  
  if (fs.existsSync(packagePath)) {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Remove ChromaDB dependencies
    const chromaDeps = ['chromadb'];
    let removed = [];
    
    chromaDeps.forEach(dep => {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        delete packageJson.dependencies[dep];
        removed.push(dep);
      }
      if (packageJson.devDependencies && packageJson.devDependencies[dep]) {
        delete packageJson.devDependencies[dep];
        removed.push(dep);
      }
    });
    
    if (removed.length > 0) {
      fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
      console.log(`✅ Removed dependencies: ${removed.join(', ')}`);
      console.log('📋 Run "npm install" to update node_modules');
    } else {
      console.log('✅ No ChromaDB dependencies found to remove');
    }
  }
}

/**
 * Create legacy vector storage file for reference
 */
function createLegacyReference() {
  console.log('\n📚 Creating legacy reference...');
  
  const legacyPath = path.join(process.cwd(), 'src/app/lib/vector-storage-legacy.ts');
  const currentPath = path.join(process.cwd(), 'src/app/lib/vector-storage.ts');
  
  if (fs.existsSync(currentPath)) {
    // Move current file to legacy
    const content = fs.readFileSync(currentPath, 'utf8');
    const legacyContent = `/**
 * LEGACY: ChromaDB Vector Storage Implementation
 * 
 * This file has been replaced by the new pgvector implementation.
 * Kept for reference during migration period.
 * 
 * New implementation: src/app/lib/vector/
 */

${content}`;
    
    fs.writeFileSync(legacyPath, legacyContent);
    console.log('✅ Created legacy reference file');
  }
}

/**
 * Update vector storage imports
 */
function updateVectorStorageImports() {
  console.log('\n🔄 Updating vector storage imports...');
  
  // Create new vector-storage.ts that exports from the new location
  const newVectorStoragePath = path.join(process.cwd(), 'src/app/lib/vector-storage.ts');
  
  const newContent = `/**
 * Vector Storage - pgvector Implementation
 * 
 * This file provides backward compatibility exports while using the new
 * pgvector-based vector storage system.
 */

// Re-export from new vector system for backward compatibility
export {
  getVectorStore,
  getUserVectorStore,
  createVectorStore,
  isVectorStoreAvailable,
  getVectorStoreHealth
} from './vector/vector-store-factory'

export {
  processDocument as storeDocumentVectors,
  searchDocuments as searchDocumentContext,
  deleteDocument as deleteDocumentVectors,
  getDocumentProcessor as getUserVectorStats
} from './vector/document-processor'

export type {
  VectorDocument,
  VectorSearchResult,
  VectorSearchOptions,
  VectorStoreStats
} from './vector/vector-store.interface'

// Legacy compatibility types
export interface VectorStorageService {
  storeVectors: (documents: any[], userId: string) => Promise<void>
  searchVectors: (queryEmbedding: number[], userId: string, options?: any) => Promise<any[]>
  deleteFileVectors: (fileId: string, userId: string) => Promise<void>
  getCollectionStats: (userId: string) => Promise<any>
  isChromaConnected: () => boolean
  getConnectionStatus: () => any
}

// Legacy function exports for compatibility
export function createVectorStorageService(): VectorStorageService {
  const vectorStore = getVectorStore()
  
  return {
    async storeVectors(documents: any[], userId: string) {
      return vectorStore.addDocuments(userId, documents)
    },
    
    async searchVectors(queryEmbedding: number[], userId: string, options: any = {}) {
      return vectorStore.searchSimilar(userId, queryEmbedding, options)
    },
    
    async deleteFileVectors(fileId: string, userId: string) {
      return vectorStore.deleteUserDocuments(userId, fileId)
    },
    
    async getCollectionStats(userId: string) {
      return vectorStore.getCollectionStats(userId)
    },
    
    isChromaConnected() {
      return vectorStore.isConnected()
    },
    
    getConnectionStatus() {
      return vectorStore.getConnectionStatus()
    }
  }
}

export function createUserVectorStorageService(userConfig: any, systemConfig?: any) {
  return createVectorStorageService() // Use default for now
}

export function chunksToVectorDocuments(chunks: any[], embeddings: number[][], userId: string, fileName: string) {
  return chunks.map((chunk, index) => ({
    id: \`\${chunk.fileId}_\${chunk.chunkIndex}\`,
    content: chunk.content,
    embedding: embeddings[index],
    metadata: {
      fileId: chunk.fileId,
      fileName,
      chunkIndex: chunk.chunkIndex,
      userId,
      createdAt: new Date().toISOString(),
      ...chunk.metadata,
    },
  }))
}
`;
  
  fs.writeFileSync(newVectorStoragePath, newContent);
  console.log('✅ Created backward compatibility vector-storage.ts');
}

/**
 * Verify pgvector setup
 */
function verifyPgvectorSetup() {
  console.log('\n🔍 Verifying pgvector setup...');
  
  const requiredFiles = [
    'src/app/lib/vector/vector-store.interface.ts',
    'src/app/lib/vector/pgvector-store.ts',
    'src/app/lib/vector/vector-store-factory.ts',
    'src/app/lib/vector/document-processor.ts',
    'database/01-multi-tenant-schema-migration.sql',
    'database/03-tenant-context-functions.sql'
  ];
  
  let allFilesExist = true;
  
  requiredFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} - MISSING`);
      allFilesExist = false;
    }
  });
  
  if (allFilesExist) {
    console.log('✅ All required pgvector files are present');
  } else {
    console.log('⚠️  Some required files are missing');
  }
}

/**
 * Create migration checklist
 */
function createMigrationChecklist() {
  console.log('\n📋 Creating migration checklist...');
  
  const checklistContent = `# ChromaDB to pgvector Migration Checklist

## ✅ Completed by Migration Script
- [x] Updated environment variables to use pgvector
- [x] Removed ChromaDB dependencies from package.json
- [x] Created backward compatibility layer
- [x] Created legacy reference files

## 🔄 Manual Steps Required

### 1. Database Migration
- [ ] Run database migration: \`node scripts/migrate-to-multi-tenant.js\`
- [ ] Verify pgvector extension is enabled in Supabase
- [ ] Test vector search functionality

### 2. Environment Configuration
- [ ] Update production environment variables:
  - Set \`VECTOR_BACKEND=pgvector\`
  - Remove or comment out CHROMA_* variables
- [ ] Verify Supabase connection is working

### 3. Code Updates
- [ ] Update any remaining ChromaDB imports
- [ ] Test all vector search functionality
- [ ] Verify chat context retrieval works
- [ ] Test document upload and processing

### 4. Testing
- [ ] Run vector search tests
- [ ] Test document processing pipeline
- [ ] Verify user data isolation (RLS)
- [ ] Test performance with pgvector

### 5. Cleanup (After Verification)
- [ ] Remove \`src/app/lib/vector-storage-legacy.ts\`
- [ ] Remove any unused ChromaDB configuration
- [ ] Update documentation

## 🚀 Benefits of pgvector Migration
- ✅ Better integration with Supabase RLS
- ✅ Reduced infrastructure complexity
- ✅ Improved data isolation and security
- ✅ Native PostgreSQL performance
- ✅ Simplified backup and recovery

## 🔧 Troubleshooting
If you encounter issues:
1. Check Supabase logs for pgvector errors
2. Verify database schema migration completed
3. Test vector search with small dataset first
4. Check environment variables are set correctly

## 📞 Support
For migration issues, check:
- Database migration logs
- Supabase dashboard for errors
- Vector search API responses
`;

  fs.writeFileSync('MIGRATION_CHECKLIST.md', checklistContent);
  console.log('✅ Created MIGRATION_CHECKLIST.md');
}

/**
 * Main migration function
 */
function runMigration() {
  try {
    updateEnvironmentVariables();
    updatePackageJson();
    createLegacyReference();
    updateVectorStorageImports();
    verifyPgvectorSetup();
    createMigrationChecklist();
    
    console.log('\n🎉 ChromaDB to pgvector Migration Script Completed!');
    console.log('=====================================');
    console.log('✅ Environment variables updated');
    console.log('✅ Package.json cleaned up');
    console.log('✅ Backward compatibility layer created');
    console.log('✅ Legacy files preserved');
    console.log('✅ Migration checklist created');
    console.log('\n📋 Next Steps:');
    console.log('1. Run: npm install');
    console.log('2. Run: node scripts/migrate-to-multi-tenant.js');
    console.log('3. Follow MIGRATION_CHECKLIST.md');
    console.log('4. Test vector search functionality');
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Execute migration if run directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };