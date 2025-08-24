/**
 * Minimal performance monitoring for MVP
 * Provides basic performance tracking without complex monitoring infrastructure
 */

// Simple performance monitoring for MVP
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  operationName?: string
): T {
  return ((...args: any[]) => {
    const start = Date.now();
    
    try {
      const result = fn(...args);
      
      // If it's a promise, handle async timing
      if (result && typeof result.then === 'function') {
        return result.finally(() => {
          const duration = Date.now() - start;
          console.log(`[Performance] ${operationName || fn.name}: ${duration}ms`);
        });
      }
      
      // Sync operation
      const duration = Date.now() - start;
      console.log(`[Performance] ${operationName || fn.name}: ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.log(`[Performance] ${operationName || fn.name} (error): ${duration}ms`);
      throw error;
    }
  }) as T;
}

// API-specific performance monitoring
export function withApiPerformanceMonitoring<T extends (...args: any[]) => any>(
  fn: T,
  endpoint?: string
): T {
  return withPerformanceMonitoring(fn, `API ${endpoint || 'unknown'}`);
}

// Simple performance metrics collection
export interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
}

class SimplePerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100; // Keep only last 100 metrics

  track(operation: string, duration: number, success: boolean = true) {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      success
    };

    this.metrics.push(metric);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }

    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${operation}: ${duration}ms ${success ? '✓' : '✗'}`);
    }
  }

  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getAverageForOperation(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    if (operationMetrics.length === 0) return 0;
    
    const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
    return total / operationMetrics.length;
  }

  clear() {
    this.metrics = [];
  }
}

// Global performance tracker instance
const performanceTracker = new SimplePerformanceTracker();

export { performanceTracker };

// Utility function for manual performance tracking
export function trackPerformance<T>(
  operation: string,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const start = Date.now();
  
  try {
    const result = fn();
    
    if (result && typeof result === 'object' && 'then' in result) {
      // Handle Promise
      return (result as Promise<T>).then(
        (value) => {
          performanceTracker.track(operation, Date.now() - start, true);
          return value;
        },
        (error) => {
          performanceTracker.track(operation, Date.now() - start, false);
          throw error;
        }
      );
    }
    
    // Handle sync result
    performanceTracker.track(operation, Date.now() - start, true);
    return result;
  } catch (error) {
    performanceTracker.track(operation, Date.now() - start, false);
    throw error;
  }
}