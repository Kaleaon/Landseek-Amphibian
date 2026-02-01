# Adding New Model Sources

This document describes how to add new AI models to the Amphibian model registry.

## Registry Location

The model registry is located at:
`bridge/model_manager/models.json`

## Model Entry Format

To add a new model, append a JSON object to the array with the following fields:

```json
{
  "id": "unique-model-id",
  "name": "Human Readable Name",
  "filename": "local_filename.bin",
  "description": "Short description of the model",
  "size": 123456789, // Size in bytes
  "sha256": "sha256_checksum_here", // Required for integrity check
  "url": "https://url.to/download/model.bin" // Direct download link
}
```

## Supported Formats

- `.bin`: MediaPipe formatted models.
- `.onnx`: ONNX models (if supported by backend).

## Verification

When adding a model:
1. Ensure the URL is a direct download link (supports Range headers for resume capability).
2. Calculate the SHA256 checksum of the file.
3. Verify the file size in bytes.

## Download Logic

The `ModelManager` supports:
- **Resume**: If a download is interrupted, it will attempt to resume from the last byte.
- **Integrity**: It verifies SHA256 checksum after download and before resuming existing files.
