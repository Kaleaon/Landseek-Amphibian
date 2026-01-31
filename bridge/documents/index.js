/**
 * Document Processing System
 * 
 * Handles document upload, parsing, and AI analysis.
 * Supports 70+ file formats like Landseek.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Supported file extensions by category
const SUPPORTED_FORMATS = {
    text: ['.txt', '.md', '.markdown', '.rst'],
    data: ['.json', '.csv', '.tsv', '.xml', '.yaml', '.yml', '.toml'],
    code: ['.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.c', '.cpp', '.h', 
           '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sql', 
           '.sh', '.bash', '.lua', '.pl', '.dart'],
    config: ['.ini', '.cfg', '.conf', '.log'],
    web: ['.html', '.htm', '.xhtml', '.css'],
    // These require external libraries in production
    documents: ['.pdf', '.docx', '.doc', '.odt', '.rtf', '.epub'],
    images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'],
    audio: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'],
    video: ['.mp4', '.webm', '.mkv', '.avi', '.mov'],
    office: ['.xlsx', '.xls', '.ods', '.pptx', '.ppt'],
    archive: ['.zip', '.tar', '.gz', '.7z']
};

// Get all supported extensions as a flat array
function getAllSupportedExtensions() {
    return Object.values(SUPPORTED_FORMATS).flat();
}

class DocumentManager {
    constructor(storagePath) {
        this.storagePath = storagePath || './documents_storage';
        this.documents = new Map(); // id -> document metadata
        this.activeDocument = null;
        
        // Ensure storage directory exists
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }

    /**
     * Check if a file extension is supported
     */
    isSupported(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return getAllSupportedExtensions().includes(ext);
    }

    /**
     * Get the category of a file type
     */
    getCategory(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        for (const [category, extensions] of Object.entries(SUPPORTED_FORMATS)) {
            if (extensions.includes(ext)) {
                return category;
            }
        }
        return 'unknown';
    }

    /**
     * Upload and process a document
     */
    async upload(filePath, options = {}) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        const filename = path.basename(filePath);
        const category = this.getCategory(filePath);
        const stats = fs.statSync(filePath);
        
        // Generate unique ID using crypto for collision resistance
        const id = `doc_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        
        // Read and process content based on type
        let content = '';
        let metadata = {};

        try {
            if (category === 'text' || category === 'data' || category === 'code' || 
                category === 'config' || category === 'web') {
                // Text-based files can be read directly
                content = fs.readFileSync(filePath, 'utf8');
                metadata = this.extractTextMetadata(content);
            } else if (category === 'images') {
                // For images, store path and basic info (actual vision would need MediaPipe)
                content = `[Image file: ${filename}]`;
                metadata = {
                    type: 'image',
                    size: stats.size,
                    path: filePath
                };
            } else if (category === 'documents') {
                // PDF/DOCX would need external libraries
                content = `[Document file: ${filename}] - Content extraction requires additional libraries`;
                metadata = {
                    type: 'document',
                    size: stats.size,
                    note: 'Install pymupdf or python-docx for full extraction'
                };
            } else {
                content = `[Binary file: ${filename}]`;
                metadata = { type: 'binary', size: stats.size };
            }
        } catch (e) {
            throw new Error(`Failed to read file: ${e.message}`);
        }

        // Create document record
        const doc = {
            id,
            filename,
            path: filePath,
            category,
            extension: ext,
            size: stats.size,
            content,
            preview: content.substring(0, 500),
            metadata,
            uploadedAt: new Date().toISOString(),
            chunks: [] // For RAG chunking
        };

        // Chunk content for RAG if it's text-based
        if (content.length > 0 && !content.startsWith('[')) {
            doc.chunks = this.chunkContent(content);
        }

        // Store document
        this.documents.set(id, doc);
        
        // Save to disk
        this.saveDocumentIndex();

        return {
            id,
            filename,
            category,
            size: this.formatSize(stats.size),
            preview: doc.preview,
            chunksCount: doc.chunks.length
        };
    }

    /**
     * Extract metadata from text content
     */
    extractTextMetadata(content) {
        const lines = content.split('\n');
        const words = content.split(/\s+/).filter(w => w.length > 0);
        
        return {
            lines: lines.length,
            words: words.length,
            characters: content.length,
            hasCode: /```|def |function |class |import |const |let |var /.test(content)
        };
    }

    /**
     * Chunk content for RAG processing
     */
    chunkContent(content, chunkSize = 1000, overlap = 200) {
        const chunks = [];
        let start = 0;
        let chunkIndex = 0;

        while (start < content.length) {
            const end = Math.min(start + chunkSize, content.length);
            let chunk = content.substring(start, end);
            
            // Try to break at sentence/paragraph boundary
            if (end < content.length) {
                const lastPeriod = chunk.lastIndexOf('.');
                const lastNewline = chunk.lastIndexOf('\n');
                const breakPoint = Math.max(lastPeriod, lastNewline);
                
                if (breakPoint > chunkSize * 0.5) {
                    chunk = content.substring(start, start + breakPoint + 1);
                }
            }

            chunks.push({
                index: chunkIndex++,
                text: chunk.trim(),
                start,
                end: start + chunk.length
            });

            start += chunk.length - overlap;
        }

        return chunks;
    }

    /**
     * Get document by ID
     */
    get(id) {
        return this.documents.get(id);
    }

    /**
     * Get document by filename
     */
    getByName(filename) {
        for (const doc of this.documents.values()) {
            if (doc.filename.toLowerCase() === filename.toLowerCase()) {
                return doc;
            }
        }
        return null;
    }

    /**
     * List all documents
     */
    list() {
        return Array.from(this.documents.values()).map(doc => ({
            id: doc.id,
            filename: doc.filename,
            category: doc.category,
            size: this.formatSize(doc.size),
            uploadedAt: doc.uploadedAt
        }));
    }

    /**
     * Select a document as active
     */
    select(id) {
        const doc = this.get(id);
        if (doc) {
            this.activeDocument = id;
            return doc;
        }
        return null;
    }

    /**
     * Get currently active document
     */
    getActive() {
        return this.activeDocument ? this.get(this.activeDocument) : null;
    }

    /**
     * Remove a document
     */
    remove(id) {
        const doc = this.get(id);
        if (doc) {
            this.documents.delete(id);
            if (this.activeDocument === id) {
                this.activeDocument = null;
            }
            this.saveDocumentIndex();
            return true;
        }
        return false;
    }

    /**
     * Search within a document
     */
    search(id, query, options = {}) {
        const doc = this.get(id);
        if (!doc) return [];

        const { caseSensitive = false, maxResults = 10 } = options;
        const results = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        const content = caseSensitive ? doc.content : doc.content.toLowerCase();

        let pos = 0;
        while (results.length < maxResults) {
            const index = content.indexOf(searchQuery, pos);
            if (index === -1) break;

            // Get surrounding context
            const start = Math.max(0, index - 50);
            const end = Math.min(doc.content.length, index + query.length + 50);
            const context = doc.content.substring(start, end);

            results.push({
                position: index,
                context: `...${context}...`,
                line: doc.content.substring(0, index).split('\n').length
            });

            pos = index + 1;
        }

        return results;
    }

    /**
     * Get document content for AI analysis
     */
    getContentForAnalysis(id, options = {}) {
        const doc = this.get(id);
        if (!doc) return null;

        const { maxTokens = 4000, includeMetadata = true } = options;
        
        let result = '';
        
        if (includeMetadata) {
            result += `📄 Document: ${doc.filename}\n`;
            result += `Category: ${doc.category}\n`;
            result += `Size: ${this.formatSize(doc.size)}\n`;
            
            if (doc.metadata.lines) {
                result += `Lines: ${doc.metadata.lines}, Words: ${doc.metadata.words}\n`;
            }
            result += '\n---\n\n';
        }

        // Truncate content if needed (rough estimate: 4 chars per token)
        const maxChars = maxTokens * 4;
        if (doc.content.length > maxChars) {
            result += doc.content.substring(0, maxChars);
            result += `\n\n[Content truncated. Full document has ${doc.metadata.words || 'unknown'} words]`;
        } else {
            result += doc.content;
        }

        return result;
    }

    /**
     * Get relevant chunks for RAG query
     */
    getRelevantChunks(id, query, limit = 3) {
        const doc = this.get(id);
        if (!doc || doc.chunks.length === 0) return [];

        // Simple keyword-based relevance (in production, use embeddings)
        const queryTerms = query.toLowerCase().split(/\s+/);
        
        const scored = doc.chunks.map(chunk => {
            const text = chunk.text.toLowerCase();
            let score = 0;
            
            for (const term of queryTerms) {
                if (text.includes(term)) {
                    score += 1;
                    // Bonus for exact word match
                    const regex = new RegExp(`\\b${term}\\b`, 'gi');
                    score += (text.match(regex) || []).length * 0.5;
                }
            }
            
            return { chunk, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.chunk);
    }

    /**
     * Save document index to disk
     */
    saveDocumentIndex() {
        const indexPath = path.join(this.storagePath, 'index.json');
        const index = {
            documents: Array.from(this.documents.entries()),
            activeDocument: this.activeDocument,
            updatedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }

    /**
     * Load document index from disk
     */
    loadDocumentIndex() {
        const indexPath = path.join(this.storagePath, 'index.json');
        if (!fs.existsSync(indexPath)) return;

        try {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            this.documents = new Map(index.documents);
            this.activeDocument = index.activeDocument;
        } catch (e) {
            console.error('Failed to load document index:', e);
        }
    }

    /**
     * Format file size for display
     */
    formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    /**
     * List supported formats
     */
    listSupportedFormats() {
        const lines = ['**Supported File Formats:**\n'];
        
        for (const [category, extensions] of Object.entries(SUPPORTED_FORMATS)) {
            lines.push(`📁 **${category.toUpperCase()}**: ${extensions.join(', ')}`);
        }
        
        return lines.join('\n');
    }
}

module.exports = { DocumentManager, SUPPORTED_FORMATS, getAllSupportedExtensions };
