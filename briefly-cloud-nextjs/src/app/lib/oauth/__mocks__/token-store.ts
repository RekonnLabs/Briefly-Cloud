// Mock TokenStore for tests
export const getToken = jest.fn()
export const saveToken = jest.fn()

export const TokenStore = {
  getToken: jest.fn(),
  saveToken: jest.fn(),
  deleteToken: jest.fn(),
  refreshToken: jest.fn(),
  refreshTokenIfNeeded: jest.fn(),
}
