const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const models = require('./models.json');

class ModelManager {
    constructor(androidToolCallback) {
        this.androidToolCallback = androidToolCallback;
        // process.env.ANDROID_FILES_DIR is set by AmphibianCoreService
        this.modelsDir = process.env.ANDROID_FILES_DIR
            ? path.join(process.env.ANDROID_FILES_DIR, 'models')
            : path.join(__dirname, '../../data/models'); // Fallback for dev

        if (!fs.existsSync(this.modelsDir)) {
            try {
                fs.mkdirSync(this.modelsDir, { recursive: true });
            } catch (e) {
                console.error('Failed to create models directory:', e);
            }
        }

        this.downloading = new Map(); // url -> { progress, controller }
    }

    /**
     * List both installed and available remote models
     */
    async listModels() {
        const installed = this.getInstalledModels();
        const available = models.map(m => ({
            ...m,
            installed: installed.includes(m.filename),
            isDownloading: this.downloading.has(m.url),
            progress: this.downloading.get(m.url)?.progress || 0
        }));

        // Also include installed models that are NOT in the registry
        const registryFilenames = models.map(m => m.filename);
        const unknownInstalled = installed.filter(f => !registryFilenames.includes(f)).map(f => ({
            id: f,
            name: f,
            filename: f,
            description: "Locally installed model",
            installed: true,
            isDownloading: false,
            url: null,
            size: 0,
            sha256: null
        }));

        return {
            available: [...available, ...unknownInstalled],
            count: available.length + unknownInstalled.length
        };
    }

    getInstalledModels() {
        try {
            if (!fs.existsSync(this.modelsDir)) return [];
            return fs.readdirSync(this.modelsDir).filter(f => f.endsWith('.bin') || f.endsWith('.onnx'));
        } catch (e) {
            console.error('Failed to list installed models:', e);
            return [];
        }
    }

    async verifyChecksum(filePath, expectedHash) {
        if (!expectedHash) return true; // Skip if no hash provided
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('error', err => reject(err));
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => {
                const actual = hash.digest('hex');
                if (actual !== expectedHash) {
                    console.warn(`Checksum mismatch: expected ${expectedHash}, got ${actual}`);
                }
                resolve(actual === expectedHash);
            });
        });
    }

    /**
     * Download a model with Resume support and Integrity check
     */
    async downloadModel(modelId, onProgress) {
        const model = models.find(m => m.id === modelId);
        if (!model) throw new Error(`Model ${modelId} not found in registry`);

        const destPath = path.join(this.modelsDir, model.filename);

        if (this.downloading.has(model.url)) {
            throw new Error(`Download already in progress for ${model.name}`);
        }

        // Check for existing file
        let startByte = 0;
        if (fs.existsSync(destPath)) {
            const stats = fs.statSync(destPath);
            startByte = stats.size;

            // If completed, verify checksum
            if (model.size && startByte === model.size) {
                 console.log(`File exists with correct size. Verifying integrity of ${model.filename}...`);
                 const valid = await this.verifyChecksum(destPath, model.sha256);
                 if (valid) {
                     return { status: 'already_installed', path: destPath };
                 } else {
                     console.warn('Integrity check failed. Redownloading...');
                     fs.unlinkSync(destPath);
                     startByte = 0;
                 }
            } else if (model.size && startByte > model.size) {
                 // Corrupt or wrong size
                 fs.unlinkSync(destPath);
                 startByte = 0;
            } else {
                console.log(`Resuming download for ${model.name} from byte ${startByte}`);
            }
        }

        const controller = new AbortController();
        this.downloading.set(model.url, { progress: 0, controller });

        try {
            const headers = {};
            if (startByte > 0) {
                headers['Range'] = `bytes=${startByte}-`;
            }

            console.log(`Starting/Resuming download of ${model.name} to ${destPath}`);

            const response = await axios({
                method: 'get',
                url: model.url,
                responseType: 'stream',
                headers: headers,
                signal: controller.signal
            });

            // If server doesn't support range, it sends 200 and full content.
            // If it supports range, it sends 206.
            const isPartial = response.status === 206;
            if (!isPartial && startByte > 0) {
                console.warn('Server does not support resume. Restarting download.');
                startByte = 0;
                // We need to truncate file if we are overwriting
                // createWriteStream with 'w' flags will truncate.
            }

            const totalLength = parseInt(response.headers['content-length'], 10) + startByte;
            const writer = fs.createWriteStream(destPath, { flags: isPartial ? 'a' : 'w' });

            let downloaded = startByte;

            response.data.on('data', (chunk) => {
                downloaded += chunk.length;
                const progress = totalLength ? Math.round((downloaded / totalLength) * 100) : 0;

                if (this.downloading.has(model.url)) {
                    this.downloading.get(model.url).progress = progress;
                }

                if (onProgress) onProgress(progress, downloaded, totalLength);
            });

            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    this.downloading.delete(model.url);
                    console.log(`Download complete: ${model.filename}`);

                    // Verify checksum after download
                    if (model.sha256) {
                        console.log('Verifying checksum...');
                        const valid = await this.verifyChecksum(destPath, model.sha256);
                        if (!valid) {
                            console.error('Integrity check failed after download!');
                            fs.unlink(destPath, () => {});
                            reject(new Error('Integrity check failed'));
                            return;
                        }
                    }

                    // Trigger rescan on Android side
                    if (this.androidToolCallback) {
                        this.androidToolCallback('rescan_models', {}).catch(e => console.error('Failed to rescan:', e));
                    }

                    resolve({ status: 'success', path: destPath });
                });

                writer.on('error', (err) => {
                    this.downloading.delete(model.url);
                    // Do NOT unlink on error to allow resume
                    reject(err);
                });

                response.data.pipe(writer);
            });

        } catch (error) {
            this.downloading.delete(model.url);
            throw error;
        }
    }

    /**
     * Switch current model
     */
    async switchModel(modelName) {
        if (!this.androidToolCallback) {
            throw new Error("Android bridge not available");
        }

        console.log(`Switching to model: ${modelName}`);
        const result = await this.androidToolCallback('load_model', { model: modelName });
        return result;
    }
}

module.exports = ModelManager;
