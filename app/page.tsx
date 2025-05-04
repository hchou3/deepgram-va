import React from "react";
import { useEffect, useRef, useState } from "react";

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const socketRef = useRef<WebSocket | null>(null);
  const audioChunks = useRef([]);

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const startRecording = async () => {
    const constraints = {
      audio: {
        channelCount: 1,
        sampleRate: 16000, // match input on index.js
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
  };
}
