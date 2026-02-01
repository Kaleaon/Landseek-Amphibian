/**
 * Models Module Index
 * 
 * Exports optimized AI model sets and the model loader with
 * full OpenClaw distributed inference integration.
 */

const {
    TaskType,
    ModelSetType,
    DeviceTier,
    Models,
    ModelSets,
    OpenClawConfigs,
    getRecommendedModelSet,
    getModelForTask,
    getOpenClawCapableModels,
    deviceTierToCapability,
    getModelForOpenClawTask
} = require('./model_sets');

const { ModelLoader, LoadStatus } = require('./model_loader');

module.exports = {
    // Model configuration
    TaskType,
    ModelSetType,
    DeviceTier,
    Models,
    ModelSets,
    OpenClawConfigs,
    
    // Utility functions
    getRecommendedModelSet,
    getModelForTask,
    getOpenClawCapableModels,
    deviceTierToCapability,
    getModelForOpenClawTask,
    
    // Model loader
    ModelLoader,
    LoadStatus
};
