/**
 * Load Testing and Performance Benchmarks
 * 
 * Tests system performance under various load conditions
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  apiResponseTime: 1000, // 1 second
  healthCheckTime: 500,  // 500ms
  concurrentUsers: 50,   // 50 concurrent requests
  memoryUsage: 85,       // 85% max memory usage
  errorRate: 5,          // 5% max error rate
};

describe('Performance and Load Testing', () => {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // Warm up the system
    await fetch(`${baseUrl}/api/health`);
  });

  describe('Response Time Benchmarks', () => {
    it('should meet health check response time requirements', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const response = await fetch(`${baseUrl}/api/health`);
        const responseTime = Date.now() - startTime;
        
        expect(response.status).toBe(200);
        responseTimes.push(responseTime);
      }

      const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      console.log(`Health Check - Average: ${averageResponseTime}ms, Max: ${maxResponseTime}ms`);
      
      expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.healthCheckTime);
      expect(maxResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.healthCheckTime * 2);
    });

    it('should meet API endpoint response time requirements', async () => {
      const endpoints = [
        '/api/health',
        '/api/client-ip'
      ];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await fetch(`${baseUrl}${endpoint}`);
        const responseTime = Date.now() - startTime;

        expect(response.status).toBeLessThan(400);
        expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime);
        
        console.log(`${endpoint} - Response time: ${responseTime}ms`);
      }
    });
  });

  describe('Concurrent Load Testing', () => {
    it('should handle concurrent requests without degradation', async () => {
      const concurrentRequests = PERFORMANCE_THRESHOLDS.concurrentUsers;
      const startTime = Date.now();
      
      const promises = Array(concurrentRequests).fill(null).map(async (_, index) => {
        const requestStart = Date.now();
        const response = await fetch(`${baseUrl}/api/health`);
        const requestTime = Date.now() - requestStart;
        
        return {
          index,
          status: response.status,
          responseTime: requestTime,
          success: response.status === 200
        };
      });

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // Analyze results
      const successfulRequests = results.filter(r => r.success).length;
      const errorRate = ((concurrentRequests - successfulRequests) / concurrentRequests) * 100;
      const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
      const maxResponseTime = Math.max(...results.map(r => r.responseTime));

      console.log(`Concurrent Load Test Results:`);
      console.log(`- Total requests: ${concurrentRequests}`);
      console.log(`- Successful requests: ${successfulRequests}`);
      console.log(`- Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`- Average response time: ${averageResponseTime.toFixed(2)}ms`);
      console.log(`- Max response time: ${maxResponseTime}ms`);
      console.log(`- Total test time: ${totalTime}ms`);

      // Assertions
      expect(errorRate).toBeLessThan(PERFORMANCE_THRESHOLDS.errorRate);
      expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime);
      expect(successfulRequests).toBe(concurrentRequests);
    });

    it('should maintain performance under sustained load', async () => {
      const duration = 30000; // 30 seconds
      const requestInterval = 100; // 100ms between requests
      const startTime = Date.now();
      const results: Array<{ responseTime: number; success: boolean; timestamp: number }> = [];

      while (Date.now() - startTime < duration) {
        const requestStart = Date.now();
        
        try {
          const response = await fetch(`${baseUrl}/api/health`);
          const responseTime = Date.now() - requestStart;
          
          results.push({
            responseTime,
            success: response.status === 200,
            timestamp: Date.now()
          });
        } catch (error) {
          results.push({
            responseTime: Date.now() - requestStart,
            success: false,
            timestamp: Date.now()
          });
        }

        // Wait before next request
        await new Promise(resolve => setTimeout(resolve, requestInterval));
      }

      // Analyze sustained load results
      const successfulRequests = results.filter(r => r.success).length;
      const totalRequests = results.length;
      const errorRate = ((totalRequests - successfulRequests) / totalRequests) * 100;
      const averageResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

      console.log(`Sustained Load Test Results:`);
      console.log(`- Duration: ${duration}ms`);
      console.log(`- Total requests: ${totalRequests}`);
      console.log(`- Successful requests: ${successfulRequests}`);
      console.log(`- Error rate: ${errorRate.toFixed(2)}%`);
      console.log(`- Average response time: ${averageResponseTime.toFixed(2)}ms`);

      expect(errorRate).toBeLessThan(PERFORMANCE_THRESHOLDS.errorRate);
      expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.apiResponseTime);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain acceptable memory usage', async () => {
      // Make several requests to potentially increase memory usage
      const requests = 20;
      
      for (let i = 0; i < requests; i++) {
        await fetch(`${baseUrl}/api/health`);
      }

      // Check memory usage
      const response = await fetch(`${baseUrl}/api/health`);
      const health = await response.json();

      if (health.performance?.memory) {
        console.log(`Memory usage: ${health.performance.memory.percentage}%`);
        console.log(`Memory used: ${health.performance.memory.used}MB`);
        console.log(`Memory total: ${health.performance.memory.total}MB`);

        expect(health.performance.memory.percentage).toBeLessThan(PERFORMANCE_THRESHOLDS.memoryUsage);
      }
    });

    it('should handle memory cleanup properly', async () => {
      // Get initial memory usage
      const initialResponse = await fetch(`${baseUrl}/api/health`);
      const initialHealth = await initialResponse.json();
      const initialMemory = initialHealth.performance?.memory?.used || 0;

      // Generate some load
      const promises = Array(10).fill(null).map(() => 
        fetch(`${baseUrl}/api/health`)
      );
      await Promise.all(promises);

      // Wait for potential garbage collection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check memory usage after load
      const finalResponse = await fetch(`${baseUrl}/api/health`);
      const finalHealth = await finalResponse.json();
      const finalMemory = finalHealth.performance?.memory?.used || 0;

      console.log(`Memory - Initial: ${initialMemory}MB, Final: ${finalMemory}MB`);

      // Memory should not increase dramatically
      const memoryIncrease = finalMemory - initialMemory;
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB increase
    });
  });

  describe('Database Performance', () => {
    it('should maintain database connection performance', async () => {
      const iterations = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const response = await fetch(`${baseUrl}/api/health`);
        const health = await response.json();
        const responseTime = Date.now() - startTime;

        expect(response.status).toBe(200);
        expect(health.services.database.status).toBe('healthy');
        
        responseTimes.push(health.services.database.responseTime || responseTime);
      }

      const averageDbTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxDbTime = Math.max(...responseTimes);

      console.log(`Database - Average: ${averageDbTime}ms, Max: ${maxDbTime}ms`);

      expect(averageDbTime).toBeLessThan(500); // 500ms average
      expect(maxDbTime).toBeLessThan(1000); // 1s max
    });
  });

  describe('External Service Performance', () => {
    it('should maintain OpenAI API performance', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const health = await response.json();

      expect(health.services.openai.status).toBe('healthy');
      
      if (health.services.openai.responseTime) {
        console.log(`OpenAI API response time: ${health.services.openai.responseTime}ms`);
        expect(health.services.openai.responseTime).toBeLessThan(3000); // 3 seconds
      }
    });

    it('should maintain Supabase service performance', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      const health = await response.json();

      expect(health.services.supabase.status).toBe('healthy');
      
      if (health.services.supabase.responseTime) {
        console.log(`Supabase response time: ${health.services.supabase.responseTime}ms`);
        expect(health.services.supabase.responseTime).toBeLessThan(1000); // 1 second
      }
    });
  });

  describe('Error Rate Analysis', () => {
    it('should maintain low error rates under normal load', async () => {
      const totalRequests = 100;
      const results: boolean[] = [];

      for (let i = 0; i < totalRequests; i++) {
        try {
          const response = await fetch(`${baseUrl}/api/health`);
          results.push(response.status === 200);
        } catch (error) {
          results.push(false);
        }
      }

      const successfulRequests = results.filter(Boolean).length;
      const errorRate = ((totalRequests - successfulRequests) / totalRequests) * 100;

      console.log(`Error Rate Analysis:`);
      console.log(`- Total requests: ${totalRequests}`);
      console.log(`- Successful requests: ${successfulRequests}`);
      console.log(`- Error rate: ${errorRate.toFixed(2)}%`);

      expect(errorRate).toBeLessThan(PERFORMANCE_THRESHOLDS.errorRate);
    });
  });

  describe('Scalability Testing', () => {
    it('should handle increasing load gracefully', async () => {
      const loadLevels = [5, 10, 20, 30];
      const results: Array<{
        concurrency: number;
        averageResponseTime: number;
        errorRate: number;
      }> = [];

      for (const concurrency of loadLevels) {
        const promises = Array(concurrency).fill(null).map(async () => {
          const startTime = Date.now();
          try {
            const response = await fetch(`${baseUrl}/api/health`);
            return {
              responseTime: Date.now() - startTime,
              success: response.status === 200
            };
          } catch (error) {
            return {
              responseTime: Date.now() - startTime,
              success: false
            };
          }
        });

        const responses = await Promise.all(promises);
        const successfulRequests = responses.filter(r => r.success).length;
        const averageResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
        const errorRate = ((concurrency - successfulRequests) / concurrency) * 100;

        results.push({
          concurrency,
          averageResponseTime,
          errorRate
        });

        console.log(`Concurrency ${concurrency}: ${averageResponseTime.toFixed(2)}ms avg, ${errorRate.toFixed(2)}% errors`);
      }

      // Verify that performance doesn't degrade significantly
      const baselineResponseTime = results[0].averageResponseTime;
      const maxResponseTime = Math.max(...results.map(r => r.averageResponseTime));
      const degradationRatio = maxResponseTime / baselineResponseTime;

      expect(degradationRatio).toBeLessThan(3); // No more than 3x degradation
      
      // All error rates should be acceptable
      results.forEach(result => {
        expect(result.errorRate).toBeLessThan(PERFORMANCE_THRESHOLDS.errorRate);
      });
    });
  });
});