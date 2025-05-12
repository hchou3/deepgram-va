import { createClient, AgentEvents } from "@deepgram/sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws"; // Explicitly import WebSocket type for TypeScript compatibility
import http from "http";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const server = http.createServer();
const wss = new WebSocketServer({ server });
let agent = null;
// Store the WebSocket reference for the connected client
let browserWs = null;
async function initializeVoiceAgent() {
    agent = deepgram.agent();
    // Wrap the agent's send method to add logging
    const originalSend = agent.send.bind(agent);
    agent.send = (data) => {
        console.log("Agent send method called with data:", {
            dataType: typeof data,
            dataLength: data.length || data.byteLength || 0,
            timestamp: new Date().toISOString(),
        });
        originalSend(data);
    };
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
                client.send(JSON.stringify({
                    type: "conversation",
                    data: message,
                }));
            }
        });
    });
    // Fixed the WebSocket send method to remove the second argument
    agent.on(AgentEvents.Audio, (audio) => {
        if ((browserWs === null || browserWs === void 0 ? void 0 : browserWs.readyState) === WebSocket.OPEN) {
            try {
                console.log("Sending audio to browser client:", {
                    bufferLength: audio.length,
                    timestamp: new Date().toISOString(),
                });
                browserWs.send(audio); // Send the audio buffer directly
            }
            catch (error) {
                console.error("Error sending audio to browser:", error);
            }
        }
        else {
            console.warn("No active browser WebSocket connection to send audio");
        }
    });
    agent.on(AgentEvents.Unhandled, (data) => {
        console.log("Unhandled event:", data);
    });
}
wss.on("connection", (ws) => {
    console.log("Socket connected");
    browserWs = ws; // Store the WebSocket reference
    ws.on("message", (data) => {
        if (agent) {
            console.log("WebSocket message received:", {
                dataType: typeof data,
                dataLength: data.length || data.byteLength || 0,
                timestamp: new Date().toISOString(),
            });
            agent.send(data);
            console.log("Sent data to agent:", data);
        }
        else {
            ws.send(JSON.stringify({
                type: "error",
                data: "Voice agent not ready",
            }));
        }
    });
    ws.on("close", () => {
        console.log("Client disconnected");
        if (browserWs === ws) {
            browserWs = null; // Clear the reference if the client disconnects
        }
    });
});
const PORT = process.env.PORT || 8001;
server.listen(PORT, () => {
    console.log(`WebSocket server is running on port ${PORT}`);
    initializeVoiceAgent();
});
