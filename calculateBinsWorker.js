const { parentPort, workerData } = require("worker_threads");

const MIN_RADIANCE = 10000;
const SMALLEST_BIN_AREA = 8 * 8;

const luminance = (r, g, b) => r * 0.2125 + g * 0.7154 + b * 0.0721;

const calculateBins = (data, width, height) => {
  const radiance = (x, y) => {
    let r = data[y * width * 3 + x * 3] || 0;
    let g = data[y * width * 3 + x * 3 + 1] || 0;
    let b = data[y * width * 3 + x * 3 + 2] || 0;

    return luminance(r, g, b);
  };

  // algorithm from http://karim.naaji.fr/environment_map_importance_sampling.html
  const processBins = (bins, radiancePrev, x0, y0, x1, y1) => {
    let w = x1 - x0;
    let h = y1 - y0;

    if (radiancePrev <= MIN_RADIANCE || w * h < SMALLEST_BIN_AREA) {
      bins.push([x0, y0, x1, y1]);
      return;
    }

    let verticalSplit = w > h;
    let xSplit = verticalSplit ? w / 2 + x0 : x1;
    let ySplit = verticalSplit ? y1 : h / 2 + y0;

    let radianceCurr = 0;

    for (let x = x0; x < xSplit; x++) {
      for (let y = y0; y < ySplit; y++) {
        radianceCurr += radianceCache[y * width + x];
      }
    }

    processBins(bins, radianceCurr, x0, y0, xSplit, ySplit);

    let radianceNew = radiancePrev - radianceCurr;

    if (verticalSplit) {
      processBins(bins, radianceNew, xSplit, y0, x1, y1);
    } else {
      processBins(bins, radianceNew, x0, ySplit, x1, y1);
    }
  };

  let radianceCache = [];

  let imageRadiance = 0;
  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      let pixelRadiance = radiance(x, y);
      radianceCache[y * width + x] = pixelRadiance;

      imageRadiance += pixelRadiance;
    }
  }

  const bins = [];
  processBins(bins, imageRadiance, 0, 0, width, height);

  return bins;
};

const bins = calculateBins(
  workerData.data,
  workerData.width,
  workerData.height
);

parentPort.postMessage(bins);
