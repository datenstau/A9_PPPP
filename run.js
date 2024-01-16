const commander = require('commander')

commander
.version('1.0.0', '-v, --version')
.usage('[OPTIONS]...')
.option('-p, --port <value>', 'port number to use, default 3000', 3000)
.option('-t, --thisip <value>','IP of the interface to bind')
.option('-b, --broadcastip <value>','IP of the interface to bind','255.255.255.255')
.parse(process.argv);

const options = commander.opts()
console.log(options)
const PPPP = require('./pppp')

let p = null

function setupPPPP() {
  p = new PPPP(options)

  p.on('log', console.log)

  p.on('connected', (address, port) => {
    console.log(`Connected to camera at ${address}:${port}`)
    setTimeout(() => {
      p.sendCMDgetParams()
    }, 1000, p)
    // p.sendCMDGetDeviceFirmwareInfo()
    p.sendCMDrequestVideo1()
  })

  p.on('disconnected', (address, port) => {
    console.log(`Disconnected from camera at ${address}:${port}`)

  })

  p.on('videoFrame', (videoFrame) => {
    // console.log(videoFrame)
    let s = '--xxxxxxkkdkdkdkdkdk__BOUNDARY\r\n'
    s += 'Content-Type: image/jpeg\r\n\r\n'
    videoStream.write(Buffer.from(s))
    videoStream.write(videoFrame.frame)
  })

  p.on('cmd', console.log)
}

setupPPPP()


//http server with mjpeg
const PassThrough = require('stream').PassThrough
var videoStream = new PassThrough()

const http = require('http')
const server = http.createServer((req, res) => {
  if (req.url === '/favicon.ico') return
  console.log('[' + req.socket.remoteAddress + '] ' + req.method + ': ' + req.url)
  if (req.url === '/v.mjpg') {
    res.setHeader(
      'Content-Type',
      'multipart/x-mixed-replace; boundary="xxxxxxkkdkdkdkdkdk__BOUNDARY"'
    )
    videoStream.pipe(res)
  } else if (req.url === '/wifi') {
    p.sendCMDgetWifi();
    res.end('test')
  } else if (req.url === '/iron') {
    p.sendCMDIr(1);
    res.end('iron')
  } else if (req.url === '/iroff') {
    p.sendCMDIr(0);
    res.end('iroff')
  } else if (req.url === '/lampon') {
    p.sendCMDLamp(1);
    res.end('lampon')
  } else if (req.url === '/lampoff') {
    p.sendCMDLamp(0);
    res.end('lampoff')
  } else if (req.url === '/lighton') {
    p.sendCMDSetWhiteLight(true);
    res.end('lighton')
  } else if (req.url === '/lightoff') {
    p.sendCMDSetWhiteLight(false);
    res.end('lightoff')
  } else if (req.url === '/reset') {
    p.sendCMDReset();
    res.end('reset')
  } else if (req.url === '/reboot') {
    p.sendCMDReboot();
    res.end('reboot')
  } else if (req.url === '/ptz') {
    p.sendCMDPtzReset();
    res.end('ptz')
  } else if (req.url === '/params') {
    p.sendCMDgetParams();
    res.end('params')
  } else if (req.url === '/fw') {
    p.sendCMDGetDeviceFirmwareInfo();
    res.end('fw')
  }  else if (req.url === '/') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!DOCTYPE html>\r\n<http><head></head><body><img src="/v.mjpg"></body></html>'
    )
  }
})

server.listen(options.port)

process.on('SIGINT', () => {
  server.close()
  server.unref()
  p.destroy()

  setTimeout(() => {
    console.log('exiting.')
    process.exit()
  }, 1000)
})
