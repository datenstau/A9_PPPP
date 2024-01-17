const commander = require('commander')

commander
.version('1.0.0', '-v, --version')
.usage('[OPTIONS]...')
.option('-p, --port <value>', 'port number to use, default 3000', 3000)
.option('-t, --thisip <value>','IP of the interface to bind')
.option('-b, --broadcastip <value>','IP of the interface to bind','255.255.255.255')
.option('-a, --audio', 'Run with audio tunneling support (requires "speaker" npm package')
.option('-r, --reconnect', 'Automatically restart the connection once disconnected')
.option('-pw, --password <value>', 'Require a password as a ?pw= query parameter to use the webserver')
.option('-e, --eval', 'eval mode, WARNING ⚠️ DO NOT USE THIS IN PRODUCTION')
.parse(process.argv);

const options = commander.opts()
console.log(options)
const PPPP = require('./pppp')
if (options.audio) {
  const speaker = require('./speaker')
}

let p = null

function setupPPPP() {
  if (p) {
    console.log('pppp was already open, closing...')
    p.destroy()
    p = null
  }
  p = new PPPP(options)

  p.on('log', console.log)

  p.on('connected', (address, port) => {
    console.log(`Connected to camera at ${address}:${port}`)
    setTimeout(p.sendCMDgetParams.bind(p), 1000)
    if (options.audio) {
      setTimeout(p.sendCMDrequestAudio.bind(p), 200)
    }
    setTimeout(p.sendCMDrequestVideo1.bind(p), 100)
  })

  p.on('disconnected', (address, port) => {
    console.log(`Disconnected from camera at ${address}:${port}`)
    if (options.reconnect) {
      console.log("Reconnecting ...")
      setupPPPP()
    }
  })

  p.on('audioFrame', (audioFrame) => {
    if (options.audio) {
      speaker.write(audioFrame.frame)
    }
    // console.log(audioFrame)
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
var url = require('url')
var path = require('path')
const querystring = require('querystring')
const server = http.createServer((req, res) => {
  try {
    if (req.url === '/favicon.ico') return
    console.log('[' + req.socket.remoteAddress + '] ' + req.method + ': ' + req.url)
    const purl = url.parse(req.url); // console.log(purl)
    const ppath = path.parse(purl.pathname); // console.log(ppath)
    const query  = querystring.parse(purl.query); //  console.log(query)
    if (options.password) {
      if (query['pw'] !== options.password) {
        res.statusCode = 403
        res.end(JSON.stringify({message: 'invalid password' }))
        return
      }
    }
    if (req.url === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(
        '<!DOCTYPE html>\r\n<http><head></head><body><img src="/v.mjpg"></body></html>'
      )
    } else if (req.url === '/v.mjpg') {
      res.setHeader(
        'Content-Type',
        'multipart/x-mixed-replace; boundary="xxxxxxkkdkdkdkdkdk__BOUNDARY"'
      )
      videoStream.pipe(res)
    } else if (req.url === '/exit') {
      process.exit()
    } else if (req.url === '/reconnect') {
      setupPPPP()
    } else if (purl.pathname.startsWith('/func/')) { // WARNING ⚠️ DO NOT USE THIS IN PRODUCTION
      if (!options.eval) {
        res.statusCode = 403
        res.end(JSON.stringify({message: 'eval mode is disabled 🙄'}))
        return
      }
      let name = ppath.base
      let args = ""
      for (let e in query) {
        if (args.length > 0) {
          args += ','
        }
        args += e + "=" + query[e]
      }
      let eval_str = `p.${name}(${args})`
      console.log(eval_str)
      let ret = eval(eval_str)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({message: 'ok', result: ret}))
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({message: 'not found'}))
    }
  } catch (e) {
    console.log(e)
    res.statusCode = 500
    res.end(JSON.stringify({message: e.message, error: e}))
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
