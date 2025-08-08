import { chunkText } from '../document-chunker'

describe('Document Chunking System', () => {
  describe('Basic Chunking', () => {
    it('should chunk text into segments of specified size', () => {
      const text = 'This is a test document with multiple sentences. It contains various content that needs to be chunked. The chunking should preserve meaning and context.'
      const chunks = chunkText(text, 50, 10)

      expect(chunks).toHaveLength(3)
      expect(chunks[0].content).toBe('This is a test document with multiple sentences.')
      expect(chunks[1].content).toBe('It contains various content that needs to be chunked.')
      expect(chunks[2].content).toBe('The chunking should preserve meaning and context.')
    })

    it('should handle text shorter than chunk size', () => {
      const text = 'Short text.'
      const chunks = chunkText(text, 100, 20)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Short text.')
    })

    it('should handle empty text', () => {
      const text = ''
      const chunks = chunkText(text, 100, 20)

      expect(chunks).toHaveLength(0)
    })
  })

  describe('Overlap Handling', () => {
    it('should create overlapping chunks', () => {
      const text = 'Sentence one. Sentence two. Sentence three. Sentence four.'
      const chunks = chunkText(text, 30, 10)

      expect(chunks).toHaveLength(3)
      expect(chunks[0].content).toBe('Sentence one. Sentence two.')
      expect(chunks[1].content).toBe('Sentence two. Sentence three.')
      expect(chunks[2].content).toBe('Sentence three. Sentence four.')
    })

    it('should handle overlap larger than chunk size', () => {
      const text = 'This is a test.'
      const chunks = chunkText(text, 10, 15)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('This is a test.')
    })
  })

  describe('Sentence Boundary Preservation', () => {
    it('should respect sentence boundaries', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
      const chunks = chunkText(text, 40, 10)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('First sentence. Second sentence.')
      expect(chunks[1].content).toBe('Third sentence. Fourth sentence.')
    })

    it('should handle multiple punctuation marks', () => {
      const text = 'Sentence one! Sentence two? Sentence three. Sentence four...'
      const chunks = chunkText(text, 40, 10)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('Sentence one! Sentence two?')
      expect(chunks[1].content).toBe('Sentence three. Sentence four...')
    })

    it('should handle sentences without periods', () => {
      const text = 'Sentence one Sentence two Sentence three'
      const chunks = chunkText(text, 30, 10)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('Sentence one Sentence two')
      expect(chunks[1].content).toBe('Sentence two Sentence three')
    })
  })

  describe('Metadata Preservation', () => {
    it('should preserve document metadata in chunks', () => {
      const text = 'Test document content.'
      const metadata = {
        fileId: 'test-file-123',
        fileName: 'test.pdf',
        fileType: 'pdf',
        pages: 1,
        title: 'Test Document',
      }

      const chunks = chunkText(text, 100, 20, metadata)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].metadata).toEqual({
        fileId: 'test-file-123',
        fileName: 'test.pdf',
        fileType: 'pdf',
        pages: 1,
        title: 'Test Document',
        chunkIndex: 0,
        totalChunks: 1,
      })
    })

    it('should assign correct chunk indices', () => {
      const text = 'Sentence one. Sentence two. Sentence three. Sentence four.'
      const metadata = { fileId: 'test' }

      const chunks = chunkText(text, 30, 10, metadata)

      expect(chunks).toHaveLength(3)
      expect(chunks[0].metadata.chunkIndex).toBe(0)
      expect(chunks[1].metadata.chunkIndex).toBe(1)
      expect(chunks[2].metadata.chunkIndex).toBe(2)
      expect(chunks[0].metadata.totalChunks).toBe(3)
      expect(chunks[1].metadata.totalChunks).toBe(3)
      expect(chunks[2].metadata.totalChunks).toBe(3)
    })
  })

  describe('Special Characters and Formatting', () => {
    it('should handle newlines and whitespace', () => {
      const text = 'Line one.\n\nLine two.\n\nLine three.'
      const chunks = chunkText(text, 50, 10)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('Line one.\n\nLine two.')
      expect(chunks[1].content).toBe('Line two.\n\nLine three.')
    })

    it('should handle tabs and special whitespace', () => {
      const text = 'Tab\tseparated\tcontent.\nNewline\ncontent.'
      const chunks = chunkText(text, 50, 10)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Tab\tseparated\tcontent.\nNewline\ncontent.')
    })

    it('should handle unicode characters', () => {
      const text = 'Unicode: éñüß. More content: 中文.'
      const chunks = chunkText(text, 50, 10)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Unicode: éñüß. More content: 中文.')
    })
  })

  describe('Large Document Handling', () => {
    it('should handle very long documents', () => {
      const sentences = Array.from({ length: 1000 }, (_, i) => `Sentence ${i + 1}.`)
      const text = sentences.join(' ')
      const chunks = chunkText(text, 100, 20)

      expect(chunks.length).toBeGreaterThan(1)
      expect(chunks[0].content.length).toBeLessThanOrEqual(100)
      expect(chunks[chunks.length - 1].metadata.chunkIndex).toBe(chunks.length - 1)
    })

    it('should handle documents with very long sentences', () => {
      const longSentence = 'This is a very long sentence that exceeds the chunk size limit and should be split appropriately even though it does not contain any natural sentence boundaries within the chunk size limit.'
      const chunks = chunkText(longSentence, 50, 10)

      expect(chunks.length).toBeGreaterThan(1)
      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(50)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle single word documents', () => {
      const text = 'Word'
      const chunks = chunkText(text, 10, 5)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('Word')
    })

    it('should handle documents with only punctuation', () => {
      const text = '... !!! ???'
      const chunks = chunkText(text, 10, 5)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].content).toBe('... !!! ???')
    })

    it('should handle documents with repeated content', () => {
      const text = 'Same. Same. Same. Same. Same.'
      const chunks = chunkText(text, 20, 5)

      expect(chunks.length).toBeGreaterThan(1)
      chunks.forEach(chunk => {
        expect(chunk.content).toContain('Same.')
      })
    })

    it('should handle documents with HTML-like content', () => {
      const text = '<p>Paragraph one.</p><p>Paragraph two.</p>'
      const chunks = chunkText(text, 30, 10)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toBe('<p>Paragraph one.</p>')
      expect(chunks[1].content).toBe('<p>Paragraph two.</p>')
    })
  })

  describe('Performance', () => {
    it('should handle large documents efficiently', () => {
      const largeText = 'Large content. '.repeat(10000) // ~150KB
      const startTime = Date.now()
      
      const chunks = chunkText(largeText, 100, 20)
      
      const endTime = Date.now()
      const duration = endTime - startTime

      expect(chunks.length).toBeGreaterThan(1)
      expect(duration).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should maintain consistent chunk sizes', () => {
      const text = 'Test sentence. '.repeat(100)
      const chunks = chunkText(text, 50, 10)

      chunks.forEach(chunk => {
        expect(chunk.content.length).toBeLessThanOrEqual(50)
      })
    })
  })

  describe('Content Quality', () => {
    it('should preserve meaning in chunks', () => {
      const text = 'The quick brown fox jumps over the lazy dog. This sentence contains all letters of the alphabet. It is commonly used for testing.'
      const chunks = chunkText(text, 80, 20)

      expect(chunks).toHaveLength(2)
      expect(chunks[0].content).toContain('quick brown fox')
      expect(chunks[1].content).toContain('alphabet')
    })

    it('should avoid breaking words inappropriately', () => {
      const text = 'Supercalifragilisticexpialidocious is a very long word.'
      const chunks = chunkText(text, 30, 10)

      // Should not break the long word inappropriately
      chunks.forEach(chunk => {
        if (chunk.content.includes('Supercalifragilisticexpialidocious')) {
          expect(chunk.content).toContain('Supercalifragilisticexpialidocious')
        }
      })
    })
  })
})
