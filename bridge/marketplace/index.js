/**
 * Extension Marketplace
 * 
 * Provides discovery, installation, and management of MCP server extensions.
 * Allows the Amphibian AI assistant to be extended with community-built tools.
 * 
 * Features:
 * - Browse and search extensions
 * - Install/uninstall extensions
 * - Version management and updates
 * - Security verification
 * - Extension ratings and reviews
 * - Categories and tags
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Extension types
const ExtensionType = {
    MCP_SERVER: 'mcp_server',       // MCP tool server
    PERSONALITY: 'personality',      // AI personality
    SKILL: 'skill',                  // Agent skill/capability
    INTEGRATION: 'integration',      // External service integration
    THEME: 'theme'                   // UI theme (for future use)
};

// Extension status
const ExtensionStatus = {
    AVAILABLE: 'available',
    INSTALLED: 'installed',
    UPDATE_AVAILABLE: 'update_available',
    DISABLED: 'disabled'
};

/**
 * Extension catalog entry
 */
class ExtensionInfo {
    constructor({
        id,
        name,
        description,
        version,
        author,
        type = ExtensionType.MCP_SERVER,
        category = 'general',
        tags = [],
        downloadUrl,
        sha256,
        dependencies = [],
        permissions = [],
        minVersion = '1.0.0',
        rating = 0,
        downloads = 0,
        verified = false,
        screenshots = [],
        changelog = '',
        homepage = '',
        repository = ''
    }) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.version = version;
        this.author = author;
        this.type = type;
        this.category = category;
        this.tags = tags;
        this.downloadUrl = downloadUrl;
        this.sha256 = sha256;
        this.dependencies = dependencies;
        this.permissions = permissions;
        this.minVersion = minVersion;
        this.rating = rating;
        this.downloads = downloads;
        this.verified = verified;
        this.screenshots = screenshots;
        this.changelog = changelog;
        this.homepage = homepage;
        this.repository = repository;
    }
}

/**
 * Installed extension record
 */
class InstalledExtension {
    constructor({
        id,
        name,
        version,
        type,
        installPath,
        installedAt,
        enabled = true,
        config = {}
    }) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.type = type;
        this.installPath = installPath;
        this.installedAt = installedAt;
        this.enabled = enabled;
        this.config = config;
    }
}

/**
 * Extension Marketplace
 */
class ExtensionMarketplace {
    constructor(options = {}) {
        this.catalogUrl = options.catalogUrl || 'https://raw.githubusercontent.com/Landseek/extension-catalog/main/catalog.json';
        this.extensionsDir = options.extensionsDir || './extensions';
        this.configFile = options.configFile || './extensions/installed.json';
        
        // State
        this.catalog = [];
        this.installed = new Map();
        this.loadedExtensions = new Map();
        
        // Event handlers
        this.eventHandlers = new Map();
    }
    
    /**
     * Initialize the marketplace
     */
    async initialize() {
        try {
            // Create extensions directory
            await fs.mkdir(this.extensionsDir, { recursive: true });
            
            // Load installed extensions
            await this.loadInstalledExtensions();
            
            // Refresh catalog
            await this.refreshCatalog();
            
            // Load enabled extensions
            await this.loadEnabledExtensions();
            
            console.log(`📦 Extension Marketplace initialized`);
            console.log(`   Installed: ${this.installed.size}`);
            console.log(`   Available: ${this.catalog.length}`);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize marketplace:', error.message);
            return false;
        }
    }
    
    /**
     * Refresh the extension catalog
     */
    async refreshCatalog() {
        try {
            // In production, this would fetch from the catalog URL
            // For now, use a local/mock catalog
            const mockCatalog = this.getMockCatalog();
            this.catalog = mockCatalog.map(ext => new ExtensionInfo(ext));
            
            this.emit('catalog_updated', { count: this.catalog.length });
            return this.catalog;
        } catch (error) {
            console.error('Failed to refresh catalog:', error.message);
            return [];
        }
    }
    
    /**
     * Search extensions
     */
    search(query, options = {}) {
        const {
            type,
            category,
            tags = [],
            verifiedOnly = false,
            sortBy = 'downloads',
            limit = 50
        } = options;
        
        let results = [...this.catalog];
        
        // Text search
        if (query) {
            const queryLower = query.toLowerCase();
            results = results.filter(ext => 
                ext.name.toLowerCase().includes(queryLower) ||
                ext.description.toLowerCase().includes(queryLower) ||
                ext.tags.some(tag => tag.toLowerCase().includes(queryLower))
            );
        }
        
        // Filter by type
        if (type) {
            results = results.filter(ext => ext.type === type);
        }
        
        // Filter by category
        if (category) {
            results = results.filter(ext => ext.category === category);
        }
        
        // Filter by tags
        if (tags.length > 0) {
            results = results.filter(ext => 
                tags.some(tag => ext.tags.includes(tag))
            );
        }
        
        // Filter verified only
        if (verifiedOnly) {
            results = results.filter(ext => ext.verified);
        }
        
        // Sort
        switch (sortBy) {
            case 'downloads':
                results.sort((a, b) => b.downloads - a.downloads);
                break;
            case 'rating':
                results.sort((a, b) => b.rating - a.rating);
                break;
            case 'name':
                results.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'newest':
                results.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
                break;
        }
        
        // Add status
        results = results.map(ext => ({
            ...ext,
            status: this.getExtensionStatus(ext.id, ext.version)
        }));
        
        return results.slice(0, limit);
    }
    
    /**
     * Get extension details
     */
    getExtension(extensionId) {
        const catalogEntry = this.catalog.find(ext => ext.id === extensionId);
        const installed = this.installed.get(extensionId);
        
        if (!catalogEntry && !installed) {
            return null;
        }
        
        return {
            ...catalogEntry,
            installed: !!installed,
            installedVersion: installed?.version,
            enabled: installed?.enabled,
            status: this.getExtensionStatus(extensionId, catalogEntry?.version)
        };
    }
    
    /**
     * Install an extension
     */
    async install(extensionId) {
        const extension = this.catalog.find(ext => ext.id === extensionId);
        if (!extension) {
            throw new Error(`Extension not found: ${extensionId}`);
        }
        
        // Check if already installed
        if (this.installed.has(extensionId)) {
            throw new Error(`Extension already installed: ${extensionId}`);
        }
        
        console.log(`📦 Installing extension: ${extension.name} v${extension.version}`);
        
        try {
            // Check dependencies
            for (const dep of extension.dependencies) {
                if (!this.installed.has(dep)) {
                    console.log(`   Installing dependency: ${dep}`);
                    await this.install(dep);
                }
            }
            
            // Download extension
            const installPath = await this.downloadExtension(extension);
            
            // Verify integrity
            if (extension.sha256) {
                const valid = await this.verifyChecksum(installPath, extension.sha256);
                if (!valid) {
                    await fs.rm(installPath, { recursive: true });
                    throw new Error('Checksum verification failed');
                }
            }
            
            // Create installed record
            const installed = new InstalledExtension({
                id: extension.id,
                name: extension.name,
                version: extension.version,
                type: extension.type,
                installPath,
                installedAt: Date.now(),
                enabled: true
            });
            
            this.installed.set(extensionId, installed);
            await this.saveInstalledExtensions();
            
            // Load the extension
            await this.loadExtension(installed);
            
            this.emit('extension_installed', { extension: installed });
            console.log(`✅ Extension installed: ${extension.name}`);
            
            return installed;
            
        } catch (error) {
            console.error(`❌ Failed to install ${extension.name}:`, error.message);
            throw error;
        }
    }
    
    /**
     * Uninstall an extension
     */
    async uninstall(extensionId) {
        const installed = this.installed.get(extensionId);
        if (!installed) {
            throw new Error(`Extension not installed: ${extensionId}`);
        }
        
        console.log(`🗑️ Uninstalling extension: ${installed.name}`);
        
        try {
            // Unload extension
            await this.unloadExtension(extensionId);
            
            // Delete files
            await fs.rm(installed.installPath, { recursive: true });
            
            // Remove from installed
            this.installed.delete(extensionId);
            await this.saveInstalledExtensions();
            
            this.emit('extension_uninstalled', { extensionId });
            console.log(`✅ Extension uninstalled: ${installed.name}`);
            
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to uninstall ${installed.name}:`, error.message);
            throw error;
        }
    }
    
    /**
     * Enable/disable an extension
     */
    async setEnabled(extensionId, enabled) {
        const installed = this.installed.get(extensionId);
        if (!installed) {
            throw new Error(`Extension not installed: ${extensionId}`);
        }
        
        if (installed.enabled === enabled) {
            return installed;
        }
        
        installed.enabled = enabled;
        this.installed.set(extensionId, installed);
        await this.saveInstalledExtensions();
        
        if (enabled) {
            await this.loadExtension(installed);
        } else {
            await this.unloadExtension(extensionId);
        }
        
        this.emit('extension_toggled', { extensionId, enabled });
        return installed;
    }
    
    /**
     * Update an extension
     */
    async update(extensionId) {
        const installed = this.installed.get(extensionId);
        const catalogEntry = this.catalog.find(ext => ext.id === extensionId);
        
        if (!installed) {
            throw new Error(`Extension not installed: ${extensionId}`);
        }
        
        if (!catalogEntry) {
            throw new Error(`Extension not found in catalog: ${extensionId}`);
        }
        
        if (!this.isNewerVersion(catalogEntry.version, installed.version)) {
            console.log(`Extension ${installed.name} is up to date`);
            return installed;
        }
        
        console.log(`🔄 Updating extension: ${installed.name} (${installed.version} -> ${catalogEntry.version})`);
        
        // Uninstall old version
        await this.uninstall(extensionId);
        
        // Install new version
        return await this.install(extensionId);
    }
    
    /**
     * Check for updates
     */
    checkForUpdates() {
        const updates = [];
        
        for (const [id, installed] of this.installed) {
            const catalogEntry = this.catalog.find(ext => ext.id === id);
            if (catalogEntry && this.isNewerVersion(catalogEntry.version, installed.version)) {
                updates.push({
                    id,
                    name: installed.name,
                    currentVersion: installed.version,
                    newVersion: catalogEntry.version,
                    changelog: catalogEntry.changelog
                });
            }
        }
        
        return updates;
    }
    
    /**
     * Get all installed extensions
     */
    getInstalled() {
        return Array.from(this.installed.values()).map(ext => ({
            ...ext,
            status: this.getExtensionStatus(ext.id)
        }));
    }
    
    /**
     * Get loaded extension instance
     */
    getLoadedExtension(extensionId) {
        return this.loadedExtensions.get(extensionId);
    }
    
    /**
     * Get all categories
     */
    getCategories() {
        const categories = new Set();
        this.catalog.forEach(ext => categories.add(ext.category));
        return Array.from(categories);
    }
    
    /**
     * Get all tags
     */
    getTags() {
        const tags = new Set();
        this.catalog.forEach(ext => ext.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags);
    }
    
    // --- Private Methods ---
    
    async loadInstalledExtensions() {
        try {
            const data = await fs.readFile(this.configFile, 'utf-8');
            const extensions = JSON.parse(data);
            
            for (const ext of extensions) {
                this.installed.set(ext.id, new InstalledExtension(ext));
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Error loading installed extensions:', error.message);
            }
        }
    }
    
    async saveInstalledExtensions() {
        const extensions = Array.from(this.installed.values());
        await fs.writeFile(this.configFile, JSON.stringify(extensions, null, 2));
    }
    
    async loadEnabledExtensions() {
        for (const [id, installed] of this.installed) {
            if (installed.enabled) {
                try {
                    await this.loadExtension(installed);
                } catch (error) {
                    console.error(`Failed to load extension ${id}:`, error.message);
                }
            }
        }
    }
    
    async loadExtension(installed) {
        try {
            // Load based on type
            switch (installed.type) {
                case ExtensionType.MCP_SERVER:
                    const serverPath = path.join(installed.installPath, 'index.js');
                    const ServerClass = require(serverPath);
                    const server = new ServerClass();
                    this.loadedExtensions.set(installed.id, server);
                    console.log(`   Loaded MCP server: ${installed.name}`);
                    break;
                    
                case ExtensionType.PERSONALITY:
                    const personalityPath = path.join(installed.installPath, 'personality.json');
                    const personality = JSON.parse(await fs.readFile(personalityPath, 'utf-8'));
                    this.loadedExtensions.set(installed.id, personality);
                    console.log(`   Loaded personality: ${installed.name}`);
                    break;
                    
                case ExtensionType.SKILL:
                    const skillPath = path.join(installed.installPath, 'skill.js');
                    const skill = require(skillPath);
                    this.loadedExtensions.set(installed.id, skill);
                    console.log(`   Loaded skill: ${installed.name}`);
                    break;
                    
                default:
                    console.log(`   Unknown extension type: ${installed.type}`);
            }
            
            this.emit('extension_loaded', { extensionId: installed.id });
            
        } catch (error) {
            console.error(`Failed to load extension ${installed.id}:`, error.message);
            throw error;
        }
    }
    
    async unloadExtension(extensionId) {
        const instance = this.loadedExtensions.get(extensionId);
        if (instance) {
            // Call cleanup if available
            if (typeof instance.shutdown === 'function') {
                await instance.shutdown();
            }
            this.loadedExtensions.delete(extensionId);
        }
    }
    
    async downloadExtension(extension) {
        // In production, this would download from extension.downloadUrl
        // For now, create a mock structure
        const installPath = path.join(this.extensionsDir, extension.id);
        await fs.mkdir(installPath, { recursive: true });
        
        // Create a placeholder file
        const indexContent = `
// ${extension.name} - Mock Extension
module.exports = class ${extension.id.replace(/-/g, '_')} {
    constructor() {
        console.log('Extension loaded: ${extension.name}');
    }
    
    getTools() {
        return [];
    }
    
    shutdown() {
        console.log('Extension shutdown: ${extension.name}');
    }
};
`;
        await fs.writeFile(path.join(installPath, 'index.js'), indexContent);
        
        return installPath;
    }
    
    async verifyChecksum(filePath, expectedSha256) {
        // In production, calculate actual checksum
        // For now, return true
        return true;
    }
    
    getExtensionStatus(extensionId, catalogVersion) {
        const installed = this.installed.get(extensionId);
        
        if (!installed) {
            return ExtensionStatus.AVAILABLE;
        }
        
        if (!installed.enabled) {
            return ExtensionStatus.DISABLED;
        }
        
        if (catalogVersion && this.isNewerVersion(catalogVersion, installed.version)) {
            return ExtensionStatus.UPDATE_AVAILABLE;
        }
        
        return ExtensionStatus.INSTALLED;
    }
    
    isNewerVersion(newVersion, currentVersion) {
        const newParts = newVersion.split('.').map(Number);
        const currentParts = currentVersion.split('.').map(Number);
        
        for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
            const n = newParts[i] || 0;
            const c = currentParts[i] || 0;
            if (n > c) return true;
            if (n < c) return false;
        }
        return false;
    }
    
    // Event handling
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    
    emit(event, data) {
        const handlers = this.eventHandlers.get(event) || [];
        handlers.forEach(handler => handler(data));
    }
    
    /**
     * Mock catalog for development/testing
     */
    getMockCatalog() {
        return [
            {
                id: 'weather-tools',
                name: 'Weather Tools',
                description: 'Get weather forecasts and conditions for any location',
                version: '1.2.0',
                author: 'Amphibian Community',
                type: ExtensionType.MCP_SERVER,
                category: 'utilities',
                tags: ['weather', 'forecast', 'location'],
                downloadUrl: 'https://example.com/extensions/weather-tools.zip',
                sha256: 'abc123',
                dependencies: [],
                permissions: ['location'],
                rating: 4.5,
                downloads: 1250,
                verified: true
            },
            {
                id: 'smart-home',
                name: 'Smart Home Control',
                description: 'Control smart home devices like lights, thermostats, and locks',
                version: '2.0.1',
                author: 'HomeAutomation Dev',
                type: ExtensionType.MCP_SERVER,
                category: 'home',
                tags: ['smart home', 'iot', 'automation', 'lights', 'thermostat'],
                downloadUrl: 'https://example.com/extensions/smart-home.zip',
                sha256: 'def456',
                dependencies: [],
                permissions: ['network'],
                rating: 4.8,
                downloads: 3420,
                verified: true
            },
            {
                id: 'code-assistant',
                name: 'Code Assistant Pro',
                description: 'Enhanced coding capabilities with multiple language support',
                version: '1.5.0',
                author: 'DevTools Inc',
                type: ExtensionType.SKILL,
                category: 'development',
                tags: ['code', 'programming', 'developer', 'python', 'javascript'],
                downloadUrl: 'https://example.com/extensions/code-assistant.zip',
                sha256: 'ghi789',
                dependencies: [],
                permissions: [],
                rating: 4.7,
                downloads: 5680,
                verified: true
            },
            {
                id: 'todo-manager',
                name: 'Todo Manager',
                description: 'Manage tasks, to-do lists, and reminders',
                version: '1.1.0',
                author: 'Productivity Labs',
                type: ExtensionType.MCP_SERVER,
                category: 'productivity',
                tags: ['todo', 'tasks', 'reminders', 'productivity'],
                downloadUrl: 'https://example.com/extensions/todo-manager.zip',
                sha256: 'jkl012',
                dependencies: [],
                permissions: ['notifications'],
                rating: 4.3,
                downloads: 890,
                verified: false
            },
            {
                id: 'personality-casual',
                name: 'Casual Charlie',
                description: 'A laid-back, friendly personality for casual conversations',
                version: '1.0.0',
                author: 'Amphibian Community',
                type: ExtensionType.PERSONALITY,
                category: 'personalities',
                tags: ['personality', 'casual', 'friendly'],
                downloadUrl: 'https://example.com/extensions/personality-casual.zip',
                sha256: 'mno345',
                dependencies: [],
                permissions: [],
                rating: 4.6,
                downloads: 2100,
                verified: true
            },
            {
                id: 'finance-tracker',
                name: 'Finance Tracker',
                description: 'Track expenses, budgets, and financial goals',
                version: '1.3.2',
                author: 'FinTech Solutions',
                type: ExtensionType.MCP_SERVER,
                category: 'finance',
                tags: ['finance', 'budget', 'expenses', 'money'],
                downloadUrl: 'https://example.com/extensions/finance-tracker.zip',
                sha256: 'pqr678',
                dependencies: [],
                permissions: [],
                rating: 4.4,
                downloads: 1560,
                verified: true
            },
            {
                id: 'news-reader',
                name: 'News Reader',
                description: 'Get news summaries from various sources',
                version: '1.0.5',
                author: 'News Aggregator',
                type: ExtensionType.MCP_SERVER,
                category: 'information',
                tags: ['news', 'articles', 'media'],
                downloadUrl: 'https://example.com/extensions/news-reader.zip',
                sha256: 'stu901',
                dependencies: [],
                permissions: ['network'],
                rating: 4.1,
                downloads: 780,
                verified: false
            },
            {
                id: 'music-control',
                name: 'Music Control',
                description: 'Control music playback on various streaming services',
                version: '2.1.0',
                author: 'AudioTech',
                type: ExtensionType.INTEGRATION,
                category: 'entertainment',
                tags: ['music', 'spotify', 'audio', 'streaming'],
                downloadUrl: 'https://example.com/extensions/music-control.zip',
                sha256: 'vwx234',
                dependencies: [],
                permissions: ['network'],
                rating: 4.9,
                downloads: 4230,
                verified: true
            }
        ];
    }
}

module.exports = {
    ExtensionMarketplace,
    ExtensionInfo,
    InstalledExtension,
    ExtensionType,
    ExtensionStatus
};
