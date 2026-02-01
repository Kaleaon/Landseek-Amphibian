/**
 * Universal Device Host Module
 * 
 * Enables any device to host distributed processing for ClawBots:
 * - Smartphones (Android, iOS)
 * - Smart Home devices (Google Home, Alexa, Smart TVs)
 * - IoT devices (Raspberry Pi, Arduino, ESP32)
 * - Desktop computers
 * - Cloud instances
 * - Edge devices
 * 
 * Features:
 * - Automatic capability detection
 * - Adaptive workload based on device resources
 * - Low-power mode for battery devices
 * - Local network device discovery
 * - Global internet-wide device discovery
 * - NAT traversal and relay support
 */

const { UniversalHost } = require('./host');
const { DeviceDiscovery } = require('./discovery');
const { AdaptiveScheduler } = require('./scheduler');
const { DeviceProfiles } = require('./profiles');
const { 
    GlobalDiscoveryClient,
    GlobalDirectoryServer,
    GlobalDeviceEntry,
    ConnectionMethod
} = require('./global_discovery');

module.exports = {
    // Local
    UniversalHost,
    DeviceDiscovery,
    AdaptiveScheduler,
    DeviceProfiles,
    
    // Global
    GlobalDiscoveryClient,
    GlobalDirectoryServer,
    GlobalDeviceEntry,
    ConnectionMethod
};
