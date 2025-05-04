import { useEffect, useRef, useState } from "react";
let socket;
let mediaStream;
let audioContext;
let processor;
let isConnected = false;
let audioQueue = [];
let isPlaying = false;
let selectedDeviceId;

interface MicrophoneCaptureProps {
  onAudioChunk: (chunk: Int16Array) => void;
  isStreaming: boolean;
}

export default function MicrophoneCapture({
  onAudioChunk,
  isStreaming,
}: MicrophoneCaptureProps) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isStreaming) return;
    const stream = async () => {
      const audio = new AudioContext({
        sampleRate: 24000,
      });

      const constraints = {
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
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
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    };

    stream();
  });
}
