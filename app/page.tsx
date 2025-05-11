"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (
        micRecorderRef.current &&
        micRecorderRef.current.state === "recording"
      ) {
        micRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();

      // Load and setup AudioWorklet
      await audioContext.audioWorklet.addModule("/audio-processor.js");
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

      workletNode.port.onmessage = (e) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          const pcmData = convertFloatToPcm(new Float32Array(e.data));
          console.log(pcmData);
          socketRef.current.send(pcmData.buffer);
        }
      };

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(workletNode);
      workletNode.connect(audioContext.destination);

      workletNodeRef.current = workletNode;
    } catch (error) {
      console.error("Audio setup failed:", error);
    }
  };

  const stopRecording = () => {
    if (
      micRecorderRef.current &&
      micRecorderRef.current.state === "recording"
    ) {
      console.log("Recording Stopped.");
      micRecorderRef.current.stop();
    }
    if (socketRef.current) {
      console.log("WebSocket connection closed");
      socketRef.current.close();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Voice Assistant</h1>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`px-4 py-2 rounded-full ${
            isRecording
              ? "bg-red-500 hover:bg-red-600"
              : "bg-blue-500 hover:bg-blue-600"
          } text-white transition-colors`}
        >
          {isRecording ? "Stop Recording" : "Start Recording"}
        </button>
        {isRecording && (
          <div className="mt-4 text-center text-gray-600">
            Recording in progress...
          </div>
        )}
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
