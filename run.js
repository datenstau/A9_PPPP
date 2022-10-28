const PPPP = require('./pppp')

const p = new PPPP()

p.on('connected', (data) => {
  console.log('connected!', data)
  p.sendCMDrequestVideo1()
})

p.on('videoFrame', (videoFrame) => {
  // console.log(videoFrame)
  let s = '--xxxxxxkkdkdkdkdkdk__BOUNDARY\r\n'
  s += 'Content-Type: image/jpeg\r\n\r\n'
  videoStream.write(Buffer.from(s))
  videoStream.write(videoFrame.frame)
})

p.on('cmd', console.log)

//http server with mjpeg
const PassThrough = require('stream').PassThrough
var videoStream = new PassThrough()

const http = require('http')
const server = http.createServer((req, res) => {
  if (req.url === '/v.mjpg') {
    res.setHeader(
      'Content-Type',
      'multipart/x-mixed-replace; boundary="xxxxxxkkdkdkdkdkdk__BOUNDARY"'
    )
    videoStream.pipe(res)
  } else if (req.url === '/') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!DOCTYPE html>\r\n<http><head></head><body><img src="/v.mjpg"></body></html>'
    )
  }
})

server.listen(3000)

process.on('SIGINT', () => {
  server.close()
  server.unref()
  p.destroy()

  setTimeout(() => {
    console.log('exiting.')
    process.exit()
  }, 1000)
})
