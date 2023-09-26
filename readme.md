# HDWiFiCam Pro (DGOA/DGOC WiFi Prefix) JS-Api

Thanks to all the people in this [Home Assistant Community](https://community.home-assistant.io/t/popular-a9-mini-wi-fi-camera-the-ha-challenge/230108) thread.

This code is tested for a cheap WiFi cam with software version "A9_IPC_20220506 10:41:05" and the "HB3_V0.3D210726" marking on the PCB.
This Camera opens a WiFi Access Point with the "DGOA", "DGOC" prefix and works with the HDWiFiCam Pro App.

![HB3_V0.3D210726](camera.jpg 'HB3_V0.3D210726')

This Camera uses the [PPPP-Protocol](https://github.com/pmarrapese/iot/tree/f02b4d7e143a369d87c40dfe80944366d1113b81/p2p/dissector) with some sort of "propietary XOR encryption".
Actual Commands to the Camera are JSON embedded in a custom Payload header in the MSG_DRW packets.

Video is received as MJPEG stream, the audio samples are [ADPCM](https://github.com/jwzhangjie/Adpcm_Pcm/blob/master/adpcm.c) encoded.

## Usage

The `run.js` starts a webserver on port 3000 wich serves the mjpeg data.
The `run_with_audio.js` additionally plays audio using the npm plugin [speaker](https://www.npmjs.com/package/speaker).

**If you have the "DGOC" prefix, you may need to edit the pppp.js file.**
if your run.js dosent connect ('Broadcast message sent' line on screen that just repeats) =>
in pppp.js change Line 193 '255.255.255.255' to '192.168.0.255'
