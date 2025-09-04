// Mock TokenStore for tests
export const TokenStore = {
  getToken: jest.fn(),
  saveToken: jest.fn(),
  deleteToken: jest.fn(),
  refreshToken: jest.fn()
}