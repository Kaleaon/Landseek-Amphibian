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

    // 1b. Test TPUBrain.chat (New method)
    console.log(" - Testing TPUBrain.chat...");
    const chatResult = await tpuBrain.chat([{ role: 'user', content: 'Hello' }]);
    assert.strictEqual(chatResult.content, "I can help with that!");
    console.log("✅ TPUBrain.chat passed.");


    // 2. Test Router defaulting to TPU (Local)
    console.log("\n - Testing Router defaulting...");
    const router = new MultiBrain(tpuBrain); // Pass tpuBrain as localBrain
    router.register('local', true); // Register local

    // We expect it to try LLM classification (using tpuBrain) or fallback to local
    // Since mockBridge returns "I can help with that!", it won't be valid JSON for classification.
    // So it should fallback to keywords, and "Hello world" -> fallback 'local'.

    const decision = await router.route("Hello world");
    // decision should be { toolName: 'local', confidence: 1.0, reason: 'keyword/fallback' }

    console.log("Decision:", decision);
    assert.strictEqual(decision.toolName, 'local');
    console.log("✅ Router defaulted to local.");

    // 3. Test Router specific routing
    console.log("\n - Testing Router specific routing...");
    router.register('jules', true);

    const codingDecision = await router.route("Fix this code bug");
    assert.strictEqual(codingDecision.toolName, 'jules');
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
