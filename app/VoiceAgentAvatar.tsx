"use client";
import React, { useMemo } from "react";

interface VoiceAgentAvatarProps {
  statusText: string;
  isUserSpeaking: boolean;
  isAgentSpeaking: boolean;
  volume: number;
}

export const VoiceAgentAvatar: React.FC<VoiceAgentAvatarProps> = ({
  statusText,
  isUserSpeaking,
  isAgentSpeaking,
  volume,
}) => {
  const segments = 64; // Number of waveform spikes
  const radius = 80;
  const maxSpikeLength = 20;

  const color = isAgentSpeaking
    ? "#10B981"
    : isUserSpeaking
    ? "#6366F1"
    : "#9CA3AF";

  const pathData = useMemo(() => {
    const step = (2 * Math.PI) / segments;
    const points = [];

    for (let i = 0; i < segments; i++) {
      const angle = i * step;
      const spike = volume * maxSpikeLength;
      const r1 = radius;
      const r2 = radius + spike;

      const x1 = 100 + r1 * Math.cos(angle);
      const y1 = 100 + r1 * Math.sin(angle);
      const x2 = 100 + r2 * Math.cos(angle);
      const y2 = 100 + r2 * Math.sin(angle);

      points.push(`M${x1},${y1} L${x2},${y2}`);
    }

    return points.join(" ");
  }, [volume]);

  return (
    <div className="relative w-64 h-64 flex flex-col items-center justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200">
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill={color}
          stroke="#fff"
          strokeWidth="2"
        />
        <path d={pathData} stroke="#fff" strokeWidth="2" fill="none" />
      </svg>
      <p className="absolute bottom-4 text-white text-center font-bold">
        {statusText}
      </p>
    </div>
  );
};
