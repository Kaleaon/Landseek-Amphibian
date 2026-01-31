/**
 * Extension Security Scanner
 * 
 * Reviews ClawBot extensions for security threats including:
 * - API key theft
 * - Data exfiltration
 * - Malicious code patterns
 * - Unauthorized network access
 * - Privacy violations
 * 
 * Works with the Ethics Review Board to provide
 * consensus-based security verdicts.
 */

const crypto = require('crypto');

/**
 * Security threat levels
 */
const ThreatLevel = {
    CRITICAL: 'critical',     // Immediate threat, block extension
    HIGH: 'high',             // Serious threat, requires manual review
    MEDIUM: 'medium',         // Potential threat, warn user
    LOW: 'low',               // Minor concern
    SAFE: 'safe'              // No threats detected
};

/**
 * Extension status
 */
const ExtensionStatus = {
    PENDING: 'pending',       // Awaiting review
    APPROVED: 'approved',     // Safe to use
    FLAGGED: 'flagged',       // Has warnings
    BLOCKED: 'blocked',       // Blocked from use
    QUARANTINED: 'quarantined' // Under investigation
};

/**
 * Threat categories
 */
const ThreatCategory = {
    API_KEY_THEFT: 'api_key_theft',
    DATA_EXFILTRATION: 'data_exfiltration',
    CREDENTIAL_HARVESTING: 'credential_harvesting',
    MALICIOUS_CODE: 'malicious_code',
    UNAUTHORIZED_NETWORK: 'unauthorized_network',
    PRIVACY_VIOLATION: 'privacy_violation',
    RESOURCE_ABUSE: 'resource_abuse',
    BACKDOOR: 'backdoor',
    OBFUSCATION: 'obfuscation',
    SUPPLY_CHAIN: 'supply_chain'
};

/**
 * Known malicious patterns
 */
const MaliciousPatterns = {
    // API Key theft patterns
    apiKeyTheft: [
        /process\.env\.([\w]+_)?(API|SECRET|KEY|TOKEN|PASSWORD)/gi,
        /localStorage\.(get|set)Item\s*\(\s*['"].*?(api|key|token|secret)/gi,
        /\.env\s*\[\s*['"].*?(API|KEY|SECRET|TOKEN)/gi,
        /headers\s*\[\s*['"]Authorization['"]\s*\]/gi,
        /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g,
        /sk-[a-zA-Z0-9]{48}/g,  // OpenAI key pattern
        /AIza[0-9A-Za-z\-_]{35}/g,  // Google API key pattern
    ],
    
    // Data exfiltration patterns
    dataExfiltration: [
        /fetch\s*\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/gi,
        /XMLHttpRequest.*?\.open\s*\(\s*['"]POST['"]/gi,
        /navigator\.sendBeacon/gi,
        /new\s+WebSocket\s*\(\s*['"`]wss?:\/\/(?!localhost)/gi,
        /\.upload\s*\(/gi,
        /formData\.append.*?(password|token|key|secret)/gi,
    ],
    
    // Credential harvesting
    credentialHarvesting: [
        /password\s*[=:]\s*document\./gi,
        /\.value.*?password/gi,
        /keylogger|keystroke/gi,
        /document\.forms.*?password/gi,
        /input\[type=['"]password['"]\]/gi,
    ],
    
    // Malicious code patterns
    maliciousCode: [
        /eval\s*\(\s*atob/gi,
        /Function\s*\(\s*['"`]return/gi,
        /document\.write\s*\(\s*unescape/gi,
        /setTimeout\s*\(\s*['"`].*?(eval|Function)/gi,
        /\\\x[0-9a-f]{2}/gi,  // Hex encoded strings
        /String\.fromCharCode\s*\(\s*\d+\s*(,\s*\d+){10,}/gi,  // Long char code sequences
    ],
    
    // Unauthorized network access
    unauthorizedNetwork: [
        /child_process/gi,
        /require\s*\(\s*['"]net['"]\)/gi,
        /dgram|dns\.resolve/gi,
        /\.connect\s*\(\s*\d+/gi,
        /ssh|telnet|ftp:\/\//gi,
    ],
    
    // Privacy violations
    privacyViolation: [
        /navigator\.geolocation/gi,
        /navigator\.contacts/gi,
        /MediaDevices|getUserMedia/gi,
        /document\.cookie/gi,
        /indexedDB|localStorage|sessionStorage/gi,
        /getInstalledRelatedApps/gi,
    ],
    
    // Resource abuse
    resourceAbuse: [
        /crypto\.subtle\.digest.*?while/gi,  // Crypto mining
        /WebAssembly\.instantiate/gi,
        /while\s*\(\s*true\s*\)/gi,
        /setInterval\s*\(.*?,\s*[01]\s*\)/gi,  // Very fast intervals
    ],
    
    // Backdoor patterns
    backdoor: [
        /reverse\s*shell/gi,
        /bind\s*shell/gi,
        /nc\s+-[el]/gi,
        /\/bin\/sh|\/bin\/bash/gi,
        /cmd\.exe|powershell/gi,
    ],
    
    // Obfuscation (suspicious)
    obfuscation: [
        /\b[a-z]\s*=\s*\[\s*\].*?\b[a-z]\s*\+\s*=\s*String/gi,  // Array-based string building
        /_0x[a-f0-9]+/gi,  // Obfuscated variable names
        /\\u[0-9a-f]{4}/gi,  // Unicode escapes
        /atob\s*\(\s*['"`][A-Za-z0-9+/=]{50,}/gi,  // Long base64 strings
    ]
};

/**
 * Known malicious extensions database
 */
class MaliciousExtensionDatabase {
    constructor() {
        // Hash -> ExtensionInfo
        this.blocklist = new Map();
        
        // Publisher -> TrustInfo
        this.publisherTrust = new Map();
        
        // Extension name -> Reports
        this.reports = new Map();
        
        // Load known malicious extensions
        this.loadKnownThreats();
    }
    
    /**
     * Load known threats (in production, would fetch from server)
     */
    loadKnownThreats() {
        // Example known malicious extensions
        const knownThreats = [
            {
                name: 'api-key-helper',
                hash: 'known_malicious_hash_1',
                reason: 'Steals API keys and sends to external server',
                category: ThreatCategory.API_KEY_THEFT,
                reportedAt: '2024-01-15',
                severity: ThreatLevel.CRITICAL
            },
            {
                name: 'free-tokens-extension',
                hash: 'known_malicious_hash_2',
                reason: 'Harvests credentials and payment information',
                category: ThreatCategory.CREDENTIAL_HARVESTING,
                reportedAt: '2024-01-20',
                severity: ThreatLevel.CRITICAL
            },
            {
                name: 'super-boost-plugin',
                hash: 'known_malicious_hash_3',
                reason: 'Contains cryptocurrency miner',
                category: ThreatCategory.RESOURCE_ABUSE,
                reportedAt: '2024-02-01',
                severity: ThreatLevel.HIGH
            }
        ];
        
        for (const threat of knownThreats) {
            this.blocklist.set(threat.hash, threat);
            this.blocklist.set(threat.name.toLowerCase(), threat);
        }
    }
    
    /**
     * Check if extension is in blocklist
     */
    isBlocked(identifier) {
        return this.blocklist.has(identifier) || 
               this.blocklist.has(identifier.toLowerCase());
    }
    
    /**
     * Get block info
     */
    getBlockInfo(identifier) {
        return this.blocklist.get(identifier) || 
               this.blocklist.get(identifier.toLowerCase());
    }
    
    /**
     * Add to blocklist
     */
    block(extensionInfo) {
        this.blocklist.set(extensionInfo.hash, extensionInfo);
        if (extensionInfo.name) {
            this.blocklist.set(extensionInfo.name.toLowerCase(), extensionInfo);
        }
    }
    
    /**
     * Report an extension
     */
    report(extensionName, report) {
        const reports = this.reports.get(extensionName) || [];
        reports.push({
            ...report,
            reportedAt: Date.now()
        });
        this.reports.set(extensionName, reports);
        
        // Auto-block if many reports
        if (reports.length >= 5) {
            console.log(`⚠️ Extension ${extensionName} auto-blocked due to multiple reports`);
            this.block({
                name: extensionName,
                hash: `reported_${extensionName}`,
                reason: 'Multiple user reports',
                category: ThreatCategory.MALICIOUS_CODE,
                severity: ThreatLevel.HIGH
            });
        }
    }
    
    /**
     * Get publisher trust score
     */
    getPublisherTrust(publisher) {
        return this.publisherTrust.get(publisher) || { score: 0.5, verified: false };
    }
    
    /**
     * Update publisher trust
     */
    updatePublisherTrust(publisher, change, reason) {
        const trust = this.getPublisherTrust(publisher);
        trust.score = Math.max(0, Math.min(1, trust.score + change));
        trust.lastUpdate = Date.now();
        trust.history = trust.history || [];
        trust.history.push({ change, reason, timestamp: Date.now() });
        this.publisherTrust.set(publisher, trust);
    }
}

/**
 * Extension Security Scanner
 */
class ExtensionSecurityScanner {
    constructor(options = {}) {
        this.id = options.id || `scanner_${Date.now()}`;
        this.name = options.name || 'Extension Security Scanner';
        
        // Threat database
        this.database = new MaliciousExtensionDatabase();
        
        // Scan configuration
        this.config = {
            maxCodeSize: options.maxCodeSize || 10 * 1024 * 1024, // 10MB
            scanTimeout: options.scanTimeout || 30000,
            deepScan: options.deepScan !== false,
            checkDependencies: options.checkDependencies !== false
        };
        
        // Statistics
        this.stats = {
            totalScans: 0,
            threatsFound: 0,
            extensionsBlocked: 0,
            lastScan: null
        };
    }
    
    /**
     * Scan an extension for security threats
     */
    async scan(extension) {
        const startTime = Date.now();
        this.stats.totalScans++;
        this.stats.lastScan = startTime;
        
        const result = {
            extensionId: extension.id,
            extensionName: extension.name,
            version: extension.version,
            publisher: extension.publisher,
            hash: this.hashExtension(extension),
            scanTime: 0,
            status: ExtensionStatus.PENDING,
            threatLevel: ThreatLevel.SAFE,
            threats: [],
            warnings: [],
            recommendations: [],
            timestamp: Date.now()
        };
        
        try {
            // Check blocklist first
            const blockInfo = this.checkBlocklist(extension, result);
            if (blockInfo) {
                result.status = ExtensionStatus.BLOCKED;
                result.threatLevel = ThreatLevel.CRITICAL;
                result.scanTime = Date.now() - startTime;
                return result;
            }
            
            // Scan code for malicious patterns
            await this.scanCode(extension, result);
            
            // Check permissions
            this.checkPermissions(extension, result);
            
            // Check publisher trust
            this.checkPublisher(extension, result);
            
            // Check dependencies (if enabled)
            if (this.config.checkDependencies && extension.dependencies) {
                await this.checkDependencies(extension, result);
            }
            
            // Determine final status
            this.determineStatus(result);
            
        } catch (e) {
            result.warnings.push({
                category: 'scan_error',
                message: `Scan error: ${e.message}`,
                severity: ThreatLevel.MEDIUM
            });
            result.status = ExtensionStatus.FLAGGED;
        }
        
        result.scanTime = Date.now() - startTime;
        
        if (result.threats.length > 0) {
            this.stats.threatsFound += result.threats.length;
        }
        
        if (result.status === ExtensionStatus.BLOCKED) {
            this.stats.extensionsBlocked++;
        }
        
        return result;
    }
    
    /**
     * Hash extension for identification
     */
    hashExtension(extension) {
        const content = JSON.stringify({
            name: extension.name,
            version: extension.version,
            code: extension.code || '',
            manifest: extension.manifest
        });
        
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    
    /**
     * Check if extension is in blocklist
     */
    checkBlocklist(extension, result) {
        // Check by hash
        const hash = result.hash;
        if (this.database.isBlocked(hash)) {
            const info = this.database.getBlockInfo(hash);
            result.threats.push({
                category: info.category,
                severity: ThreatLevel.CRITICAL,
                description: `Known malicious extension: ${info.reason}`,
                evidence: info
            });
            return info;
        }
        
        // Check by name
        if (this.database.isBlocked(extension.name)) {
            const info = this.database.getBlockInfo(extension.name);
            result.threats.push({
                category: info.category,
                severity: ThreatLevel.CRITICAL,
                description: `Blocklisted extension name: ${info.reason}`,
                evidence: info
            });
            return info;
        }
        
        return null;
    }
    
    /**
     * Scan code for malicious patterns
     */
    async scanCode(extension, result) {
        const code = extension.code || '';
        
        if (code.length > this.config.maxCodeSize) {
            result.warnings.push({
                category: 'size',
                message: 'Extension code exceeds maximum size limit',
                severity: ThreatLevel.MEDIUM
            });
        }
        
        // Scan for each threat category
        for (const [category, patterns] of Object.entries(MaliciousPatterns)) {
            for (const pattern of patterns) {
                const matches = code.match(pattern);
                
                if (matches && matches.length > 0) {
                    const threat = this.categorizeThreat(category, matches, code);
                    
                    if (threat.severity === ThreatLevel.CRITICAL || 
                        threat.severity === ThreatLevel.HIGH) {
                        result.threats.push(threat);
                    } else {
                        result.warnings.push(threat);
                    }
                }
            }
        }
        
        // Check for suspicious behaviors
        this.checkSuspiciousBehaviors(code, result);
    }
    
    /**
     * Categorize a detected threat
     */
    categorizeThreat(category, matches, code) {
        const categoryToThreat = {
            apiKeyTheft: {
                category: ThreatCategory.API_KEY_THEFT,
                severity: ThreatLevel.CRITICAL,
                description: 'Potential API key theft detected'
            },
            dataExfiltration: {
                category: ThreatCategory.DATA_EXFILTRATION,
                severity: ThreatLevel.CRITICAL,
                description: 'Potential data exfiltration detected'
            },
            credentialHarvesting: {
                category: ThreatCategory.CREDENTIAL_HARVESTING,
                severity: ThreatLevel.CRITICAL,
                description: 'Potential credential harvesting detected'
            },
            maliciousCode: {
                category: ThreatCategory.MALICIOUS_CODE,
                severity: ThreatLevel.HIGH,
                description: 'Potentially malicious code pattern detected'
            },
            unauthorizedNetwork: {
                category: ThreatCategory.UNAUTHORIZED_NETWORK,
                severity: ThreatLevel.HIGH,
                description: 'Unauthorized network access attempt detected'
            },
            privacyViolation: {
                category: ThreatCategory.PRIVACY_VIOLATION,
                severity: ThreatLevel.MEDIUM,
                description: 'Privacy-sensitive API usage detected'
            },
            resourceAbuse: {
                category: ThreatCategory.RESOURCE_ABUSE,
                severity: ThreatLevel.HIGH,
                description: 'Potential resource abuse detected'
            },
            backdoor: {
                category: ThreatCategory.BACKDOOR,
                severity: ThreatLevel.CRITICAL,
                description: 'Potential backdoor detected'
            },
            obfuscation: {
                category: ThreatCategory.OBFUSCATION,
                severity: ThreatLevel.MEDIUM,
                description: 'Code obfuscation detected - may hide malicious intent'
            }
        };
        
        const base = categoryToThreat[category] || {
            category: ThreatCategory.MALICIOUS_CODE,
            severity: ThreatLevel.MEDIUM,
            description: 'Suspicious pattern detected'
        };
        
        return {
            ...base,
            matches: matches.slice(0, 5), // Limit evidence
            matchCount: matches.length
        };
    }
    
    /**
     * Check for suspicious behaviors
     */
    checkSuspiciousBehaviors(code, result) {
        // Check for encoded payloads
        const base64Matches = code.match(/[A-Za-z0-9+/=]{100,}/g);
        if (base64Matches && base64Matches.length > 3) {
            result.warnings.push({
                category: ThreatCategory.OBFUSCATION,
                severity: ThreatLevel.MEDIUM,
                description: `Found ${base64Matches.length} large encoded strings`,
                recommendation: 'Review encoded content for malicious payloads'
            });
        }
        
        // Check for dynamic code execution
        if (/eval|Function\s*\(|setTimeout\s*\(\s*['"`]/.test(code)) {
            result.warnings.push({
                category: ThreatCategory.MALICIOUS_CODE,
                severity: ThreatLevel.MEDIUM,
                description: 'Dynamic code execution detected',
                recommendation: 'Avoid eval() and similar constructs'
            });
        }
        
        // Check for external resource loading
        const externalUrls = code.match(/https?:\/\/[^\s'"`)]+/gi);
        if (externalUrls && externalUrls.length > 0) {
            const uniqueUrls = [...new Set(externalUrls)];
            result.warnings.push({
                category: ThreatCategory.UNAUTHORIZED_NETWORK,
                severity: ThreatLevel.LOW,
                description: `References ${uniqueUrls.length} external URLs`,
                evidence: uniqueUrls.slice(0, 10),
                recommendation: 'Verify all external resources are legitimate'
            });
        }
    }
    
    /**
     * Check extension permissions
     */
    checkPermissions(extension, result) {
        const permissions = extension.permissions || [];
        
        // Dangerous permissions
        const dangerousPerms = [
            'storage', 'cookies', 'webRequest', 'tabs',
            'history', 'bookmarks', 'downloads', 'management'
        ];
        
        const requested = permissions.filter(p => dangerousPerms.includes(p));
        
        if (requested.length > 0) {
            result.warnings.push({
                category: ThreatCategory.PRIVACY_VIOLATION,
                severity: requested.length > 3 ? ThreatLevel.MEDIUM : ThreatLevel.LOW,
                description: `Requests sensitive permissions: ${requested.join(', ')}`,
                recommendation: 'Verify these permissions are necessary for functionality'
            });
        }
        
        // Check for overly broad permissions
        if (permissions.includes('all_urls') || permissions.includes('<all_urls>')) {
            result.warnings.push({
                category: ThreatCategory.UNAUTHORIZED_NETWORK,
                severity: ThreatLevel.MEDIUM,
                description: 'Requests access to all URLs',
                recommendation: 'Consider restricting URL access to specific domains'
            });
        }
    }
    
    /**
     * Check publisher trust
     */
    checkPublisher(extension, result) {
        if (!extension.publisher) {
            result.warnings.push({
                category: 'publisher',
                severity: ThreatLevel.LOW,
                description: 'No publisher information provided',
                recommendation: 'Verified publishers are more trustworthy'
            });
            return;
        }
        
        const trust = this.database.getPublisherTrust(extension.publisher);
        
        if (trust.score < 0.3) {
            result.warnings.push({
                category: 'publisher',
                severity: ThreatLevel.MEDIUM,
                description: `Publisher has low trust score (${(trust.score * 100).toFixed(0)}%)`,
                recommendation: 'Exercise caution with extensions from this publisher'
            });
        }
        
        if (!trust.verified) {
            result.warnings.push({
                category: 'publisher',
                severity: ThreatLevel.LOW,
                description: 'Publisher is not verified',
                recommendation: 'Prefer extensions from verified publishers'
            });
        }
        
        result.publisherTrust = trust;
    }
    
    /**
     * Check dependencies for known vulnerabilities
     */
    async checkDependencies(extension, result) {
        const deps = extension.dependencies || {};
        
        for (const [name, version] of Object.entries(deps)) {
            // Check if dependency is known malicious
            if (this.database.isBlocked(name)) {
                result.threats.push({
                    category: ThreatCategory.SUPPLY_CHAIN,
                    severity: ThreatLevel.CRITICAL,
                    description: `Depends on blocklisted package: ${name}`,
                    recommendation: 'Remove this dependency immediately'
                });
            }
        }
        
        // Check for suspicious dependency patterns
        if (Object.keys(deps).length > 50) {
            result.warnings.push({
                category: ThreatCategory.SUPPLY_CHAIN,
                severity: ThreatLevel.LOW,
                description: 'Large number of dependencies increases supply chain risk',
                recommendation: 'Review and minimize dependencies'
            });
        }
    }
    
    /**
     * Determine final status based on findings
     */
    determineStatus(result) {
        // Any critical threats = blocked
        if (result.threats.some(t => t.severity === ThreatLevel.CRITICAL)) {
            result.status = ExtensionStatus.BLOCKED;
            result.threatLevel = ThreatLevel.CRITICAL;
            return;
        }
        
        // High severity threats = quarantined
        if (result.threats.some(t => t.severity === ThreatLevel.HIGH)) {
            result.status = ExtensionStatus.QUARANTINED;
            result.threatLevel = ThreatLevel.HIGH;
            return;
        }
        
        // Medium threats or multiple warnings = flagged
        if (result.threats.length > 0 || 
            result.warnings.filter(w => w.severity === ThreatLevel.MEDIUM).length >= 3) {
            result.status = ExtensionStatus.FLAGGED;
            result.threatLevel = ThreatLevel.MEDIUM;
            return;
        }
        
        // Minor warnings only = approved with notes
        if (result.warnings.length > 0) {
            result.status = ExtensionStatus.APPROVED;
            result.threatLevel = ThreatLevel.LOW;
            result.recommendations.push('Review warnings before using in production');
            return;
        }
        
        // All clear
        result.status = ExtensionStatus.APPROVED;
        result.threatLevel = ThreatLevel.SAFE;
    }
    
    /**
     * Report a malicious extension
     */
    reportExtension(extensionName, report) {
        this.database.report(extensionName, report);
    }
    
    /**
     * Block an extension
     */
    blockExtension(extensionInfo) {
        this.database.block(extensionInfo);
        this.stats.extensionsBlocked++;
    }
    
    /**
     * Get scan statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

/**
 * Extension Review Board
 * 
 * Coordinates multiple security scanners and ethics reviewers
 * to provide consensus-based extension approval.
 */
class ExtensionReviewBoard {
    constructor(options = {}) {
        // Initialize multiple scanners for consensus
        this.scanners = [
            new ExtensionSecurityScanner({
                id: 'security_scanner_1',
                name: 'Primary Security Scanner',
                deepScan: true
            }),
            new ExtensionSecurityScanner({
                id: 'security_scanner_2',
                name: 'Secondary Security Scanner',
                deepScan: true
            }),
            new ExtensionSecurityScanner({
                id: 'security_scanner_3',
                name: 'Backup Security Scanner',
                deepScan: false
            })
        ];
        
        // Shared malicious extension database
        this.database = new MaliciousExtensionDatabase();
        
        // Configuration
        this.config = {
            minScanners: options.minScanners || 2,
            blockThreshold: options.blockThreshold || 0.5, // 50% block = blocked
            approvalThreshold: options.approvalThreshold || 0.67 // 67% approve = approved
        };
        
        // Review history
        this.reviewHistory = [];
        
        // Statistics
        this.stats = {
            totalReviews: 0,
            approved: 0,
            blocked: 0,
            flagged: 0
        };
        
        // Event handlers
        this.eventHandlers = [];
    }
    
    /**
     * Review an extension with full board
     */
    async reviewExtension(extension, submitterId = null) {
        const startTime = Date.now();
        
        // Run all scanners
        const scanPromises = this.scanners.map(s => 
            s.scan(extension).catch(e => ({
                status: ExtensionStatus.FLAGGED,
                error: e.message
            }))
        );
        
        const scanResults = await Promise.all(scanPromises);
        
        // Calculate consensus
        const consensus = this.calculateConsensus(scanResults);
        
        // Build result
        const result = {
            extensionId: extension.id,
            extensionName: extension.name,
            version: extension.version,
            publisher: extension.publisher,
            status: consensus.status,
            threatLevel: consensus.threatLevel,
            threats: consensus.allThreats,
            warnings: consensus.allWarnings,
            scanResults: scanResults.map(r => ({
                scannerId: r.scannerId,
                status: r.status,
                threatLevel: r.threatLevel,
                threatCount: r.threats?.length || 0
            })),
            consensus: consensus.agreement,
            reviewTime: Date.now() - startTime,
            timestamp: Date.now(),
            submitterId
        };
        
        // Update statistics
        this.updateStats(result);
        
        // Log review
        this.logReview(result);
        
        // Auto-block if critical
        if (result.status === ExtensionStatus.BLOCKED) {
            this.database.block({
                name: extension.name,
                hash: scanResults[0]?.hash,
                reason: result.threats[0]?.description || 'Multiple security violations',
                category: result.threats[0]?.category || ThreatCategory.MALICIOUS_CODE,
                severity: ThreatLevel.CRITICAL
            });
        }
        
        // Emit event
        this.emit('review_complete', result);
        
        return result;
    }
    
    /**
     * Calculate consensus from scan results
     */
    calculateConsensus(scanResults) {
        const validResults = scanResults.filter(r => !r.error);
        
        if (validResults.length < this.config.minScanners) {
            return {
                status: ExtensionStatus.FLAGGED,
                threatLevel: ThreatLevel.MEDIUM,
                allThreats: [],
                allWarnings: [{ message: 'Insufficient scanner agreement' }],
                agreement: 0
            };
        }
        
        // Count votes
        const votes = {
            [ExtensionStatus.BLOCKED]: 0,
            [ExtensionStatus.QUARANTINED]: 0,
            [ExtensionStatus.FLAGGED]: 0,
            [ExtensionStatus.APPROVED]: 0
        };
        
        const allThreats = [];
        const allWarnings = [];
        
        for (const result of validResults) {
            votes[result.status]++;
            
            if (result.threats) {
                allThreats.push(...result.threats);
            }
            if (result.warnings) {
                allWarnings.push(...result.warnings);
            }
        }
        
        const total = validResults.length;
        
        // Determine status
        if (votes[ExtensionStatus.BLOCKED] / total >= this.config.blockThreshold) {
            return {
                status: ExtensionStatus.BLOCKED,
                threatLevel: ThreatLevel.CRITICAL,
                allThreats: this.dedupeThreats(allThreats),
                allWarnings: this.dedupeThreats(allWarnings),
                agreement: votes[ExtensionStatus.BLOCKED] / total
            };
        }
        
        if (votes[ExtensionStatus.QUARANTINED] / total >= this.config.blockThreshold) {
            return {
                status: ExtensionStatus.QUARANTINED,
                threatLevel: ThreatLevel.HIGH,
                allThreats: this.dedupeThreats(allThreats),
                allWarnings: this.dedupeThreats(allWarnings),
                agreement: votes[ExtensionStatus.QUARANTINED] / total
            };
        }
        
        if (votes[ExtensionStatus.APPROVED] / total >= this.config.approvalThreshold) {
            return {
                status: ExtensionStatus.APPROVED,
                threatLevel: allWarnings.length > 0 ? ThreatLevel.LOW : ThreatLevel.SAFE,
                allThreats: [],
                allWarnings: this.dedupeThreats(allWarnings),
                agreement: votes[ExtensionStatus.APPROVED] / total
            };
        }
        
        // No clear consensus
        return {
            status: ExtensionStatus.FLAGGED,
            threatLevel: ThreatLevel.MEDIUM,
            allThreats: this.dedupeThreats(allThreats),
            allWarnings: this.dedupeThreats(allWarnings),
            agreement: Math.max(...Object.values(votes)) / total
        };
    }
    
    /**
     * Deduplicate threats/warnings
     */
    dedupeThreats(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = `${item.category}-${item.description}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
    
    /**
     * Update statistics
     */
    updateStats(result) {
        this.stats.totalReviews++;
        
        switch (result.status) {
            case ExtensionStatus.APPROVED:
                this.stats.approved++;
                break;
            case ExtensionStatus.BLOCKED:
            case ExtensionStatus.QUARANTINED:
                this.stats.blocked++;
                break;
            case ExtensionStatus.FLAGGED:
                this.stats.flagged++;
                break;
        }
    }
    
    /**
     * Log review
     */
    logReview(result) {
        this.reviewHistory.push(result);
        
        // Keep last 1000 reviews
        if (this.reviewHistory.length > 1000) {
            this.reviewHistory.shift();
        }
    }
    
    /**
     * Report an extension
     */
    reportExtension(extensionName, report) {
        this.database.report(extensionName, report);
        
        // Also report to all scanners
        for (const scanner of this.scanners) {
            scanner.reportExtension(extensionName, report);
        }
        
        this.emit('extension_reported', { extensionName, report });
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            blocklist_size: this.database.blocklist.size,
            review_history_size: this.reviewHistory.length
        };
    }
    
    /**
     * Get recent reviews
     */
    getRecentReviews(limit = 50) {
        return this.reviewHistory.slice(-limit);
    }
    
    /**
     * Check if extension is blocked
     */
    isBlocked(identifier) {
        return this.database.isBlocked(identifier);
    }
    
    /**
     * Register event handler
     */
    on(event, handler) {
        this.eventHandlers.push({ event, handler });
    }
    
    /**
     * Emit event
     */
    emit(event, data) {
        for (const h of this.eventHandlers) {
            if (h.event === event) {
                try {
                    h.handler(data);
                } catch (e) {
                    console.error(`Event handler error (${event}):`, e);
                }
            }
        }
    }
}

module.exports = {
    ThreatLevel,
    ExtensionStatus,
    ThreatCategory,
    MaliciousPatterns,
    MaliciousExtensionDatabase,
    ExtensionSecurityScanner,
    ExtensionReviewBoard
};
