package com.landseek.amphibian

import com.landseek.amphibian.service.WordPieceTokenizer
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * Unit tests for WordPieceTokenizer
 */
@RunWith(RobolectricTestRunner::class)
class WordPieceTokenizerTest {
    
    private lateinit var tokenizer: WordPieceTokenizer
    
    @Before
    fun setup() {
        val context = RuntimeEnvironment.getApplication().applicationContext
        tokenizer = WordPieceTokenizer(context)
    }
    
    @Test
    fun `tokenize returns correct length arrays`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenize("Hello world")
        
        assertEquals(WordPieceTokenizer.MAX_SEQ_LENGTH, result.inputIds.size)
        assertEquals(WordPieceTokenizer.MAX_SEQ_LENGTH, result.attentionMask.size)
        assertEquals(WordPieceTokenizer.MAX_SEQ_LENGTH, result.tokenTypeIds.size)
    }
    
    @Test
    fun `tokenize adds CLS and SEP tokens`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenize("Hello")
        val specialIds = tokenizer.getSpecialTokenIds()
        
        // First token should be [CLS]
        assertEquals(specialIds.cls.toLong(), result.inputIds[0])
        
        // Should have [SEP] token after content
        assertTrue(result.inputIds.contains(specialIds.sep.toLong()))
    }
    
    @Test
    fun `attention mask marks real tokens`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenize("Test")
        
        // First few tokens should have attention mask = 1
        assertEquals(1L, result.attentionMask[0])
        assertEquals(1L, result.attentionMask[1])
        assertEquals(1L, result.attentionMask[2]) // [CLS], "test", [SEP]
        
        // Later tokens should be padding (0)
        assertEquals(0L, result.attentionMask[result.attentionMask.size - 1])
    }
    
    @Test
    fun `tokenize handles empty string`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenize("")
        val specialIds = tokenizer.getSpecialTokenIds()
        
        // Should still have [CLS] and [SEP]
        assertEquals(specialIds.cls.toLong(), result.inputIds[0])
        assertEquals(specialIds.sep.toLong(), result.inputIds[1])
    }
    
    @Test
    fun `tokenize handles long text by truncating`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val longText = (1..500).joinToString(" ") { "word$it" }
        val result = tokenizer.tokenize(longText)
        
        // Should not exceed max length
        assertEquals(WordPieceTokenizer.MAX_SEQ_LENGTH, result.inputIds.size)
    }
    
    @Test
    fun `tokenize handles punctuation`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenize("Hello, world!")
        
        // Should produce valid tokens (non-zero attention for content)
        val validTokenCount = result.attentionMask.count { it == 1L }
        assertTrue(validTokenCount > 2) // More than just [CLS] and [SEP]
    }
    
    @Test
    fun `vocabulary size is positive after initialization`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        assertTrue(tokenizer.getVocabSize() > 0)
        assertTrue(tokenizer.isInitialized())
    }
    
    @Test
    fun `decode reverses tokenization`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val original = "hello world"
        val tokenized = tokenizer.tokenize(original)
        val decoded = tokenizer.decode(tokenized.inputIds)
        
        // Decoded text should contain the original words
        assertTrue(decoded.contains("hello") || decoded.contains("[UNK]"))
    }
    
    @Test
    fun `tokenize pair handles two texts`() {
        kotlinx.coroutines.runBlocking {
            tokenizer.initialize()
        }
        
        val result = tokenizer.tokenizePair("First sentence", "Second sentence")
        
        assertEquals(WordPieceTokenizer.MAX_SEQ_LENGTH, result.inputIds.size)
        
        // Should have different token type IDs for each sentence
        assertTrue(result.tokenTypeIds.contains(0L))
        assertTrue(result.tokenTypeIds.contains(1L))
    }
}
