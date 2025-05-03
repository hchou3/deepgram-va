const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");

const fetch = require("cross-fetch");
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DEEPGRAM_URL;

const stream = async () => {
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
  const connection = deepgram.listen.live({
    model: "nova-3",
    language: "en-US",
    smart_format: true,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log("Connection closed");
    });
    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      console.log(data.channel.alternatives[0].transcript);
    });
    connection.on(LiveTranscriptionEvents.Metadata, (data) => {
      console.log(data);
    });
    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error("Error:", error);
    });

    fetch(url)
      .then((r) => r.body)
      .then((res) => {
        res.on("readable", () => {
          connection.send(res.read());
        });
      });
  });
};

stream();
