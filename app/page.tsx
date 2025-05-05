"use client";
import React from "react";
import { useEffect, useRef, useState } from "react";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

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
      const constraints = {
        audio: {
          channelCount: 1,
          sampleRate: 16000,
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
      const micRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      micRecorderRef.current = micRecorder;
      audioChunks.current = [];

      const ws = new WebSocket("ws://localhost:8001/ws");
      socketRef.current = ws;

      // Initialize AudioContext for playing agent's responses
      audioContextRef.current = new AudioContext();

      ws.onopen = () => {
        console.log("WebSocket connection opened");
        micRecorder.start(500); // start recording in 500ms chunks
        setIsRecording(true);
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case "conversation":
            setTranscript(
              (prev) => `${prev}\n${message.data.role}: ${message.data.content}`
            );
            break;

          case "audio":
            // Play the agent's audio response
            if (audioContextRef.current) {
              const audioData = new Uint8Array(message.data);
              const audioBuffer = await audioContextRef.current.decodeAudioData(
                audioData.buffer
              );
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              source.start();
            }
            break;

          case "error":
            console.error("Error from server:", message.data);
            break;

          case "connection_closed":
            console.log("Connection closed by server");
            break;
        }
      };

      micRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
          ws.send(event.data);
        }
      };

      micRecorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
      };
    } catch (error) {
      console.error("Error accessing microphone:", error);
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
        {transcript && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg max-h-60 overflow-y-auto">
            <pre className="whitespace-pre-wrap">{transcript}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
