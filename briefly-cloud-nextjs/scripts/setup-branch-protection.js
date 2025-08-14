#!/usr/bin/env node

/**
 * Branch Protection Setup Script
 * Configures GitHub branch protection rules with security gates
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

class BranchProtectionManager {
  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
    
    this.owner = process.env.GITHUB_REPOSITORY_OWNER || 'your-org';
    this.repo = process.env.GITHUB_REPOSITORY_NAME || 'briefly-cloud';
    
    this.configPath = path.join(__dirname, '..', '.github', 'branch-protection-config.json');
    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
  }

  async setupBranchProtection() {
    console.log('🔒 Setting up branch protection rules...\n');

    try {
      for (const [branch, rules] of Object.entries(this.config.branch_protection_rules)) {
        console.log(`Setting up protection for branch: ${branch}`);
        await this.protectBranch(branch, rules);
        console.log(`✅ Branch protection configured for ${branch}\n`);
      }

      await this.setupSecurityLabels();
      await this.setupCodeOwners();
      
      console.log('✅ All branch protection rules configured successfully');
    } catch (error) {
      console.error('❌ Failed to setup branch protection:', error.message);
      process.exit(1);
    }
  }

  async protectBranch(branch, rules) {
    try {
      const response = await this.octokit.rest.repos.updateBranchProtection({
        owner: this.owner,
        repo: this.repo,
        branch: branch,
        required_status_checks: rules.required_status_checks || null,
        enforce_admins: rules.enforce_admins || false,
        required_pull_request_reviews: rules.required_pull_request_reviews || null,
        restrictions: rules.restrictions || null,
        required_linear_history: rules.required_linear_history || false,
        allow_force_pushes: rules.allow_force_pushes || false,
        allow_deletions: rules.allow_deletions || false,
        block_creations: rules.block_creations || false,
        required_conversation_resolution: rules.required_conversation_resolution || false,
        lock_branch: rules.lock_branch || false,
        allow_fork_syncing: rules.allow_fork_syncing || true
      });

      console.log(`  ✅ Protection rules applied to ${branch}`);
      return response.data;
    } catch (error) {
      if (error.status === 404) {
        console.log(`  ⚠️  Branch ${branch} not found, skipping...`);
        return null;
      }
      throw error;
    }
  }

  async setupSecurityLabels() {
    console.log('Setting up security labels...');
    
    const labels = [
      {
        name: 'security-review-required',
        color: 'ff0000',
        description: 'Requires manual security team review'
      },
      {
        name: 'security-critical',
        color: 'cc0000',
        description: 'Critical security changes requiring immediate attention'
      },
      {
        name: 'security-enhancement',
        color: '00aa00',
        description: 'Security improvements and enhancements'
      },
      {
        name: 'security-fix',
        color: 'ff6600',
        description: 'Security vulnerability fixes'
      },
      {
        name: 'security-approved',
        color: '00cc00',
        description: 'Approved by security team'
      }
    ];

    for (const label of labels) {
      try {
        await this.octokit.rest.issues.createLabel({
          owner: this.owner,
          repo: this.repo,
          name: label.name,
          color: label.color,
          description: label.description
        });
        console.log(`  ✅ Created label: ${label.name}`);
      } catch (error) {
        if (error.status === 422) {
          // Label already exists, update it
          await this.octokit.rest.issues.updateLabel({
            owner: this.owner,
            repo: this.repo,
            name: label.name,
            color: label.color,
            description: label.description
          });
          console.log(`  ✅ Updated label: ${label.name}`);
        } else {
          console.error(`  ❌ Failed to create label ${label.name}:`, error.message);
        }
      }
    }
  }

  async setupCodeOwners() {
    console.log('Setting up CODEOWNERS file...');
    
    const codeOwnersContent = `# Security-sensitive files require security team review
/database/ @security-team
/src/app/lib/auth/ @security-team
/src/app/lib/security/ @security-team
/middleware.ts @security-team
/next.config.js @security-team
/.github/workflows/ @security-team
/src/app/api/admin/ @security-team
/scripts/ @security-team

# Configuration files
/.env* @security-team @core-developers
/package.json @core-developers
/package-lock.json @core-developers

# Documentation
/docs/ @core-developers
/README.md @core-developers

# Default reviewers for all other files
* @core-developers
`;

    const codeOwnersPath = path.join(__dirname, '..', '.github', 'CODEOWNERS');
    fs.writeFileSync(codeOwnersPath, codeOwnersContent);
    console.log('  ✅ CODEOWNERS file created');
  }

  async validateConfiguration() {
    console.log('🔍 Validating branch protection configuration...\n');

    const branches = ['main', 'develop'];
    
    for (const branch of branches) {
      try {
        const protection = await this.octokit.rest.repos.getBranchProtection({
          owner: this.owner,
          repo: this.repo,
          branch: branch
        });

        console.log(`Branch: ${branch}`);
        console.log(`  Required status checks: ${protection.data.required_status_checks?.contexts?.length || 0} checks`);
        console.log(`  Required reviews: ${protection.data.required_pull_request_reviews?.required_approving_review_count || 0}`);
        console.log(`  Enforce admins: ${protection.data.enforce_admins?.enabled || false}`);
        console.log(`  Restrict pushes: ${protection.data.restrictions ? 'Yes' : 'No'}`);
        console.log('');
      } catch (error) {
        console.log(`Branch: ${branch} - No protection configured`);
      }
    }
  }

  async createSecurityTeam() {
    console.log('Setting up security team...');
    
    try {
      // Note: This requires organization admin permissions
      const team = await this.octokit.rest.teams.create({
        org: this.owner,
        name: 'security-team',
        description: 'Security team responsible for security reviews and approvals',
        privacy: 'closed',
        permission: 'pull'
      });

      console.log('  ✅ Security team created');
      
      // Add repository to team with admin permissions for security reviews
      await this.octokit.rest.teams.addOrUpdateRepoPermissionsInOrg({
        org: this.owner,
        team_slug: 'security-team',
        owner: this.owner,
        repo: this.repo,
        permission: 'admin'
      });

      console.log('  ✅ Security team added to repository');
    } catch (error) {
      if (error.status === 422) {
        console.log('  ⚠️  Security team already exists');
      } else {
        console.error('  ❌ Failed to create security team:', error.message);
        console.log('  ℹ️  You may need to create the security team manually in GitHub');
      }
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const manager = new BranchProtectionManager();

  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    console.log('Please set GITHUB_TOKEN with a personal access token that has repo admin permissions');
    process.exit(1);
  }

  try {
    if (args.includes('--validate')) {
      await manager.validateConfiguration();
    } else if (args.includes('--setup-team')) {
      await manager.createSecurityTeam();
    } else {
      await manager.setupBranchProtection();
      
      if (args.includes('--with-team')) {
        await manager.createSecurityTeam();
      }
      
      if (args.includes('--validate-after')) {
        console.log('\n');
        await manager.validateConfiguration();
      }
    }
  } catch (error) {
    console.error('❌ Operation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = BranchProtectionManager;