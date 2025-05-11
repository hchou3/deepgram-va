class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage(input[0].buffer); // Send raw PCM
    }
    return true; // Keep processor alive
  }
}

registerProcessor("audio-processor", AudioProcessor);
