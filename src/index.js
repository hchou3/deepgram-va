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

async function initializeVoiceAgent() {
  agent = deepgram.agent();

  agent.on(AgentEvents.Open, async () => {
    console.log("Connection opened");

    await agent.configure({
      audio: {
        input: {
          encoding: "linear16",
          sampleRate: 16000,
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
    });
    console.log("Voice agent configured");

    setInterval(() => {
      console.log("Keep alive!");
      void agent.keepAlive();
    }, 8000);
  });

  agent.on(AgentEvents.AgentStartedSpeaking, (data) => {
    console.log("Agent started speaking:", data["total_latency"]);
  });

  agent.on(AgentEvents.ConversationText, (message) => {
    console.log(`${message.role} said: ${message.content}`);
    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "conversation",
            data: message,
          })
        );
      }
    });
  });

  agent.on(AgentEvents.Audio, (audio) => {
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
    console.error("Voice agent error:", error);
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
    console.log("Voice agent connection closed");
  });
}

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("Socket connected");

  ws.on("message", (data) => {
    if (agent) {
      agent.send(data);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          data: "Voice agent not ready",
        })
      );
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 8001;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
  initializeVoiceAgent();
});
