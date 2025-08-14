/**
 * ESLint Security Configuration
 * 
 * Security-focused ESLint rules for detecting potential security vulnerabilities
 * in the codebase including XSS, injection attacks, and insecure patterns.
 */

module.exports = {
  extends: [
    'next/core-web-vitals',
    'plugin:security/recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  plugins: [
    'security',
    'no-secrets',
    '@typescript-eslint'
  ],
  rules: {
    // Security-specific rules
    'security/detect-object-injection': 'error',
    'security/detect-non-literal-regexp': 'error',
    'security/detect-non-literal-fs-filename': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-pseudoRandomBytes': 'error',
    'security/detect-possible-timing-attacks': 'error',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-child-process': 'error',
    'security/detect-disable-mustache-escape': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-non-literal-require': 'error',
    
    // Secrets detection
    'no-secrets/no-secrets': ['error', {
      'tolerance': 4.2,
      'additionalRegexes': {
        'Supabase URL': 'https://[a-zA-Z0-9]+\\.supabase\\.co',
        'Supabase Key': 'eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+',
        'OpenAI Key': 'sk-[a-zA-Z0-9]{48}',
        'Stripe Key': 'sk_[a-z]+_[a-zA-Z0-9]{24,}',
        'JWT Secret': '[a-zA-Z0-9_-]{32,}'
      }
    }],
    
    // TypeScript security rules
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    
    // Custom security rules
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'error',
    'no-console': ['warn', { 
      allow: ['warn', 'error'] 
    }],
    
    // Prevent dangerous patterns
    'no-unused-vars': ['error', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_' 
    }],
    'prefer-const': 'error',
    'no-var': 'error',
    
    // React/Next.js security
    'react/no-danger': 'error',
    'react/no-danger-with-children': 'error',
    'react/jsx-no-script-url': 'error',
    'react/jsx-no-target-blank': ['error', { 
      'enforceDynamicLinks': 'always' 
    }],
    
    // API security
    'no-restricted-imports': ['error', {
      'patterns': [
        {
          'group': ['**/node_modules/**'],
          'message': 'Direct node_modules imports not allowed'
        }
      ]
    }],
    
    // Database security
    'no-restricted-syntax': [
      'error',
      {
        'selector': 'TemplateLiteral[expressions.length>0][quasis.0.value.raw*="SELECT"]',
        'message': 'Raw SQL queries with template literals are not allowed. Use parameterized queries.'
      },
      {
        'selector': 'TemplateLiteral[expressions.length>0][quasis.0.value.raw*="INSERT"]',
        'message': 'Raw SQL queries with template literals are not allowed. Use parameterized queries.'
      },
      {
        'selector': 'TemplateLiteral[expressions.length>0][quasis.0.value.raw*="UPDATE"]',
        'message': 'Raw SQL queries with template literals are not allowed. Use parameterized queries.'
      },
      {
        'selector': 'TemplateLiteral[expressions.length>0][quasis.0.value.raw*="DELETE"]',
        'message': 'Raw SQL queries with template literals are not allowed. Use parameterized queries.'
      }
    ]
  },
  
  overrides: [
    {
      // Stricter rules for API routes
      files: ['src/app/api/**/*.ts', 'src/app/api/**/*.js'],
      rules: {
        'security/detect-object-injection': 'error',
        'no-console': 'error',
        '@typescript-eslint/no-explicit-any': 'error'
      }
    },
    {
      // Stricter rules for authentication and security modules
      files: [
        'src/app/lib/auth/**/*.ts',
        'src/app/lib/security/**/*.ts',
        'src/app/lib/audit/**/*.ts'
      ],
      rules: {
        'security/detect-possible-timing-attacks': 'error',
        'security/detect-pseudoRandomBytes': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-function-return-type': 'error'
      }
    },
    {
      // More lenient rules for test files
      files: ['**/*.test.ts', '**/*.test.js', 'tests/**/*'],
      rules: {
        'security/detect-object-injection': 'warn',
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off'
      }
    }
  ],
  
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  
  settings: {
    react: {
      version: 'detect'
    }
  }
};