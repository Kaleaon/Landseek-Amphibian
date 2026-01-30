/**
 * Test for TPU Brain and Router Integration
 */

const assert = require('assert');
const TPUBrain = require('../brains/tpu_brain');
const MultiBrain = require('../brains/router');
const AndroidInferenceServer = require('../mcp_servers/android_inference');

// Mock Android Bridge Callback
const mockBridge = {
    inference: (prompt, callback) => {
        console.log(`[Mock Bridge] Inference requested: "${prompt}"`);
        // Simulate streaming response
        setTimeout(() => callback(null, "I can ", false), 10);
        setTimeout(() => callback(null, "help with ", false), 20);
        setTimeout(() => callback(null, "that!", true), 30);
    }
};

// Mock Global for consistency (though we pass it explicitly usually)
global.androidBridgeCallback = mockBridge;

async function runTest() {
    console.log("🧪 Starting TPU Brain Test...");

    // 1. Test TPUBrain directly
    const tpuBrain = new TPUBrain(mockBridge);
    console.log(" - Testing TPUBrain.generate...");
    const result = await tpuBrain.generate("Hello", (chunk) => {
        process.stdout.write(`(stream: ${chunk}) `);
    });
    console.log(`\n - Result: "${result}"`);
    assert.strictEqual(result, "I can help with that!");
    console.log("✅ TPUBrain passed.");

    // 2. Test Router defaulting to TPU
    console.log("\n - Testing Router defaulting...");
    const router = new MultiBrain({});
    router.register('tpu', tpuBrain);

    const brain = await router.route("Hello world");
    assert.strictEqual(brain, tpuBrain);
    console.log("✅ Router defaulted to TPU.");

    // 3. Test Router specific routing
    console.log("\n - Testing Router specific routing...");
    const mockJules = { name: 'jules' };
    router.register('jules', mockJules);

    const codingBrain = await router.route("Fix this code bug");
    assert.strictEqual(codingBrain, mockJules);
    console.log("✅ Router routed to Jules.");

    // 4. Test AndroidInferenceServer (MCP Tool)
    console.log("\n - Testing AndroidInferenceServer...");
    const server = new AndroidInferenceServer(tpuBrain);
    console.log("✅ AndroidInferenceServer instantiated successfully.");

    console.log("\n🎉 All Tests Passed!");
}

runTest().catch(err => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});
