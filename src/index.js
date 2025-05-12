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

  agent.on(AgentEvents.Welcome, async () => {
    console.log("Welcome to the Deepgram Voice Agent!");

    await agent.configure({
      audio: {
        input: {
          encoding: "linear16",
          sample_rate: 24000,
        },
        output: {
          encoding: "linear16",
          sample_rate: 24000,
          container: "none",
        },
      },
      agent: {
        language: "en",
        listen: {
          provider: {
            type: "deepgram",
            model: "nova-3",
          },
        },
        think: {
          provider: {
            type: "open_ai",
            model: "gpt-4o-mini",
          },
          prompt: "You are a friendly AI assistant.",
        },
        speak: {
          provider: {
            type: "deepgram",
            model: "aura-2-thalia-en",
          },
        },
        greeting: "Hello! How can I help you today?",
      },
    });

    console.log("Voice agent configured");

    setInterval(() => {
      console.log("Keep alive!");
      void agent.keepAlive();
    }, 8000);
  });

  agent.on(AgentEvents.Open, () => {
    console.log("Connection opened");
  });

  agent.on(AgentEvents.Close, () => {
    console.log("Voice agent connection closed");
  });

  agent.on(AgentEvents.Error, (error) => {
    console.error("Voice agent error:", JSON.stringify(error, null, 2));
  });

  agent.on(AgentEvents.ConversationText, (message) => {
    console.log("AgentEvents.ConversationText triggered:", {
      role: message.role,
      content: message.content,
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log("Sending conversation text to client:", {
          clientReadyState: client.readyState,
          messageContent: message.content,
        });
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
    console.log("AgentEvents.Audio triggered:", {
      bufferLength: buffer.length,
      sampleRate: 24000,
      format: "linear16",
    });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log("Sending audio data to client:", {
          clientReadyState: client.readyState,
          bufferLength: buffer.length,
        });
        client.send(
          JSON.stringify({
            type: "audio",
            data: buffer,
          })
        );
      }
    });
  });

  agent.on(AgentEvents.Unhandled, (data) => {
    console.log("Unhandled event:", data);
  });
}

wss.on("connection", (ws) => {
  console.log("Socket connected");

  ws.on("message", (data) => {
    if (agent) {
      agent.send(data);
      console.log("Sent data to agent:", data.length);
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
