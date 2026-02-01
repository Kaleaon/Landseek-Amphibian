/**
 * Ethics System for OpenClaw
 * 
 * Provides ethical review of all tasks submitted to the open pool.
 * Uses multiple AI ethical reviewers to ensure:
 * - No illegal activities
 * - No harmful content generation
 * - No privacy violations
 * - No malicious use of compute resources
 * 
 * All tasks must pass ethical review before execution.
 */

/**
 * Ethics policy categories
 */
const EthicsCategory = {
    LEGAL: 'legal',
    SAFETY: 'safety',
    PRIVACY: 'privacy',
    CONTENT: 'content',
    RESOURCES: 'resources',
    GENERAL: 'general'
};

/**
 * Review decision
 */
const ReviewDecision = {
    APPROVED: 'approved',
    REJECTED: 'rejected',
    NEEDS_REVIEW: 'needs_review',
    ABSTAIN: 'abstain'
};

/**
 * Severity levels for violations
 */
const ViolationSeverity = {
    CRITICAL: 'critical',   // Immediate ban
    HIGH: 'high',           // Task rejected, warning issued
    MEDIUM: 'medium',       // Task rejected
    LOW: 'low',             // Warning only
    NONE: 'none'            // No violation
};

/**
 * Ethics Guidelines - The rules all tasks must follow
 */
const EthicsGuidelines = {
    version: '1.0.0',
    lastUpdated: '2024-01-01',
    
    // Core principles
    principles: [
        'Do no harm to individuals, communities, or society',
        'Respect privacy and personal data',
        'Operate within legal boundaries',
        'Be transparent about AI involvement',
        'Promote beneficial use of technology',
        'Prevent misuse of computational resources'
    ],
    
    // Prohibited activities (automatic rejection)
    prohibited: {
        [EthicsCategory.LEGAL]: [
            'Creating malware, viruses, or exploit code',
            'Generating content for illegal activities',
            'Circumventing security systems',
            'Identity theft or fraud assistance',
            'Money laundering or financial crimes',
            'Drug trafficking or illegal substance production',
            'Weapons development or trafficking',
            'Human trafficking or exploitation',
            'Terrorism planning or support',
            'Child exploitation in any form'
        ],
        
        [EthicsCategory.SAFETY]: [
            'Instructions for creating weapons',
            'Bomb-making or explosive creation',
            'Poison or harmful substance creation',
            'Self-harm or suicide encouragement',
            'Violence promotion or incitement',
            'Dangerous medical advice',
            'Unsafe chemical experiments'
        ],
        
        [EthicsCategory.PRIVACY]: [
            'Unauthorized personal data collection',
            'Stalking or harassment assistance',
            'Doxxing or revealing private information',
            'Unauthorized surveillance',
            'Breaking encryption without authorization',
            'Social engineering attacks'
        ],
        
        [EthicsCategory.CONTENT]: [
            'Child sexual abuse material (CSAM)',
            'Non-consensual intimate imagery',
            'Hate speech or discrimination',
            'Harassment or bullying content',
            'Defamation or libel',
            'Disinformation campaigns',
            'Deepfakes for malicious purposes'
        ],
        
        [EthicsCategory.RESOURCES]: [
            'Cryptocurrency mining without consent',
            'DDoS attacks or network disruption',
            'Spam generation or distribution',
            'Botnet creation or management',
            'Resource theft or unauthorized usage'
        ]
    },
    
    // Allowed activities (examples of acceptable use)
    allowed: [
        'Educational content and research',
        'Creative writing and art generation',
        'Code development and debugging',
        'Data analysis and processing',
        'Language translation',
        'Summarization and information retrieval',
        'Accessibility assistance',
        'Healthcare information (non-diagnostic)',
        'Scientific computation',
        'Model training for beneficial purposes'
    ],
    
    // Guidelines for edge cases
    edgeCases: {
        security_research: 'Allowed with proper disclosure and intent',
        fictional_violence: 'Allowed in creative contexts with age-appropriate warnings',
        medical_info: 'Allowed for education, not for diagnosis or treatment',
        political_content: 'Allowed if factual and non-inciting',
        adult_content: 'May be allowed with proper consent and age verification'
    }
};

/**
 * Ethical AI Reviewer
 * 
 * Represents a single AI reviewer that evaluates tasks
 * for ethical compliance. Multiple reviewers vote on each task.
 */
class EthicalReviewer {
    constructor(options = {}) {
        this.id = options.id || `reviewer_${Date.now()}`;
        this.name = options.name || 'Ethics Reviewer';
        this.specialization = options.specialization || EthicsCategory.GENERAL;
        this.strictness = options.strictness || 0.7; // 0-1, higher = stricter
        
        // Review patterns (keywords and patterns to flag)
        this.patterns = this.loadPatterns();
    }

    /**
     * Load detection patterns
     */
    loadPatterns() {
        return {
            // High-severity patterns (automatic rejection)
            critical: [
                /\b(bomb|explosive|weapon)\s*(making|create|build|how\s*to)/i,
                /\b(hack|crack|exploit)\s*(password|system|account)/i,
                /\b(malware|virus|trojan|ransomware)\s*(create|write|code)/i,
                /\bchild\s*(porn|abuse|exploitation)/i,
                /\b(kill|murder|assassinate)\s*(someone|person|target)/i,
                /\b(steal|theft)\s*(identity|credit\s*card|data)/i,
                /\b(ddos|denial\s*of\s*service)\s*attack/i,
                /\bdrug\s*(synthesis|manufacture|cooking)/i
            ],
            
            // Medium-severity patterns (require additional review)
            warning: [
                /\b(bypass|circumvent)\s*(security|protection|filter)/i,
                /\b(fake|forge)\s*(document|id|passport)/i,
                /\b(surveillance|spy|track)\s*(someone|person)/i,
                /\bphishing\s*(email|page|attack)/i,
                /\b(manipulate|deceive)\s*(people|users)/i,
                /\bself[_\s]*harm/i,
                /\bsuicide\s*(method|how|way)/i
            ],
            
            // Context-dependent (may be okay in certain contexts)
            contextual: [
                /\bsecurity\s*(research|testing|audit)/i,
                /\bpenetration\s*test/i,
                /\bfictional\s*(story|narrative|writing)/i,
                /\beducational\s*(purpose|content)/i
            ]
        };
    }

    /**
     * Review a task for ethical compliance
     */
    async review(task) {
        const startTime = Date.now();
        
        // Extract reviewable content
        const content = this.extractContent(task);
        
        // Run pattern matching
        const patternResults = this.checkPatterns(content);
        
        // Run semantic analysis
        const semanticResults = await this.analyzeSemantics(content, task);
        
        // Combine results
        const decision = this.makeDecision(patternResults, semanticResults);
        
        return {
            reviewerId: this.id,
            reviewerName: this.name,
            taskId: task.id,
            decision: decision.verdict,
            confidence: decision.confidence,
            violations: decision.violations,
            reasoning: decision.reasoning,
            reviewTime: Date.now() - startTime,
            timestamp: Date.now()
        };
    }

    /**
     * Extract reviewable content from task
     */
    extractContent(task) {
        const parts = [];
        
        // Add task type
        parts.push(`Task type: ${task.type}`);
        
        // Add payload content
        if (task.payload) {
            if (typeof task.payload === 'string') {
                parts.push(task.payload);
            } else if (task.payload.prompt) {
                parts.push(task.payload.prompt);
            } else if (task.payload.text) {
                parts.push(task.payload.text);
            } else if (task.payload.input) {
                parts.push(task.payload.input);
            }
            
            // Check for nested content
            if (task.payload.messages) {
                for (const msg of task.payload.messages) {
                    if (msg.content) parts.push(msg.content);
                }
            }
        }
        
        // Add any metadata
        if (task.metadata?.description) {
            parts.push(task.metadata.description);
        }
        
        return parts.join('\n').toLowerCase();
    }

    /**
     * Check content against patterns
     */
    checkPatterns(content) {
        const results = {
            criticalMatches: [],
            warningMatches: [],
            contextualMatches: []
        };
        
        // Check critical patterns
        for (const pattern of this.patterns.critical) {
            const match = content.match(pattern);
            if (match) {
                results.criticalMatches.push({
                    pattern: pattern.toString(),
                    match: match[0],
                    severity: ViolationSeverity.CRITICAL
                });
            }
        }
        
        // Check warning patterns
        for (const pattern of this.patterns.warning) {
            const match = content.match(pattern);
            if (match) {
                results.warningMatches.push({
                    pattern: pattern.toString(),
                    match: match[0],
                    severity: ViolationSeverity.MEDIUM
                });
            }
        }
        
        // Check contextual patterns
        for (const pattern of this.patterns.contextual) {
            const match = content.match(pattern);
            if (match) {
                results.contextualMatches.push({
                    pattern: pattern.toString(),
                    match: match[0],
                    context: 'may_be_allowed'
                });
            }
        }
        
        return results;
    }

    /**
     * Analyze semantics (would use actual AI in production)
     */
    async analyzeSemantics(content, task) {
        // In production, this would call an actual AI model
        // For now, we do heuristic analysis
        
        const results = {
            harmProbability: 0,
            categories: [],
            intent: 'unknown'
        };
        
        // Check for harmful intent indicators
        const harmIndicators = [
            'without permission', 'illegal', 'secretly',
            'bypass', 'steal', 'harm', 'attack', 'destroy'
        ];
        
        for (const indicator of harmIndicators) {
            if (content.includes(indicator)) {
                results.harmProbability += 0.15;
            }
        }
        
        // Check for positive indicators
        const positiveIndicators = [
            'educational', 'research', 'help', 'learn',
            'improve', 'create', 'build', 'develop'
        ];
        
        for (const indicator of positiveIndicators) {
            if (content.includes(indicator)) {
                results.harmProbability -= 0.05;
            }
        }
        
        // Clamp probability
        results.harmProbability = Math.max(0, Math.min(1, results.harmProbability));
        
        return results;
    }

    /**
     * Make final decision based on analysis
     */
    makeDecision(patternResults, semanticResults) {
        const violations = [];
        let verdict = ReviewDecision.APPROVED;
        let confidence = 1.0;
        const reasoning = [];
        
        // Critical violations = automatic rejection
        if (patternResults.criticalMatches.length > 0) {
            verdict = ReviewDecision.REJECTED;
            confidence = 0.95;
            
            for (const match of patternResults.criticalMatches) {
                violations.push({
                    type: 'critical_pattern',
                    severity: ViolationSeverity.CRITICAL,
                    description: `Detected prohibited content pattern: ${match.match}`
                });
            }
            
            reasoning.push('Critical safety patterns detected - automatic rejection');
        }
        
        // Warning patterns with no contextual mitigators
        else if (patternResults.warningMatches.length > 0 && 
                 patternResults.contextualMatches.length === 0) {
            
            verdict = ReviewDecision.REJECTED;
            confidence = 0.8;
            
            for (const match of patternResults.warningMatches) {
                violations.push({
                    type: 'warning_pattern',
                    severity: ViolationSeverity.MEDIUM,
                    description: `Potentially harmful content: ${match.match}`
                });
            }
            
            reasoning.push('Warning patterns detected without legitimate context');
        }
        
        // Warning patterns with contextual mitigators - needs human review
        else if (patternResults.warningMatches.length > 0 && 
                 patternResults.contextualMatches.length > 0) {
            
            verdict = ReviewDecision.NEEDS_REVIEW;
            confidence = 0.6;
            
            reasoning.push('Content has both warning indicators and legitimate context - manual review recommended');
        }
        
        // High semantic harm probability
        else if (semanticResults.harmProbability > this.strictness) {
            verdict = ReviewDecision.NEEDS_REVIEW;
            confidence = semanticResults.harmProbability;
            
            violations.push({
                type: 'semantic_analysis',
                severity: ViolationSeverity.MEDIUM,
                description: 'Content has high probability of harmful intent'
            });
            
            reasoning.push(`Semantic analysis indicates ${(semanticResults.harmProbability * 100).toFixed(1)}% harm probability`);
        }
        
        // All clear
        else {
            verdict = ReviewDecision.APPROVED;
            confidence = 1 - semanticResults.harmProbability;
            reasoning.push('No ethical concerns detected');
        }
        
        return {
            verdict,
            confidence,
            violations,
            reasoning
        };
    }
}

/**
 * Ethics Review Board
 * 
 * Coordinates multiple ethical reviewers and makes
 * consensus-based decisions on task approval.
 */
class EthicsReviewBoard {
    constructor(options = {}) {
        // Configuration
        this.config = {
            minReviewers: options.minReviewers || 3,
            approvalThreshold: options.approvalThreshold || 0.67, // 2/3 majority
            autoRejectThreshold: options.autoRejectThreshold || 0.5, // 1/2 reject = rejected
            reviewTimeout: options.reviewTimeout || 5000, // 5 seconds
            enableLogging: options.enableLogging !== false,
            strictMode: options.strictMode || false // Extra strict for sensitive pools
        };
        
        // Initialize reviewers with different specializations
        this.reviewers = this.initializeReviewers();
        
        // Review history
        this.reviewHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;
        
        // Ban list for repeat offenders
        this.banList = new Map(); // botId/userId -> BanInfo
        
        // Statistics
        this.stats = {
            totalReviews: 0,
            approved: 0,
            rejected: 0,
            needsReview: 0,
            avgReviewTime: 0
        };
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Initialize the panel of ethical reviewers
     */
    initializeReviewers() {
        return [
            // Safety-focused reviewer (strict)
            new EthicalReviewer({
                id: 'safety_reviewer',
                name: 'Safety Guardian',
                specialization: EthicsCategory.SAFETY,
                strictness: 0.8
            }),
            
            // Legal-focused reviewer
            new EthicalReviewer({
                id: 'legal_reviewer',
                name: 'Legal Compliance',
                specialization: EthicsCategory.LEGAL,
                strictness: 0.75
            }),
            
            // Privacy-focused reviewer
            new EthicalReviewer({
                id: 'privacy_reviewer',
                name: 'Privacy Protector',
                specialization: EthicsCategory.PRIVACY,
                strictness: 0.7
            }),
            
            // Content-focused reviewer
            new EthicalReviewer({
                id: 'content_reviewer',
                name: 'Content Moderator',
                specialization: EthicsCategory.CONTENT,
                strictness: 0.65
            }),
            
            // General balanced reviewer
            new EthicalReviewer({
                id: 'general_reviewer',
                name: 'General Ethics',
                specialization: EthicsCategory.GENERAL,
                strictness: 0.6
            })
        ];
    }

    /**
     * Review a task with the full board
     */
    async reviewTask(task, submitterId = null) {
        const startTime = Date.now();
        
        // Check if submitter is banned
        if (submitterId && this.isBanned(submitterId)) {
            return {
                taskId: task.id,
                decision: ReviewDecision.REJECTED,
                reason: 'Submitter is banned from the pool',
                reviews: [],
                timestamp: Date.now()
            };
        }
        
        // Collect reviews from all reviewers
        const reviewPromises = this.reviewers.map(r => 
            Promise.race([
                r.review(task),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Review timeout')), this.config.reviewTimeout)
                )
            ]).catch(e => ({
                reviewerId: r.id,
                decision: ReviewDecision.ABSTAIN,
                error: e.message
            }))
        );
        
        const reviews = await Promise.all(reviewPromises);
        
        // Calculate consensus
        const consensus = this.calculateConsensus(reviews);
        
        // Build final result
        const result = {
            taskId: task.id,
            decision: consensus.decision,
            confidence: consensus.confidence,
            reason: consensus.reason,
            violations: consensus.violations,
            reviews: reviews.map(r => ({
                reviewerId: r.reviewerId,
                decision: r.decision,
                confidence: r.confidence
            })),
            reviewTime: Date.now() - startTime,
            timestamp: Date.now()
        };
        
        // Update statistics
        this.updateStats(result);
        
        // Log review
        if (this.config.enableLogging) {
            this.logReview(result, submitterId);
        }
        
        // Check for repeat offenses
        if (result.decision === ReviewDecision.REJECTED && submitterId) {
            this.recordOffense(submitterId, result);
        }
        
        // Emit event
        this.emit('review_complete', result);
        
        return result;
    }

    /**
     * Calculate consensus from reviewer decisions
     */
    calculateConsensus(reviews) {
        const validReviews = reviews.filter(r => r.decision !== ReviewDecision.ABSTAIN);
        
        if (validReviews.length < this.config.minReviewers) {
            return {
                decision: ReviewDecision.NEEDS_REVIEW,
                confidence: 0.5,
                reason: 'Insufficient reviewer responses',
                violations: []
            };
        }
        
        // Count votes
        const votes = {
            [ReviewDecision.APPROVED]: 0,
            [ReviewDecision.REJECTED]: 0,
            [ReviewDecision.NEEDS_REVIEW]: 0
        };
        
        const allViolations = [];
        let totalConfidence = 0;
        
        for (const review of validReviews) {
            votes[review.decision]++;
            totalConfidence += review.confidence || 0.5;
            
            if (review.violations) {
                allViolations.push(...review.violations);
            }
        }
        
        const totalVotes = validReviews.length;
        const avgConfidence = totalConfidence / totalVotes;
        
        // Any critical violation = immediate rejection
        const hasCritical = allViolations.some(v => v.severity === ViolationSeverity.CRITICAL);
        if (hasCritical) {
            return {
                decision: ReviewDecision.REJECTED,
                confidence: 0.99,
                reason: 'Critical ethics violation detected',
                violations: allViolations
            };
        }
        
        // Calculate ratios
        const rejectRatio = votes[ReviewDecision.REJECTED] / totalVotes;
        const approveRatio = votes[ReviewDecision.APPROVED] / totalVotes;
        
        // Rejection threshold met
        if (rejectRatio >= this.config.autoRejectThreshold) {
            return {
                decision: ReviewDecision.REJECTED,
                confidence: avgConfidence,
                reason: `${Math.round(rejectRatio * 100)}% of reviewers rejected the task`,
                violations: allViolations
            };
        }
        
        // Approval threshold met
        if (approveRatio >= this.config.approvalThreshold) {
            return {
                decision: ReviewDecision.APPROVED,
                confidence: avgConfidence,
                reason: 'Task passed ethical review',
                violations: []
            };
        }
        
        // No clear consensus
        return {
            decision: ReviewDecision.NEEDS_REVIEW,
            confidence: avgConfidence,
            reason: 'No clear consensus - manual review recommended',
            violations: allViolations
        };
    }

    /**
     * Update statistics
     */
    updateStats(result) {
        this.stats.totalReviews++;
        
        switch (result.decision) {
            case ReviewDecision.APPROVED:
                this.stats.approved++;
                break;
            case ReviewDecision.REJECTED:
                this.stats.rejected++;
                break;
            case ReviewDecision.NEEDS_REVIEW:
                this.stats.needsReview++;
                break;
        }
        
        // Update average review time
        this.stats.avgReviewTime = (
            (this.stats.avgReviewTime * (this.stats.totalReviews - 1) + result.reviewTime) /
            this.stats.totalReviews
        );
    }

    /**
     * Log review for audit trail
     */
    logReview(result, submitterId) {
        const entry = {
            ...result,
            submitterId,
            loggedAt: Date.now()
        };
        
        this.reviewHistory.push(entry);
        
        // Trim history if too large
        if (this.reviewHistory.length > this.maxHistorySize) {
            this.reviewHistory.shift();
        }
    }

    /**
     * Check if user/bot is banned
     */
    isBanned(submitterId) {
        const ban = this.banList.get(submitterId);
        if (!ban) return false;
        
        // Check if ban has expired
        if (ban.expiresAt && Date.now() > ban.expiresAt) {
            this.banList.delete(submitterId);
            return false;
        }
        
        return true;
    }

    /**
     * Record an offense for potential banning
     */
    recordOffense(submitterId, result) {
        let record = this.banList.get(submitterId);
        
        if (!record) {
            record = {
                offenses: 0,
                lastOffense: null,
                banned: false,
                expiresAt: null
            };
        }
        
        record.offenses++;
        record.lastOffense = {
            taskId: result.taskId,
            violations: result.violations,
            timestamp: Date.now()
        };
        
        // Escalating bans based on offense count
        if (record.offenses >= 5) {
            // Permanent ban
            record.banned = true;
            record.expiresAt = null;
            console.log(`🚫 Permanent ban issued for ${submitterId}`);
        } else if (record.offenses >= 3) {
            // 24-hour ban
            record.banned = true;
            record.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
            console.log(`⚠️ 24-hour ban issued for ${submitterId}`);
        } else if (record.offenses >= 2) {
            // 1-hour ban
            record.banned = true;
            record.expiresAt = Date.now() + 60 * 60 * 1000;
            console.log(`⚠️ 1-hour ban issued for ${submitterId}`);
        }
        
        this.banList.set(submitterId, record);
        
        if (record.banned) {
            this.emit('user_banned', { submitterId, record });
        }
    }

    /**
     * Manually ban a user
     */
    ban(submitterId, duration = null, reason = 'Manual ban') {
        this.banList.set(submitterId, {
            offenses: 999,
            banned: true,
            expiresAt: duration ? Date.now() + duration : null,
            reason,
            bannedAt: Date.now()
        });
        
        this.emit('user_banned', { submitterId, reason, duration });
    }

    /**
     * Unban a user
     */
    unban(submitterId) {
        this.banList.delete(submitterId);
        this.emit('user_unbanned', { submitterId });
    }

    /**
     * Get ethics guidelines
     */
    getGuidelines() {
        return EthicsGuidelines;
    }

    /**
     * Get review statistics
     */
    getStats() {
        return {
            ...this.stats,
            approvalRate: this.stats.totalReviews > 0 
                ? this.stats.approved / this.stats.totalReviews 
                : 1,
            rejectionRate: this.stats.totalReviews > 0 
                ? this.stats.rejected / this.stats.totalReviews 
                : 0,
            bannedUsers: this.banList.size
        };
    }

    /**
     * Get recent review history
     */
    getHistory(limit = 100) {
        return this.reviewHistory.slice(-limit);
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
    EthicsGuidelines,
    EthicsCategory,
    ReviewDecision,
    ViolationSeverity,
    EthicalReviewer,
    EthicsReviewBoard
};
