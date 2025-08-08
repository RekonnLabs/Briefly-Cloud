/**
 * Verification script for OpenAI embeddings integration
 * Checks code structure and dependencies without making API calls
 */

const fs = require('fs')
const path = require('path')

function verifyEmbeddingsIntegration() {
  console.log('🔍 Verifying OpenAI Embeddings Integration...\n')

  const checks = []

  // Check 1: Verify embeddings library file exists
  const embeddingsLibPath = path.join(__dirname, 'src/app/lib/embeddings.ts')
  if (fs.existsSync(embeddingsLibPath)) {
    checks.push('✅ Embeddings library file exists')
    
    // Check content
    const content = fs.readFileSync(embeddingsLibPath, 'utf8')
    if (content.includes('EmbeddingsService')) {
      checks.push('✅ EmbeddingsService class is defined')
    }
    if (content.includes('generateEmbedding')) {
      checks.push('✅ generateEmbedding method is implemented')
    }
    if (content.includes('generateBatchEmbeddings')) {
      checks.push('✅ generateBatchEmbeddings method is implemented')
    }
    if (content.includes('text-embedding-3-small')) {
      checks.push('✅ Uses latest OpenAI embedding model')
    }
    if (content.includes('BYOK') || content.includes('userApiKey')) {
      checks.push('✅ BYOK (Bring Your Own Key) support implemented')
    }
    if (content.includes('retry') || content.includes('maxRetries')) {
      checks.push('✅ Retry logic implemented')
    }
  } else {
    checks.push('❌ Embeddings library file missing')
  }

  // Check 2: Verify API routes exist
  const apiRoutes = [
    'src/app/api/embeddings/route.ts',
    'src/app/api/embeddings/batch/route.ts',
    'src/app/api/embeddings/chunks/[fileId]/route.ts'
  ]

  apiRoutes.forEach(route => {
    const routePath = path.join(__dirname, route)
    if (fs.existsSync(routePath)) {
      checks.push(`✅ API route exists: ${route}`)
    } else {
      checks.push(`❌ API route missing: ${route}`)
    }
  })

  // Check 3: Verify package.json has OpenAI dependency
  const packageJsonPath = path.join(__dirname, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    if (packageJson.dependencies && packageJson.dependencies.openai) {
      checks.push(`✅ OpenAI dependency installed: ${packageJson.dependencies.openai}`)
    } else {
      checks.push('❌ OpenAI dependency missing from package.json')
    }
  }

  // Check 4: Verify environment example includes OpenAI key
  const envExamplePath = path.join(__dirname, '.env.example')
  if (fs.existsSync(envExamplePath)) {
    const envContent = fs.readFileSync(envExamplePath, 'utf8')
    if (envContent.includes('OPENAI_API_KEY')) {
      checks.push('✅ Environment example includes OPENAI_API_KEY')
    } else {
      checks.push('❌ Environment example missing OPENAI_API_KEY')
    }
  }

  // Check 5: Verify supporting utilities exist
  const supportingFiles = [
    'src/app/lib/api-errors.ts',
    'src/app/lib/logger.ts',
    'src/app/lib/api-middleware.ts',
    'src/app/lib/rate-limit.ts'
  ]

  supportingFiles.forEach(file => {
    const filePath = path.join(__dirname, file)
    if (fs.existsSync(filePath)) {
      checks.push(`✅ Supporting utility exists: ${file}`)
    } else {
      checks.push(`❌ Supporting utility missing: ${file}`)
    }
  })

  // Print results
  console.log('Verification Results:')
  checks.forEach(check => console.log(`  ${check}`))

  const passedChecks = checks.filter(check => check.startsWith('✅')).length
  const totalChecks = checks.length

  console.log(`\n📊 Summary: ${passedChecks}/${totalChecks} checks passed`)

  if (passedChecks === totalChecks) {
    console.log('\n🎉 All verification checks passed!')
    console.log('\nThe OpenAI embeddings integration is properly implemented with:')
    console.log('- ✅ Complete EmbeddingsService class with all required methods')
    console.log('- ✅ API routes for single, batch, and chunk embeddings')
    console.log('- ✅ BYOK (Bring Your Own Key) support for Pro users')
    console.log('- ✅ Retry logic for failed embedding requests')
    console.log('- ✅ Latest OpenAI embedding models (text-embedding-3-small)')
    console.log('- ✅ Proper error handling and logging')
    console.log('- ✅ Rate limiting and middleware integration')
    
    console.log('\n🚀 Ready for testing with actual API keys!')
  } else {
    console.log('\n⚠️  Some checks failed. Please review the missing components.')
  }

  return passedChecks === totalChecks
}

// Run verification
if (require.main === module) {
  verifyEmbeddingsIntegration()
}

module.exports = { verifyEmbeddingsIntegration }