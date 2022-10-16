const fs = require("fs");
//https://github.com/jwzhangjie/Adpcm_Pcm/blob/master/adpcm.c
const indexTable = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const stepsizeTable = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
];



function decode(indata) {
  let stateIndex = 0;
  let stateValpred = stepsizeTable[stateIndex];

  let inbuf = Buffer.from(indata);
  let outbuf = Buffer.alloc(inbuf.length * 2 * 2);

  let inp = 0; /* Input buffer pointer */
  let outp = 0; /* output buffer pointer */
  let sign = 0; /* Current adpcm sign bit */

  let delta = 0; /* Current adpcm output value */
  let step = 0; /* Stepsize */
  let valpred = 0; /* Predicted value */
  let vpdiff = 0; /* Current change to valpred */
  let index = 0; /* Current step change index */
  let inputbuffer = 0; /* place to keep next 4-bit value */
  let bufferstep = false; /* toggle between inputbuffer/input */

  valpred = stateValpred;
  index = stateIndex;
  step = stepsizeTable[index];

  let len = inbuf.length * 2;

  for (; len > 0; len--) {
    /* Step 1 - get the delta value */
    if (bufferstep) {
      delta = inputbuffer & 0xf;
    } else {
      inputbuffer = inbuf.readUInt8(inp++);
      delta = (inputbuffer >> 4) & 0xf;
    }
    bufferstep = !bufferstep;

    /* Step 2 - Find new index value (for later) */
    index += indexTable[delta];
    if (index < 0) index = 0;
    if (index > 88) index = 88;

    /* Step 3 - Separate sign and magnitude */
    sign = delta & 8;
    delta = delta & 7;

    /* Step 4 - Compute difference and new predicted value */
    /*
     ** Computes 'vpdiff = (delta+0.5)*step/4', but see comment
     ** in adpcm_coder.
     */
    vpdiff = step >> 3;
    if (delta & 4) vpdiff += step;
    if (delta & 2) vpdiff += step >> 1;
    if (delta & 1) vpdiff += step >> 2;

    if (sign) valpred -= vpdiff;
    else valpred += vpdiff;

    /* Step 5 - clamp output value */
    if (valpred > 32767) valpred = 32767;
    else if (valpred < -32768) valpred = -32768;

    /* Step 6 - Update step value */
    step = stepsizeTable[index];

    /* Step 7 - Output value */
    // * outp++ = valpred;

    outbuf.writeInt16LE(valpred, 2 * outp++);
    // console.log(outbuf.length, outp);
  }

  stateValpred = valpred;
  stateIndex = index;

  return outbuf;
}

if (require.main === module) {
  let filenameIn = process.argv[2];
  let filenameOut = process.argv[3];

  if (!filenameIn || !filenameOut) {
    console.log("Usage: node adcpm.js infile outfile");
    return;
  }

  let file = fs.readFileSync(filenameIn);

  let chunks = [];
  for (let i = 0; i < file.length; i += 320) {
    let end = Math.min(i + 320, file.length);
    let buf = file.subarray(i, end);
    let d = decode(buf);
    chunks.push(d);
  }

  fs.writeFileSync(filenameOut, Buffer.concat(chunks));
}

module.exports = {
  decode,
  reset: () => {
    stateIndex = 0;
    stateValpred = 0;
  },
};
