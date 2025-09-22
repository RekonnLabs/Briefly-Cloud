// Mock ImportJobManager for tests
export const ImportJobManager = {
  createJob: jest.fn(),
  processJob: jest.fn(),
  getUserJobs: jest.fn(),
  getJobStatus: jest.fn(),
  cancelJob: jest.fn()
}
