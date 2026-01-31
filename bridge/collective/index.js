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
 * 
 * Key Features:
 * - Asynchronous task queuing for high-latency tolerance
 * - Chunked processing for distributed model inference
 * - Automatic failover when devices become unavailable
 * - Speculative execution for latency hiding
 */

const { CollectiveCoordinator } = require('./coordinator');
const { CollectiveBrain } = require('./brain');
const { CollectiveClient } = require('./client');

module.exports = {
    CollectiveCoordinator,
    CollectiveBrain,
    CollectiveClient
};
