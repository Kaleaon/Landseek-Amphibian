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
 */

const { OpenPool } = require('./pool');
const { OpenRegistry } = require('./registry');
const { ContributionTracker } = require('./contributions');

module.exports = {
    OpenPool,
    OpenRegistry,
    ContributionTracker
};
