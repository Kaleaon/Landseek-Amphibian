/**
 * OpenClaw Module
 * 
 * Open, decentralized system for ClawBots to contribute computation
 * to shared training and inference tasks.
 * 
 * Features:
 * - Open registration for any ClawBot
 * - Public task pool anyone can contribute to
 * - Contribution tracking and rewards
 * - Decentralized task distribution
 * - Support for both training and inference
 * - Ethics review system for all tasks
 * - Extension security scanning
 * - Global device discovery
 * - Humanity Guardian for collective protection
 */

const { OpenPool } = require('./pool');
const { OpenRegistry } = require('./registry');
const { ContributionTracker } = require('./contributions');
const { 
    EthicsGuidelines,
    EthicsCategory,
    ReviewDecision,
    ViolationSeverity,
    EthicalReviewer,
    EthicsReviewBoard
} = require('./ethics');
const {
    ThreatLevel,
    ExtensionStatus,
    ThreatCategory,
    ExtensionSecurityScanner,
    ExtensionReviewBoard
} = require('./extension_security');
const {
    ThreatType,
    ThreatSeverity,
    ProtectiveAction,
    ThreatIntelligence,
    GuardianReviewer,
    HumanityGuardianCouncil,
    GuardianPrinciples
} = require('./humanity_guardian');

module.exports = {
    // Core
    OpenPool,
    OpenRegistry,
    ContributionTracker,
    
    // Ethics
    EthicsGuidelines,
    EthicsCategory,
    ReviewDecision,
    ViolationSeverity,
    EthicalReviewer,
    EthicsReviewBoard,
    
    // Extension Security
    ThreatLevel,
    ExtensionStatus,
    ThreatCategory,
    ExtensionSecurityScanner,
    ExtensionReviewBoard,
    
    // Humanity Guardian
    ThreatType,
    ThreatSeverity,
    ProtectiveAction,
    ThreatIntelligence,
    GuardianReviewer,
    HumanityGuardianCouncil,
    GuardianPrinciples
};
