/**
 * Training Worker
 * 
 * Participates in distributed training by:
 * - Receiving training batches
 * - Computing gradients locally
 * - Submitting gradients to coordinator
 * - Syncing weights when needed
 * 
 * Designed for high-latency environments with:
 * - Gradient compression
 * - Batch prefetching
 * - Async weight updates
 */

/**
 * Worker status
 */
const WorkerStatus = {
    IDLE: 'idle',
    CONNECTING: 'connecting',
    READY: 'ready',
    COMPUTING: 'computing',
    SYNCING: 'syncing',
    PAUSED: 'paused'
};

class TrainingWorker {
    constructor(collectiveClient, options = {}) {
        this.client = collectiveClient;
        
        // Worker configuration
        this.config = {
            deviceName: options.deviceName || 'Worker',
            maxBatchQueue: options.maxBatchQueue || 3, // Pre-fetch up to 3 batches
            gradientCompression: options.gradientCompression !== false,
            compressionThreshold: options.compressionThreshold || 0.001 // Sparsify below this
        };
        
        // State
        this.status = WorkerStatus.IDLE;
        this.localBrain = options.localBrain;
        this.currentWeightVersion = 0;
        this.isTraining = false;
        
        // Training stats
        this.stats = {
            batchesProcessed: 0,
            gradientsSubmitted: 0,
            totalComputeTime: 0,
            avgComputeTime: 0
        };
        
        // Batch queue for prefetching
        this.batchQueue = [];
        this.pendingBatch = null;
        
        // Training configuration from coordinator
        this.trainingConfig = null;
        
        // Event handlers
        this.eventHandlers = [];
    }

    /**
     * Start the training worker
     */
    async start() {
        if (!this.client || !this.client.isConnected) {
            throw new Error('Not connected to collective');
        }
        
        this.status = WorkerStatus.CONNECTING;
        this.isTraining = true;
        
        // Set up message handlers
        this.setupMessageHandlers();
        
        // Notify coordinator we're ready
        this.client.send({
            type: 'TRAINING_READY',
            deviceName: this.config.deviceName,
            capabilities: {
                hasLocalBrain: !!this.localBrain,
                maxBatchSize: 8,
                supportsCompression: this.config.gradientCompression
            }
        });
        
        this.status = WorkerStatus.READY;
        console.log('🎓 Training worker started');
        
        return true;
    }

    /**
     * Set up message handlers
     */
    setupMessageHandlers() {
        this.client.on('message', (msg) => {
            switch (msg.type) {
                case 'TRAINING_START':
                    this.handleTrainingStart(msg);
                    break;
                    
                case 'TRAINING_BATCH':
                    this.handleBatch(msg);
                    break;
                    
                case 'WEIGHT_UPDATE':
                    this.handleWeightUpdate(msg);
                    break;
                    
                case 'WEIGHT_SYNC':
                    this.handleWeightSync(msg);
                    break;
                    
                case 'TRAINING_STATE':
                    this.handleTrainingState(msg);
                    break;
                    
                case 'TRAINING_PAUSED':
                    this.status = WorkerStatus.PAUSED;
                    console.log('⏸️ Training paused by coordinator');
                    break;
                    
                case 'TRAINING_RESUMED':
                    this.status = WorkerStatus.READY;
                    console.log('▶️ Training resumed');
                    this.processNextBatch();
                    break;
                    
                case 'TRAINING_STOPPED':
                    this.isTraining = false;
                    this.status = WorkerStatus.IDLE;
                    console.log('🛑 Training stopped by coordinator');
                    break;
            }
        });
    }

    /**
     * Handle training start
     */
    handleTrainingStart(msg) {
        this.trainingConfig = msg.config;
        this.currentWeightVersion = msg.weightVersion;
        this.status = WorkerStatus.READY;
        
        console.log(`🎓 Training started: ${this.trainingConfig.modelName}`);
        console.log(`   Batch size: ${this.trainingConfig.batchSize}`);
        console.log(`   Learning rate: ${this.trainingConfig.learningRate}`);
        
        this.emit('training_started', this.trainingConfig);
    }

    /**
     * Handle incoming training batch
     */
    async handleBatch(msg) {
        const { taskId, batch, weightVersion, step, config } = msg;
        
        // Add to queue
        this.batchQueue.push({ taskId, batch, weightVersion, step, config });
        
        // Start processing if not already
        if (this.status === WorkerStatus.READY) {
            await this.processNextBatch();
        }
    }

    /**
     * Process next batch from queue
     */
    async processNextBatch() {
        if (this.batchQueue.length === 0 || this.status === WorkerStatus.PAUSED) {
            return;
        }
        
        const batchInfo = this.batchQueue.shift();
        this.pendingBatch = batchInfo;
        this.status = WorkerStatus.COMPUTING;
        
        const startTime = Date.now();
        
        try {
            // Check if weights are stale
            if (batchInfo.weightVersion < this.currentWeightVersion - 2) {
                // Request weight sync
                this.requestWeightSync();
            }
            
            // Compute gradients
            const gradients = await this.computeGradients(batchInfo.batch, batchInfo.config);
            
            const computeTime = Date.now() - startTime;
            this.stats.totalComputeTime += computeTime;
            this.stats.batchesProcessed++;
            this.stats.avgComputeTime = this.stats.totalComputeTime / this.stats.batchesProcessed;
            
            // Submit gradients
            await this.submitGradients(batchInfo.taskId, gradients, batchInfo.weightVersion);
            
            console.log(`✅ Batch ${batchInfo.taskId} processed (${computeTime}ms)`);
            
        } catch (e) {
            console.error(`❌ Batch processing failed:`, e.message);
            
            this.client.send({
                type: 'GRADIENT_FAILED',
                taskId: batchInfo.taskId,
                error: e.message
            });
        } finally {
            this.pendingBatch = null;
            this.status = WorkerStatus.READY;
            
            // Process next batch
            if (this.batchQueue.length > 0) {
                await this.processNextBatch();
            }
        }
    }

    /**
     * Compute gradients for a batch
     */
    async computeGradients(batch, config) {
        // Simulated gradient computation
        // In production, this would:
        // 1. Forward pass through the model
        // 2. Compute loss
        // 3. Backward pass to get gradients
        
        const gradients = {};
        let totalLoss = 0;
        
        for (const sample of batch) {
            // Simulate forward pass and loss computation
            const { input, output } = sample;
            
            if (this.localBrain) {
                // Use local brain for actual computation
                try {
                    const response = await this.localBrain.chat([
                        { role: 'user', content: input }
                    ], { maxTokens: 50 });
                    
                    // Simple loss simulation based on response length difference
                    const responseLoss = Math.abs(response.content.length - output.length) / 100;
                    totalLoss += responseLoss;
                } catch (e) {
                    // Fallback to simulated loss
                    totalLoss += Math.random() * 0.5;
                }
            } else {
                // Simulated loss
                totalLoss += Math.random() * 0.5;
            }
            
            // Simulate gradient computation
            // Real implementation would compute actual gradients
            if (!gradients['layer1']) {
                gradients['layer1'] = [];
            }
            gradients['layer1'].push(Math.random() * 0.01 - 0.005);
        }
        
        const avgLoss = totalLoss / batch.length;
        
        // Apply gradient compression if enabled
        const processedGradients = this.config.gradientCompression
            ? this.compressGradients(gradients)
            : gradients;
        
        return {
            gradients: processedGradients,
            loss: avgLoss,
            batchSize: batch.length
        };
    }

    /**
     * Compress gradients by sparsification
     */
    compressGradients(gradients) {
        const compressed = {};
        
        for (const [param, values] of Object.entries(gradients)) {
            // Only keep gradients above threshold
            compressed[param] = values.map(v => 
                Math.abs(v) < this.config.compressionThreshold ? 0 : v
            );
        }
        
        return compressed;
    }

    /**
     * Submit gradients to coordinator
     */
    async submitGradients(taskId, gradientResult, weightVersion) {
        const { gradients, loss, batchSize } = gradientResult;
        
        this.client.send({
            type: 'GRADIENT_SUBMIT',
            taskId,
            gradients,
            loss,
            batchSize,
            weightVersion,
            computeTime: this.stats.avgComputeTime
        });
        
        this.stats.gradientsSubmitted++;
        
        this.emit('gradient_submitted', {
            taskId,
            loss,
            weightVersion
        });
    }

    /**
     * Handle weight update from coordinator
     */
    handleWeightUpdate(msg) {
        const { weightVersion, step } = msg;
        
        // Update local weight version
        this.currentWeightVersion = weightVersion;
        
        console.log(`📥 Weight update received (v${weightVersion})`);
        
        this.emit('weights_updated', { weightVersion, step });
    }

    /**
     * Handle full weight sync
     */
    handleWeightSync(msg) {
        const { weightVersion } = msg;
        
        this.currentWeightVersion = weightVersion;
        this.status = WorkerStatus.READY;
        
        console.log(`🔄 Full weight sync completed (v${weightVersion})`);
        
        // Resume batch processing
        this.processNextBatch();
    }

    /**
     * Handle training state from coordinator
     */
    handleTrainingState(msg) {
        this.trainingConfig = msg.config;
        this.currentWeightVersion = msg.weightVersion;
        
        console.log(`📋 Received training state (step ${msg.currentStep})`);
        
        this.status = WorkerStatus.READY;
    }

    /**
     * Request weight sync from coordinator
     */
    requestWeightSync() {
        this.status = WorkerStatus.SYNCING;
        
        this.client.send({
            type: 'WEIGHT_SYNC_REQUEST',
            currentVersion: this.currentWeightVersion
        });
    }

    /**
     * Get worker status
     */
    getStatus() {
        return {
            status: this.status,
            isTraining: this.isTraining,
            currentWeightVersion: this.currentWeightVersion,
            batchesProcessed: this.stats.batchesProcessed,
            gradientsSubmitted: this.stats.gradientsSubmitted,
            avgComputeTime: this.stats.avgComputeTime,
            queuedBatches: this.batchQueue.length,
            hasLocalBrain: !!this.localBrain
        };
    }

    /**
     * Pause processing
     */
    pause() {
        this.status = WorkerStatus.PAUSED;
    }

    /**
     * Resume processing
     */
    resume() {
        if (this.status === WorkerStatus.PAUSED) {
            this.status = WorkerStatus.READY;
            this.processNextBatch();
        }
    }

    /**
     * Stop the worker
     */
    stop() {
        this.isTraining = false;
        this.status = WorkerStatus.IDLE;
        this.batchQueue = [];
        this.pendingBatch = null;
        
        console.log('🛑 Training worker stopped');
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

module.exports = { TrainingWorker, WorkerStatus };
