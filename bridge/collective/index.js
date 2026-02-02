/**
 * Collective Mode System
 * 
 * Enables AI model pooling across multiple devices, designed to work
 * even with high latency and delays between devices.
 * 
 * Architecture:
 * - CollectiveCoordinator: Manages the pool of devices and orchestrates inference
 * - CollectiveBrain: Distributed brain that splits work across devices
 * - CollectiveClient: Joins a collective pool as a worker
 * - IdentityManager: Handles authentication and reputation
 * 
 * Key Features:
 * - Asynchronous task queuing for high-latency tolerance
 * - Chunked processing for distributed model inference
 * - Automatic failover when devices become unavailable
 * - Speculative execution for latency hiding
 * - Cryptographic identity and reputation system
 */

const { CollectiveCoordinator } = require('./coordinator');
const { CollectiveBrain } = require('./brain');
const { CollectiveClient } = require('./client');
const { 
    IdentityManager, 
    CollectiveIdentity, 
    TrustLevel, 
    Permission,
    Badges,
    ReputationPoints 
} = require('./identity');

module.exports = {
    CollectiveCoordinator,
    CollectiveBrain,
    CollectiveClient,
    IdentityManager,
    CollectiveIdentity,
    TrustLevel,
    Permission,
    Badges,
    ReputationPoints
};
