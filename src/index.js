const { createClient, AgentEvents } = require("@deepgram/sdk");
import { prompt } from "./prompt.js";

const fetch = require("cross-fetch");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DEEPGRAM_URL;

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function connectToVoice() {
  const agent = deepgram.agent();
  let audioBuffer = Buffer.alloc(0);
  let i = 0;

  agent.on(AgentEvents.Open, async () => {
    console.log("Connection opened");

    agent.configure({
      audio: {
        input: {
          encoding: "linear16",
          sampleRate: 16000,
        },
        output: {
          encoding: "linear16",
          container: "wav",
          sampleRate: 24000,
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
          instructions: { prompt },
        },
      },
    });
    console.log("Agent configured");

    setInterval(() => {
      console.log("Keep alive!");
      void agent.keepAlive();
    }, 5000);
    fetch(url)
      .then((r) => r.body)
      .then((res) => {
        res.on("readable", () => {
          agent.send(res.read());
        });
      });
  });

  agent.on(AgentEvents.AgentStartedSpeaking, (data) => {
    console.log("Agent started speaking:", data["total_latency"]);
  });

  agent.on(AgentEvents.ConversationText, (message) => {
    console.log(`${message.role} said: ${message.content}`);
  });

  agent.on(AgentEvents.Audio, (audio) => {
    const buffer = Buffer.from(audio);
    audioBuffer = Buffer.concat([audioBuffer, buffer]);
  });

  agent.on(AgentEvents.Error, (error) => {
    console.error("Error:", error);
    console.error(err);
    console.error(err.message);
  });

  agent.on(AgentEvents.Close, () => {
    console.log("Connection closed");
  });
}
