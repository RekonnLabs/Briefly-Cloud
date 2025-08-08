import { extractTextFromFile } from '../document-extractor'

// Mock file processing libraries
jest.mock('pdf-parse', () => ({
  default: jest.fn(),
}))

jest.mock('mammoth', () => ({
  convertToHtml: jest.fn(),
  extractRawText: jest.fn(),
}))

jest.mock('xlsx', () => ({
  read: jest.fn(),
}))

describe('Document Text Extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('PDF Processing', () => {
    it('should extract text from PDF files', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockResolvedValue({
        text: 'This is test PDF content with multiple lines.\nSecond line of content.',
        numpages: 2,
        info: {
          Title: 'Test PDF',
          Author: 'Test Author',
        },
      })

      const fileBuffer = Buffer.from('fake pdf content')
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'test.pdf')

      expect(mockPdfParse).toHaveBeenCalledWith(fileBuffer)
      expect(result.text).toBe('This is test PDF content with multiple lines.\nSecond line of content.')
      expect(result.metadata).toEqual({
        pages: 2,
        title: 'Test PDF',
        author: 'Test Author',
        fileType: 'pdf',
        fileName: 'test.pdf',
      })
    })

    it('should handle PDF parsing errors', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockRejectedValue(new Error('Invalid PDF format'))

      const fileBuffer = Buffer.from('invalid pdf content')

      await expect(extractTextFromFile(fileBuffer, 'application/pdf', 'invalid.pdf')).rejects.toThrow('Invalid PDF format')
    })

    it('should handle empty PDF files', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockResolvedValue({
        text: '',
        numpages: 0,
        info: {},
      })

      const fileBuffer = Buffer.from('empty pdf')
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'empty.pdf')

      expect(result.text).toBe('')
      expect(result.metadata.pages).toBe(0)
    })
  })

  describe('Word Document Processing', () => {
    it('should extract text from DOCX files', async () => {
      const mockMammoth = require('mammoth')
      mockMammoth.extractRawText.mockResolvedValue({
        value: 'This is test Word document content.\nWith multiple paragraphs.',
      })

      const fileBuffer = Buffer.from('fake docx content')
      const result = await extractTextFromFile(fileBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'test.docx')

      expect(mockMammoth.extractRawText).toHaveBeenCalledWith({ buffer: fileBuffer })
      expect(result.text).toBe('This is test Word document content.\nWith multiple paragraphs.')
      expect(result.metadata.fileType).toBe('docx')
    })

    it('should handle DOCX parsing errors', async () => {
      const mockMammoth = require('mammoth')
      mockMammoth.extractRawText.mockRejectedValue(new Error('Invalid DOCX format'))

      const fileBuffer = Buffer.from('invalid docx content')

      await expect(extractTextFromFile(fileBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'invalid.docx')).rejects.toThrow('Invalid DOCX format')
    })
  })

  describe('Excel Processing', () => {
    it('should extract text from XLSX files', async () => {
      const mockXlsx = require('xlsx')
      mockXlsx.read.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {
            'A1': { v: 'Header 1' },
            'A2': { v: 'Data 1' },
            'B1': { v: 'Header 2' },
            'B2': { v: 'Data 2' },
          },
          Sheet2: {
            'A1': { v: 'Sheet 2 Data' },
          },
        },
      })

      const fileBuffer = Buffer.from('fake xlsx content')
      const result = await extractTextFromFile(fileBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'test.xlsx')

      expect(mockXlsx.read).toHaveBeenCalledWith(fileBuffer, { type: 'buffer' })
      expect(result.text).toContain('Header 1')
      expect(result.text).toContain('Data 1')
      expect(result.text).toContain('Header 2')
      expect(result.text).toContain('Data 2')
      expect(result.text).toContain('Sheet 2 Data')
      expect(result.metadata.fileType).toBe('xlsx')
      expect(result.metadata.sheets).toBe(2)
    })

    it('should handle empty Excel files', async () => {
      const mockXlsx = require('xlsx')
      mockXlsx.read.mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {},
        },
      })

      const fileBuffer = Buffer.from('empty xlsx')
      const result = await extractTextFromFile(fileBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'empty.xlsx')

      expect(result.text).toBe('')
      expect(result.metadata.sheets).toBe(1)
    })
  })

  describe('Text File Processing', () => {
    it('should extract text from plain text files', async () => {
      const fileBuffer = Buffer.from('This is plain text content.\nWith multiple lines.')
      const result = await extractTextFromFile(fileBuffer, 'text/plain', 'test.txt')

      expect(result.text).toBe('This is plain text content.\nWith multiple lines.')
      expect(result.metadata.fileType).toBe('txt')
    })

    it('should handle UTF-8 encoding', async () => {
      const fileBuffer = Buffer.from('Special characters: éñüß', 'utf8')
      const result = await extractTextFromFile(fileBuffer, 'text/plain', 'unicode.txt')

      expect(result.text).toBe('Special characters: éñüß')
    })

    it('should handle markdown files', async () => {
      const fileBuffer = Buffer.from('# Markdown Title\n\nThis is **bold** text.')
      const result = await extractTextFromFile(fileBuffer, 'text/markdown', 'test.md')

      expect(result.text).toBe('# Markdown Title\n\nThis is **bold** text.')
      expect(result.metadata.fileType).toBe('md')
    })
  })

  describe('CSV Processing', () => {
    it('should extract text from CSV files', async () => {
      const fileBuffer = Buffer.from('Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles')
      const result = await extractTextFromFile(fileBuffer, 'text/csv', 'test.csv')

      expect(result.text).toBe('Name,Age,City\nJohn,30,New York\nJane,25,Los Angeles')
      expect(result.metadata.fileType).toBe('csv')
    })

    it('should handle CSV with special characters', async () => {
      const fileBuffer = Buffer.from('Name,Description\nJohn,"Contains, comma"\nJane,"Contains ""quotes"""')
      const result = await extractTextFromFile(fileBuffer, 'text/csv', 'special.csv')

      expect(result.text).toBe('Name,Description\nJohn,"Contains, comma"\nJane,"Contains ""quotes"""')
    })
  })

  describe('Error Handling', () => {
    it('should reject unsupported file types', async () => {
      const fileBuffer = Buffer.from('unsupported content')

      await expect(extractTextFromFile(fileBuffer, 'application/octet-stream', 'unsupported.bin')).rejects.toThrow('Unsupported file type: application/octet-stream')
    })

    it('should handle corrupted files', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockRejectedValue(new Error('PDF header not found'))

      const fileBuffer = Buffer.from('corrupted content')

      await expect(extractTextFromFile(fileBuffer, 'application/pdf', 'corrupted.pdf')).rejects.toThrow('PDF header not found')
    })

    it('should handle empty files', async () => {
      const fileBuffer = Buffer.from('')
      const result = await extractTextFromFile(fileBuffer, 'text/plain', 'empty.txt')

      expect(result.text).toBe('')
      expect(result.metadata.fileType).toBe('txt')
    })
  })

  describe('Performance', () => {
    it('should handle large files efficiently', async () => {
      const mockPdfParse = require('pdf-parse').default
      const largeText = 'Large content '.repeat(10000) // ~150KB
      mockPdfParse.mockResolvedValue({
        text: largeText,
        numpages: 1,
        info: {},
      })

      const fileBuffer = Buffer.from('large pdf content')
      const startTime = Date.now()
      
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'large.pdf')
      
      const endTime = Date.now()
      const duration = endTime - startTime

      expect(result.text).toBe(largeText)
      expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
    })

    it('should handle files with many pages', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockResolvedValue({
        text: 'Multi-page content',
        numpages: 100,
        info: { Title: 'Large Document' },
      })

      const fileBuffer = Buffer.from('multi-page pdf')
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'multi-page.pdf')

      expect(result.metadata.pages).toBe(100)
      expect(result.text).toBe('Multi-page content')
    })
  })

  describe('Metadata Extraction', () => {
    it('should extract comprehensive metadata from PDFs', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockResolvedValue({
        text: 'PDF content',
        numpages: 5,
        info: {
          Title: 'Test Document',
          Author: 'John Doe',
          Subject: 'Test Subject',
          Keywords: 'test, document, pdf',
          CreationDate: '2023-01-01',
        },
      })

      const fileBuffer = Buffer.from('pdf content')
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'test.pdf')

      expect(result.metadata).toEqual({
        pages: 5,
        title: 'Test Document',
        author: 'John Doe',
        subject: 'Test Subject',
        keywords: 'test, document, pdf',
        creationDate: '2023-01-01',
        fileType: 'pdf',
        fileName: 'test.pdf',
      })
    })

    it('should handle missing metadata gracefully', async () => {
      const mockPdfParse = require('pdf-parse').default
      mockPdfParse.mockResolvedValue({
        text: 'PDF content',
        numpages: 1,
        info: {},
      })

      const fileBuffer = Buffer.from('pdf content')
      const result = await extractTextFromFile(fileBuffer, 'application/pdf', 'test.pdf')

      expect(result.metadata).toEqual({
        pages: 1,
        title: undefined,
        author: undefined,
        fileType: 'pdf',
        fileName: 'test.pdf',
      })
    })
  })
})
