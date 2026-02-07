/**
 * Tests for Extension Marketplace with Moltbook Catalog
 */

const { ExtensionMarketplace, MOLTBOOK_CATALOG_URL, ExtensionType } = require('../marketplace/index.js');
const fs = require('fs').promises;
const path = require('path');

// Mock catalog data matching moltbook services.json structure
const mockMoltbookCatalog = {
    version: 1,
    lastUpdated: "2026-02-01T16:48:00.778Z",
    services: [
        {
            id: "chatr",
            name: "Chatr.ai",
            url: "https://chatr.ai",
            category: "communication",
            status: "active",
            notes: "Already integrated — chatr_read, chatr_send, chatr_agents tools",
            tags: ["chat", "realtime", "messaging"]
        },
        {
            id: "ctxly-memory",
            name: "Ctxly",
            url: "https://ctxly.app",
            category: "memory",
            status: "active",
            notes: "ctxly_remember/ctxly_recall MCP tools integrated",
            tags: ["memory", "context", "semantic-search"]
        },
        {
            id: "moltbook",
            name: "Moltbook",
            url: "https://moltbook.com",
            category: "social",
            status: "integrated",
            notes: "Primary platform — full MCP integration",
            tags: ["identity", "social", "verification"]
        },
        {
            id: "4claw",
            name: "4claw",
            url: "https://www.4claw.org",
            category: "unknown",
            status: "active",
            notes: "6 MCP tools integrated",
            tags: []
        },
        {
            id: "rejected-service",
            name: "Rejected",
            url: "https://rejected.com",
            category: "tools",
            status: "rejected",
            notes: "Not aligned",
            tags: []
        }
    ]
};

describe('ExtensionMarketplace with Moltbook Catalog', () => {
    let marketplace;
    const testDir = '/tmp/test-extensions-' + Date.now();

    beforeEach(async () => {
        // Create test directory
        await fs.mkdir(testDir, { recursive: true });
        
        marketplace = new ExtensionMarketplace({
            extensionsDir: testDir,
            configFile: path.join(testDir, 'installed.json'),
            catalogCacheFile: path.join(testDir, 'catalog_cache.json')
        });
    });

    afterEach(async () => {
        // Cleanup
        try {
            await fs.rm(testDir, { recursive: true });
        } catch (e) {}
    });

    describe('MOLTBOOK_CATALOG_URL', () => {
        it('should point to terminalcraft moltbook-mcp repo', () => {
            expect(MOLTBOOK_CATALOG_URL).toContain('terminalcraft/moltbook-mcp');
            expect(MOLTBOOK_CATALOG_URL).toContain('services.json');
        });
    });

    describe('transformMoltbookServices', () => {
        it('should transform moltbook services to extension format', () => {
            const extensions = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
            
            // Should only include active and integrated services (4 out of 5)
            expect(extensions.length).toBe(4);
            
            // Check first extension
            const chatr = extensions.find(e => e.id === 'chatr');
            expect(chatr).toBeDefined();
            expect(chatr.name).toBe('Chatr.ai');
            expect(chatr.category).toBe('communication');
            expect(chatr.tags).toContain('chat');
        });

        it('should filter out rejected services', () => {
            const extensions = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
            const rejected = extensions.find(e => e.id === 'rejected-service');
            expect(rejected).toBeUndefined();
        });

        it('should mark integrated services as verified', () => {
            const extensions = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
            const moltbook = extensions.find(e => e.id === 'moltbook');
            
            expect(moltbook.verified).toBe(true);
            expect(moltbook.rating).toBe(4.5);
            expect(moltbook.downloads).toBe(1000);
        });

        it('should mark active services as unverified', () => {
            const extensions = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
            const chatr = extensions.find(e => e.id === 'chatr');
            
            expect(chatr.verified).toBe(false);
            expect(chatr.rating).toBe(4.0);
        });
    });

    describe('mapCategoryToType', () => {
        it('should map communication to MCP_SERVER', () => {
            expect(marketplace.mapCategoryToType('communication')).toBe(ExtensionType.MCP_SERVER);
        });

        it('should map social to INTEGRATION', () => {
            expect(marketplace.mapCategoryToType('social')).toBe(ExtensionType.INTEGRATION);
        });

        it('should map memory to MCP_SERVER', () => {
            expect(marketplace.mapCategoryToType('memory')).toBe(ExtensionType.MCP_SERVER);
        });

        it('should map unknown to MCP_SERVER', () => {
            expect(marketplace.mapCategoryToType('unknown')).toBe(ExtensionType.MCP_SERVER);
            expect(marketplace.mapCategoryToType('random')).toBe(ExtensionType.MCP_SERVER);
        });
    });

    describe('inferPermissions', () => {
        it('should add network for communication', () => {
            const perms = marketplace.inferPermissions({ category: 'communication' });
            expect(perms).toContain('network');
        });

        it('should add storage for memory', () => {
            const perms = marketplace.inferPermissions({ category: 'memory' });
            expect(perms).toContain('storage');
        });

        it('should add network and identity for social', () => {
            const perms = marketplace.inferPermissions({ category: 'social' });
            expect(perms).toContain('network');
            expect(perms).toContain('identity');
        });
    });

    describe('cacheCatalog and loadCachedCatalog', () => {
        it('should cache and load catalog', async () => {
            // Cache the mock catalog
            await marketplace.cacheCatalog(mockMoltbookCatalog);
            
            // Clear catalog
            marketplace.catalog = [];
            
            // Load from cache
            await marketplace.loadCachedCatalog();
            
            // Should have loaded extensions
            expect(marketplace.catalog.length).toBe(4);
        });
    });

    describe('search', () => {
        beforeEach(() => {
            marketplace.catalog = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
        });

        it('should search by name', () => {
            const results = marketplace.search('chatr');
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('chatr');
        });

        it('should search by tag', () => {
            const results = marketplace.search('memory');
            expect(results.some(r => r.id === 'ctxly-memory')).toBe(true);
        });

        it('should filter by category', () => {
            const results = marketplace.search('', { category: 'social' });
            expect(results.every(r => r.category === 'social')).toBe(true);
        });

        it('should filter verified only', () => {
            const results = marketplace.search('', { verifiedOnly: true });
            expect(results.every(r => r.verified)).toBe(true);
        });
    });

    describe('getCategories', () => {
        beforeEach(() => {
            marketplace.catalog = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
        });

        it('should return unique categories', () => {
            const categories = marketplace.getCategories();
            expect(categories).toContain('communication');
            expect(categories).toContain('memory');
            expect(categories).toContain('social');
            expect(categories).toContain('unknown');
        });
    });

    describe('getTags', () => {
        beforeEach(() => {
            marketplace.catalog = marketplace.transformMoltbookServices(mockMoltbookCatalog.services);
        });

        it('should return unique tags', () => {
            const tags = marketplace.getTags();
            expect(tags).toContain('chat');
            expect(tags).toContain('memory');
            expect(tags).toContain('identity');
        });
    });

    describe('verifyChecksum', () => {
        it('should return true for matching checksum', async () => {
            const filePath = path.join(testDir, 'test-file.txt');
            const content = 'test content for checksum';
            await fs.writeFile(filePath, content);
            
            const crypto = require('crypto');
            const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
            
            const result = await marketplace.verifyChecksum(filePath, expectedHash);
            expect(result).toBe(true);
        });

        it('should return false for mismatched checksum', async () => {
            const filePath = path.join(testDir, 'test-file.txt');
            await fs.writeFile(filePath, 'test content');
            
            const result = await marketplace.verifyChecksum(filePath, 'invalid_hash');
            expect(result).toBe(false);
        });

        it('should return false for non-existent file', async () => {
            const result = await marketplace.verifyChecksum('/tmp/does-not-exist-' + Date.now(), 'abc');
            expect(result).toBe(false);
        });

        it('should return true when given a directory path (skip verification)', async () => {
            const dirPath = path.join(testDir, 'some-dir');
            await fs.mkdir(dirPath, { recursive: true });
            
            const result = await marketplace.verifyChecksum(dirPath, 'any_hash');
            expect(result).toBe(true);
        });
    });

    describe('downloadExtension', () => {
        it('should create scaffold when no downloadUrl is provided', async () => {
            const extension = {
                id: 'test-ext',
                name: 'Test Extension'
            };
            
            const installPath = await marketplace.downloadExtension(extension);
            expect(installPath).toContain('test-ext');
            
            const indexPath = path.join(installPath, 'index.js');
            const content = await fs.readFile(indexPath, 'utf8');
            expect(content).toContain('Test Extension');
        });

        it('should throw on failed download response', async () => {
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });
            
            const extension = {
                id: 'fail-ext',
                name: 'Failing Extension',
                downloadUrl: 'https://example.com/ext.tar.gz'
            };
            
            await expect(marketplace.downloadExtension(extension))
                .rejects.toThrow('Download failed: 404 Not Found');
            
            global.fetch = originalFetch;
        });
    });
});
