
#include <jni.h>
#include <string>
#include <android/log.h>
#include <vector>
#include "node.h"

#define TAG "AmphibianJNI"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL
Java_com_landseek_amphibian_service_AmphibianNative_startNode(
        JNIEnv* env,
        jobject /* this */,
        jobjectArray arguments) {

    int argc = env->GetArrayLength(arguments);
    std::vector<std::string> args;
    std::vector<char*> argv;

    // Convert Java Strings to C Strings
    for (int i = 0; i < argc; i++) {
        jstring string = (jstring) env->GetObjectArrayElement(arguments, i);
        const char* rawString = env->GetStringUTFChars(string, 0);
        args.push_back(std::string(rawString));
        env->ReleaseStringUTFChars(string, rawString);
    }

    // Build argv
    for (int i = 0; i < argc; i++) {
        argv.push_back(const_cast<char*>(args[i].c_str()));
    }

    LOGD("Starting Embedded Node.js...");
    int result = node::Start(argc, argv.data());
    LOGD("Node.js exited with code: %d", result);
    
    return result;
}
    