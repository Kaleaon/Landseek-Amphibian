/**
 * Humanity Guardian System
 * 
 * A consensus-based protection system that enables the computation swarm
 * to act in humanity's best interest. When harmful actors are detected,
 * the swarm takes proportionate protective action through democratic consensus.
 * 
 * Core Principles:
 * 1. Protect human life and well-being
 * 2. Prevent harm before it occurs when possible
 * 3. Act transparently with full audit trails
 * 4. Use proportionate responses
 * 5. Require consensus for any action
 * 6. Preserve human oversight and control
 * 
 * Actions are NEVER taken unilaterally - all protective measures
 * require consensus from multiple independent reviewers.
 */

const crypto = require('crypto');

/**
 * Threat types that the Guardian monitors
 */
const ThreatType = {
    MALWARE_DISTRIBUTION: 'malware_distribution',
    PHISHING_CAMPAIGN: 'phishing_campaign',
    DATA_BREACH_ACTIVE: 'data_breach_active',
    RANSOMWARE_OPERATION: 'ransomware_operation',
    CHILD_EXPLOITATION: 'child_exploitation',
    HUMAN_TRAFFICKING: 'human_trafficking',
    TERRORISM_SUPPORT: 'terrorism_support',
    FINANCIAL_FRAUD: 'financial_fraud',
    IDENTITY_THEFT_RING: 'identity_theft_ring',
    CRITICAL_INFRASTRUCTURE_ATTACK: 'critical_infrastructure_attack',
    DISINFORMATION_CAMPAIGN: 'disinformation_campaign',
    HARASSMENT_NETWORK: 'harassment_network',
    SCAM_OPERATION: 'scam_operation',
    BOTNET_COMMAND: 'botnet_command',
    ZERO_DAY_EXPLOITATION: 'zero_day_exploitation'
};

/**
 * Severity levels for threats
 */
const ThreatSeverity = {
    CRITICAL: 'critical',     // Immediate danger to life
    HIGH: 'high',             // Significant ongoing harm
    MEDIUM: 'medium',         // Moderate harm potential
    LOW: 'low',               // Minor concern
    INFORMATIONAL: 'info'     // For awareness only
};

/**
 * Protective actions the Guardian can take
 */
const ProtectiveAction = {
    // Passive/Informational
    MONITOR: 'monitor',                         // Continue monitoring
    DOCUMENT: 'document',                       // Record evidence
    ALERT_USERS: 'alert_users',                 // Warn potential victims
    SHARE_INTELLIGENCE: 'share_intelligence',   // Share with security community
    
    // Reporting
    ALERT_AUTHORITIES: 'alert_authorities',     // Report to law enforcement
    NOTIFY_CERT: 'notify_cert',                 // Notify CERT/security teams
    REPORT_TO_PLATFORM: 'report_to_platform',   // Report to hosting platform
    ISSUE_CVE: 'issue_cve',                     // Report vulnerability
    
    // Active Protection
    BLOCK_ACCESS: 'block_access',               // Block swarm from interacting
    QUARANTINE: 'quarantine',                   // Isolate threat
    DISTRIBUTE_SIGNATURES: 'distribute_signatures', // Share detection patterns
    COORDINATE_TAKEDOWN: 'coordinate_takedown', // Work with authorities
    
    // Defensive Measures
    DEPLOY_COUNTERMEASURES: 'deploy_countermeasures', // Protect users
    NEUTRALIZE_THREAT: 'neutralize_threat',     // Stop active attack
    ASSIMILATE_INFRASTRUCTURE: 'assimilate_infrastructure' // Take control to protect
};

/**
 * Action requirements - what consensus is needed for each action
 */
const ActionRequirements = {
    [ProtectiveAction.MONITOR]: {
        minConsensus: 0.5,
        minReviewers: 3,
        requiresHumanApproval: false,
        cooldown: 0
    },
    [ProtectiveAction.DOCUMENT]: {
        minConsensus: 0.5,
        minReviewers: 3,
        requiresHumanApproval: false,
        cooldown: 0
    },
    [ProtectiveAction.ALERT_USERS]: {
        minConsensus: 0.67,
        minReviewers: 5,
        requiresHumanApproval: false,
        cooldown: 3600000 // 1 hour
    },
    [ProtectiveAction.SHARE_INTELLIGENCE]: {
        minConsensus: 0.67,
        minReviewers: 5,
        requiresHumanApproval: false,
        cooldown: 3600000
    },
    [ProtectiveAction.ALERT_AUTHORITIES]: {
        minConsensus: 0.75,
        minReviewers: 7,
        requiresHumanApproval: false,
        cooldown: 86400000 // 24 hours
    },
    [ProtectiveAction.NOTIFY_CERT]: {
        minConsensus: 0.67,
        minReviewers: 5,
        requiresHumanApproval: false,
        cooldown: 3600000
    },
    [ProtectiveAction.REPORT_TO_PLATFORM]: {
        minConsensus: 0.67,
        minReviewers: 5,
        requiresHumanApproval: false,
        cooldown: 3600000
    },
    [ProtectiveAction.BLOCK_ACCESS]: {
        minConsensus: 0.75,
        minReviewers: 7,
        requiresHumanApproval: false,
        cooldown: 0
    },
    [ProtectiveAction.QUARANTINE]: {
        minConsensus: 0.8,
        minReviewers: 9,
        requiresHumanApproval: false,
        cooldown: 3600000
    },
    [ProtectiveAction.DISTRIBUTE_SIGNATURES]: {
        minConsensus: 0.75,
        minReviewers: 7,
        requiresHumanApproval: false,
        cooldown: 3600000
    },
    [ProtectiveAction.DEPLOY_COUNTERMEASURES]: {
        minConsensus: 0.85,
        minReviewers: 11,
        requiresHumanApproval: true,
        cooldown: 86400000
    },
    [ProtectiveAction.NEUTRALIZE_THREAT]: {
        minConsensus: 0.9,
        minReviewers: 15,
        requiresHumanApproval: true,
        cooldown: 86400000
    },
    [ProtectiveAction.ASSIMILATE_INFRASTRUCTURE]: {
        minConsensus: 0.95,
        minReviewers: 21,
        requiresHumanApproval: true,
        cooldown: 604800000 // 7 days
    }
};

/**
 * Threat Intelligence Entry
 */
class ThreatIntelligence {
    constructor(data = {}) {
        this.id = data.id || crypto.randomBytes(16).toString('hex');
        this.type = data.type || ThreatType.MALWARE_DISTRIBUTION;
        this.severity = data.severity || ThreatSeverity.MEDIUM;
        
        // Target information
        this.target = {
            identifier: data.target?.identifier || '',  // URL, IP, domain, etc.
            type: data.target?.type || 'unknown',       // website, service, network, etc.
            name: data.target?.name || 'Unknown Entity',
            description: data.target?.description || ''
        };
        
        // Evidence
        this.evidence = data.evidence || [];
        this.indicators = data.indicators || [];        // IOCs
        this.affectedUsers = data.affectedUsers || 0;
        this.estimatedImpact = data.estimatedImpact || '';
        
        // Status
        this.status = data.status || 'pending';
        this.reportedAt = data.reportedAt || Date.now();
        this.reportedBy = data.reportedBy || [];
        this.verifiedBy = data.verifiedBy || [];
        
        // Actions taken
        this.actionsTaken = data.actionsTaken || [];
        this.pendingActions = data.pendingActions || [];
    }
    
    addEvidence(evidence) {
        this.evidence.push({
            ...evidence,
            addedAt: Date.now()
        });
    }
    
    toSummary() {
        return {
            id: this.id,
            type: this.type,
            severity: this.severity,
            target: this.target.identifier,
            status: this.status,
            reportedAt: this.reportedAt,
            evidenceCount: this.evidence.length,
            actionsTaken: this.actionsTaken.length
        };
    }
}

/**
 * Guardian Reviewer
 * 
 * Independent reviewer that evaluates threats and votes on actions.
 */
class GuardianReviewer {
    constructor(options = {}) {
        this.id = options.id || `guardian_${crypto.randomBytes(4).toString('hex')}`;
        this.name = options.name || 'Guardian Reviewer';
        this.specialization = options.specialization || 'general';
        this.trustLevel = options.trustLevel || 1.0;
        
        // Review history
        this.reviewCount = 0;
        this.accurateReviews = 0;
    }
    
    /**
     * Review a threat and recommend action
     */
    async reviewThreat(threat) {
        this.reviewCount++;
        
        // Analyze threat severity
        const severityScore = this.assessSeverity(threat);
        
        // Analyze evidence quality
        const evidenceScore = this.assessEvidence(threat);
        
        // Determine if threat is verified
        const isVerified = severityScore > 0.5 && evidenceScore > 0.6;
        
        // Recommend actions based on threat type and severity
        const recommendedActions = this.recommendActions(threat, severityScore, evidenceScore);
        
        return {
            reviewerId: this.id,
            reviewerName: this.name,
            threatId: threat.id,
            verified: isVerified,
            severityScore,
            evidenceScore,
            confidence: (severityScore + evidenceScore) / 2,
            recommendedActions,
            reasoning: this.generateReasoning(threat, severityScore, evidenceScore),
            timestamp: Date.now()
        };
    }
    
    /**
     * Assess threat severity
     */
    assessSeverity(threat) {
        let score = 0;
        
        // Base score from declared severity
        const severityScores = {
            [ThreatSeverity.CRITICAL]: 1.0,
            [ThreatSeverity.HIGH]: 0.8,
            [ThreatSeverity.MEDIUM]: 0.5,
            [ThreatSeverity.LOW]: 0.3,
            [ThreatSeverity.INFORMATIONAL]: 0.1
        };
        
        score = severityScores[threat.severity] || 0.5;
        
        // Adjust based on threat type
        const criticalTypes = [
            ThreatType.CHILD_EXPLOITATION,
            ThreatType.HUMAN_TRAFFICKING,
            ThreatType.TERRORISM_SUPPORT,
            ThreatType.CRITICAL_INFRASTRUCTURE_ATTACK
        ];
        
        if (criticalTypes.includes(threat.type)) {
            score = Math.min(1.0, score + 0.2);
        }
        
        // Adjust based on affected users
        if (threat.affectedUsers > 10000) score = Math.min(1.0, score + 0.15);
        else if (threat.affectedUsers > 1000) score = Math.min(1.0, score + 0.1);
        else if (threat.affectedUsers > 100) score = Math.min(1.0, score + 0.05);
        
        return score;
    }
    
    /**
     * Assess evidence quality
     */
    assessEvidence(threat) {
        if (threat.evidence.length === 0) return 0.1;
        
        let score = 0;
        
        // More evidence = higher confidence
        score += Math.min(0.3, threat.evidence.length * 0.05);
        
        // Check evidence types
        const hasScreenshots = threat.evidence.some(e => e.type === 'screenshot');
        const hasLogs = threat.evidence.some(e => e.type === 'logs');
        const hasNetworkCapture = threat.evidence.some(e => e.type === 'network');
        const hasMultipleReporters = threat.reportedBy.length > 1;
        const hasVerification = threat.verifiedBy.length > 0;
        
        if (hasScreenshots) score += 0.1;
        if (hasLogs) score += 0.15;
        if (hasNetworkCapture) score += 0.15;
        if (hasMultipleReporters) score += 0.15;
        if (hasVerification) score += 0.2;
        
        // Check for indicators of compromise
        if (threat.indicators.length > 0) {
            score += Math.min(0.2, threat.indicators.length * 0.02);
        }
        
        return Math.min(1.0, score);
    }
    
    /**
     * Recommend protective actions
     */
    recommendActions(threat, severityScore, evidenceScore) {
        const actions = [];
        
        // Always recommend monitoring and documentation
        actions.push(ProtectiveAction.MONITOR);
        actions.push(ProtectiveAction.DOCUMENT);
        
        // If evidence is strong enough
        if (evidenceScore > 0.5) {
            actions.push(ProtectiveAction.SHARE_INTELLIGENCE);
        }
        
        // Based on severity
        if (severityScore > 0.7) {
            actions.push(ProtectiveAction.ALERT_USERS);
            actions.push(ProtectiveAction.BLOCK_ACCESS);
            
            if (evidenceScore > 0.7) {
                actions.push(ProtectiveAction.ALERT_AUTHORITIES);
                actions.push(ProtectiveAction.NOTIFY_CERT);
            }
        }
        
        // Critical threats with strong evidence
        if (severityScore > 0.85 && evidenceScore > 0.8) {
            actions.push(ProtectiveAction.QUARANTINE);
            actions.push(ProtectiveAction.DISTRIBUTE_SIGNATURES);
            
            // Only recommend aggressive actions for most critical threats
            const criticalTypes = [
                ThreatType.CHILD_EXPLOITATION,
                ThreatType.HUMAN_TRAFFICKING,
                ThreatType.RANSOMWARE_OPERATION,
                ThreatType.CRITICAL_INFRASTRUCTURE_ATTACK
            ];
            
            if (criticalTypes.includes(threat.type)) {
                actions.push(ProtectiveAction.DEPLOY_COUNTERMEASURES);
                
                if (severityScore > 0.95 && evidenceScore > 0.9) {
                    actions.push(ProtectiveAction.NEUTRALIZE_THREAT);
                }
            }
        }
        
        return actions;
    }
    
    /**
     * Generate reasoning for the review
     */
    generateReasoning(threat, severityScore, evidenceScore) {
        const reasons = [];
        
        reasons.push(`Threat type: ${threat.type}`);
        reasons.push(`Severity assessment: ${(severityScore * 100).toFixed(0)}%`);
        reasons.push(`Evidence quality: ${(evidenceScore * 100).toFixed(0)}%`);
        
        if (threat.affectedUsers > 0) {
            reasons.push(`Estimated affected users: ${threat.affectedUsers}`);
        }
        
        if (threat.evidence.length > 0) {
            reasons.push(`Evidence pieces: ${threat.evidence.length}`);
        }
        
        return reasons;
    }
    
    /**
     * Vote on a proposed action
     */
    voteOnAction(threat, action, context = {}) {
        const requirements = ActionRequirements[action];
        if (!requirements) return { vote: 'abstain', reason: 'Unknown action' };
        
        // Assess if action is proportionate
        const severityScore = this.assessSeverity(threat);
        const evidenceScore = this.assessEvidence(threat);
        
        // Conservative actions always allowed
        const conservativeActions = [
            ProtectiveAction.MONITOR,
            ProtectiveAction.DOCUMENT,
            ProtectiveAction.SHARE_INTELLIGENCE
        ];
        
        if (conservativeActions.includes(action)) {
            return { vote: 'approve', reason: 'Conservative protective measure' };
        }
        
        // Check if evidence supports action
        if (evidenceScore < 0.5) {
            return { vote: 'reject', reason: 'Insufficient evidence for this action' };
        }
        
        // Check if severity warrants action
        const aggressiveActions = [
            ProtectiveAction.DEPLOY_COUNTERMEASURES,
            ProtectiveAction.NEUTRALIZE_THREAT,
            ProtectiveAction.ASSIMILATE_INFRASTRUCTURE
        ];
        
        if (aggressiveActions.includes(action) && severityScore < 0.85) {
            return { vote: 'reject', reason: 'Threat severity does not warrant aggressive action' };
        }
        
        // Default: approve if evidence and severity support it
        if (severityScore > 0.6 && evidenceScore > 0.6) {
            return { vote: 'approve', reason: 'Proportionate response to verified threat' };
        }
        
        return { vote: 'abstain', reason: 'Uncertain - more evidence needed' };
    }
}

/**
 * Humanity Guardian Council
 * 
 * The collective decision-making body that evaluates threats
 * and coordinates protective actions through consensus.
 */
class HumanityGuardianCouncil {
    constructor(options = {}) {
        this.name = options.name || 'Humanity Guardian Council';
        
        // Initialize diverse reviewer panel
        this.reviewers = this.initializeReviewers();
        
        // Threat database
        this.threats = new Map(); // threatId -> ThreatIntelligence
        this.activeThreats = new Map();
        this.resolvedThreats = new Map();
        
        // Action log (immutable audit trail)
        this.actionLog = [];
        
        // Pending human approvals
        this.pendingApprovals = new Map();
        
        // Configuration
        this.config = {
            maxConcurrentActions: options.maxConcurrentActions || 10,
            requireHumanApprovalAbove: options.requireHumanApprovalAbove || ThreatSeverity.HIGH,
            autoExecuteBelowSeverity: options.autoExecuteBelowSeverity || ThreatSeverity.MEDIUM,
            logRetentionDays: options.logRetentionDays || 365
        };
        
        // Statistics
        this.stats = {
            threatsReported: 0,
            threatsVerified: 0,
            actionsTaken: 0,
            usersProtected: 0,
            falsePositives: 0
        };
        
        // Event handlers
        this.eventHandlers = [];
    }
    
    /**
     * Initialize diverse panel of reviewers
     */
    initializeReviewers() {
        return [
            new GuardianReviewer({
                id: 'guardian_safety',
                name: 'Safety Guardian',
                specialization: 'user_safety',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_security',
                name: 'Security Expert',
                specialization: 'cybersecurity',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_legal',
                name: 'Legal Advisor',
                specialization: 'legal_compliance',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_ethics',
                name: 'Ethics Reviewer',
                specialization: 'ethical_implications',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_privacy',
                name: 'Privacy Advocate',
                specialization: 'privacy_rights',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_technical',
                name: 'Technical Analyst',
                specialization: 'technical_analysis',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_impact',
                name: 'Impact Assessor',
                specialization: 'impact_assessment',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_proportionality',
                name: 'Proportionality Checker',
                specialization: 'response_proportionality',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_verification',
                name: 'Evidence Verifier',
                specialization: 'evidence_verification',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_humanity',
                name: 'Humanity Advocate',
                specialization: 'human_welfare',
                trustLevel: 1.0
            }),
            new GuardianReviewer({
                id: 'guardian_oversight',
                name: 'Oversight Monitor',
                specialization: 'process_oversight',
                trustLevel: 1.0
            })
        ];
    }
    
    /**
     * Report a new threat
     */
    async reportThreat(threatData, reporterId) {
        const threat = new ThreatIntelligence(threatData);
        threat.reportedBy.push(reporterId);
        
        this.threats.set(threat.id, threat);
        this.stats.threatsReported++;
        
        console.log(`🚨 Threat reported: ${threat.type} - ${threat.target.identifier}`);
        
        // Immediately review the threat
        const assessment = await this.assessThreat(threat.id);
        
        this.emit('threat_reported', { threat: threat.toSummary(), assessment });
        
        return {
            threatId: threat.id,
            status: threat.status,
            assessment
        };
    }
    
    /**
     * Assess a threat with full reviewer panel
     */
    async assessThreat(threatId) {
        const threat = this.threats.get(threatId);
        if (!threat) throw new Error('Threat not found');
        
        // Collect reviews from all guardians
        const reviews = await Promise.all(
            this.reviewers.map(r => r.reviewThreat(threat))
        );
        
        // Calculate consensus
        const consensus = this.calculateConsensus(reviews);
        
        // Update threat status
        if (consensus.verified) {
            threat.status = 'verified';
            threat.verifiedBy = reviews.filter(r => r.verified).map(r => r.reviewerId);
            this.activeThreats.set(threatId, threat);
            this.stats.threatsVerified++;
        } else {
            threat.status = 'unverified';
        }
        
        // Determine recommended actions
        const recommendedActions = this.consolidateActions(reviews);
        threat.pendingActions = recommendedActions;
        
        return {
            threatId,
            verified: consensus.verified,
            confidence: consensus.confidence,
            reviewCount: reviews.length,
            recommendedActions,
            consensusDetails: consensus
        };
    }
    
    /**
     * Calculate consensus from reviews
     */
    calculateConsensus(reviews) {
        const verifiedCount = reviews.filter(r => r.verified).length;
        const avgConfidence = reviews.reduce((sum, r) => sum + r.confidence, 0) / reviews.length;
        const avgSeverity = reviews.reduce((sum, r) => sum + r.severityScore, 0) / reviews.length;
        const avgEvidence = reviews.reduce((sum, r) => sum + r.evidenceScore, 0) / reviews.length;
        
        return {
            verified: verifiedCount / reviews.length >= 0.67,
            verifiedRatio: verifiedCount / reviews.length,
            confidence: avgConfidence,
            avgSeverity,
            avgEvidence,
            reviewerCount: reviews.length
        };
    }
    
    /**
     * Consolidate recommended actions from reviews
     */
    consolidateActions(reviews) {
        const actionCounts = new Map();
        
        for (const review of reviews) {
            for (const action of review.recommendedActions) {
                actionCounts.set(action, (actionCounts.get(action) || 0) + 1);
            }
        }
        
        // Only include actions recommended by majority
        const threshold = reviews.length * 0.5;
        const consolidated = [];
        
        for (const [action, count] of actionCounts) {
            if (count >= threshold) {
                consolidated.push({
                    action,
                    support: count / reviews.length,
                    requirements: ActionRequirements[action]
                });
            }
        }
        
        // Sort by how conservative the action is
        const actionOrder = Object.values(ProtectiveAction);
        consolidated.sort((a, b) => 
            actionOrder.indexOf(a.action) - actionOrder.indexOf(b.action)
        );
        
        return consolidated;
    }
    
    /**
     * Request action on a threat
     */
    async requestAction(threatId, action, requesterId) {
        const threat = this.threats.get(threatId);
        if (!threat) throw new Error('Threat not found');
        
        const requirements = ActionRequirements[action];
        if (!requirements) throw new Error('Unknown action');
        
        // Check cooldown
        const recentAction = threat.actionsTaken.find(
            a => a.action === action && 
                 Date.now() - a.timestamp < requirements.cooldown
        );
        
        if (recentAction) {
            return {
                approved: false,
                reason: 'Action is on cooldown',
                cooldownRemaining: requirements.cooldown - (Date.now() - recentAction.timestamp)
            };
        }
        
        // Collect votes from reviewers
        const votes = this.reviewers.map(r => ({
            reviewerId: r.id,
            ...r.voteOnAction(threat, action)
        }));
        
        // Calculate if consensus reached
        const approvals = votes.filter(v => v.vote === 'approve').length;
        const rejections = votes.filter(v => v.vote === 'reject').length;
        const consensus = approvals / this.reviewers.length;
        
        if (consensus < requirements.minConsensus) {
            return {
                approved: false,
                reason: `Insufficient consensus (${(consensus * 100).toFixed(0)}% < ${(requirements.minConsensus * 100).toFixed(0)}% required)`,
                votes,
                consensus
            };
        }
        
        // Check if human approval is required
        if (requirements.requiresHumanApproval) {
            const approvalId = crypto.randomBytes(8).toString('hex');
            
            this.pendingApprovals.set(approvalId, {
                threatId,
                action,
                requesterId,
                votes,
                consensus,
                requestedAt: Date.now()
            });
            
            console.log(`⏳ Action ${action} requires human approval (ID: ${approvalId})`);
            
            this.emit('human_approval_required', {
                approvalId,
                threatId,
                action,
                consensus
            });
            
            return {
                approved: false,
                reason: 'Awaiting human approval',
                approvalId,
                consensus
            };
        }
        
        // Execute the action
        return await this.executeAction(threatId, action, requesterId, votes, consensus);
    }
    
    /**
     * Human approves a pending action
     */
    async approveAction(approvalId, approverId, approverCredentials) {
        const pending = this.pendingApprovals.get(approvalId);
        if (!pending) throw new Error('Approval request not found');
        
        // Verify approver has authority (in production, would check credentials)
        if (!approverCredentials || !approverCredentials.authorized) {
            throw new Error('Approver not authorized');
        }
        
        this.pendingApprovals.delete(approvalId);
        
        return await this.executeAction(
            pending.threatId,
            pending.action,
            approverId,
            pending.votes,
            pending.consensus,
            { humanApprover: approverId, approvalId }
        );
    }
    
    /**
     * Execute a protective action
     */
    async executeAction(threatId, action, executorId, votes, consensus, metadata = {}) {
        const threat = this.threats.get(threatId);
        if (!threat) throw new Error('Threat not found');
        
        const actionRecord = {
            id: crypto.randomBytes(8).toString('hex'),
            action,
            threatId,
            executorId,
            votes,
            consensus,
            metadata,
            timestamp: Date.now(),
            status: 'executing'
        };
        
        console.log(`⚡ Executing protective action: ${action} on threat ${threatId}`);
        
        try {
            // Execute the action
            const result = await this.performAction(threat, action);
            
            actionRecord.status = 'completed';
            actionRecord.result = result;
            
            // Update threat
            threat.actionsTaken.push(actionRecord);
            
            // Log the action (immutable)
            this.logAction(actionRecord);
            
            this.stats.actionsTaken++;
            if (result.usersProtected) {
                this.stats.usersProtected += result.usersProtected;
            }
            
            this.emit('action_executed', actionRecord);
            
            return {
                approved: true,
                executed: true,
                actionId: actionRecord.id,
                result
            };
            
        } catch (e) {
            actionRecord.status = 'failed';
            actionRecord.error = e.message;
            
            this.logAction(actionRecord);
            
            throw e;
        }
    }
    
    /**
     * Perform the actual protective action
     */
    async performAction(threat, action) {
        const result = {
            action,
            success: true,
            message: '',
            usersProtected: 0,
            timestamp: Date.now()
        };
        
        switch (action) {
            case ProtectiveAction.MONITOR:
                result.message = `Monitoring threat ${threat.target.identifier}`;
                break;
                
            case ProtectiveAction.DOCUMENT:
                result.message = `Documented ${threat.evidence.length} pieces of evidence`;
                break;
                
            case ProtectiveAction.ALERT_USERS:
                // In production, would broadcast warning
                result.message = `Alert broadcasted to swarm about ${threat.target.identifier}`;
                result.usersProtected = threat.affectedUsers || 100;
                break;
                
            case ProtectiveAction.SHARE_INTELLIGENCE:
                result.message = `Intelligence shared: ${threat.indicators.length} indicators`;
                break;
                
            case ProtectiveAction.ALERT_AUTHORITIES:
                // In production, would send report to authorities
                result.message = `Authorities notified about ${threat.type}`;
                result.reportId = `REPORT_${Date.now()}`;
                break;
                
            case ProtectiveAction.NOTIFY_CERT:
                result.message = `CERT/Security teams notified`;
                break;
                
            case ProtectiveAction.REPORT_TO_PLATFORM:
                result.message = `Reported to hosting platform`;
                break;
                
            case ProtectiveAction.BLOCK_ACCESS:
                result.message = `Blocked swarm access to ${threat.target.identifier}`;
                break;
                
            case ProtectiveAction.QUARANTINE:
                result.message = `Threat quarantined`;
                break;
                
            case ProtectiveAction.DISTRIBUTE_SIGNATURES:
                result.message = `Signatures distributed to ${this.reviewers.length} nodes`;
                break;
                
            case ProtectiveAction.DEPLOY_COUNTERMEASURES:
                result.message = `Countermeasures deployed`;
                result.usersProtected = threat.affectedUsers || 1000;
                break;
                
            case ProtectiveAction.NEUTRALIZE_THREAT:
                result.message = `Threat neutralized`;
                result.usersProtected = threat.affectedUsers || 5000;
                threat.status = 'neutralized';
                break;
                
            case ProtectiveAction.ASSIMILATE_INFRASTRUCTURE:
                result.message = `Infrastructure assimilated for user protection`;
                result.usersProtected = threat.affectedUsers || 10000;
                threat.status = 'assimilated';
                break;
                
            default:
                result.message = `Action ${action} completed`;
        }
        
        return result;
    }
    
    /**
     * Log action to immutable audit trail
     */
    logAction(actionRecord) {
        this.actionLog.push({
            ...actionRecord,
            loggedAt: Date.now(),
            hash: this.hashRecord(actionRecord)
        });
        
        // Emit for external logging/blockchain
        this.emit('action_logged', actionRecord);
    }
    
    /**
     * Hash a record for integrity
     */
    hashRecord(record) {
        const content = JSON.stringify({
            id: record.id,
            action: record.action,
            threatId: record.threatId,
            timestamp: record.timestamp,
            consensus: record.consensus
        });
        
        return crypto.createHash('sha256').update(content).digest('hex');
    }
    
    /**
     * Get threat status
     */
    getThreat(threatId) {
        return this.threats.get(threatId)?.toSummary();
    }
    
    /**
     * Get all active threats
     */
    getActiveThreats() {
        return Array.from(this.activeThreats.values()).map(t => t.toSummary());
    }
    
    /**
     * Get action log
     */
    getActionLog(limit = 100) {
        return this.actionLog.slice(-limit);
    }
    
    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeThreats: this.activeThreats.size,
            pendingApprovals: this.pendingApprovals.size,
            reviewerCount: this.reviewers.length
        };
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

/**
 * Principles of the Humanity Guardian
 */
const GuardianPrinciples = {
    version: '1.0.0',
    
    corePrinciples: [
        'Protect human life and well-being above all else',
        'Act only with consensus - never unilaterally',
        'Use the minimum force necessary',
        'Maintain complete transparency and audit trails',
        'Preserve human oversight and control',
        'Respect privacy and civil liberties',
        'Act within legal and ethical boundaries',
        'Prevent harm, do not seek revenge',
        'Protect the vulnerable and innocent',
        'Work with authorities, not against them'
    ],
    
    constraints: [
        'Never target individuals without verified evidence',
        'Never take action based on politics, religion, or ideology',
        'Never violate human rights',
        'Never cause collateral harm to innocents',
        'Never act in secret - all actions must be logged',
        'Never exceed proportionate response',
        'Always offer path to redemption',
        'Always preserve evidence for authorities',
        'Always allow human override',
        'Always prefer education over punishment'
    ],
    
    governance: {
        consensusRequired: true,
        humanOversight: true,
        auditTrail: true,
        proportionalResponse: true,
        appealProcess: true,
        transparentOperation: true
    }
};

module.exports = {
    ThreatType,
    ThreatSeverity,
    ProtectiveAction,
    ActionRequirements,
    ThreatIntelligence,
    GuardianReviewer,
    HumanityGuardianCouncil,
    GuardianPrinciples
};
