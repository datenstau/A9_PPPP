const Speaker = require("speaker");
const speaker = new Speaker({
  channels: 1, // 2 channels
  bitDepth: 16, // 16-bit samples
  sampleRate: 8000, // 44,100 Hz sample rate
});

module.exports = speaker;
