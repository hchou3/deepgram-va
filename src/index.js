const {
  createClient,
  LiveTranscriptionEvents,
  AgentEvents,
} = require("@deepgram/sdk");

const fetch = require("cross-fetch");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DEEPGRAM_URL;

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function connectToVoice() {
  const agent = deepgram.agent();

  agent.on(AgentEvents.Open, () => {
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
          instructions:
            "You are a helpful AI assistant. Keep responses brief and friendly.",
        },
      },
    });
  });

  agent.on(AgentEvents.AgentStartedSpeaking, (data) => {
    console.log("Agent started speaking:", data["total_latency"]);
  });

  agent.on(AgentEvents.ConversationText, (message) => {
    console.log(`${message.role} said: ${message.content}`);
  });

  agent.on(AgentEvents.Audio, (audio) => {
    playAudio(audio);
  });

  agent.on(AgentEvents.Error, (error) => {
    console.error("Error:", error);
  });

  agent.on(AgentEvents.Close, () => {
    console.log("Connection closed");
  });

  function sendAudioData(audioData) {
    agent.send(audioData);
  }

  setInterval(() => {
    agent.keepAlive();
  }, 8000);
}
