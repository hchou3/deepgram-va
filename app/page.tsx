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
          sampleRate: 44100,
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

      audioContextRef.current = new AudioContext();

      ws.onopen = () => {
        console.log("WebSocket connection opened successfully");
        micRecorder.start(500);
        setIsRecording(true);
      };

      ws.onerror = (event) => {
        console.error("WebSocket error occurred");
        console.error("Event:", event);
        // Try to get more error details
        if (event instanceof ErrorEvent) {
          console.error("Error message:", event.message);
          console.error("Error type:", event.type);
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket connection closed:", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
      };

      micRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          try {
            // Send the raw audio data directly
            console.log(
              "Sending audio chunk to server, size:",
              event.data.size
            );
            ws.send(event.data);
          } catch (error) {
            console.error("Error sending audio:", error);
          }
        }
      };

      ws.onmessage = async (event) => {
        try {
          console.log("\n=== RECEIVED WEBSOCKET MESSAGE ===");
          console.log("Raw message:", event.data);
          const message = JSON.parse(event.data);
          console.log("Parsed message:", message);

          switch (message.type) {
            case "conversation":
              console.log("Processing conversation message:", message.data);
              const newTranscript = `${message.data.role}: ${message.data.content}`;
              console.log("Adding to transcript:", newTranscript);
              setTranscript((prev) => {
                const updated = prev
                  ? `${prev}\n${newTranscript}`
                  : newTranscript;
                console.log("Updated transcript:", updated);
                return updated;
              });
              break;

            case "audio":
              console.log("Processing audio data, size:", message.data.length);
              if (audioContextRef.current) {
                try {
                  // Convert the base64 audio data to ArrayBuffer
                  const binaryString = atob(message.data);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }

                  const audioBuffer =
                    await audioContextRef.current.decodeAudioData(bytes.buffer);
                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(audioContextRef.current.destination);
                  source.start();
                } catch (error) {
                  console.error("Error playing audio:", error);
                }
              }
              break;

            case "error":
              console.error("Error from server:", message.data);
              break;

            default:
              console.log("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
          console.error("Raw message that caused error:", event.data);
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

    // Wait for 5 seconds before closing the WebSocket to receive any pending responses
    setTimeout(() => {
      if (socketRef.current) {
        console.log("Closing WebSocket connection after delay");
        socketRef.current.close();
      }
    }, 5000);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-full max-w-2xl">
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
        <div className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Conversation</h2>
          <div className="bg-gray-50 rounded-lg p-4 h-96 overflow-y-auto">
            {transcript ? (
              transcript.split("\n").map((line, index) => {
                const [role, content] = line.split(": ");
                return (
                  <div key={index} className="mb-3">
                    <span
                      className={`font-semibold ${
                        role === "user" ? "text-blue-600" : "text-green-600"
                      }`}
                    >
                      {role}:
                    </span>
                    <span className="ml-2">{content}</span>
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-center">
                Start speaking to begin the conversation...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
