import React from "react";
import { Orbitron } from "next/font/google";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["700"] });

export const AppHeader: React.FC = () => (
  <header
    className={`${orbitron.className} fixed top-0 left-0 right-0 z-20 flex justify-center pt-8`}
  >
    <h1 className="text-4xl font-bold tracking-wide text-white drop-shadow-lg text-center w-full">
      Voice Agent
    </h1>
  </header>
);
