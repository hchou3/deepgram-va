import { createClient, AgentEvents } from "@deepgram/sdk";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  console.error("Please set your DEEPGRAM_API_KEY in the .env file");
  process.exit(1);
}
const deepgram = createClient(DEEPGRAM_API_KEY);
const server = http.createServer();

const wss = new WebSocketServer({ server });
let browserWs: WebSocket | null = null;

async function connectToAgent() {
  try {
    const agent = deepgram.agent();
    agent.on(AgentEvents.Open, () => {
      agent.configure({
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
    });

    agent.on(
      AgentEvents.AgentStartedSpeaking,
      (data: { total_latency: number }) => {
        console.log("Agent started speaking");
        console.log("Total latency:", data.total_latency);
      }
    );

    agent.on(
      AgentEvents.ConversationText,
      (message: { role: string; content: string }) => {
        console.log(`${message.role}: ${message.content}`);
      }
    );

    agent.on(AgentEvents.Audio, (data: Buffer) => {
      if (browserWs?.readyState === WebSocket.OPEN) {
        try {
          console.log("Sending audio to React app");
          browserWs.send(data, { binary: true });
        } catch (error) {
          console.error("Error sending audio to React app:", error);
        }
      }
    });

    agent.on(AgentEvents.Error, (error: Error) => {
      console.error("Agent error:", error);
    });

    agent.on(AgentEvents.Close, () => {
      console.log("Agent connection closed");
    });

    return agent;
  } catch (error) {
    console.error("Error connecting to Deepgram:", error);
    process.exit(1);
  }
}

wss.on("connection", async (ws) => {
  console.log("React app connected");
  browserWs = ws;

  const agent = await connectToAgent();

  ws.on("message", (data: Buffer) => {
    try {
      // Log metadata about the audio data
      console.log("Audio data metadata:", {
        byteLength: data.byteLength,
        isBuffer: Buffer.isBuffer(data),
        dataType: typeof data,
      });

      if (Buffer.isBuffer(data)) {
        agent.send(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        );
      } else {
        console.error("Received data is not binary");
      }
    } catch (error) {
      console.error("Error processing message from React app:", error);
    }
  });

  ws.on("close", async () => {
    if (agent) {
      await agent.disconnect();
    }
    browserWs = null;
    console.log("React app disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

const PORT = process.env.PORT || 8000;
const serverInstance = server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

function shutdown() {
  console.log("\nShutting down server...");

  const forceExit = setTimeout(() => {
    console.error("Force closing due to timeout");
    process.exit(1);
  }, 5000);

  let pendingOps = {
    ws: true,
    http: true,
  };

  const checkComplete = () => {
    if (!pendingOps.ws && !pendingOps.http) {
      clearTimeout(forceExit);
      console.log("Server shutdown complete");
      process.exit(0);
    }
  };

  wss.clients.forEach((client) => {
    try {
      client.close();
    } catch (err) {
      console.error("Error closing WebSocket client:", err);
    }
  });

  wss.close((err) => {
    if (err) {
      console.error("Error closing WebSocket server:", err);
    } else {
      console.log("WebSocket server closed");
    }
    pendingOps.ws = false;
    checkComplete();
  });

  serverInstance.close((err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
    } else {
      console.log("HTTP server closed");
    }
    pendingOps.http = false;
    checkComplete();
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default serverInstance;
