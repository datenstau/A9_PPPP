const dgram = require('dgram')
const crypt = require('./crypt')

const adcpm = require('./adpcm')
const { EventEmitter } = require('stream')

const MCAM = 0xf1
const MDRW = 0xd1

const MSG_PUNCH = 0x41
const MSG_P2P_RDY = 0x42
const MSG_DRW = 0xd0
const MSG_DRW_ACK = 0xd1
const MSG_ALIVE = 0xe0
const MSG_ALIVE_ACK = 0xe1
const MSG_CLOSE = 0xf0

const TYPE_DICT = {}
TYPE_DICT[MSG_PUNCH] = 'MSG_PUNCH'
TYPE_DICT[MSG_P2P_RDY] = 'MSG_P2P_RDY'
TYPE_DICT[MSG_DRW] = 'MSG_DRW'
TYPE_DICT[MSG_DRW_ACK] = 'MSG_DRW_ACK'
TYPE_DICT[MSG_ALIVE] = 'MSG_ALIVE'
TYPE_DICT[MSG_ALIVE_ACK] = 'MSG_ALIVE_ACK'
TYPE_DICT[MSG_CLOSE] = 'MSG_CLOSE'

const CMD_CHECK_USER = 100
const CMD_GET_PARMS = 101
const CMD_DEV_CONTROL = 102
const CMD_GET_ALARM = 107
const CMD_STREAM = 111
const CMD_GET_WIFI = 112
const CMD_SCAN_WIFI = 113
const CMD_SET_WIFI = 114
const CMD_PTZ_CONTROL = 128
const CMD_TALK_SEND = 300
const CMD_SET_WHITELIGHT = 304
const CMD_GET_WHITELIGHT = 305
const CMD_GET_CLOUD_SUPPORT = 9000

const CMD_DICT = {}
CMD_DICT[CMD_CHECK_USER] = 'check_user'
CMD_DICT[CMD_GET_PARMS] = 'get_parms'
CMD_DICT[CMD_DEV_CONTROL] = 'dev_control'
CMD_DICT[CMD_GET_ALARM] = 'get_alarm'
CMD_DICT[CMD_STREAM] = 'stream'
CMD_DICT[CMD_GET_WIFI] = 'get_wifi'
CMD_DICT[CMD_SCAN_WIFI] = 'scan_wifi'
CMD_DICT[CMD_SET_WIFI] = 'set_wifi'
CMD_DICT[CMD_PTZ_CONTROL] = 'ptz_control'
CMD_DICT[CMD_TALK_SEND] = 'talk_send'
CMD_DICT[CMD_SET_WHITELIGHT] = 'set_whiteLight'
CMD_DICT[CMD_GET_WHITELIGHT] = 'get_whiteLight'
CMD_DICT[CMD_GET_CLOUD_SUPPORT] = 'get_cloudsupport'

class PPPP extends EventEmitter {
  constructor(options) {
    super()
    this.socket = dgram.createSocket('udp4')

    this.IP_DEBUG_MSG = null

    this.DRW_PACKET_INDEX = 0

    this.lastVideoFrame = -1
    this.videoBoundaries = new Set()
    this.videoReceived = []
    this.videoOverflow = false

    this.lastAudioFrame = -1

    this.isConnected = false
    this.punchCount = 0

    this.broadcastDestination=options.broadcastip,
    this.myIpAddressToBind=options.thisip

    this.socket.on('error', (err) => {
      console.log(`socket error:\n${err.stack}`)
      this.socket.close()
    })

    this.socket.on('listening', () => {
      const address = this.socket.address()
      console.log(`socket listening ${address.address}:${address.port}`)
      this.socket.setBroadcast(true)

      this.sendBroadcast()
    })

    this.socket.on('message', (msg, rinfo) => {
      let d = crypt.decrypt(msg)

      if (this.IP_DEBUG_MSG) {
        this.socket.send(d, 3300, IP_DEBUG_MSG)
      }

      let p = this.parsePacket(d)
      //console.log(TYPE_DICT[p.type], p.size, p.channel, p.index)
      if (p.type == MSG_DRW) {
        this.emit(
          'log',
          `Received ${TYPE_DICT[p.type]} size: ${p.size} channel: ${
            p.channel
          } index: ${p.index}`
        )
      } else {
        this.emit('log', `Received ${TYPE_DICT[p.type]} size: ${p.size}`)
      }

      //reply to MSG_PUNCH to establish connection
      if (p.type == MSG_PUNCH) {
        if (this.punchCount++ < 5) {
          this.socket.send(msg, rinfo.port, rinfo.address)
        }
      }

      if (p.type == MSG_P2P_RDY) {
        this.IP_CAM = rinfo.address
        this.PORT_CAM = rinfo.port

        if (!this.isConnected) {
          this.isConnected = true
          setTimeout(() => {
            this.emit('connected', {
              address: rinfo.address,
              port: rinfo.port,
            })
          }, 500)
        }
      }

      // reply to MSG_ALIVE
      if (p.type == MSG_ALIVE) {
        let buf = Buffer.alloc(4)
        buf.writeUint8(MCAM, 0)
        buf.writeUInt8(MSG_ALIVE_ACK, 1)
        buf.writeUint16BE(0, 2)

        // this.send(crypt.encrypt(buf).toString("hex"))
        this.sendEnc(buf)
      }

      //handle MSG_DRW
      if (p.type == MSG_DRW) {
        //send MSG_DRW_ACK
        let buf = Buffer.alloc(10)
        buf.writeUint8(MCAM, 0)
        buf.writeUint8(MSG_DRW_ACK, 1)
        buf.writeUInt16BE(6, 2)
        buf.writeUInt8(0xd1, 4)
        buf.writeUInt8(p.channel, 5)
        buf.writeUInt16BE(1, 6)
        buf.writeUInt16BE(p.index, 8)

        this.send(crypt.encrypt(buf).toString('hex'))
        this.send(crypt.encrypt(buf).toString('hex'))

        //handle CMD Response
        if (p.channel == 0) {
          if (0 == p.data.indexOf(Buffer.from('060a', 'hex'))) {
            let data = p.data.subarray(8)
            this.emit('cmd', data.toString('ascii'))
          }
        }

        //handle Video
        if (p.channel == 1) {
          //handle MSG_DRW packet index overflow
          if (p.index > 65400) {
            this.videoOverflow = true
            // console.log('Overflow incoming...')
          }

          if (this.videoOverflow && p.index < 65400) {
            this.lastVideoFrame = -1
            this.videoOverflow = false
            this.videoBoundaries.clear()
            this.videoReceived = []
            // console.log('Overflow handled!')
          }

          if (0 === p.data.indexOf(Buffer.from('55aa15a80300', 'hex'))) {
            this.videoReceived[p.index] = p.data.subarray(0x20)
            this.videoBoundaries.add(p.index)
            // console.log('Got boundary for video', p.index)
            // console.log('Boundaries:', this.videoBoundaries)
            // visualize()
          } else {
            this.videoReceived[p.index] = p.data
          }
          this.getVideoFrame()
        }

        //handle audio
        if (p.channel == 2) {
          if (this.lastAudioFrame < p.index) {
            let raw
            if (0 === p.data.indexOf(Buffer.from('55aa15a8aa01', 'hex'))) {
              raw = p.data.subarray(0x20)
              // visualize()
            } else {
              raw = p.data
            }

            let decoded = adcpm.decode(raw)
            this.lastAudioFrame = p.index

            this.emit('audioFrame', { frame: decoded, packetIndex: p.index })
          }
        }
      }
    })

    let bindOptions = {}
    if (this.myIpAddressToBind){
      bindOptions.address = this.myIpAddressToBind
    }
    console.log("bind options:"+bindOptions)
    this.socket.bind(bindOptions)
  }

  setDebugIp(ip) {
    this.IP_DEBUG_MSG = ip
  }

  sendBroadcast() {
    const message = Buffer.from('2cba5f5d', 'hex')

    this.socket.send(message, 32108, this.broadcastDestination)
    console.log('broadcast Message sent.')

    if (!this.isConnected && this.punchCount == 0) {
      setTimeout(this.sendBroadcast.bind(this), 100)
    }
  }

  sendEnc(msg) {
    let message
    if (msg instanceof Buffer) {
      message = msg
    } else {
      message = Buffer.from(msg, 'hex')
    }

    this.send(crypt.encrypt(message))
  }

  send(msg) {
    let message
    if (msg instanceof Buffer) {
      message = msg
    } else {
      message = Buffer.from(msg, 'hex')
    }
    this.socket.send(message, this.PORT_CAM, this.IP_CAM)

    if (this.IP_DEBUG_MSG) {
      this.socket.send(crypt.decrypt(message), 3301, this.IP_DEBUG_MSG)
    }
  }

  sendCMDPacket(msg) {
    let data
    if (msg instanceof Buffer) {
      data = msg
    } else {
      data = Buffer.from(msg, 'ascii')
    }
    let buf = Buffer.alloc(data.length + 8)
    buf.writeUInt8(0x06, 0)
    buf.writeUInt8(0x0a, 1)
    buf.writeUInt8(0xa0, 2)
    buf.writeUInt8(0x80, 3)
    buf.writeUInt32LE(data.length, 4)

    data.copy(buf, 8)
    this.sendDRWPacket(0, buf)
    this.emit('log', `CMD sent: ${data.toString('ascii')}`)
  }

  sendDRWPacket(channel, data) {
    let buf = Buffer.alloc(data.length + 8)
    buf.writeUint8(MCAM, 0)
    buf.writeUint8(MSG_DRW, 1)
    buf.writeUInt16BE(data.length + 4, 2)
    buf.writeUInt8(MDRW, 4)
    buf.writeUInt8(channel, 5)
    buf.writeUInt16BE(this.DRW_PACKET_INDEX++, 6)
    data.copy(buf, 8)

    this.sendEnc(buf)
  }

  sendCommand(command, args) {
    let fixed_data = {
      user: 'admin',
      pwd: '6666',
      devmac:'0000'
    }
  /* incorrect password:
  {
        "cmd":  ...,
        "result":       -3
  }

  incorrect user name: (or password field missing):
  {
        "cmd":  ...,
        "result":       -1
}*/



    let data = {
      pro: CMD_DICT[command],
      cmd: command
    }

    this.sendCMDPacket(JSON.stringify({ ...data, ...args, ...fixed_data}))
  }

  sendCMDCheckUser() {
    this.sendCommand(CMD_CHECK_USER);
  }

  sendCMDrequestVideo1() {
    //"1080p" "HD" with 640x480
    this.sendCommand(CMD_STREAM, { video: 1 });
  }

  sendCMDrequestVideo2() {
    //"720p" "HD" with 320x240
    this.sendCommand(CMD_STREAM, { video: 2 });
  }

  sendCMDrequestAudio() {
    //Strange ADPCM format
    this.sendCommand(CMD_STREAM, { audio: 1 });
  }

  sendCMDsetWifi(ssid, pw) {
    this.sendCommand(CMD_SET_WIFI, {
      wifissid: ssid,
      encwifissid: ssid,
      wifipwd: pw,
      encwifipwd: pw,
      encryption: 1
    });
  }

  sendCMDscanWifi() {
    this.sendCommand(CMD_SCAN_WIFI);
  }

  sendCMDgetWifi() {
    this.sendCommand(CMD_GET_WIFI);
  }

  sendCMDgetParams() {
    this.sendCommand(CMD_GET_PARMS);

    /* returns e.g.
    {
        "cmd":  101,
        "result":       0,
        "tz":   -8,
        "time": 1699397280,
        "icut": 0,
        "batValue":     90,
        "batStatus":    1,
        "sysver":       "HQLS_HK66_DP_20230802 20:08:13",
        "mcuver":       "1.1.1.1",
        "isShow4KMenu": 0,
        "isShowIcutAuto":       1,
        "rotmir":       0,
        "signal":       100,
        "lamp": 0
}
    */
  }

  sendCMDIr(isOn) {
    this.sendCommand(CMD_DEV_CONTROL, { icut: isOn ? 1 : 0});
  }

  sendCMDTalkSend() {
    // it is unclear for me what this really does
    this.sendCommand(CMD_TALK_SEND, { isSend: 1 });

    /*
    returns like:
    {
        "cmd":  300,
        "result":       0
    }
    */
  }


  sendCMDGetWhiteLight() {
    this.sendCommand(CMD_GET_WHITELIGHT);
  }

  sendCMDSetWhiteLight(isOn) {
    this.sendCommand(CMD_SET_WHITELIGHT, { status: isOn ? 1 : 0});
  }

  sendCMDHeartBeat() {
    this.sendCommand(CMD_DEV_CONTROL, { heart: 1 });
  }

  sendCMDGetDeviceFirmwareInfo() {
    this.sendCommand(CMD_GET_CLOUD_SUPPORT);

      /*
      the command name is a mis-nomer. this is more like TF card support,
      firmware version and flashability. Returns something like:
      {
        "cmd":  9000,
        "result":       0,
        "flashOrTf":    1,
        "uploadType":   0,
        "isExistTf":    0,
        "productName":  "HQLS_HK66_DP230802",
        "fwVer":        10000,
        "supportNewUp": 1
    }
    */
  }

  sendCMDGetAlarm() {
    this.sendCommand(CMD_GET_ALARM);

    /*
    Returns something like:
    {
        "cmd":  107,
        "result":       0,
        "pirenable":    0,
        "pirsensitive": 3,
        "pirvideo":     0,
        "pirPush":      0,
        "pirvideotime": 10,
        "pirDelayTime": 120,
        "AalarmInterval":       2,
        "pirCloudUpCount":      50
    }
    */
  }

  // direction == 0..7:
  // 0 = start motor in A axis
  // 1 = stop motor in A axis
  // etc
  sendCMDPtzControl(direction) {
    this.sendCommand(CMD_PTZ_CONTROL, { parms: 0, value: direction});
  }

  sendCMDReboot() {
    this.sendCommand(CMD_DEV_CONTROL, { reboot: 1});
  }

  sendCMDReset() {
    this.sendCommand(CMD_DEV_CONTROL, { reset: 1});
  }

  parsePacket(buff) {
    let buf, magic1, type, size, magic2, channel, index, data
    try {
      buf = Buffer.from(buff)
      magic1 = buf.readUInt8(0)
      type = buf.readUInt8(1)
      size = buf.readUInt16BE(2)
      magic2 = buf.readUInt8(4)
      channel = buf.readUInt8(5)
      index = buf.readUInt16BE(6)
      data = buf.subarray(8)
    } catch (e) {}

    return {
      magic1,
      type,
      size,
      magic2,
      channel,
      index,
      data,
    }
  }

  getVideoFrame() {
    if (this.videoBoundaries.size <= 1) {
      return
    }
    let array = Array.from(this.videoBoundaries).sort((a, b) => a - b)
    let index = array[array.length - 2]
    let lastIndex = array[array.length - 1]

    if (index == this.lastVideoFrame) {
      return
    }

    let complete = true
    let out = []
    let completeness = ''
    for (let i = index; i < lastIndex; i++) {
      if (this.videoReceived[i] !== undefined) {
        out.push(this.videoReceived[i])
        completeness += 'x'
      } else {
        complete = false
        completeness += '_'
      }
    }

    // console.log(completeness)
    if (complete) {
      /*console.log(
        `------------>>>>>> GOT VIDEO FRAME FROM ${index} to ${lastIndex}`
      )
      */
      this.lastVideoFrame = index
      this.emit('videoFrame', { frame: Buffer.concat(out), packetIndex: index })

      //free ram where videoRecieved[<index]
      for (let i = 0; i < index; i++) {
        this.videoReceived[i] = undefined
      }
    }
  }

  destroy() {
    this.sendEnc(Buffer.from([MCAM, MSG_CLOSE, 0, 0]))
    this.sendEnc(Buffer.from([MCAM, MSG_CLOSE, 0, 0]))
    this.sendEnc(Buffer.from([MCAM, MSG_CLOSE, 0, 0]))

    this.socket.unref()
  }
}

module.exports = PPPP
