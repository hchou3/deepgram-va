class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Removed speechThreshold
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0]) {
      // Always post every buffer, no silence detection
      this.port.postMessage(input[0].buffer);
    }
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
