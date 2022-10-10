var HDR = require("hdr");
const fs = require("fs");
const Jimp = require("jimp");
const { rgbaToInt } = require("jimp");
const { Worker } = require("worker_threads");

file = fs.createReadStream("modern_buildings_2_2k.hdr");
let a = 0xff;
let data, width, height;
var hdrloader = new HDR.loader();

const resize = (data, width, height, step = 4) => {
  let newData = [];
  let newWidth = width / step;
  let newHeight = height / step;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let avgR = 0;
      let avgG = 0;
      let avgB = 0;

      for (let neighbor = 0; neighbor < step; neighbor++) {
        let r = data[y * width * 3 + 3 * (x + neighbor)];
        let g = data[y * width * 3 + 3 * (x + neighbor) + 1];
        let b = data[y * width * 3 + 3 * (x + neighbor) + 2];

        avgR += r;
        avgG += g;
        avgB += b;
      }

      avgR /= step;
      avgG /= step;
      avgB /= step;

      newData.push(avgR, avgG, avgB);
    }
  }

  return {
    data: newData,
    width: newWidth,
    height: newHeight,
  };
};

hdrloader.on("load", function () {
  data = this.data;
  width = this.width;
  height = this.height;

  let resizeFactor = Math.max(1, width / 1024);

  let resized = resize(data, width, height, resizeFactor);

  const worker = new Worker("./calculateBinsWorker.js", {
    workerData: resized,
  });

  let now = performance.now();

  worker.on("message", (bins) => {
    console.log(
      "Generated " +
        bins.length +
        " bins in " +
        (performance.now() - now).toFixed(2) +
        " ms"
    );

    bins = bins.map(([x0, y0, x1, y1]) => [
      x0 * resizeFactor,
      y0 * resizeFactor,
      x1 * resizeFactor,
      y1 * resizeFactor,
    ]);

    let randomSamples = Array(256)
      .fill(undefined)
      .map(() => {
        let [x0, y0, x1, y1] =
          bins[Math.round(Math.random() * (bins.length - 1))];

        let x = (x1 - x0) * Math.random();
        let y = (y1 - y0) * Math.random();

        return [Math.round(x0 + x), Math.round(y0 + y)];
      });

    new Jimp(width, height, (err, image) => {
      if (err) throw err;

      for (let y = 0; y <= height; y++) {
        for (let x = 0; x <= width; x++) {
          let r = data[y * width * 3 + x * 3];
          let g = data[y * width * 3 + x * 3 + 1];
          let b = data[y * width * 3 + x * 3 + 2];

          if (r > 1) r = 1;
          if (g > 1) g = 1;
          if (b > 1) b = 1;

          r = Math.floor(r ** (1 / 2.2) * 0xff);
          g = Math.floor(g ** (1 / 2.2) * 0xff);
          b = Math.floor(b ** (1 / 2.2) * 0xff);

          let hex = rgbaToInt(r, g, b, a);

          markBinLoop: for (let [x0, y0, x1, y1] of bins) {
            if (
              ((Math.abs(x - x0) < 3 || Math.abs(x - x1) < 3) &&
                y >= y0 &&
                y <= y1) ||
              ((Math.abs(y - y0) < 3 || Math.abs(y - y1) < 3) &&
                x >= x0 &&
                x <= x1)
            ) {
              hex = 0xff0000ff;
              break markBinLoop;
            }
          }

          randomSampleLoop: for (let [rX, rY] of randomSamples) {
            if (((x - rX) ** 2 + (y - rY) ** 2) ** 0.5 < 4) {
              hex = 0x0000ffff;
              break randomSampleLoop;
            }
          }

          image.setPixelColor(hex, x, y);
        }
      }

      image.write("output.png", (err) => {
        if (err) throw err;

        console.log("Saved output.png");
      });
    });
  });
});

file.pipe(hdrloader);
