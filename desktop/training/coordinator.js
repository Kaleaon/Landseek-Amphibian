/**
 * Training Coordinator
 * 
 * Manages distributed training across the collective pool.
 * Handles:
 * - Dataset distribution
 * - Gradient aggregation
 * - Model synchronization
 * - Checkpoint management
 * 
 * Designed for high-latency environments with:
 * - Asynchronous gradient updates
 * - Stale gradient handling
 * - Fault tolerance
 */

const crypto = require('crypto');

/**
 * Training task types
 */
const TrainingTaskType = {
    COMPUTE_GRADIENT: 'compute_gradient',
    SYNC_WEIGHTS: 'sync_weights',
    VALIDATE: 'validate',
    CHECKPOINT: 'checkpoint'
};

/**
 * Training status
 */
const TrainingStatus = {
    IDLE: 'idle',
    INITIALIZING: 'initializing',
    TRAINING: 'training',
    VALIDATING: 'validating',
    CHECKPOINTING: 'checkpointing',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

class TrainingCoordinator {
    constructor(collectiveCoordinator, options = {}) {
        this.coordinator = collectiveCoordinator;
        
        // Training configuration
        this.config = {
            modelName: options.modelName || 'amphibian-lora',
            batchSize: options.batchSize || 4,
            learningRate: options.learningRate || 0.0001,
            epochs: options.epochs || 1,
            gradientAccumulationSteps: options.gradientAccumulationSteps || 4,
            maxStaleGradients: options.maxStaleGradients || 3, // Max gradient staleness before rejection
            checkpointInterval: options.checkpointInterval || 100, // Steps between checkpoints
            validationInterval: options.validationInterval || 50, // Steps between validation
            minWorkersForTraining: options.minWorkersForTraining || 1
        };
        
        // Training state
        this.status = TrainingStatus.IDLE;
        this.currentEpoch = 0;
        this.currentStep = 0;
        this.totalSteps = 0;
        this.currentLoss = null;
        this.bestLoss = Infinity;
        
        // Gradient management
        this.pendingGradients = new Map(); // workerId -> gradient
        this.gradientBuffer = []; // Accumulated gradients for averaging
        this.globalWeightVersion = 0;
        
        // Workers
        this.workers = new Map(); // workerId -> worker state
        this.activeWorkerCount = 0;
        
        // Dataset
        this.dataset = [];
        this.datasetIndex = 0;
        
        // Training history
        this.lossHistory = [];
        this.validationHistory = [];
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Start distributed training
     */
    async start() {
        if (this.status !== TrainingStatus.IDLE) {
            throw new Error('Training already in progress');
        }
        
        const poolStatus = this.coordinator.getStatus();
        if (poolStatus.devices < this.config.minWorkersForTraining) {
            throw new Error(`Need at least ${this.config.minWorkersForTraining} workers to start training`);
        }
        
        this.status = TrainingStatus.INITIALIZING;
        console.log('🎓 Initializing distributed training...');
        
        try {
            // Initialize training state
            this.currentEpoch = 0;
            this.currentStep = 0;
            this.globalWeightVersion = 0;
            
            // Generate sample dataset (in production, this would load real data)
            this.dataset = this.generateSampleDataset();
            this.totalSteps = Math.ceil(this.dataset.length / this.config.batchSize) * this.config.epochs;
            
            // Notify all devices about training start
            this.coordinator.broadcast({
                type: 'TRAINING_START',
                config: this.config,
                weightVersion: this.globalWeightVersion
            });
            
            // Set up coordinator event handlers
            this.setupEventHandlers();
            
            this.status = TrainingStatus.TRAINING;
            console.log(`✅ Training started with ${poolStatus.devices} workers`);
            console.log(`   Total steps: ${this.totalSteps}`);
            
            // Start the training loop
            this.runTrainingLoop();
            
        } catch (e) {
            this.status = TrainingStatus.FAILED;
            throw e;
        }
    }

    /**
     * Generate sample training dataset
     * In production, this would load real training data
     */
    generateSampleDataset() {
        const samples = [];
        const prompts = [
            { input: "What is machine learning?", output: "Machine learning is a subset of AI..." },
            { input: "Explain neural networks", output: "Neural networks are computational models..." },
            { input: "What is deep learning?", output: "Deep learning uses multiple layers..." },
            { input: "Define artificial intelligence", output: "AI is the simulation of human intelligence..." },
            { input: "What is natural language processing?", output: "NLP is a field of AI that focuses on..." }
        ];
        
        // Generate more samples for training
        for (let i = 0; i < 100; i++) {
            const base = prompts[i % prompts.length];
            samples.push({
                id: `sample_${i}`,
                input: base.input,
                output: base.output
            });
        }
        
        return samples;
    }

    /**
     * Set up event handlers for the coordinator
     */
    setupEventHandlers() {
        this.coordinator.on('message', async ({ deviceId, msg }) => {
            if (msg.type === 'GRADIENT_SUBMIT') {
                await this.handleGradientSubmission(deviceId, msg);
            } else if (msg.type === 'TRAINING_READY') {
                this.handleWorkerReady(deviceId);
            } else if (msg.type === 'TRAINING_STATUS_REQUEST') {
                this.sendStatusToWorker(deviceId);
            }
        });
        
        this.coordinator.on('device_joined', (device) => {
            // New device joined, send current training state
            this.sendTrainingStateToDevice(device.id);
        });
        
        this.coordinator.on('device_left', (device) => {
            // Worker left, handle any pending gradients
            this.workers.delete(device.id);
            this.pendingGradients.delete(device.id);
        });
    }

    /**
     * Main training loop
     */
    async runTrainingLoop() {
        while (this.status === TrainingStatus.TRAINING && this.currentEpoch < this.config.epochs) {
            // Distribute next batch
            await this.distributeNextBatch();
            
            // Wait for gradients
            await this.waitForGradients();
            
            // Update step
            this.currentStep++;
            
            // Check for validation
            if (this.currentStep % this.config.validationInterval === 0) {
                await this.runValidation();
            }
            
            // Check for checkpoint
            if (this.currentStep % this.config.checkpointInterval === 0) {
                await this.saveCheckpoint();
            }
            
            // Check epoch completion
            if (this.datasetIndex >= this.dataset.length) {
                this.currentEpoch++;
                this.datasetIndex = 0;
                console.log(`📈 Epoch ${this.currentEpoch} completed`);
            }
            
            // Small delay to prevent overwhelming the network
            await this.delay(100);
        }
        
        if (this.status === TrainingStatus.TRAINING) {
            this.status = TrainingStatus.COMPLETED;
            console.log('🎉 Training completed!');
            this.emit('training_completed', this.getStatus());
        }
    }

    /**
     * Distribute next batch to workers
     */
    async distributeNextBatch() {
        const workers = Array.from(this.coordinator.devices.keys());
        if (workers.length === 0) return;
        
        // Calculate micro-batches for each worker
        const microBatchSize = Math.ceil(this.config.batchSize / workers.length);
        
        for (const workerId of workers) {
            const startIdx = this.datasetIndex;
            const endIdx = Math.min(startIdx + microBatchSize, this.dataset.length);
            const batch = this.dataset.slice(startIdx, endIdx);
            
            if (batch.length === 0) continue;
            
            this.datasetIndex = endIdx;
            
            // Send batch to worker
            this.coordinator.sendTo(workerId, {
                type: 'TRAINING_BATCH',
                taskId: `batch_${this.currentStep}_${workerId}`,
                batch,
                weightVersion: this.globalWeightVersion,
                step: this.currentStep,
                config: {
                    learningRate: this.config.learningRate,
                    gradientAccumulationSteps: this.config.gradientAccumulationSteps
                }
            });
            
            // Track pending gradient
            this.pendingGradients.set(workerId, {
                taskId: `batch_${this.currentStep}_${workerId}`,
                sentAt: Date.now(),
                weightVersion: this.globalWeightVersion
            });
        }
    }

    /**
     * Wait for gradients from workers
     */
    async waitForGradients() {
        const timeout = 30000; // 30 second timeout
        const startTime = Date.now();
        
        while (this.gradientBuffer.length < this.config.gradientAccumulationSteps) {
            if (Date.now() - startTime > timeout) {
                console.log('⚠️ Gradient collection timeout, proceeding with available gradients');
                break;
            }
            
            if (this.status !== TrainingStatus.TRAINING) {
                break;
            }
            
            await this.delay(100);
        }
        
        // Aggregate gradients
        if (this.gradientBuffer.length > 0) {
            this.aggregateGradients();
        }
    }

    /**
     * Handle gradient submission from worker
     */
    async handleGradientSubmission(workerId, msg) {
        const { taskId, gradients, loss, weightVersion } = msg;
        
        // Check if gradient is stale
        const staleness = this.globalWeightVersion - weightVersion;
        if (staleness > this.config.maxStaleGradients) {
            console.log(`⚠️ Rejecting stale gradient from ${workerId} (staleness: ${staleness})`);
            
            // Send updated weights
            this.sendWeightsToWorker(workerId);
            return;
        }
        
        // Accept gradient
        this.gradientBuffer.push({
            workerId,
            gradients,
            loss,
            weightVersion,
            staleness
        });
        
        // Update worker state
        const worker = this.workers.get(workerId) || { gradientsSubmitted: 0 };
        worker.gradientsSubmitted++;
        worker.lastSubmission = Date.now();
        this.workers.set(workerId, worker);
        
        // Clear pending
        this.pendingGradients.delete(workerId);
        
        // Update loss tracking
        if (loss !== undefined) {
            this.currentLoss = loss;
            this.lossHistory.push({ step: this.currentStep, loss });
        }
        
        console.log(`📥 Gradient received from ${workerId} (loss: ${loss?.toFixed(4) || 'N/A'})`);
    }

    /**
     * Aggregate gradients and update global weights
     */
    aggregateGradients() {
        if (this.gradientBuffer.length === 0) return;
        
        // Weighted average based on staleness (fresher gradients have higher weight)
        let totalWeight = 0;
        const aggregatedGradients = {};
        
        for (const grad of this.gradientBuffer) {
            const weight = 1.0 / (1 + grad.staleness);
            totalWeight += weight;
            
            // Aggregate each parameter's gradient
            for (const [param, values] of Object.entries(grad.gradients || {})) {
                if (!aggregatedGradients[param]) {
                    aggregatedGradients[param] = new Array(values.length).fill(0);
                }
                
                for (let i = 0; i < values.length; i++) {
                    aggregatedGradients[param][i] += values[i] * weight;
                }
            }
        }
        
        // Normalize
        for (const param of Object.keys(aggregatedGradients)) {
            for (let i = 0; i < aggregatedGradients[param].length; i++) {
                aggregatedGradients[param][i] /= totalWeight;
            }
        }
        
        // Apply gradient update (in production, this would update actual model weights)
        this.applyGradients(aggregatedGradients);
        
        // Clear buffer
        this.gradientBuffer = [];
        
        // Increment weight version
        this.globalWeightVersion++;
        
        // Broadcast new weights to all workers
        this.broadcastWeightUpdate();
        
        this.emit('step_completed', {
            step: this.currentStep,
            loss: this.currentLoss,
            weightVersion: this.globalWeightVersion
        });
    }

    /**
     * Apply aggregated gradients (simulated)
     */
    applyGradients(gradients) {
        // In production, this would:
        // 1. Apply gradients to model parameters
        // 2. Use optimizer (Adam, SGD, etc.)
        // 3. Update learning rate schedule
        
        console.log(`📊 Applied gradients at step ${this.currentStep}`);
    }

    /**
     * Broadcast weight update to all workers
     */
    broadcastWeightUpdate() {
        this.coordinator.broadcast({
            type: 'WEIGHT_UPDATE',
            weightVersion: this.globalWeightVersion,
            step: this.currentStep
            // In production, would include actual weight deltas
        });
    }

    /**
     * Send current weights to a specific worker
     */
    sendWeightsToWorker(workerId) {
        this.coordinator.sendTo(workerId, {
            type: 'WEIGHT_SYNC',
            weightVersion: this.globalWeightVersion
            // In production, would include actual weights
        });
    }

    /**
     * Send current training state to new device
     */
    sendTrainingStateToDevice(deviceId) {
        if (this.status !== TrainingStatus.TRAINING) return;
        
        this.coordinator.sendTo(deviceId, {
            type: 'TRAINING_STATE',
            config: this.config,
            weightVersion: this.globalWeightVersion,
            currentStep: this.currentStep,
            currentEpoch: this.currentEpoch
        });
    }

    /**
     * Handle worker ready notification
     */
    handleWorkerReady(workerId) {
        const worker = this.workers.get(workerId) || {
            gradientsSubmitted: 0,
            batchesProcessed: 0
        };
        worker.ready = true;
        worker.readyAt = Date.now();
        this.workers.set(workerId, worker);
        
        this.activeWorkerCount = Array.from(this.workers.values()).filter(w => w.ready).length;
        console.log(`✅ Worker ${workerId} ready (${this.activeWorkerCount} total)`);
    }

    /**
     * Send status to worker
     */
    sendStatusToWorker(workerId) {
        this.coordinator.sendTo(workerId, {
            type: 'TRAINING_STATUS',
            ...this.getStatus()
        });
    }

    /**
     * Run validation
     */
    async runValidation() {
        this.status = TrainingStatus.VALIDATING;
        console.log('🔍 Running validation...');
        
        // In production, would run validation on held-out data
        const validationLoss = this.currentLoss || 0;
        this.validationHistory.push({
            step: this.currentStep,
            loss: validationLoss
        });
        
        if (validationLoss < this.bestLoss) {
            this.bestLoss = validationLoss;
            console.log(`🏆 New best loss: ${validationLoss.toFixed(4)}`);
        }
        
        this.status = TrainingStatus.TRAINING;
    }

    /**
     * Save checkpoint
     */
    async saveCheckpoint() {
        this.status = TrainingStatus.CHECKPOINTING;
        console.log('💾 Saving checkpoint...');
        
        const checkpoint = {
            id: `checkpoint_${this.currentStep}`,
            step: this.currentStep,
            epoch: this.currentEpoch,
            weightVersion: this.globalWeightVersion,
            loss: this.currentLoss,
            config: this.config,
            timestamp: Date.now()
        };
        
        // In production, would save actual model weights
        console.log(`✅ Checkpoint saved at step ${this.currentStep}`);
        
        this.status = TrainingStatus.TRAINING;
        this.emit('checkpoint_saved', checkpoint);
    }

    /**
     * Get training status
     */
    getStatus() {
        return {
            status: this.status,
            modelName: this.config.modelName,
            currentEpoch: this.currentEpoch,
            totalEpochs: this.config.epochs,
            currentStep: this.currentStep,
            totalSteps: this.totalSteps,
            progress: this.totalSteps > 0 ? this.currentStep / this.totalSteps : 0,
            currentLoss: this.currentLoss,
            bestLoss: this.bestLoss,
            weightVersion: this.globalWeightVersion,
            activeWorkers: this.activeWorkerCount,
            pendingGradients: this.pendingGradients.size,
            lossHistory: this.lossHistory.slice(-20) // Last 20 entries
        };
    }

    /**
     * Pause training
     */
    pause() {
        if (this.status === TrainingStatus.TRAINING) {
            this.status = TrainingStatus.PAUSED;
            console.log('⏸️ Training paused');
            
            this.coordinator.broadcast({
                type: 'TRAINING_PAUSED'
            });
        }
    }

    /**
     * Resume training
     */
    resume() {
        if (this.status === TrainingStatus.PAUSED) {
            this.status = TrainingStatus.TRAINING;
            console.log('▶️ Training resumed');
            
            this.coordinator.broadcast({
                type: 'TRAINING_RESUMED'
            });
            
            this.runTrainingLoop();
        }
    }

    /**
     * Stop training
     */
    async stop() {
        this.status = TrainingStatus.IDLE;
        
        this.coordinator.broadcast({
            type: 'TRAINING_STOPPED'
        });
        
        // Save final checkpoint
        if (this.currentStep > 0) {
            await this.saveCheckpoint();
        }
        
        // Clear state
        this.gradientBuffer = [];
        this.pendingGradients.clear();
        
        console.log('🛑 Training stopped');
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

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { TrainingCoordinator, TrainingTaskType, TrainingStatus };
