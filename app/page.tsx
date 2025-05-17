"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";

let audioContext: AudioContext | null = null;

// Buffer for accumulating audio samples before sending
let sendBuffer = new Int16Array(0);
const CHUNK_SIZE = 2048; // ~85ms at 24kHz, matches peer's implementation

export default function App() {
  const [agentStatus, setAgentStatus] = useState("Agent is ready");
  const [isSilent, setIsSilent] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  let audioQueue: Int16Array[] = [];
  let isPlaying = false;

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!audioContextRef.current) {
        audioContextRef.current =
          audioContext ||
          new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 24000,
          });
      }
    }
  }, []);

  useEffect(() => {
    const connectWebSocket = () => {
      const socket = new WebSocket("ws://localhost:8000");
      socketRef.current = socket;

      socket.onopen = () => {
        startRecording(); // Automatically start recording
      };

      // Added debug logs to verify audio data reception and queue addition
      socket.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          try {
            console.log("Processing audio Blob...");
            const arrayBuffer = await event.data.arrayBuffer();
            const audioData = new Int16Array(arrayBuffer);
            console.log("Audio data received:", {
              length: audioData.length,
              sampleRate: 16000,
              format: "linear16",
            });

            // Add to queue instead of playing immediately
            audioQueue.push(audioData);
            console.log(
              "Audio data added to queue. Queue length:",
              audioQueue.length
            );

            if (!isPlaying) {
              playNextInQueue();
            }
          } catch (error) {
            console.error("Error processing audio response:", error);
          }
        } else {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "conversation") {
              setAgentStatus("Agent is speaking...");
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        }
      };

      socket.onclose = () => {
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (error) => {};
    };

    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      if (
        !socketRef.current ||
        socketRef.current.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const constraints = {
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          googEchoCancellation: false,
          googAutoGainControl: false,
          googNoiseSuppression: false,
          googHighpassFilter: true,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioContext = audioContextRef.current;

      if (!audioContext) {
        return;
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      await audioContext.audioWorklet.addModule("/audio-processor.js");
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

      workletNode.port.onmessage = (e) => {
        // No silence detection: always process every buffer
        const float32Array = new Float32Array(e.data);
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          const sample = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        // Concatenate new samples to the sendBuffer
        const combined = new Int16Array(sendBuffer.length + int16Array.length);
        combined.set(sendBuffer, 0);
        combined.set(int16Array, sendBuffer.length);
        sendBuffer = combined;

        // Send in CHUNK_SIZE blocks
        while (sendBuffer.length >= CHUNK_SIZE) {
          const chunk = sendBuffer.slice(0, CHUNK_SIZE);
          if (socketRef.current) {
            console.log("About to send binary audio chunk:", {
              bufferType: Object.prototype.toString.call(chunk.buffer),
              byteLength: chunk.buffer.byteLength,
              firstBytes: Array.from(new Uint8Array(chunk.buffer).slice(0, 8)),
            });
            socketRef.current.send(chunk.buffer);
            console.log("Sent binary audio chunk to WebSocket server");
          }
          sendBuffer = sendBuffer.slice(CHUNK_SIZE);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      workletNodeRef.current = workletNode;
    } catch (error) {}
  };

  async function playNextInQueue() {
    if (audioQueue.length === 0) {
      isPlaying = false;
      setAgentStatus("Agent is ready");
      return;
    }

    isPlaying = true;
    const audioData = audioQueue.shift();

    try {
      const audioContext = audioContextRef.current;

      if (!audioContext) {
        return;
      }

      // Ensure audio context is running
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (!audioData) {
        console.error("Audio data is undefined. Skipping playback.");
        isPlaying = false;
        playNextInQueue();
        return;
      }

      // Added debug logs to verify buffer creation
      // Create buffer with correct sample rate for agent's audio
      const buffer = audioContext.createBuffer(1, audioData.length, 24000);
      console.log("AudioBuffer created:", {
        bufferLength: buffer.length,
        sampleRate: 24000,
      });

      const channelData = buffer.getChannelData(0);
      channelData.set(
        Float32Array.from(
          audioData,
          (sample) => sample / (sample >= 0 ? 0x7fff : 0x8000)
        )
      );
      console.log("Channel data set in AudioBuffer");

      // Added debug logs to verify playback process
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      console.log("AudioBufferSourceNode created and buffer assigned");

      // Added debug logs to verify volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;
      console.log("GainNode initialized with gain value:", gainNode.gain.value);

      // Log gain value manually if modified in the future
      console.log("Ensure gain value remains consistent during playback");

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      console.log(
        "AudioBufferSourceNode connected to GainNode and destination"
      );

      source.onended = () => {
        console.log("Audio playback ended. Playing next in queue...");
        playNextInQueue();
      };

      source.start(0);
      console.log("Audio playback started");
      setAgentStatus("Agent is speaking...");
    } catch (error) {
      isPlaying = false;
      playNextInQueue();
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Voice Assistant</h1>
        <div className="mt-4 text-center text-gray-600">{agentStatus}</div>
      </div>
    </div>
  );
}

const convertFloatToPcm = (float32: Float32Array): Int16Array => {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
  }
  return int16;
};
