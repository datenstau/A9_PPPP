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

const pages = {
  "Embedded Video": "/v",
  "Raw Video": "/v.mjpg",
}
const endpoints = {
  "Reconnect": "/reconnect",
  "Reboot": "/func/sendCMDReboot",
  "Light on": "/func/sendCMDSetWhiteLight?isOn=true",
  "Light off": "/func/sendCMDSetWhiteLight?isOn=false",
  "IR on": "/func/sendCMDIr?isOn=true",
  "IR off": "/func/sendCMDIr?isOn=false",
  "Lamp on": "/func/sendCMDLamp?isOn=true",
  "Lamp off": "/func/sendCMDLamp?isOn=false",
  "Rotate up start": "/func/sendCMDPtzControl?direction=0",
  "Rotate up end": "/func/sendCMDPtzControl?direction=1",
  "Rotate down start": "/func/sendCMDPtzControl?direction=2",
  "Rotate down end": "/func/sendCMDPtzControl?direction=3",
  "Rotate left start": "/func/sendCMDPtzControl?direction=4",
  "Rotate left end": "/func/sendCMDPtzControl?direction=5",
  "Rotate rightstart": "/func/sendCMDPtzControl?direction=6",
  "Rotate right end": "/func/sendCMDPtzControl?direction=7",
  "Rotate reset": "/func/sendCMDPtzReset"
}

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

  p.on('error', (err) => {
    console.log(`socket error: ${err}`)
  })

  p.on('cmd', console.log)
}

setupPPPP()

function makeUrl(uri, params) {
  const newUrl = ""
  for (let key in params) {
    if (params.hasOwnProperty(key)) {
      if (newUrl.length > 0) {
        newUrl += '&'
      }
      newUrl += key + '=' + params[key]
    }
  }
  return uri + '?' + newUrl
}

function makeNavItem(url, text) {
  return `<li class="nav-item"><a class="nav-link" href="${url}">${text}</a></li>`
}
function makeButton(url) {
  return `<button onclick="window.location.href='${url}';">${text}</button>`
}

//http server with mjpeg
const PassThrough = require('stream').PassThrough
var videoStream = new PassThrough()

const http = require('http')
const fs = require('fs')
var url = require('url')
var path = require('path')
const querystring = require('querystring')
const server = http.createServer((req, res) => {
  try {
    if (req.url === '/favicon.ico') return
    console.log('[' + req.socket.remoteAddress + '] ' + req.method + ': ' + req.url)
    const purl = url.parse(req.url); // console.log(purl)
    const ppath = path.parse(purl.pathname); // console.log(ppath)
    const query  = querystring.parse(purl.query); // console.log(query)
    if (options.password) {
      if (query['pw'] !== options.password) {
        res.statusCode = 403
        res.end(JSON.stringify({message: 'invalid password' }))
        return
      }
    }
    if (purl.pathname === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      let content = fs.readFileSync("index.html", "utf-8");
      navitems = ""
      for (let key in pages) {
        if (pages.hasOwnProperty(key)) {
          navitems += makeNavItem(makeUrl(pages[key], query), key)
        }
      }
      content = content.replace("{{navitems}}", navitems)
      buttons = ""
      for (let key in endpoints) {
        if (endpoints.hasOwnProperty(key)) {
          buttons += makeButton(makeUrl(endpoints[key], query), key)
        }
      }
      content = content.replace("{{buttons}}", buttons)
      res.end(content)
    } else if (req.url === '/v') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(
        '<!DOCTYPE html>\r\n<http><head></head><body><img src="/v.mjpg"></body></html>'
      )
    } else if (purl.pathname === '/v.mjpg') {
      res.setHeader(
        'Content-Type',
        'multipart/x-mixed-replace; boundary="xxxxxxkkdkdkdkdkdk__BOUNDARY"'
      )
      videoStream.pipe(res)
    } else if (purl.pathname === '/exit') {
      process.exit()
    } else if (purl.pathname === '/reconnect') {
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
        if (e === "pw") continue;
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
