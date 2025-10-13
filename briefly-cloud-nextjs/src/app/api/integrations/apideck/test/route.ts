import { NextResponse } from 'next/server';
import { createProtectedApiHandler, type ApiContext } from '@/app/lib/api-middleware';
import { isApideckEnabled, validateApideckConfig } from '@/app/lib/integrations/apideck';

const handler = async (_req: Request, ctx: ApiContext) => {
  if (!ctx.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const testResults = {
    timestamp: new Date().toISOString(),
    userId: ctx.user.id,
    tests: [] as Array<{
      name: string;
      status: 'pass' | 'fail' | 'warning';
      message: string;
      details?: any;
    }>
  };

  // Test 1: Check if Apideck is enabled
  try {
    const enabled = isApideckEnabled();
    testResults.tests.push({
      name: 'Apideck Enabled',
      status: enabled ? 'pass' : 'warning',
      message: enabled ? 'Apideck integration is enabled' : 'Apideck integration is disabled',
      details: { enabled }
    });
  } catch (error) {
    testResults.tests.push({
      name: 'Apideck Enabled',
      status: 'fail',
      message: 'Failed to check if Apideck is enabled',
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    });
  }

  // Test 2: Validate configuration
  try {
    validateApideckConfig();
    testResults.tests.push({
      name: 'Configuration Validation',
      status: 'pass',
      message: 'All required Apideck environment variables are present'
    });
  } catch (error) {
    testResults.tests.push({
      name: 'Configuration Validation',
      status: 'fail',
      message: 'Apideck configuration is incomplete',
      details: { error: error instanceof Error ? error.message : 'Unknown error' }
    });
  }

  // Test 3: Check environment variables format
  const envChecks = [
    {
      name: 'APIDECK_API_KEY',
      value: process.env.APIDECK_API_KEY,
      expectedPrefix: 'sk_',
      isSecret: true
    },
    {
      name: 'APIDECK_APP_ID',
      value: process.env.APIDECK_APP_ID,
      expectedPrefix: 'app_',
      isSecret: false
    },
    {
      name: 'APIDECK_APP_UID',
      value: process.env.APIDECK_APP_UID,
      expectedPrefix: 'app_uid_',
      isSecret: false
    },
    {
      name: 'APIDECK_API_BASE_URL',
      value: process.env.APIDECK_API_BASE_URL,
      expectedValue: 'https://unify.apideck.com',
      isSecret: false
    },
    {
      name: 'APIDECK_VAULT_BASE_URL',
      value: process.env.APIDECK_VAULT_BASE_URL,
      expectedValue: 'https://unify.apideck.com/vault',
      isSecret: false
    },
    {
      name: 'APIDECK_REDIRECT_URL',
      value: process.env.APIDECK_REDIRECT_URL,
      isSecret: false
    }
  ];

  for (const check of envChecks) {
    const hasValue = !!check.value && check.value !== 'undefined' && check.value !== 'null';
    const isPlaceholder = check.value?.includes('xxx') || check.value === 'your_value_here';
    
    if (!hasValue) {
      testResults.tests.push({
        name: `Environment Variable: ${check.name}`,
        status: 'fail',
        message: `${check.name} is not set`,
        details: { variable: check.name, hasValue: false }
      });
    } else if (isPlaceholder) {
      testResults.tests.push({
        name: `Environment Variable: ${check.name}`,
        status: 'fail',
        message: `${check.name} contains placeholder value`,
        details: { 
          variable: check.name, 
          value: check.isSecret ? '[REDACTED]' : check.value,
          isPlaceholder: true
        }
      });
    } else if (check.expectedPrefix && !check.value.startsWith(check.expectedPrefix)) {
      testResults.tests.push({
        name: `Environment Variable: ${check.name}`,
        status: 'fail',
        message: `${check.name} does not start with expected prefix "${check.expectedPrefix}"`,
        details: { 
          variable: check.name, 
          value: check.isSecret ? '[REDACTED]' : check.value,
          expectedPrefix: check.expectedPrefix
        }
      });
    } else if (check.expectedValue && check.value !== check.expectedValue) {
      testResults.tests.push({
        name: `Environment Variable: ${check.name}`,
        status: 'warning',
        message: `${check.name} does not match expected value`,
        details: { 
          variable: check.name, 
          value: check.value,
          expectedValue: check.expectedValue
        }
      });
    } else {
      testResults.tests.push({
        name: `Environment Variable: ${check.name}`,
        status: 'pass',
        message: `${check.name} is properly configured`,
        details: { 
          variable: check.name, 
          value: check.isSecret ? '[REDACTED]' : check.value
        }
      });
    }
  }

  // Test 4: Test Apideck API connectivity (if configuration is valid)
  const configValid = testResults.tests
    .filter(t => t.name.includes('Configuration') || t.name.includes('Environment'))
    .every(t => t.status === 'pass');

  if (configValid && isApideckEnabled()) {
    try {
      const response = await fetch('https://unify.apideck.com/vault/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.APIDECK_API_KEY}`,
          'x-apideck-app-id': process.env.APIDECK_APP_ID!,
          'x-apideck-consumer-id': ctx.user.id,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          application_id: process.env.APIDECK_APP_ID,
          unified_api: 'file-storage',
          redirect_uri: process.env.APIDECK_REDIRECT_URL
        })
      });

      if (response.ok) {
        testResults.tests.push({
          name: 'Apideck API Connectivity',
          status: 'pass',
          message: 'Successfully connected to Apideck API',
          details: { statusCode: response.status }
        });
      } else {
        const errorText = await response.text();
        testResults.tests.push({
          name: 'Apideck API Connectivity',
          status: 'fail',
          message: `Apideck API returned error: ${response.status}`,
          details: { 
            statusCode: response.status, 
            statusText: response.statusText,
            error: errorText
          }
        });
      }
    } catch (error) {
      testResults.tests.push({
        name: 'Apideck API Connectivity',
        status: 'fail',
        message: 'Failed to connect to Apideck API',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  } else {
    testResults.tests.push({
      name: 'Apideck API Connectivity',
      status: 'warning',
      message: 'Skipped API test due to configuration issues',
      details: { reason: 'Configuration validation failed or Apideck disabled' }
    });
  }

  // Calculate overall status
  const hasFailures = testResults.tests.some(t => t.status === 'fail');
  const hasWarnings = testResults.tests.some(t => t.status === 'warning');
  
  const overallStatus = hasFailures ? 'fail' : hasWarnings ? 'warning' : 'pass';
  
  return NextResponse.json({
    status: overallStatus,
    message: hasFailures 
      ? 'Apideck integration has configuration issues'
      : hasWarnings 
        ? 'Apideck integration has warnings'
        : 'Apideck integration is properly configured',
    ...testResults
  });
};

export const GET = createProtectedApiHandler(handler);