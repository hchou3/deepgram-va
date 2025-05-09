import { createClient, AgentEvents } from "@deepgram/sdk";
import { prompt } from "./prompt.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const server = http.createServer();
const wss = new WebSocketServer({ server });

let agent = null;
let audioBuffer = Buffer.alloc(0);
let lastAudioChunkTime = Date.now();

async function initializeVoiceAgent() {
  agent = deepgram.agent();

  agent.on(AgentEvents.Open, async () => {
    console.log("\n=== AGENT CONNECTION OPENED ===");
    console.log("Initializing agent configuration...");
    try {
      const config = {
        audio: {
          input: {
            encoding: "linear16",
            sampleRate: 44100,
          },
          output: {
            encoding: "linear16",
            sampleRate: 16000,
            container: "wav",
          },
        },
        agent: {
          listen: {
            model: "nova-3",
          },
          speak: {
            model: "aura-asteria-en",
          },
          think: {
            provider: {
              type: "anthropic",
            },
            model: "claude-3-haiku-20240307",
            instructions: prompt,
          },
        },
      };
      console.log("Agent configuration:", JSON.stringify(config, null, 2));
      await agent.configure(config);
      console.log("Agent configuration successful");
      console.log("Agent state after configuration:", agent.state);

      // Add debug logging for all agent events
      Object.values(AgentEvents).forEach((eventName) => {
        agent.on(eventName, (data) => {
          console.log(`\n=== AGENT EVENT: ${eventName} ===`);
          console.log("Event data:", data);
          console.log("========================\n");
        });
      });

      setInterval(() => {
        console.log("Keep alive! Agent state:", agent.state);
        void agent.keepAlive();
      }, 8000);
    } catch (error) {
      console.error("Error configuring agent:", error);
      console.error("Error stack:", error.stack);
    }
  });

  agent.on(AgentEvents.AgentStartedSpeaking, (data) => {
    console.log("\n=== AGENT STARTED SPEAKING ===");
    console.log("Total latency:", data["total_latency"]);
    console.log("=============================\n");
  });

  agent.on(AgentEvents.ConversationText, (data) => {
    console.log("\n=== AGENT RESPONSE ===");
    console.log("Full response data:", JSON.stringify(data, null, 2));
    console.log("Role:", data.role);
    console.log("Content:", data.content);
    console.log(
      "Time since last audio chunk:",
      Date.now() - lastAudioChunkTime,
      "ms"
    );
    console.log("========================\n");

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log("Broadcasting conversation to client");
        client.send(
          JSON.stringify({
            type: "conversation",
            data: data,
          })
        );
      }
    });
  });

  agent.on(AgentEvents.Audio, (audio) => {
    console.log("\n=== AGENT AUDIO ===");
    console.log("Audio buffer size:", audio.length);
    console.log("Audio first 100 bytes:", audio.slice(0, 100));
    console.log(
      "Time since last audio chunk:",
      Date.now() - lastAudioChunkTime,
      "ms"
    );
    console.log("===================\n");

    const buffer = Buffer.from(audio);
    audioBuffer = Buffer.concat([audioBuffer, buffer]);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "audio",
            data: buffer,
          })
        );
      }
    });
  });

  agent.on(AgentEvents.Error, (error) => {
    console.error("\n=== AGENT ERROR ===");
    console.error("Error details:", error);
    console.error("===================\n");

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "error",
            data: error.message,
          })
        );
      }
    });
  });

  agent.on(AgentEvents.Close, () => {
    console.log("\n=== AGENT CONNECTION CLOSED ===\n");
  });
}

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("\n=== NEW CLIENT CONNECTED ===");
  console.log("Agent status:", agent ? "Initialized" : "Not initialized");

  ws.on("message", (data) => {
    console.log("\n=== RECEIVED AUDIO CHUNK ===");
    console.log("Chunk size:", data.length);
    console.log("Chunk type:", data.constructor.name);
    console.log("Chunk first 100 bytes:", data.slice(0, 100));
    console.log(
      "Time since last chunk:",
      Date.now() - lastAudioChunkTime,
      "ms"
    );

    lastAudioChunkTime = Date.now();
    if (agent) {
      try {
        console.log("Sending chunk to agent...");
        console.log("Agent state:", agent.state);
        agent.send(data);
        console.log("Chunk sent to agent successfully");
      } catch (error) {
        console.error("\n=== ERROR SENDING TO AGENT ===");
        console.error("Error:", error);
        console.error("Error stack:", error.stack);
        console.error("=============================\n");

        try {
          ws.send(
            JSON.stringify({
              type: "error",
              data: "Error sending audio to agent: " + error.message,
            })
          );
        } catch (wsError) {
          console.error("Error sending error message to client:", wsError);
        }
      }
    } else {
      console.error("\n=== AGENT NOT INITIALIZED ===\n");
      try {
        ws.send(
          JSON.stringify({
            type: "error",
            data: "Voice agent not ready",
          })
        );
      } catch (wsError) {
        console.error("Error sending error message to client:", wsError);
      }
    }
  });

  ws.on("close", (code, reason) => {
    console.log("\n=== CLIENT DISCONNECTED ===");
    console.log("Close code:", code);
    console.log("Close reason:", reason);
    console.log(
      "Time since last audio chunk:",
      Date.now() - lastAudioChunkTime,
      "ms"
    );
    console.log("===========================\n");
  });

  ws.on("error", (error) => {
    console.error("\n=== WEBSOCKET SERVER ERROR ===");
    console.error("Error:", error);
    console.error("=============================\n");
  });
});

// Add error handler for the WebSocket server
wss.on("error", (error) => {
  console.error("\n=== WEBSOCKET SERVER ERROR ===");
  console.error("Error:", error);
  console.error("=============================\n");
});

const PORT = process.env.PORT || 8001;
const serverInstance = server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
  initializeVoiceAgent();
});
