#!/usr/bin/env node

/**
 * Build Security Validation
 * 
 * Validates that the production build is secure and doesn't contain
 * development artifacts, debug code, or security vulnerabilities.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class BuildSecurityValidator {
  constructor() {
    this.buildDir = '.next';
    this.errors = [];
    this.warnings = [];
    
    this.dangerousPatterns = [
      { name: 'Console logs', pattern: /console\.(log|debug|info|warn|error)/g },
      { name: 'Debugger statements', pattern: /debugger;?/g },
      { name: 'Development URLs', pattern: /localhost:\d+/g },
      { name: 'Test credentials', pattern: /(test_|dev_|demo_)[a-zA-Z0-9_-]+/g },
      { name: 'Source maps', pattern: /\/\/# sourceMappingURL=/g },
      { name: 'API keys', pattern: /sk-[a-zA-Z0-9]{48}/g },
      { name: 'Supabase keys', pattern: /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g },
      { name: 'TODO comments', pattern: /TODO|FIXME|HACK/gi },
      { name: 'Development flags', pattern: /NODE_ENV.*development/g }
    ];
    
    this.requiredSecurityHeaders = [
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'X-Frame-Options',
      'X-Content-Type-Options'
    ];
  }

  async validate() {
    console.log('🔍 Validating build security...');
    
    if (!fs.existsSync(this.buildDir)) {
      this.errors.push('Build directory not found. Run "npm run build" first.');
      this.printResults();
      process.exit(1);
    }
    
    await this.checkBuildArtifacts();
    await this.scanForDangerousPatterns();
    await this.validateSecurityConfiguration();
    await this.checkBundleSize();
    await this.validateEnvironmentVariables();
    await this.checkSourceMaps();
    
    this.printResults();
    
    if (this.errors.length > 0) {
      process.exit(1);
    }
  }

  async checkBuildArtifacts() {
    console.log('  Checking build artifacts...');
    
    // Check for required build files
    const requiredFiles = [
      '.next/BUILD_ID',
      '.next/static',
      '.next/server'
    ];
    
    requiredFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        this.errors.push(`Missing required build file: ${file}`);
      }
    });
    
    // Check for development artifacts that shouldn't be in production
    const devArtifacts = [
      '.next/cache/webpack',
      '.next/static/development'
    ];
    
    devArtifacts.forEach(artifact => {
      const artifactPath = path.join(process.cwd(), artifact);
      if (fs.existsSync(artifactPath)) {
        this.warnings.push(`Development artifact found in build: ${artifact}`);
      }
    });
  }

  async scanForDangerousPatterns() {
    console.log('  Scanning for dangerous patterns...');
    
    const jsFiles = this.findJSFiles(this.buildDir);
    
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      this.dangerousPatterns.forEach(({ name, pattern }) => {
        const matches = content.match(pattern);
        if (matches) {
          const relativePath = path.relative(process.cwd(), file);
          this.warnings.push(`${name} found in ${relativePath}: ${matches.length} occurrences`);
        }
      });
    }
  }

  async validateSecurityConfiguration() {
    console.log('  Validating security configuration...');
    
    // Check middleware configuration
    const middlewarePath = path.join(process.cwd(), 'middleware.ts');
    if (fs.existsSync(middlewarePath)) {
      const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
      
      // Check for security headers
      this.requiredSecurityHeaders.forEach(header => {
        if (!middlewareContent.includes(header)) {
          this.warnings.push(`Security header not found in middleware: ${header}`);
        }
      });
      
      // Check for CORS configuration
      if (!middlewareContent.includes('Access-Control-Allow-Origin')) {
        this.warnings.push('CORS configuration not found in middleware');
      }
    } else {
      this.warnings.push('Middleware file not found - security headers may not be configured');
    }
    
    // Check Next.js configuration
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    if (fs.existsSync(nextConfigPath)) {
      const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf8');
      
      // Check for security-related configurations
      const securityConfigs = [
        'poweredByHeader: false',
        'compress: true',
        'generateEtags: false'
      ];
      
      securityConfigs.forEach(config => {
        if (!nextConfigContent.includes(config)) {
          this.warnings.push(`Security configuration missing in next.config.js: ${config}`);
        }
      });
    }
  }

  async checkBundleSize() {
    console.log('  Checking bundle size...');
    
    try {
      // Get bundle analyzer data if available
      const staticDir = path.join(this.buildDir, 'static');
      if (fs.existsSync(staticDir)) {
        const stats = this.getBundleStats(staticDir);
        
        // Check for unusually large bundles (> 1MB)
        const largeBundles = stats.filter(bundle => bundle.size > 1024 * 1024);
        if (largeBundles.length > 0) {
          largeBundles.forEach(bundle => {
            this.warnings.push(`Large bundle detected: ${bundle.name} (${this.formatBytes(bundle.size)})`);
          });
        }
        
        // Check total bundle size
        const totalSize = stats.reduce((sum, bundle) => sum + bundle.size, 0);
        if (totalSize > 5 * 1024 * 1024) { // 5MB
          this.warnings.push(`Total bundle size is large: ${this.formatBytes(totalSize)}`);
        }
      }
    } catch (error) {
      this.warnings.push(`Could not analyze bundle size: ${error.message}`);
    }
  }

  async validateEnvironmentVariables() {
    console.log('  Validating environment variables in build...');
    
    // Check for hardcoded environment variables in build
    const jsFiles = this.findJSFiles(this.buildDir);
    const envPatterns = [
      /process\.env\.[A-Z_]+/g,
      /NEXT_PUBLIC_[A-Z_]+/g
    ];
    
    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      envPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          // Filter out expected public variables
          const unexpectedVars = matches.filter(match => 
            !match.includes('NEXT_PUBLIC_') && 
            !match.includes('NODE_ENV')
          );
          
          if (unexpectedVars.length > 0) {
            const relativePath = path.relative(process.cwd(), file);
            this.warnings.push(`Environment variables found in build ${relativePath}: ${unexpectedVars.join(', ')}`);
          }
        }
      });
    }
  }

  async checkSourceMaps() {
    console.log('  Checking source maps...');
    
    const sourceMapFiles = this.findFiles(this.buildDir, '.map');
    
    if (sourceMapFiles.length > 0 && process.env.NODE_ENV === 'production') {
      this.warnings.push(`Source maps found in production build: ${sourceMapFiles.length} files`);
      
      // Check if source maps contain sensitive information
      for (const mapFile of sourceMapFiles.slice(0, 5)) { // Check first 5 files
        const content = fs.readFileSync(mapFile, 'utf8');
        
        if (content.includes('node_modules')) {
          this.warnings.push(`Source map contains node_modules paths: ${path.basename(mapFile)}`);
        }
        
        if (content.includes(process.cwd())) {
          this.warnings.push(`Source map contains absolute paths: ${path.basename(mapFile)}`);
        }
      }
    }
  }

  findJSFiles(dir) {
    const jsFiles = [];
    
    const scanDir = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scanDir(itemPath);
        } else if (item.endsWith('.js') || item.endsWith('.mjs')) {
          jsFiles.push(itemPath);
        }
      });
    };
    
    scanDir(dir);
    return jsFiles;
  }

  findFiles(dir, extension) {
    const files = [];
    
    const scanDir = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scanDir(itemPath);
        } else if (item.endsWith(extension)) {
          files.push(itemPath);
        }
      });
    };
    
    scanDir(dir);
    return files;
  }

  getBundleStats(staticDir) {
    const stats = [];
    
    const scanDir = (currentDir) => {
      const items = fs.readdirSync(currentDir);
      
      items.forEach(item => {
        const itemPath = path.join(currentDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          scanDir(itemPath);
        } else if (item.endsWith('.js') || item.endsWith('.css')) {
          stats.push({
            name: path.relative(staticDir, itemPath),
            size: stat.size
          });
        }
      });
    };
    
    scanDir(staticDir);
    return stats;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  printResults() {
    console.log('\n📊 Build Security Validation Results:');
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ Build is secure and ready for production');
      return;
    }
    
    if (this.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => console.log(`  - ${warning}`));
    }
    
    console.log(`\nSummary: ${this.errors.length} errors, ${this.warnings.length} warnings`);
  }
}

// CLI execution
if (require.main === module) {
  const validator = new BuildSecurityValidator();
  validator.validate().catch(error => {
    console.error('❌ Build security validation failed:', error);
    process.exit(1);
  });
}

module.exports = BuildSecurityValidator;