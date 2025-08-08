/**
 * Accessibility Audit Component
 * 
 * Provides tools for auditing and improving accessibility compliance
 */

'use client';

import React, { useState, useEffect } from 'react';
import { a11y, AccessibilityIssue } from '@/app/lib/accessibility';

interface AccessibilityAuditProps {
  targetElement?: HTMLElement;
  autoRun?: boolean;
  showInProduction?: boolean;
}

export default function AccessibilityAudit({ 
  targetElement, 
  autoRun = false,
  showInProduction = false 
}: AccessibilityAuditProps) {
  const [issues, setIssues] = useState<AccessibilityIssue[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  // Don't show in production unless explicitly enabled
  const shouldShow = process.env.NODE_ENV === 'development' || showInProduction;

  useEffect(() => {
    if (autoRun && shouldShow) {
      runAudit();
    }
  }, [autoRun, shouldShow]);

  const runAudit = async () => {
    setIsRunning(true);
    
    try {
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const container = targetElement || document.body;
      const auditResults = a11y.auditAccessibility(container);
      
      setIssues(auditResults);
      setLastRun(new Date());
      
      // Log results to console for developers
      if (auditResults.length > 0) {
        console.group('🔍 Accessibility Audit Results');
        auditResults.forEach(issue => {
          const logMethod = issue.type === 'error' ? console.error : console.warn;
          logMethod(`${issue.rule}: ${issue.message}`, issue.element);
        });
        console.groupEnd();
      } else {
        console.log('✅ No accessibility issues found!');
      }
      
    } catch (error) {
      console.error('Accessibility audit failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const fixIssue = (issue: AccessibilityIssue) => {
    const element = issue.element;
    
    try {
      switch (issue.rule) {
        case 'WCAG 1.1.1': // Missing alt text
          if (element.tagName === 'IMG') {
            const altText = prompt('Enter alt text for this image:', '');
            if (altText !== null) {
              element.setAttribute('alt', altText);
              runAudit(); // Re-run audit
            }
          }
          break;
          
        case 'WCAG 1.3.1': // Missing form labels
          if (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
            const labelText = prompt('Enter label text for this form control:', '');
            if (labelText !== null) {
              element.setAttribute('aria-label', labelText);
              runAudit(); // Re-run audit
            }
          }
          break;
          
        case 'WCAG 2.4.7': // Missing focus indicator
          // Add a basic focus style
          element.style.outline = '2px solid #0066cc';
          element.style.outlineOffset = '2px';
          runAudit(); // Re-run audit
          break;
          
        default:
          alert('This issue requires manual fixing. Please check the console for details.');
      }
    } catch (error) {
      console.error('Failed to fix accessibility issue:', error);
      alert('Failed to fix this issue automatically.');
    }
  };

  const highlightElement = (element: HTMLElement) => {
    // Remove existing highlights
    document.querySelectorAll('.a11y-highlight').forEach(el => {
      el.classList.remove('a11y-highlight');
    });
    
    // Add highlight to current element
    element.classList.add('a11y-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      element.classList.remove('a11y-highlight');
    }, 3000);
  };

  const getIssueIcon = (type: 'error' | 'warning') => {
    return type === 'error' ? '🚨' : '⚠️';
  };

  const getIssueColor = (type: 'error' | 'warning') => {
    return type === 'error' ? 'text-red-600' : 'text-yellow-600';
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <>
      {/* Floating Audit Button */}
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setShowAudit(!showAudit)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Accessibility Audit"
          aria-label="Open accessibility audit panel"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {issues.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
              {issues.length}
            </span>
          )}
        </button>
      </div>

      {/* Audit Panel */}
      {showAudit && (
        <div className="fixed bottom-20 left-4 w-96 max-h-96 bg-white border border-gray-300 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Accessibility Audit</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={runAudit}
                  disabled={isRunning}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded transition-colors"
                >
                  {isRunning ? 'Running...' : 'Run Audit'}
                </button>
                <button
                  onClick={() => setShowAudit(false)}
                  className="text-gray-400 hover:text-gray-600"
                  aria-label="Close audit panel"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {lastRun && (
              <p className="text-xs text-gray-500 mt-1">
                Last run: {lastRun.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {issues.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                {lastRun ? (
                  <div>
                    <div className="text-green-600 text-2xl mb-2">✅</div>
                    <p>No accessibility issues found!</p>
                  </div>
                ) : (
                  <p>Click "Run Audit" to check for accessibility issues</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {issues.map((issue, index) => (
                  <div key={index} className="p-3">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{getIssueIcon(issue.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-medium ${getIssueColor(issue.type)}`}>
                            {issue.rule}
                          </span>
                          <span className="text-xs text-gray-500 uppercase">
                            {issue.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-2">
                          {issue.message}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => highlightElement(issue.element)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Highlight
                          </button>
                          <button
                            onClick={() => fixIssue(issue)}
                            className="text-xs text-green-600 hover:text-green-800 underline"
                          >
                            Quick Fix
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {issues.length > 0 && (
            <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
              <div className="flex justify-between text-xs text-gray-600">
                <span>
                  {issues.filter(i => i.type === 'error').length} errors, {' '}
                  {issues.filter(i => i.type === 'warning').length} warnings
                </span>
                <button
                  onClick={() => {
                    console.log('Accessibility Issues:', issues);
                    alert('Issues logged to console');
                  }}
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  Export to Console
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS for highlighting elements */}
      <style jsx global>{`
        .a11y-highlight {
          outline: 3px solid #ff6b6b !important;
          outline-offset: 2px !important;
          background-color: rgba(255, 107, 107, 0.1) !important;
          transition: all 0.3s ease !important;
        }
      `}</style>
    </>
  );
}

// Hook for using accessibility audit in components
export function useAccessibilityAudit() {
  const [issues, setIssues] = useState<AccessibilityIssue[]>([]);

  const runAudit = (container?: HTMLElement) => {
    const auditContainer = container || document.body;
    const results = a11y.auditAccessibility(auditContainer);
    setIssues(results);
    return results;
  };

  return {
    issues,
    runAudit,
    hasErrors: issues.some(issue => issue.type === 'error'),
    hasWarnings: issues.some(issue => issue.type === 'warning'),
    errorCount: issues.filter(issue => issue.type === 'error').length,
    warningCount: issues.filter(issue => issue.type === 'warning').length
  };
}