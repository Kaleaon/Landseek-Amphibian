package com.landseek.amphibian.service

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File

/**
 * TPUCapabilityService
 * 
 * Detects and manages Pixel TPU/NPU hardware capabilities.
 * Optimized for Pixel 10 Tensor G5 chip but compatible with older Pixels.
 * 
 * Supported Hardware:
 * - Pixel 10: Tensor G5 with dedicated TPU (Best performance)
 * - Pixel 9/Pro: Tensor G4 with TPU
 * - Pixel 8/Pro: Tensor G3 with TPU
 * - Pixel 7/Pro: Tensor G2 with TPU
 * - Pixel 6/Pro: Tensor G1 with TPU
 * - Other devices: GPU/CPU fallback
 */
class TPUCapabilityService(private val context: Context) {
    
    private val TAG = "AmphibianTPU"
    
    /**
     * Hardware acceleration backend preference
     */
    enum class AccelerationBackend {
        TPU,        // Google Tensor TPU (Pixel 6+)
        GPU,        // GPU via OpenGL/OpenCL
        NNAPI,      // Android Neural Networks API
        CPU         // CPU fallback
    }
    
    /**
     * Device capability tier for model selection
     */
    enum class DeviceTier {
        FLAGSHIP,   // 12GB+ RAM, latest TPU (Pixel 10, 9 Pro)
        HIGH,       // 8GB+ RAM, TPU (Pixel 8, 9)
        MEDIUM,     // 6GB+ RAM, GPU
        LOW         // Below 6GB, CPU only
    }
    
    /**
     * TPU capability information
     */
    data class TPUCapabilities(
        val hasTPU: Boolean,
        val hasNPU: Boolean,
        val tensorGeneration: Int?,     // G1=1, G2=2, G3=3, G4=4, G5=5
        val recommendedBackend: AccelerationBackend,
        val deviceTier: DeviceTier,
        val maxModelSize: Long,         // Maximum recommended model size in bytes
        val supportedQuantizations: List<String>,
        val supportsInt4: Boolean,
        val supportsInt8: Boolean,
        val totalRamMB: Long
    )
    
    private var cachedCapabilities: TPUCapabilities? = null
    
    /**
     * Detect device capabilities
     */
    fun detectCapabilities(): TPUCapabilities {
        cachedCapabilities?.let { return it }
        
        val tensorGen = detectTensorGeneration()
        val totalRam = getTotalRAM()
        val hasTPU = tensorGen != null
        val hasNPU = checkNPUAvailability()
        
        val tier = when {
            totalRam >= 12000 && tensorGen != null && tensorGen >= 4 -> DeviceTier.FLAGSHIP
            totalRam >= 8000 && tensorGen != null -> DeviceTier.HIGH
            totalRam >= 6000 -> DeviceTier.MEDIUM
            else -> DeviceTier.LOW
        }
        
        val backend = when {
            hasTPU && tensorGen != null && tensorGen >= 3 -> AccelerationBackend.TPU
            hasNPU -> AccelerationBackend.NNAPI
            totalRam >= 6000 -> AccelerationBackend.GPU
            else -> AccelerationBackend.CPU
        }
        
        // Recommended model sizes based on device tier
        val maxModelSize = when (tier) {
            DeviceTier.FLAGSHIP -> 8L * 1024 * 1024 * 1024  // 8GB models
            DeviceTier.HIGH -> 4L * 1024 * 1024 * 1024     // 4GB models
            DeviceTier.MEDIUM -> 2L * 1024 * 1024 * 1024   // 2GB models
            DeviceTier.LOW -> 1L * 1024 * 1024 * 1024      // 1GB models
        }
        
        val quantizations = buildList {
            if (tensorGen != null && tensorGen >= 4) {
                add("int4")    // Pixel 9+ with Tensor G4 supports int4
            }
            if (tensorGen != null || hasNPU) {
                add("int8")
            }
            add("fp16")
            add("fp32")
        }
        
        val capabilities = TPUCapabilities(
            hasTPU = hasTPU,
            hasNPU = hasNPU,
            tensorGeneration = tensorGen,
            recommendedBackend = backend,
            deviceTier = tier,
            maxModelSize = maxModelSize,
            supportedQuantizations = quantizations,
            supportsInt4 = tensorGen != null && tensorGen >= 4,
            supportsInt8 = tensorGen != null || hasNPU,
            totalRamMB = totalRam
        )
        
        cachedCapabilities = capabilities
        logCapabilities(capabilities)
        
        return capabilities
    }
    
    /**
     * Detect Google Tensor chip generation from device model
     */
    private fun detectTensorGeneration(): Int? {
        val model = Build.MODEL.lowercase()
        val device = Build.DEVICE.lowercase()
        val hardware = Build.HARDWARE.lowercase()
        val soc = Build.SOC_MODEL.lowercase()
        
        Log.d(TAG, "Device: $device, Model: $model, Hardware: $hardware, SOC: $soc")
        
        // Check for Tensor chip by SOC model or device name
        return when {
            // Pixel 10 - Tensor G5
            soc.contains("tensor g5") || 
            model.contains("pixel 10") ||
            device.contains("caiman") || device.contains("komodo") -> 5
            
            // Pixel 9 - Tensor G4
            soc.contains("tensor g4") ||
            model.contains("pixel 9") ||
            device.contains("tokay") || device.contains("caiman") || 
            device.contains("komodo") -> 4
            
            // Pixel 8 - Tensor G3
            soc.contains("tensor g3") ||
            model.contains("pixel 8") ||
            device.contains("shiba") || device.contains("husky") ||
            device.contains("akita") -> 3
            
            // Pixel 7 - Tensor G2
            soc.contains("tensor g2") ||
            model.contains("pixel 7") ||
            device.contains("panther") || device.contains("cheetah") ||
            device.contains("lynx") -> 2
            
            // Pixel 6 - Tensor G1
            soc.contains("tensor") ||
            model.contains("pixel 6") ||
            device.contains("oriole") || device.contains("raven") ||
            device.contains("bluejay") -> 1
            
            else -> null
        }
    }
    
    /**
     * Check if NPU/NNAPI is available
     */
    private fun checkNPUAvailability(): Boolean {
        return try {
            // Check for NNAPI feature
            val hasNNAPI = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
            
            // Check for dedicated NPU hardware feature
            val pm = context.packageManager
            val hasNPU = pm.hasSystemFeature("android.hardware.npu")
            
            hasNNAPI || hasNPU
        } catch (e: Exception) {
            Log.w(TAG, "Error checking NPU availability", e)
            false
        }
    }
    
    /**
     * Get total device RAM in MB
     */
    private fun getTotalRAM(): Long {
        return try {
            val memInfo = File("/proc/meminfo")
            if (memInfo.exists()) {
                val content = memInfo.readText()
                val memTotal = content.lines()
                    .firstOrNull { it.startsWith("MemTotal:") }
                    ?.split("\\s+".toRegex())
                    ?.getOrNull(1)
                    ?.toLongOrNull()
                    ?: 0L
                memTotal / 1024  // Convert KB to MB
            } else {
                0L
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error reading RAM info", e)
            0L
        }
    }
    
    /**
     * Get optimal MediaPipe delegate options based on device capabilities
     */
    fun getOptimalDelegateConfig(): DelegateConfig {
        val caps = detectCapabilities()
        
        return when (caps.recommendedBackend) {
            AccelerationBackend.TPU -> DelegateConfig(
                useGpu = true,
                useNnapi = false,  // MediaPipe prefers GPU path for Tensor TPU
                numThreads = 4,
                gpuPrecision = if (caps.supportsInt4) GpuPrecision.INT4 else GpuPrecision.FP16,
                enableQuantization = true
            )
            AccelerationBackend.GPU -> DelegateConfig(
                useGpu = true,
                useNnapi = false,
                numThreads = 4,
                gpuPrecision = GpuPrecision.FP16,
                enableQuantization = caps.supportsInt8
            )
            AccelerationBackend.NNAPI -> DelegateConfig(
                useGpu = false,
                useNnapi = true,
                numThreads = Runtime.getRuntime().availableProcessors().coerceAtMost(8),
                gpuPrecision = GpuPrecision.FP32,
                enableQuantization = true
            )
            AccelerationBackend.CPU -> DelegateConfig(
                useGpu = false,
                useNnapi = false,
                numThreads = Runtime.getRuntime().availableProcessors().coerceAtMost(4),
                gpuPrecision = GpuPrecision.FP32,
                enableQuantization = false
            )
        }
    }
    
    /**
     * Get recommended model for this device
     */
    fun getRecommendedModel(): RecommendedModel {
        val caps = detectCapabilities()
        
        return when (caps.deviceTier) {
            DeviceTier.FLAGSHIP -> RecommendedModel(
                name = "gemma-3-4b-it-gpu-int4.bin",
                description = "Gemma 3 4B INT4 - Best quality for flagship devices",
                sizeBytes = 2_500_000_000L,
                quantization = "int4"
            )
            DeviceTier.HIGH -> RecommendedModel(
                name = "gemma-3-4b-it-gpu-int4.bin",
                description = "Gemma 3 4B INT4 - Optimized for Pixel TPU",
                sizeBytes = 2_500_000_000L,
                quantization = "int4"
            )
            DeviceTier.MEDIUM -> RecommendedModel(
                name = "gemma-2b-it-gpu-int4.bin",
                description = "Gemma 2B INT4 - Balanced performance",
                sizeBytes = 1_300_000_000L,
                quantization = "int4"
            )
            DeviceTier.LOW -> RecommendedModel(
                name = "gemma-2b-it-cpu-int8.bin",
                description = "Gemma 2B INT8 - CPU optimized",
                sizeBytes = 2_000_000_000L,
                quantization = "int8"
            )
        }
    }
    
    private fun logCapabilities(caps: TPUCapabilities) {
        Log.i(TAG, """
            ╔════════════════════════════════════════════════════════════╗
            ║              🦎 Amphibian TPU Capabilities                 ║
            ╠════════════════════════════════════════════════════════════╣
            ║ Device: ${Build.MODEL.padEnd(46)}║
            ║ Tensor Generation: ${(caps.tensorGeneration?.let { "G$it" } ?: "N/A").padEnd(36)}║
            ║ Has TPU: ${caps.hasTPU.toString().padEnd(45)}║
            ║ Has NPU: ${caps.hasNPU.toString().padEnd(45)}║
            ║ Device Tier: ${caps.deviceTier.name.padEnd(41)}║
            ║ Recommended Backend: ${caps.recommendedBackend.name.padEnd(33)}║
            ║ Total RAM: ${(caps.totalRamMB.toString() + " MB").padEnd(43)}║
            ║ Max Model Size: ${formatSize(caps.maxModelSize).padEnd(38)}║
            ║ Supports INT4: ${caps.supportsInt4.toString().padEnd(39)}║
            ║ Supports INT8: ${caps.supportsInt8.toString().padEnd(39)}║
            ╚════════════════════════════════════════════════════════════╝
        """.trimIndent())
    }
    
    private fun formatSize(bytes: Long): String {
        return when {
            bytes >= 1024 * 1024 * 1024 -> "${bytes / (1024 * 1024 * 1024)} GB"
            bytes >= 1024 * 1024 -> "${bytes / (1024 * 1024)} MB"
            else -> "$bytes bytes"
        }
    }
    
    /**
     * Delegate configuration for MediaPipe
     */
    data class DelegateConfig(
        val useGpu: Boolean,
        val useNnapi: Boolean,
        val numThreads: Int,
        val gpuPrecision: GpuPrecision,
        val enableQuantization: Boolean
    )
    
    enum class GpuPrecision {
        INT4,   // 4-bit integer (Tensor G4+)
        INT8,   // 8-bit integer
        FP16,   // 16-bit float
        FP32    // 32-bit float
    }
    
    /**
     * Recommended model information
     */
    data class RecommendedModel(
        val name: String,
        val description: String,
        val sizeBytes: Long,
        val quantization: String
    )
}
