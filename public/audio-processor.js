class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.speechThreshold = 0.02; // Match the threshold in page.tsx
  }

  calculateRMS(input) {
    const sum = input.reduce((acc, val) => acc + val * val, 0);
    return Math.sqrt(sum / input.length);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const rms = this.calculateRMS(input[0]);

      if (rms > this.speechThreshold) {
        this.port.postMessage(input[0].buffer);
      }
    }
    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
