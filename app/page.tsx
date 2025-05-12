"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";

let audioContext: AudioContext | null = null;

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
          new (window.AudioContext || (window as any).webkitAudioContext)();
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioContext = audioContextRef.current;

      if (!audioContext) {
        return;
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      await audioContext.audioWorklet.addModule("/audio-processor.js");
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

      let silenceDebounceTimeout: NodeJS.Timeout | null = null;
      const silenceDebounceDelay = 300; // 300ms debounce delay

      workletNode.port.onmessage = (e) => {
        const float32Array = new Float32Array(e.data);
        const rms = Math.sqrt(
          float32Array.reduce((sum, sample) => sum + sample * sample, 0) /
            float32Array.length
        );

        const speechThreshold = 0.02;

        if (rms > speechThreshold) {
          if (isSilent) {
            setIsSilent(false);
            setAgentStatus("Agent is listening...");
          }

          const pcmData = convertFloatToPcm(float32Array);
          if (socketRef.current) {
            socketRef.current.send(pcmData.buffer);
          }
          console.log("Sent PCM data to WebSocket server");

          // Added detailed logging for PCM data sent to the WebSocket
          console.log("PCM data metadata:", {
            bufferLength: pcmData.buffer.byteLength,
            dataType: typeof pcmData,
            sampleRate: 24000, // Assuming a fixed sample rate
            timestamp: new Date().toISOString(),
          });

          if (silenceDebounceTimeout) {
            clearTimeout(silenceDebounceTimeout);
            silenceDebounceTimeout = null;
          }
        } else {
          if (!isSilent) {
            if (!silenceDebounceTimeout) {
              silenceDebounceTimeout = setTimeout(() => {
                setIsSilent(true);
                setAgentStatus("Agent is ready");
                silenceDebounceTimeout = null;
              }, silenceDebounceDelay);
            }
          }
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      workletNodeRef.current = workletNode;
    } catch (error) {}
  };

  // Added debug logs to verify resampling logic
  async function resampleAudio(
    audioData: Int16Array,
    fromSampleRate: number,
    toSampleRate: number
  ): Promise<Float32Array> {
    console.log("Resampling audio:", {
      inputLength: audioData.length,
      fromSampleRate,
      toSampleRate,
    });

    if (fromSampleRate === toSampleRate) {
      console.log("No resampling needed. Returning original data.");
      return Float32Array.from(
        audioData,
        (sample) => sample / (sample >= 0 ? 0x7fff : 0x8000)
      );
    }

    const resampleRatio = toSampleRate / fromSampleRate;
    const newLength = Math.round(audioData.length * resampleRatio);
    const resampledData = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originalIndex = i / resampleRatio;
      const lowerIndex = Math.floor(originalIndex);
      const upperIndex = Math.min(
        Math.ceil(originalIndex),
        audioData.length - 1
      );
      const weight = originalIndex - lowerIndex;

      resampledData[i] =
        (audioData[lowerIndex] * (1 - weight) +
          audioData[upperIndex] * weight) /
        (audioData[lowerIndex] >= 0 ? 0x7fff : 0x8000);
    }

    console.log("Resampled audio:", {
      outputLength: resampledData.length,
      toSampleRate,
    });

    return resampledData;
  }

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

      // Resample audio to match AudioContext sample rate
      if (!audioData) {
        console.error("Audio data is undefined. Skipping resampling.");
        isPlaying = false;
        playNextInQueue();
        return;
      }

      const resampledData = await resampleAudio(
        audioData,
        24000,
        audioContext.sampleRate
      );

      // Added debug logs to verify buffer creation
      // Create buffer with correct sample rate for agent's audio
      const buffer = audioContext.createBuffer(
        1,
        resampledData.length,
        audioContext.sampleRate
      );
      console.log("AudioBuffer created:", {
        bufferLength: buffer.length,
        sampleRate: audioContext.sampleRate,
      });

      const channelData = buffer.getChannelData(0);
      channelData.set(resampledData);
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
