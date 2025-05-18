"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";
import * as Avatar from "@radix-ui/react-avatar";
import { VoiceAgentAvatar } from "./VoiceAgentAvatar";
import { Orbitron } from "next/font/google";
import { AppHeader } from "./AppHeader";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["700"] });

let audioContext: AudioContext | null = null;

let sendBuffer = new Int16Array(0);
const CHUNK_SIZE = 2048;

export default function App() {
  const [agentStatus, setAgentStatus] = useState("Agent is ready");
  const [isSilent, setIsSilent] = useState(true);
  const [volume, setVolume] = useState(0); // For UI animation
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
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
        startRecording();
      };

      socket.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          try {
            const arrayBuffer = await event.data.arrayBuffer();
            const audioData = new Int16Array(arrayBuffer);

            audioQueue.push(audioData);

            if (!isPlaying) {
              setIsAgentSpeaking(true);
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
              setIsAgentSpeaking(true);
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
        const float32Array = new Float32Array(e.data);
        const rms = Math.sqrt(
          float32Array.reduce((sum, sample) => sum + sample * sample, 0) /
            float32Array.length
        );
        setVolume(rms);

        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
          const sample = Math.max(-1, Math.min(1, float32Array[i]));
          int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }

        const combined = new Int16Array(sendBuffer.length + int16Array.length);
        combined.set(sendBuffer, 0);
        combined.set(int16Array, sendBuffer.length);
        sendBuffer = combined;

        while (sendBuffer.length >= CHUNK_SIZE) {
          const chunk = sendBuffer.slice(0, CHUNK_SIZE);
          if (socketRef.current) {
            socketRef.current.send(chunk.buffer);
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
      setIsAgentSpeaking(false);
      return;
    }

    isPlaying = true;
    const audioData = audioQueue.shift();

    try {
      const audioContext = audioContextRef.current;

      if (!audioContext) {
        return;
      }

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (!audioData) {
        isPlaying = false;
        playNextInQueue();
        return;
      }

      const buffer = audioContext.createBuffer(1, audioData.length, 24000);

      const channelData = buffer.getChannelData(0);
      channelData.set(
        Float32Array.from(
          audioData,
          (sample) => sample / (sample >= 0 ? 0x7fff : 0x8000)
        )
      );

      const source = audioContext.createBufferSource();
      source.buffer = buffer;

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      source.onended = () => {
        playNextInQueue();
      };

      source.start(0);
      setAgentStatus("Agent is speaking...");
      setIsAgentSpeaking(true);
    } catch (error) {
      isPlaying = false;
      playNextInQueue();
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <header
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem 0",
          background: "rgba(0,0,0,0.7)",
          zIndex: 50,
        }}
      >
        <h1
          className={`text-4xl font-bold tracking-wide text-white ${orbitron.className}`}
          style={{ textAlign: "center" }}
        >
          Voice Agent
        </h1>
      </header>
      <main
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "rgba(255,255,255,0.9)",
            borderRadius: "1rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            padding: "3rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <VoiceAgentAvatar
            statusText={agentStatus}
            isUserSpeaking={volume > 0.05}
            isAgentSpeaking={isAgentSpeaking}
            volume={volume}
          />
        </div>
      </main>
    </div>
  );
}
