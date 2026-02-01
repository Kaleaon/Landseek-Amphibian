/**
 * Training Module Index
 * 
 * Exports all training-related components for distributed AI training.
 */

const { TrainingCoordinator, TrainingTaskType, TrainingStatus } = require('./coordinator');
const { TrainingWorker, WorkerStatus } = require('./worker');

module.exports = {
    TrainingCoordinator,
    TrainingTaskType,
    TrainingStatus,
    TrainingWorker,
    WorkerStatus
};
