/**
 * Device Profiles
 * 
 * Predefined profiles for different device types with
 * appropriate capability settings and resource limits.
 */

/**
 * Device types
 */
const DeviceType = {
    // Mobile devices
    SMARTPHONE_HIGH: 'smartphone_high',     // Flagship phones with NPU/TPU
    SMARTPHONE_MID: 'smartphone_mid',       // Mid-range phones
    SMARTPHONE_LOW: 'smartphone_low',       // Budget phones
    TABLET: 'tablet',
    
    // Smart home devices
    SMART_SPEAKER: 'smart_speaker',         // Google Home, Alexa, etc.
    SMART_DISPLAY: 'smart_display',         // Smart displays with screens
    SMART_TV: 'smart_tv',
    SMART_HUB: 'smart_hub',                 // Home automation hubs
    
    // IoT devices
    RASPBERRY_PI: 'raspberry_pi',
    RASPBERRY_PI_ZERO: 'raspberry_pi_zero',
    ARDUINO: 'arduino',
    ESP32: 'esp32',
    JETSON_NANO: 'jetson_nano',             // NVIDIA Jetson
    CORAL_DEV: 'coral_dev',                 // Google Coral with TPU
    
    // Desktop/Server
    DESKTOP_HIGH: 'desktop_high',           // Gaming PC / Workstation
    DESKTOP_MID: 'desktop_mid',
    DESKTOP_LOW: 'desktop_low',
    SERVER: 'server',
    CLOUD_INSTANCE: 'cloud_instance',
    
    // Edge devices
    EDGE_DEVICE: 'edge_device',
    ROUTER: 'router',                       // Smart routers
    NAS: 'nas',                             // Network storage
    
    // Unknown/Custom
    CUSTOM: 'custom',
    UNKNOWN: 'unknown'
};

/**
 * Power modes
 */
const PowerMode = {
    PERFORMANCE: 'performance',     // Maximum performance
    BALANCED: 'balanced',           // Balance performance and power
    POWER_SAVE: 'power_save',       // Minimize power usage
    ULTRA_LOW: 'ultra_low',         // For battery-critical situations
    PLUGGED_IN: 'plugged_in'        // Device is plugged in, no limits
};

/**
 * Device profile definitions
 */
const DeviceProfiles = {
    [DeviceType.SMARTPHONE_HIGH]: {
        name: 'High-End Smartphone',
        description: 'Flagship phone with NPU/TPU (Pixel 6+, iPhone 15+, Galaxy S24+)',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: true,
            acceleratorType: 'npu'
        },
        resources: {
            maxMemoryMB: 4096,
            maxConcurrentTasks: 3,
            maxBatchSize: 8,
            maxTokens: 1024
        },
        power: {
            defaultMode: PowerMode.BALANCED,
            batteryThreshold: 20,           // Switch to power save below this %
            thermalThrottleTemp: 40         // Throttle above this °C
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 100
        }
    },

    [DeviceType.SMARTPHONE_MID]: {
        name: 'Mid-Range Smartphone',
        description: 'Standard smartphone with decent processing',
        capabilities: {
            canInference: true,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: false
        },
        resources: {
            maxMemoryMB: 2048,
            maxConcurrentTasks: 2,
            maxBatchSize: 4,
            maxTokens: 512
        },
        power: {
            defaultMode: PowerMode.BALANCED,
            batteryThreshold: 30,
            thermalThrottleTemp: 38
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 50
        }
    },

    [DeviceType.SMARTPHONE_LOW]: {
        name: 'Budget Smartphone',
        description: 'Low-end phone, limited processing',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: false
        },
        resources: {
            maxMemoryMB: 512,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 128
        },
        power: {
            defaultMode: PowerMode.POWER_SAVE,
            batteryThreshold: 40,
            thermalThrottleTemp: 35
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 20
        }
    },

    [DeviceType.SMART_SPEAKER]: {
        name: 'Smart Speaker',
        description: 'Google Home, Amazon Echo, etc.',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: false,
            hasAccelerator: false,
            canRelay: true,                 // Can relay tasks to other devices
            canWakeWord: true               // Can listen for wake words
        },
        resources: {
            maxMemoryMB: 256,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 64
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 10
        }
    },

    [DeviceType.SMART_DISPLAY]: {
        name: 'Smart Display',
        description: 'Google Nest Hub, Echo Show, etc.',
        capabilities: {
            canInference: true,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: false,
            canDisplay: true,
            canRelay: true
        },
        resources: {
            maxMemoryMB: 1024,
            maxConcurrentTasks: 2,
            maxBatchSize: 2,
            maxTokens: 256
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 50
        }
    },

    [DeviceType.SMART_TV]: {
        name: 'Smart TV',
        description: 'Smart TV with processing capability',
        capabilities: {
            canInference: true,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: false,
            canDisplay: true
        },
        resources: {
            maxMemoryMB: 2048,
            maxConcurrentTasks: 2,
            maxBatchSize: 4,
            maxTokens: 512
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 100
        }
    },

    [DeviceType.RASPBERRY_PI]: {
        name: 'Raspberry Pi 4/5',
        description: 'Full Raspberry Pi with 4-8GB RAM',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: false
        },
        resources: {
            maxMemoryMB: 4096,
            maxConcurrentTasks: 2,
            maxBatchSize: 4,
            maxTokens: 512
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 100
        }
    },

    [DeviceType.RASPBERRY_PI_ZERO]: {
        name: 'Raspberry Pi Zero',
        description: 'Raspberry Pi Zero with limited resources',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: false,
            hasAccelerator: false,
            canRelay: true
        },
        resources: {
            maxMemoryMB: 512,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 64
        },
        power: {
            defaultMode: PowerMode.POWER_SAVE
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 10
        }
    },

    [DeviceType.ESP32]: {
        name: 'ESP32',
        description: 'ESP32 microcontroller',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: false,
            hasAccelerator: false,
            canRelay: true,
            canSensor: true                 // Can provide sensor data
        },
        resources: {
            maxMemoryMB: 4,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 16
        },
        power: {
            defaultMode: PowerMode.ULTRA_LOW
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 1
        }
    },

    [DeviceType.JETSON_NANO]: {
        name: 'NVIDIA Jetson Nano',
        description: 'Jetson Nano with CUDA GPU',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: true,
            acceleratorType: 'cuda'
        },
        resources: {
            maxMemoryMB: 4096,
            maxConcurrentTasks: 4,
            maxBatchSize: 16,
            maxTokens: 2048
        },
        power: {
            defaultMode: PowerMode.PERFORMANCE
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 1000
        }
    },

    [DeviceType.CORAL_DEV]: {
        name: 'Google Coral Dev Board',
        description: 'Coral with Edge TPU',
        capabilities: {
            canInference: true,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: true,
            acceleratorType: 'edge_tpu'
        },
        resources: {
            maxMemoryMB: 1024,
            maxConcurrentTasks: 4,
            maxBatchSize: 8,
            maxTokens: 1024
        },
        power: {
            defaultMode: PowerMode.PERFORMANCE
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 100
        }
    },

    [DeviceType.DESKTOP_HIGH]: {
        name: 'High-End Desktop',
        description: 'Gaming PC or Workstation with GPU',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: true,
            acceleratorType: 'cuda'
        },
        resources: {
            maxMemoryMB: 32768,
            maxConcurrentTasks: 8,
            maxBatchSize: 64,
            maxTokens: 8192
        },
        power: {
            defaultMode: PowerMode.PERFORMANCE
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 1000
        }
    },

    [DeviceType.DESKTOP_MID]: {
        name: 'Mid-Range Desktop',
        description: 'Standard desktop computer',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: false
        },
        resources: {
            maxMemoryMB: 16384,
            maxConcurrentTasks: 4,
            maxBatchSize: 16,
            maxTokens: 4096
        },
        power: {
            defaultMode: PowerMode.BALANCED
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 1000
        }
    },

    [DeviceType.SERVER]: {
        name: 'Server',
        description: 'Dedicated server with high resources',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: true,
            acceleratorType: 'cuda',
            canCoordinate: true             // Can act as coordinator
        },
        resources: {
            maxMemoryMB: 131072,
            maxConcurrentTasks: 32,
            maxBatchSize: 256,
            maxTokens: 32768
        },
        power: {
            defaultMode: PowerMode.PERFORMANCE
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 10000
        }
    },

    [DeviceType.CLOUD_INSTANCE]: {
        name: 'Cloud Instance',
        description: 'Cloud VM (AWS, GCP, Azure)',
        capabilities: {
            canInference: true,
            canTrain: true,
            canEmbed: true,
            hasAccelerator: true,
            canCoordinate: true
        },
        resources: {
            maxMemoryMB: 65536,
            maxConcurrentTasks: 16,
            maxBatchSize: 128,
            maxTokens: 16384
        },
        power: {
            defaultMode: PowerMode.PERFORMANCE
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 10000
        }
    },

    [DeviceType.ROUTER]: {
        name: 'Smart Router',
        description: 'Router with processing capability',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: false,
            hasAccelerator: false,
            canRelay: true,
            canDiscovery: true              // Can help discover devices
        },
        resources: {
            maxMemoryMB: 256,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 32
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 1000
        }
    },

    [DeviceType.NAS]: {
        name: 'Network Attached Storage',
        description: 'NAS with processing capability',
        capabilities: {
            canInference: true,
            canTrain: false,
            canEmbed: true,
            hasAccelerator: false,
            canStore: true                  // Can store models/data
        },
        resources: {
            maxMemoryMB: 8192,
            maxConcurrentTasks: 4,
            maxBatchSize: 8,
            maxTokens: 1024
        },
        power: {
            defaultMode: PowerMode.PLUGGED_IN
        },
        network: {
            preferWifi: false,
            allowCellular: false,
            maxBandwidthMbps: 1000
        }
    },

    [DeviceType.UNKNOWN]: {
        name: 'Unknown Device',
        description: 'Device with unknown capabilities',
        capabilities: {
            canInference: false,
            canTrain: false,
            canEmbed: false,
            hasAccelerator: false,
            canRelay: true
        },
        resources: {
            maxMemoryMB: 256,
            maxConcurrentTasks: 1,
            maxBatchSize: 1,
            maxTokens: 64
        },
        power: {
            defaultMode: PowerMode.POWER_SAVE
        },
        network: {
            preferWifi: true,
            allowCellular: false,
            maxBandwidthMbps: 10
        }
    }
};

/**
 * Get profile for device type
 */
function getProfile(deviceType) {
    return DeviceProfiles[deviceType] || DeviceProfiles[DeviceType.UNKNOWN];
}

/**
 * Detect device type from system info
 */
function detectDeviceType(systemInfo) {
    const { platform, arch, totalMemory, cpuModel, hasGPU, gpuModel } = systemInfo;
    
    // Check for specific hardware
    if (gpuModel) {
        if (gpuModel.toLowerCase().includes('nvidia')) {
            if (gpuModel.toLowerCase().includes('jetson')) {
                return DeviceType.JETSON_NANO;
            }
            if (totalMemory > 16 * 1024 * 1024 * 1024) {
                return DeviceType.SERVER;
            }
            return DeviceType.DESKTOP_HIGH;
        }
    }
    
    // Check platform
    if (platform === 'android') {
        if (totalMemory > 6 * 1024 * 1024 * 1024) {
            return DeviceType.SMARTPHONE_HIGH;
        } else if (totalMemory > 3 * 1024 * 1024 * 1024) {
            return DeviceType.SMARTPHONE_MID;
        }
        return DeviceType.SMARTPHONE_LOW;
    }
    
    if (platform === 'darwin') {
        // macOS - could be Mac or iOS
        if (arch === 'arm64' && totalMemory < 4 * 1024 * 1024 * 1024) {
            return DeviceType.SMARTPHONE_HIGH; // iPhone
        }
        return DeviceType.DESKTOP_MID;
    }
    
    if (platform === 'linux') {
        // Check for Raspberry Pi
        if (cpuModel && cpuModel.toLowerCase().includes('bcm')) {
            if (totalMemory < 1 * 1024 * 1024 * 1024) {
                return DeviceType.RASPBERRY_PI_ZERO;
            }
            return DeviceType.RASPBERRY_PI;
        }
        
        // Check for server
        if (totalMemory > 32 * 1024 * 1024 * 1024) {
            return DeviceType.SERVER;
        }
        
        return DeviceType.DESKTOP_MID;
    }
    
    if (platform === 'win32') {
        if (hasGPU && totalMemory > 16 * 1024 * 1024 * 1024) {
            return DeviceType.DESKTOP_HIGH;
        }
        return DeviceType.DESKTOP_MID;
    }
    
    return DeviceType.UNKNOWN;
}

/**
 * Create custom profile
 */
function createCustomProfile(overrides) {
    const base = DeviceProfiles[DeviceType.UNKNOWN];
    
    return {
        ...base,
        name: overrides.name || 'Custom Device',
        description: overrides.description || 'Custom device profile',
        capabilities: { ...base.capabilities, ...overrides.capabilities },
        resources: { ...base.resources, ...overrides.resources },
        power: { ...base.power, ...overrides.power },
        network: { ...base.network, ...overrides.network }
    };
}

module.exports = {
    DeviceType,
    PowerMode,
    DeviceProfiles,
    getProfile,
    detectDeviceType,
    createCustomProfile
};
