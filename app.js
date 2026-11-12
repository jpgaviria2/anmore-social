var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod2) => function __require() {
  return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// node_modules/qrcode/lib/can-promise.js
var require_can_promise = __commonJS({
  "node_modules/qrcode/lib/can-promise.js"(exports, module) {
    module.exports = function() {
      return typeof Promise === "function" && Promise.prototype && Promise.prototype.then;
    };
  }
});

// node_modules/qrcode/lib/core/utils.js
var require_utils = __commonJS({
  "node_modules/qrcode/lib/core/utils.js"(exports) {
    var toSJISFunction;
    var CODEWORDS_COUNT = [
      0,
      // Not used
      26,
      44,
      70,
      100,
      134,
      172,
      196,
      242,
      292,
      346,
      404,
      466,
      532,
      581,
      655,
      733,
      815,
      901,
      991,
      1085,
      1156,
      1258,
      1364,
      1474,
      1588,
      1706,
      1828,
      1921,
      2051,
      2185,
      2323,
      2465,
      2611,
      2761,
      2876,
      3034,
      3196,
      3362,
      3532,
      3706
    ];
    exports.getSymbolSize = function getSymbolSize(version) {
      if (!version) throw new Error('"version" cannot be null or undefined');
      if (version < 1 || version > 40) throw new Error('"version" should be in range from 1 to 40');
      return version * 4 + 17;
    };
    exports.getSymbolTotalCodewords = function getSymbolTotalCodewords(version) {
      return CODEWORDS_COUNT[version];
    };
    exports.getBCHDigit = function(data) {
      let digit = 0;
      while (data !== 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    };
    exports.setToSJISFunction = function setToSJISFunction(f) {
      if (typeof f !== "function") {
        throw new Error('"toSJISFunc" is not a valid function.');
      }
      toSJISFunction = f;
    };
    exports.isKanjiModeEnabled = function() {
      return typeof toSJISFunction !== "undefined";
    };
    exports.toSJIS = function toSJIS(kanji) {
      return toSJISFunction(kanji);
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-level.js
var require_error_correction_level = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-level.js"(exports) {
    exports.L = { bit: 1 };
    exports.M = { bit: 0 };
    exports.Q = { bit: 3 };
    exports.H = { bit: 2 };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "l":
        case "low":
          return exports.L;
        case "m":
        case "medium":
          return exports.M;
        case "q":
        case "quartile":
          return exports.Q;
        case "h":
        case "high":
          return exports.H;
        default:
          throw new Error("Unknown EC Level: " + string);
      }
    }
    exports.isValid = function isValid(level) {
      return level && typeof level.bit !== "undefined" && level.bit >= 0 && level.bit < 4;
    };
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/bit-buffer.js
var require_bit_buffer = __commonJS({
  "node_modules/qrcode/lib/core/bit-buffer.js"(exports, module) {
    function BitBuffer() {
      this.buffer = [];
      this.length = 0;
    }
    BitBuffer.prototype = {
      get: function(index) {
        const bufIndex = Math.floor(index / 8);
        return (this.buffer[bufIndex] >>> 7 - index % 8 & 1) === 1;
      },
      put: function(num, length) {
        for (let i2 = 0; i2 < length; i2++) {
          this.putBit((num >>> length - i2 - 1 & 1) === 1);
        }
      },
      getLengthInBits: function() {
        return this.length;
      },
      putBit: function(bit) {
        const bufIndex = Math.floor(this.length / 8);
        if (this.buffer.length <= bufIndex) {
          this.buffer.push(0);
        }
        if (bit) {
          this.buffer[bufIndex] |= 128 >>> this.length % 8;
        }
        this.length++;
      }
    };
    module.exports = BitBuffer;
  }
});

// node_modules/qrcode/lib/core/bit-matrix.js
var require_bit_matrix = __commonJS({
  "node_modules/qrcode/lib/core/bit-matrix.js"(exports, module) {
    function BitMatrix(size) {
      if (!size || size < 1) {
        throw new Error("BitMatrix size must be defined and greater than 0");
      }
      this.size = size;
      this.data = new Uint8Array(size * size);
      this.reservedBit = new Uint8Array(size * size);
    }
    BitMatrix.prototype.set = function(row, col, value, reserved) {
      const index = row * this.size + col;
      this.data[index] = value;
      if (reserved) this.reservedBit[index] = true;
    };
    BitMatrix.prototype.get = function(row, col) {
      return this.data[row * this.size + col];
    };
    BitMatrix.prototype.xor = function(row, col, value) {
      this.data[row * this.size + col] ^= value;
    };
    BitMatrix.prototype.isReserved = function(row, col) {
      return this.reservedBit[row * this.size + col];
    };
    module.exports = BitMatrix;
  }
});

// node_modules/qrcode/lib/core/alignment-pattern.js
var require_alignment_pattern = __commonJS({
  "node_modules/qrcode/lib/core/alignment-pattern.js"(exports) {
    var getSymbolSize = require_utils().getSymbolSize;
    exports.getRowColCoords = function getRowColCoords(version) {
      if (version === 1) return [];
      const posCount = Math.floor(version / 7) + 2;
      const size = getSymbolSize(version);
      const intervals = size === 145 ? 26 : Math.ceil((size - 13) / (2 * posCount - 2)) * 2;
      const positions = [size - 7];
      for (let i2 = 1; i2 < posCount - 1; i2++) {
        positions[i2] = positions[i2 - 1] - intervals;
      }
      positions.push(6);
      return positions.reverse();
    };
    exports.getPositions = function getPositions(version) {
      const coords = [];
      const pos = exports.getRowColCoords(version);
      const posLength = pos.length;
      for (let i2 = 0; i2 < posLength; i2++) {
        for (let j = 0; j < posLength; j++) {
          if (i2 === 0 && j === 0 || // top-left
          i2 === 0 && j === posLength - 1 || // bottom-left
          i2 === posLength - 1 && j === 0) {
            continue;
          }
          coords.push([pos[i2], pos[j]]);
        }
      }
      return coords;
    };
  }
});

// node_modules/qrcode/lib/core/finder-pattern.js
var require_finder_pattern = __commonJS({
  "node_modules/qrcode/lib/core/finder-pattern.js"(exports) {
    var getSymbolSize = require_utils().getSymbolSize;
    var FINDER_PATTERN_SIZE = 7;
    exports.getPositions = function getPositions(version) {
      const size = getSymbolSize(version);
      return [
        // top-left
        [0, 0],
        // top-right
        [size - FINDER_PATTERN_SIZE, 0],
        // bottom-left
        [0, size - FINDER_PATTERN_SIZE]
      ];
    };
  }
});

// node_modules/qrcode/lib/core/mask-pattern.js
var require_mask_pattern = __commonJS({
  "node_modules/qrcode/lib/core/mask-pattern.js"(exports) {
    exports.Patterns = {
      PATTERN000: 0,
      PATTERN001: 1,
      PATTERN010: 2,
      PATTERN011: 3,
      PATTERN100: 4,
      PATTERN101: 5,
      PATTERN110: 6,
      PATTERN111: 7
    };
    var PenaltyScores = {
      N1: 3,
      N2: 3,
      N3: 40,
      N4: 10
    };
    exports.isValid = function isValid(mask) {
      return mask != null && mask !== "" && !isNaN(mask) && mask >= 0 && mask <= 7;
    };
    exports.from = function from(value) {
      return exports.isValid(value) ? parseInt(value, 10) : void 0;
    };
    exports.getPenaltyN1 = function getPenaltyN1(data) {
      const size = data.size;
      let points = 0;
      let sameCountCol = 0;
      let sameCountRow = 0;
      let lastCol = null;
      let lastRow = null;
      for (let row = 0; row < size; row++) {
        sameCountCol = sameCountRow = 0;
        lastCol = lastRow = null;
        for (let col = 0; col < size; col++) {
          let module2 = data.get(row, col);
          if (module2 === lastCol) {
            sameCountCol++;
          } else {
            if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
            lastCol = module2;
            sameCountCol = 1;
          }
          module2 = data.get(col, row);
          if (module2 === lastRow) {
            sameCountRow++;
          } else {
            if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
            lastRow = module2;
            sameCountRow = 1;
          }
        }
        if (sameCountCol >= 5) points += PenaltyScores.N1 + (sameCountCol - 5);
        if (sameCountRow >= 5) points += PenaltyScores.N1 + (sameCountRow - 5);
      }
      return points;
    };
    exports.getPenaltyN2 = function getPenaltyN2(data) {
      const size = data.size;
      let points = 0;
      for (let row = 0; row < size - 1; row++) {
        for (let col = 0; col < size - 1; col++) {
          const last = data.get(row, col) + data.get(row, col + 1) + data.get(row + 1, col) + data.get(row + 1, col + 1);
          if (last === 4 || last === 0) points++;
        }
      }
      return points * PenaltyScores.N2;
    };
    exports.getPenaltyN3 = function getPenaltyN3(data) {
      const size = data.size;
      let points = 0;
      let bitsCol = 0;
      let bitsRow = 0;
      for (let row = 0; row < size; row++) {
        bitsCol = bitsRow = 0;
        for (let col = 0; col < size; col++) {
          bitsCol = bitsCol << 1 & 2047 | data.get(row, col);
          if (col >= 10 && (bitsCol === 1488 || bitsCol === 93)) points++;
          bitsRow = bitsRow << 1 & 2047 | data.get(col, row);
          if (col >= 10 && (bitsRow === 1488 || bitsRow === 93)) points++;
        }
      }
      return points * PenaltyScores.N3;
    };
    exports.getPenaltyN4 = function getPenaltyN4(data) {
      let darkCount = 0;
      const modulesCount = data.data.length;
      for (let i2 = 0; i2 < modulesCount; i2++) darkCount += data.data[i2];
      const k = Math.abs(Math.ceil(darkCount * 100 / modulesCount / 5) - 10);
      return k * PenaltyScores.N4;
    };
    function getMaskAt(maskPattern, i2, j) {
      switch (maskPattern) {
        case exports.Patterns.PATTERN000:
          return (i2 + j) % 2 === 0;
        case exports.Patterns.PATTERN001:
          return i2 % 2 === 0;
        case exports.Patterns.PATTERN010:
          return j % 3 === 0;
        case exports.Patterns.PATTERN011:
          return (i2 + j) % 3 === 0;
        case exports.Patterns.PATTERN100:
          return (Math.floor(i2 / 2) + Math.floor(j / 3)) % 2 === 0;
        case exports.Patterns.PATTERN101:
          return i2 * j % 2 + i2 * j % 3 === 0;
        case exports.Patterns.PATTERN110:
          return (i2 * j % 2 + i2 * j % 3) % 2 === 0;
        case exports.Patterns.PATTERN111:
          return (i2 * j % 3 + (i2 + j) % 2) % 2 === 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern);
      }
    }
    exports.applyMask = function applyMask(pattern, data) {
      const size = data.size;
      for (let col = 0; col < size; col++) {
        for (let row = 0; row < size; row++) {
          if (data.isReserved(row, col)) continue;
          data.xor(row, col, getMaskAt(pattern, row, col));
        }
      }
    };
    exports.getBestMask = function getBestMask(data, setupFormatFunc) {
      const numPatterns = Object.keys(exports.Patterns).length;
      let bestPattern = 0;
      let lowerPenalty = Infinity;
      for (let p = 0; p < numPatterns; p++) {
        setupFormatFunc(p);
        exports.applyMask(p, data);
        const penalty = exports.getPenaltyN1(data) + exports.getPenaltyN2(data) + exports.getPenaltyN3(data) + exports.getPenaltyN4(data);
        exports.applyMask(p, data);
        if (penalty < lowerPenalty) {
          lowerPenalty = penalty;
          bestPattern = p;
        }
      }
      return bestPattern;
    };
  }
});

// node_modules/qrcode/lib/core/error-correction-code.js
var require_error_correction_code = __commonJS({
  "node_modules/qrcode/lib/core/error-correction-code.js"(exports) {
    var ECLevel = require_error_correction_level();
    var EC_BLOCKS_TABLE = [
      // L  M  Q  H
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      2,
      2,
      1,
      2,
      2,
      4,
      1,
      2,
      4,
      4,
      2,
      4,
      4,
      4,
      2,
      4,
      6,
      5,
      2,
      4,
      6,
      6,
      2,
      5,
      8,
      8,
      4,
      5,
      8,
      8,
      4,
      5,
      8,
      11,
      4,
      8,
      10,
      11,
      4,
      9,
      12,
      16,
      4,
      9,
      16,
      16,
      6,
      10,
      12,
      18,
      6,
      10,
      17,
      16,
      6,
      11,
      16,
      19,
      6,
      13,
      18,
      21,
      7,
      14,
      21,
      25,
      8,
      16,
      20,
      25,
      8,
      17,
      23,
      25,
      9,
      17,
      23,
      34,
      9,
      18,
      25,
      30,
      10,
      20,
      27,
      32,
      12,
      21,
      29,
      35,
      12,
      23,
      34,
      37,
      12,
      25,
      34,
      40,
      13,
      26,
      35,
      42,
      14,
      28,
      38,
      45,
      15,
      29,
      40,
      48,
      16,
      31,
      43,
      51,
      17,
      33,
      45,
      54,
      18,
      35,
      48,
      57,
      19,
      37,
      51,
      60,
      19,
      38,
      53,
      63,
      20,
      40,
      56,
      66,
      21,
      43,
      59,
      70,
      22,
      45,
      62,
      74,
      24,
      47,
      65,
      77,
      25,
      49,
      68,
      81
    ];
    var EC_CODEWORDS_TABLE = [
      // L  M  Q  H
      7,
      10,
      13,
      17,
      10,
      16,
      22,
      28,
      15,
      26,
      36,
      44,
      20,
      36,
      52,
      64,
      26,
      48,
      72,
      88,
      36,
      64,
      96,
      112,
      40,
      72,
      108,
      130,
      48,
      88,
      132,
      156,
      60,
      110,
      160,
      192,
      72,
      130,
      192,
      224,
      80,
      150,
      224,
      264,
      96,
      176,
      260,
      308,
      104,
      198,
      288,
      352,
      120,
      216,
      320,
      384,
      132,
      240,
      360,
      432,
      144,
      280,
      408,
      480,
      168,
      308,
      448,
      532,
      180,
      338,
      504,
      588,
      196,
      364,
      546,
      650,
      224,
      416,
      600,
      700,
      224,
      442,
      644,
      750,
      252,
      476,
      690,
      816,
      270,
      504,
      750,
      900,
      300,
      560,
      810,
      960,
      312,
      588,
      870,
      1050,
      336,
      644,
      952,
      1110,
      360,
      700,
      1020,
      1200,
      390,
      728,
      1050,
      1260,
      420,
      784,
      1140,
      1350,
      450,
      812,
      1200,
      1440,
      480,
      868,
      1290,
      1530,
      510,
      924,
      1350,
      1620,
      540,
      980,
      1440,
      1710,
      570,
      1036,
      1530,
      1800,
      570,
      1064,
      1590,
      1890,
      600,
      1120,
      1680,
      1980,
      630,
      1204,
      1770,
      2100,
      660,
      1260,
      1860,
      2220,
      720,
      1316,
      1950,
      2310,
      750,
      1372,
      2040,
      2430
    ];
    exports.getBlocksCount = function getBlocksCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_BLOCKS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
    exports.getTotalCodewordsCount = function getTotalCodewordsCount(version, errorCorrectionLevel) {
      switch (errorCorrectionLevel) {
        case ECLevel.L:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 0];
        case ECLevel.M:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 1];
        case ECLevel.Q:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 2];
        case ECLevel.H:
          return EC_CODEWORDS_TABLE[(version - 1) * 4 + 3];
        default:
          return void 0;
      }
    };
  }
});

// node_modules/qrcode/lib/core/galois-field.js
var require_galois_field = __commonJS({
  "node_modules/qrcode/lib/core/galois-field.js"(exports) {
    var EXP_TABLE = new Uint8Array(512);
    var LOG_TABLE = new Uint8Array(256);
    (function initTables() {
      let x = 1;
      for (let i2 = 0; i2 < 255; i2++) {
        EXP_TABLE[i2] = x;
        LOG_TABLE[x] = i2;
        x <<= 1;
        if (x & 256) {
          x ^= 285;
        }
      }
      for (let i2 = 255; i2 < 512; i2++) {
        EXP_TABLE[i2] = EXP_TABLE[i2 - 255];
      }
    })();
    exports.log = function log(n) {
      if (n < 1) throw new Error("log(" + n + ")");
      return LOG_TABLE[n];
    };
    exports.exp = function exp(n) {
      return EXP_TABLE[n];
    };
    exports.mul = function mul(x, y) {
      if (x === 0 || y === 0) return 0;
      return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
    };
  }
});

// node_modules/qrcode/lib/core/polynomial.js
var require_polynomial = __commonJS({
  "node_modules/qrcode/lib/core/polynomial.js"(exports) {
    var GF = require_galois_field();
    exports.mul = function mul(p1, p2) {
      const coeff = new Uint8Array(p1.length + p2.length - 1);
      for (let i2 = 0; i2 < p1.length; i2++) {
        for (let j = 0; j < p2.length; j++) {
          coeff[i2 + j] ^= GF.mul(p1[i2], p2[j]);
        }
      }
      return coeff;
    };
    exports.mod = function mod2(divident, divisor) {
      let result = new Uint8Array(divident);
      while (result.length - divisor.length >= 0) {
        const coeff = result[0];
        for (let i2 = 0; i2 < divisor.length; i2++) {
          result[i2] ^= GF.mul(divisor[i2], coeff);
        }
        let offset = 0;
        while (offset < result.length && result[offset] === 0) offset++;
        result = result.slice(offset);
      }
      return result;
    };
    exports.generateECPolynomial = function generateECPolynomial(degree) {
      let poly = new Uint8Array([1]);
      for (let i2 = 0; i2 < degree; i2++) {
        poly = exports.mul(poly, new Uint8Array([1, GF.exp(i2)]));
      }
      return poly;
    };
  }
});

// node_modules/qrcode/lib/core/reed-solomon-encoder.js
var require_reed_solomon_encoder = __commonJS({
  "node_modules/qrcode/lib/core/reed-solomon-encoder.js"(exports, module) {
    var Polynomial = require_polynomial();
    function ReedSolomonEncoder(degree) {
      this.genPoly = void 0;
      this.degree = degree;
      if (this.degree) this.initialize(this.degree);
    }
    ReedSolomonEncoder.prototype.initialize = function initialize(degree) {
      this.degree = degree;
      this.genPoly = Polynomial.generateECPolynomial(this.degree);
    };
    ReedSolomonEncoder.prototype.encode = function encode(data) {
      if (!this.genPoly) {
        throw new Error("Encoder not initialized");
      }
      const paddedData = new Uint8Array(data.length + this.degree);
      paddedData.set(data);
      const remainder = Polynomial.mod(paddedData, this.genPoly);
      const start = this.degree - remainder.length;
      if (start > 0) {
        const buff = new Uint8Array(this.degree);
        buff.set(remainder, start);
        return buff;
      }
      return remainder;
    };
    module.exports = ReedSolomonEncoder;
  }
});

// node_modules/qrcode/lib/core/version-check.js
var require_version_check = __commonJS({
  "node_modules/qrcode/lib/core/version-check.js"(exports) {
    exports.isValid = function isValid(version) {
      return !isNaN(version) && version >= 1 && version <= 40;
    };
  }
});

// node_modules/qrcode/lib/core/regex.js
var require_regex = __commonJS({
  "node_modules/qrcode/lib/core/regex.js"(exports) {
    var numeric = "[0-9]+";
    var alphanumeric = "[A-Z $%*+\\-./:]+";
    var kanji = "(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";
    kanji = kanji.replace(/u/g, "\\u");
    var byte = "(?:(?![A-Z0-9 $%*+\\-./:]|" + kanji + ")(?:.|[\r\n]))+";
    exports.KANJI = new RegExp(kanji, "g");
    exports.BYTE_KANJI = new RegExp("[^A-Z0-9 $%*+\\-./:]+", "g");
    exports.BYTE = new RegExp(byte, "g");
    exports.NUMERIC = new RegExp(numeric, "g");
    exports.ALPHANUMERIC = new RegExp(alphanumeric, "g");
    var TEST_KANJI = new RegExp("^" + kanji + "$");
    var TEST_NUMERIC = new RegExp("^" + numeric + "$");
    var TEST_ALPHANUMERIC = new RegExp("^[A-Z0-9 $%*+\\-./:]+$");
    exports.testKanji = function testKanji(str) {
      return TEST_KANJI.test(str);
    };
    exports.testNumeric = function testNumeric(str) {
      return TEST_NUMERIC.test(str);
    };
    exports.testAlphanumeric = function testAlphanumeric(str) {
      return TEST_ALPHANUMERIC.test(str);
    };
  }
});

// node_modules/qrcode/lib/core/mode.js
var require_mode = __commonJS({
  "node_modules/qrcode/lib/core/mode.js"(exports) {
    var VersionCheck = require_version_check();
    var Regex = require_regex();
    exports.NUMERIC = {
      id: "Numeric",
      bit: 1 << 0,
      ccBits: [10, 12, 14]
    };
    exports.ALPHANUMERIC = {
      id: "Alphanumeric",
      bit: 1 << 1,
      ccBits: [9, 11, 13]
    };
    exports.BYTE = {
      id: "Byte",
      bit: 1 << 2,
      ccBits: [8, 16, 16]
    };
    exports.KANJI = {
      id: "Kanji",
      bit: 1 << 3,
      ccBits: [8, 10, 12]
    };
    exports.MIXED = {
      bit: -1
    };
    exports.getCharCountIndicator = function getCharCountIndicator(mode, version) {
      if (!mode.ccBits) throw new Error("Invalid mode: " + mode);
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid version: " + version);
      }
      if (version >= 1 && version < 10) return mode.ccBits[0];
      else if (version < 27) return mode.ccBits[1];
      return mode.ccBits[2];
    };
    exports.getBestModeForData = function getBestModeForData(dataStr) {
      if (Regex.testNumeric(dataStr)) return exports.NUMERIC;
      else if (Regex.testAlphanumeric(dataStr)) return exports.ALPHANUMERIC;
      else if (Regex.testKanji(dataStr)) return exports.KANJI;
      else return exports.BYTE;
    };
    exports.toString = function toString(mode) {
      if (mode && mode.id) return mode.id;
      throw new Error("Invalid mode");
    };
    exports.isValid = function isValid(mode) {
      return mode && mode.bit && mode.ccBits;
    };
    function fromString(string) {
      if (typeof string !== "string") {
        throw new Error("Param is not a string");
      }
      const lcStr = string.toLowerCase();
      switch (lcStr) {
        case "numeric":
          return exports.NUMERIC;
        case "alphanumeric":
          return exports.ALPHANUMERIC;
        case "kanji":
          return exports.KANJI;
        case "byte":
          return exports.BYTE;
        default:
          throw new Error("Unknown mode: " + string);
      }
    }
    exports.from = function from(value, defaultValue) {
      if (exports.isValid(value)) {
        return value;
      }
      try {
        return fromString(value);
      } catch (e) {
        return defaultValue;
      }
    };
  }
});

// node_modules/qrcode/lib/core/version.js
var require_version = __commonJS({
  "node_modules/qrcode/lib/core/version.js"(exports) {
    var Utils = require_utils();
    var ECCode = require_error_correction_code();
    var ECLevel = require_error_correction_level();
    var Mode = require_mode();
    var VersionCheck = require_version_check();
    var G18 = 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0;
    var G18_BCH = Utils.getBCHDigit(G18);
    function getBestVersionForDataLength(mode, length, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, mode)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    function getReservedBitsCount(mode, version) {
      return Mode.getCharCountIndicator(mode, version) + 4;
    }
    function getTotalBitsFromDataArray(segments, version) {
      let totalBits = 0;
      segments.forEach(function(data) {
        const reservedBits = getReservedBitsCount(data.mode, version);
        totalBits += reservedBits + data.getBitsLength();
      });
      return totalBits;
    }
    function getBestVersionForMixedData(segments, errorCorrectionLevel) {
      for (let currentVersion = 1; currentVersion <= 40; currentVersion++) {
        const length = getTotalBitsFromDataArray(segments, currentVersion);
        if (length <= exports.getCapacity(currentVersion, errorCorrectionLevel, Mode.MIXED)) {
          return currentVersion;
        }
      }
      return void 0;
    }
    exports.from = function from(value, defaultValue) {
      if (VersionCheck.isValid(value)) {
        return parseInt(value, 10);
      }
      return defaultValue;
    };
    exports.getCapacity = function getCapacity(version, errorCorrectionLevel, mode) {
      if (!VersionCheck.isValid(version)) {
        throw new Error("Invalid QR Code version");
      }
      if (typeof mode === "undefined") mode = Mode.BYTE;
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (mode === Mode.MIXED) return dataTotalCodewordsBits;
      const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version);
      switch (mode) {
        case Mode.NUMERIC:
          return Math.floor(usableBits / 10 * 3);
        case Mode.ALPHANUMERIC:
          return Math.floor(usableBits / 11 * 2);
        case Mode.KANJI:
          return Math.floor(usableBits / 13);
        case Mode.BYTE:
        default:
          return Math.floor(usableBits / 8);
      }
    };
    exports.getBestVersionForData = function getBestVersionForData(data, errorCorrectionLevel) {
      let seg;
      const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M);
      if (Array.isArray(data)) {
        if (data.length > 1) {
          return getBestVersionForMixedData(data, ecl);
        }
        if (data.length === 0) {
          return 1;
        }
        seg = data[0];
      } else {
        seg = data;
      }
      return getBestVersionForDataLength(seg.mode, seg.getLength(), ecl);
    };
    exports.getEncodedBits = function getEncodedBits(version) {
      if (!VersionCheck.isValid(version) || version < 7) {
        throw new Error("Invalid QR Code version");
      }
      let d = version << 12;
      while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
        d ^= G18 << Utils.getBCHDigit(d) - G18_BCH;
      }
      return version << 12 | d;
    };
  }
});

// node_modules/qrcode/lib/core/format-info.js
var require_format_info = __commonJS({
  "node_modules/qrcode/lib/core/format-info.js"(exports) {
    var Utils = require_utils();
    var G15 = 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0;
    var G15_MASK = 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1;
    var G15_BCH = Utils.getBCHDigit(G15);
    exports.getEncodedBits = function getEncodedBits(errorCorrectionLevel, mask) {
      const data = errorCorrectionLevel.bit << 3 | mask;
      let d = data << 10;
      while (Utils.getBCHDigit(d) - G15_BCH >= 0) {
        d ^= G15 << Utils.getBCHDigit(d) - G15_BCH;
      }
      return (data << 10 | d) ^ G15_MASK;
    };
  }
});

// node_modules/qrcode/lib/core/numeric-data.js
var require_numeric_data = __commonJS({
  "node_modules/qrcode/lib/core/numeric-data.js"(exports, module) {
    var Mode = require_mode();
    function NumericData(data) {
      this.mode = Mode.NUMERIC;
      this.data = data.toString();
    }
    NumericData.getBitsLength = function getBitsLength(length) {
      return 10 * Math.floor(length / 3) + (length % 3 ? length % 3 * 3 + 1 : 0);
    };
    NumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    NumericData.prototype.getBitsLength = function getBitsLength() {
      return NumericData.getBitsLength(this.data.length);
    };
    NumericData.prototype.write = function write(bitBuffer) {
      let i2, group, value;
      for (i2 = 0; i2 + 3 <= this.data.length; i2 += 3) {
        group = this.data.substr(i2, 3);
        value = parseInt(group, 10);
        bitBuffer.put(value, 10);
      }
      const remainingNum = this.data.length - i2;
      if (remainingNum > 0) {
        group = this.data.substr(i2);
        value = parseInt(group, 10);
        bitBuffer.put(value, remainingNum * 3 + 1);
      }
    };
    module.exports = NumericData;
  }
});

// node_modules/qrcode/lib/core/alphanumeric-data.js
var require_alphanumeric_data = __commonJS({
  "node_modules/qrcode/lib/core/alphanumeric-data.js"(exports, module) {
    var Mode = require_mode();
    var ALPHA_NUM_CHARS = [
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      " ",
      "$",
      "%",
      "*",
      "+",
      "-",
      ".",
      "/",
      ":"
    ];
    function AlphanumericData(data) {
      this.mode = Mode.ALPHANUMERIC;
      this.data = data;
    }
    AlphanumericData.getBitsLength = function getBitsLength(length) {
      return 11 * Math.floor(length / 2) + 6 * (length % 2);
    };
    AlphanumericData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    AlphanumericData.prototype.getBitsLength = function getBitsLength() {
      return AlphanumericData.getBitsLength(this.data.length);
    };
    AlphanumericData.prototype.write = function write(bitBuffer) {
      let i2;
      for (i2 = 0; i2 + 2 <= this.data.length; i2 += 2) {
        let value = ALPHA_NUM_CHARS.indexOf(this.data[i2]) * 45;
        value += ALPHA_NUM_CHARS.indexOf(this.data[i2 + 1]);
        bitBuffer.put(value, 11);
      }
      if (this.data.length % 2) {
        bitBuffer.put(ALPHA_NUM_CHARS.indexOf(this.data[i2]), 6);
      }
    };
    module.exports = AlphanumericData;
  }
});

// node_modules/qrcode/lib/core/byte-data.js
var require_byte_data = __commonJS({
  "node_modules/qrcode/lib/core/byte-data.js"(exports, module) {
    var Mode = require_mode();
    function ByteData(data) {
      this.mode = Mode.BYTE;
      if (typeof data === "string") {
        this.data = new TextEncoder().encode(data);
      } else {
        this.data = new Uint8Array(data);
      }
    }
    ByteData.getBitsLength = function getBitsLength(length) {
      return length * 8;
    };
    ByteData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    ByteData.prototype.getBitsLength = function getBitsLength() {
      return ByteData.getBitsLength(this.data.length);
    };
    ByteData.prototype.write = function(bitBuffer) {
      for (let i2 = 0, l = this.data.length; i2 < l; i2++) {
        bitBuffer.put(this.data[i2], 8);
      }
    };
    module.exports = ByteData;
  }
});

// node_modules/qrcode/lib/core/kanji-data.js
var require_kanji_data = __commonJS({
  "node_modules/qrcode/lib/core/kanji-data.js"(exports, module) {
    var Mode = require_mode();
    var Utils = require_utils();
    function KanjiData(data) {
      this.mode = Mode.KANJI;
      this.data = data;
    }
    KanjiData.getBitsLength = function getBitsLength(length) {
      return length * 13;
    };
    KanjiData.prototype.getLength = function getLength() {
      return this.data.length;
    };
    KanjiData.prototype.getBitsLength = function getBitsLength() {
      return KanjiData.getBitsLength(this.data.length);
    };
    KanjiData.prototype.write = function(bitBuffer) {
      let i2;
      for (i2 = 0; i2 < this.data.length; i2++) {
        let value = Utils.toSJIS(this.data[i2]);
        if (value >= 33088 && value <= 40956) {
          value -= 33088;
        } else if (value >= 57408 && value <= 60351) {
          value -= 49472;
        } else {
          throw new Error(
            "Invalid SJIS character: " + this.data[i2] + "\nMake sure your charset is UTF-8"
          );
        }
        value = (value >>> 8 & 255) * 192 + (value & 255);
        bitBuffer.put(value, 13);
      }
    };
    module.exports = KanjiData;
  }
});

// node_modules/dijkstrajs/dijkstra.js
var require_dijkstra = __commonJS({
  "node_modules/dijkstrajs/dijkstra.js"(exports, module) {
    "use strict";
    var dijkstra = {
      single_source_shortest_paths: function(graph, s, d) {
        var predecessors = {};
        var costs = {};
        costs[s] = 0;
        var open = dijkstra.PriorityQueue.make();
        open.push(s, 0);
        var closest, u, v, cost_of_s_to_u, adjacent_nodes, cost_of_e, cost_of_s_to_u_plus_cost_of_e, cost_of_s_to_v, first_visit;
        while (!open.empty()) {
          closest = open.pop();
          u = closest.value;
          cost_of_s_to_u = closest.cost;
          adjacent_nodes = graph[u] || {};
          for (v in adjacent_nodes) {
            if (adjacent_nodes.hasOwnProperty(v)) {
              cost_of_e = adjacent_nodes[v];
              cost_of_s_to_u_plus_cost_of_e = cost_of_s_to_u + cost_of_e;
              cost_of_s_to_v = costs[v];
              first_visit = typeof costs[v] === "undefined";
              if (first_visit || cost_of_s_to_v > cost_of_s_to_u_plus_cost_of_e) {
                costs[v] = cost_of_s_to_u_plus_cost_of_e;
                open.push(v, cost_of_s_to_u_plus_cost_of_e);
                predecessors[v] = u;
              }
            }
          }
        }
        if (typeof d !== "undefined" && typeof costs[d] === "undefined") {
          var msg = ["Could not find a path from ", s, " to ", d, "."].join("");
          throw new Error(msg);
        }
        return predecessors;
      },
      extract_shortest_path_from_predecessor_list: function(predecessors, d) {
        var nodes = [];
        var u = d;
        var predecessor;
        while (u) {
          nodes.push(u);
          predecessor = predecessors[u];
          u = predecessors[u];
        }
        nodes.reverse();
        return nodes;
      },
      find_path: function(graph, s, d) {
        var predecessors = dijkstra.single_source_shortest_paths(graph, s, d);
        return dijkstra.extract_shortest_path_from_predecessor_list(
          predecessors,
          d
        );
      },
      /**
       * A very naive priority queue implementation.
       */
      PriorityQueue: {
        make: function(opts) {
          var T = dijkstra.PriorityQueue, t = {}, key;
          opts = opts || {};
          for (key in T) {
            if (T.hasOwnProperty(key)) {
              t[key] = T[key];
            }
          }
          t.queue = [];
          t.sorter = opts.sorter || T.default_sorter;
          return t;
        },
        default_sorter: function(a, b) {
          return a.cost - b.cost;
        },
        /**
         * Add a new item to the queue and ensure the highest priority element
         * is at the front of the queue.
         */
        push: function(value, cost) {
          var item = { value, cost };
          this.queue.push(item);
          this.queue.sort(this.sorter);
        },
        /**
         * Return the highest priority element in the queue.
         */
        pop: function() {
          return this.queue.shift();
        },
        empty: function() {
          return this.queue.length === 0;
        }
      }
    };
    if (typeof module !== "undefined") {
      module.exports = dijkstra;
    }
  }
});

// node_modules/qrcode/lib/core/segments.js
var require_segments = __commonJS({
  "node_modules/qrcode/lib/core/segments.js"(exports) {
    var Mode = require_mode();
    var NumericData = require_numeric_data();
    var AlphanumericData = require_alphanumeric_data();
    var ByteData = require_byte_data();
    var KanjiData = require_kanji_data();
    var Regex = require_regex();
    var Utils = require_utils();
    var dijkstra = require_dijkstra();
    function getStringByteLength(str) {
      return unescape(encodeURIComponent(str)).length;
    }
    function getSegments(regex, mode, str) {
      const segments = [];
      let result;
      while ((result = regex.exec(str)) !== null) {
        segments.push({
          data: result[0],
          index: result.index,
          mode,
          length: result[0].length
        });
      }
      return segments;
    }
    function getSegmentsFromString(dataStr) {
      const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr);
      const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr);
      let byteSegs;
      let kanjiSegs;
      if (Utils.isKanjiModeEnabled()) {
        byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr);
        kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr);
      } else {
        byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr);
        kanjiSegs = [];
      }
      const segs = numSegs.concat(alphaNumSegs, byteSegs, kanjiSegs);
      return segs.sort(function(s1, s2) {
        return s1.index - s2.index;
      }).map(function(obj) {
        return {
          data: obj.data,
          mode: obj.mode,
          length: obj.length
        };
      });
    }
    function getSegmentBitsLength(length, mode) {
      switch (mode) {
        case Mode.NUMERIC:
          return NumericData.getBitsLength(length);
        case Mode.ALPHANUMERIC:
          return AlphanumericData.getBitsLength(length);
        case Mode.KANJI:
          return KanjiData.getBitsLength(length);
        case Mode.BYTE:
          return ByteData.getBitsLength(length);
      }
    }
    function mergeSegments(segs) {
      return segs.reduce(function(acc, curr) {
        const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null;
        if (prevSeg && prevSeg.mode === curr.mode) {
          acc[acc.length - 1].data += curr.data;
          return acc;
        }
        acc.push(curr);
        return acc;
      }, []);
    }
    function buildNodes(segs) {
      const nodes = [];
      for (let i2 = 0; i2 < segs.length; i2++) {
        const seg = segs[i2];
        switch (seg.mode) {
          case Mode.NUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.ALPHANUMERIC, length: seg.length },
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.ALPHANUMERIC:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: seg.length }
            ]);
            break;
          case Mode.KANJI:
            nodes.push([
              seg,
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
            break;
          case Mode.BYTE:
            nodes.push([
              { data: seg.data, mode: Mode.BYTE, length: getStringByteLength(seg.data) }
            ]);
        }
      }
      return nodes;
    }
    function buildGraph(nodes, version) {
      const table = {};
      const graph = { start: {} };
      let prevNodeIds = ["start"];
      for (let i2 = 0; i2 < nodes.length; i2++) {
        const nodeGroup = nodes[i2];
        const currentNodeIds = [];
        for (let j = 0; j < nodeGroup.length; j++) {
          const node = nodeGroup[j];
          const key = "" + i2 + j;
          currentNodeIds.push(key);
          table[key] = { node, lastCount: 0 };
          graph[key] = {};
          for (let n = 0; n < prevNodeIds.length; n++) {
            const prevNodeId = prevNodeIds[n];
            if (table[prevNodeId] && table[prevNodeId].node.mode === node.mode) {
              graph[prevNodeId][key] = getSegmentBitsLength(table[prevNodeId].lastCount + node.length, node.mode) - getSegmentBitsLength(table[prevNodeId].lastCount, node.mode);
              table[prevNodeId].lastCount += node.length;
            } else {
              if (table[prevNodeId]) table[prevNodeId].lastCount = node.length;
              graph[prevNodeId][key] = getSegmentBitsLength(node.length, node.mode) + 4 + Mode.getCharCountIndicator(node.mode, version);
            }
          }
        }
        prevNodeIds = currentNodeIds;
      }
      for (let n = 0; n < prevNodeIds.length; n++) {
        graph[prevNodeIds[n]].end = 0;
      }
      return { map: graph, table };
    }
    function buildSingleSegment(data, modesHint) {
      let mode;
      const bestMode = Mode.getBestModeForData(data);
      mode = Mode.from(modesHint, bestMode);
      if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
        throw new Error('"' + data + '" cannot be encoded with mode ' + Mode.toString(mode) + ".\n Suggested mode is: " + Mode.toString(bestMode));
      }
      if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
        mode = Mode.BYTE;
      }
      switch (mode) {
        case Mode.NUMERIC:
          return new NumericData(data);
        case Mode.ALPHANUMERIC:
          return new AlphanumericData(data);
        case Mode.KANJI:
          return new KanjiData(data);
        case Mode.BYTE:
          return new ByteData(data);
      }
    }
    exports.fromArray = function fromArray(array) {
      return array.reduce(function(acc, seg) {
        if (typeof seg === "string") {
          acc.push(buildSingleSegment(seg, null));
        } else if (seg.data) {
          acc.push(buildSingleSegment(seg.data, seg.mode));
        }
        return acc;
      }, []);
    };
    exports.fromString = function fromString(data, version) {
      const segs = getSegmentsFromString(data, Utils.isKanjiModeEnabled());
      const nodes = buildNodes(segs);
      const graph = buildGraph(nodes, version);
      const path = dijkstra.find_path(graph.map, "start", "end");
      const optimizedSegs = [];
      for (let i2 = 1; i2 < path.length - 1; i2++) {
        optimizedSegs.push(graph.table[path[i2]].node);
      }
      return exports.fromArray(mergeSegments(optimizedSegs));
    };
    exports.rawSplit = function rawSplit(data) {
      return exports.fromArray(
        getSegmentsFromString(data, Utils.isKanjiModeEnabled())
      );
    };
  }
});

// node_modules/qrcode/lib/core/qrcode.js
var require_qrcode = __commonJS({
  "node_modules/qrcode/lib/core/qrcode.js"(exports) {
    var Utils = require_utils();
    var ECLevel = require_error_correction_level();
    var BitBuffer = require_bit_buffer();
    var BitMatrix = require_bit_matrix();
    var AlignmentPattern = require_alignment_pattern();
    var FinderPattern = require_finder_pattern();
    var MaskPattern = require_mask_pattern();
    var ECCode = require_error_correction_code();
    var ReedSolomonEncoder = require_reed_solomon_encoder();
    var Version = require_version();
    var FormatInfo = require_format_info();
    var Mode = require_mode();
    var Segments = require_segments();
    function setupFinderPattern(matrix, version) {
      const size = matrix.size;
      const pos = FinderPattern.getPositions(version);
      for (let i2 = 0; i2 < pos.length; i2++) {
        const row = pos[i2][0];
        const col = pos[i2][1];
        for (let r = -1; r <= 7; r++) {
          if (row + r <= -1 || size <= row + r) continue;
          for (let c = -1; c <= 7; c++) {
            if (col + c <= -1 || size <= col + c) continue;
            if (r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupTimingPattern(matrix) {
      const size = matrix.size;
      for (let r = 8; r < size - 8; r++) {
        const value = r % 2 === 0;
        matrix.set(r, 6, value, true);
        matrix.set(6, r, value, true);
      }
    }
    function setupAlignmentPattern(matrix, version) {
      const pos = AlignmentPattern.getPositions(version);
      for (let i2 = 0; i2 < pos.length; i2++) {
        const row = pos[i2][0];
        const col = pos[i2][1];
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (r === -2 || r === 2 || c === -2 || c === 2 || r === 0 && c === 0) {
              matrix.set(row + r, col + c, true, true);
            } else {
              matrix.set(row + r, col + c, false, true);
            }
          }
        }
      }
    }
    function setupVersionInfo(matrix, version) {
      const size = matrix.size;
      const bits = Version.getEncodedBits(version);
      let row, col, mod2;
      for (let i2 = 0; i2 < 18; i2++) {
        row = Math.floor(i2 / 3);
        col = i2 % 3 + size - 8 - 3;
        mod2 = (bits >> i2 & 1) === 1;
        matrix.set(row, col, mod2, true);
        matrix.set(col, row, mod2, true);
      }
    }
    function setupFormatInfo(matrix, errorCorrectionLevel, maskPattern) {
      const size = matrix.size;
      const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern);
      let i2, mod2;
      for (i2 = 0; i2 < 15; i2++) {
        mod2 = (bits >> i2 & 1) === 1;
        if (i2 < 6) {
          matrix.set(i2, 8, mod2, true);
        } else if (i2 < 8) {
          matrix.set(i2 + 1, 8, mod2, true);
        } else {
          matrix.set(size - 15 + i2, 8, mod2, true);
        }
        if (i2 < 8) {
          matrix.set(8, size - i2 - 1, mod2, true);
        } else if (i2 < 9) {
          matrix.set(8, 15 - i2 - 1 + 1, mod2, true);
        } else {
          matrix.set(8, 15 - i2 - 1, mod2, true);
        }
      }
      matrix.set(size - 8, 8, 1, true);
    }
    function setupData(matrix, data) {
      const size = matrix.size;
      let inc = -1;
      let row = size - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (!matrix.isReserved(row, col - c)) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (data[byteIndex] >>> bitIndex & 1) === 1;
              }
              matrix.set(row, col - c, dark);
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || size <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
    function createData(version, errorCorrectionLevel, segments) {
      const buffer = new BitBuffer();
      segments.forEach(function(data) {
        buffer.put(data.mode.bit, 4);
        buffer.put(data.getLength(), Mode.getCharCountIndicator(data.mode, version));
        data.write(buffer);
      });
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8;
      if (buffer.getLengthInBits() + 4 <= dataTotalCodewordsBits) {
        buffer.put(0, 4);
      }
      while (buffer.getLengthInBits() % 8 !== 0) {
        buffer.putBit(0);
      }
      const remainingByte = (dataTotalCodewordsBits - buffer.getLengthInBits()) / 8;
      for (let i2 = 0; i2 < remainingByte; i2++) {
        buffer.put(i2 % 2 ? 17 : 236, 8);
      }
      return createCodewords(buffer, version, errorCorrectionLevel);
    }
    function createCodewords(bitBuffer, version, errorCorrectionLevel) {
      const totalCodewords = Utils.getSymbolTotalCodewords(version);
      const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel);
      const dataTotalCodewords = totalCodewords - ecTotalCodewords;
      const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel);
      const blocksInGroup2 = totalCodewords % ecTotalBlocks;
      const blocksInGroup1 = ecTotalBlocks - blocksInGroup2;
      const totalCodewordsInGroup1 = Math.floor(totalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks);
      const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1;
      const ecCount = totalCodewordsInGroup1 - dataCodewordsInGroup1;
      const rs = new ReedSolomonEncoder(ecCount);
      let offset = 0;
      const dcData = new Array(ecTotalBlocks);
      const ecData = new Array(ecTotalBlocks);
      let maxDataSize = 0;
      const buffer = new Uint8Array(bitBuffer.buffer);
      for (let b = 0; b < ecTotalBlocks; b++) {
        const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2;
        dcData[b] = buffer.slice(offset, offset + dataSize);
        ecData[b] = rs.encode(dcData[b]);
        offset += dataSize;
        maxDataSize = Math.max(maxDataSize, dataSize);
      }
      const data = new Uint8Array(totalCodewords);
      let index = 0;
      let i2, r;
      for (i2 = 0; i2 < maxDataSize; i2++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          if (i2 < dcData[r].length) {
            data[index++] = dcData[r][i2];
          }
        }
      }
      for (i2 = 0; i2 < ecCount; i2++) {
        for (r = 0; r < ecTotalBlocks; r++) {
          data[index++] = ecData[r][i2];
        }
      }
      return data;
    }
    function createSymbol(data, version, errorCorrectionLevel, maskPattern) {
      let segments;
      if (Array.isArray(data)) {
        segments = Segments.fromArray(data);
      } else if (typeof data === "string") {
        let estimatedVersion = version;
        if (!estimatedVersion) {
          const rawSegments = Segments.rawSplit(data);
          estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel);
        }
        segments = Segments.fromString(data, estimatedVersion || 40);
      } else {
        throw new Error("Invalid data");
      }
      const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel);
      if (!bestVersion) {
        throw new Error("The amount of data is too big to be stored in a QR Code");
      }
      if (!version) {
        version = bestVersion;
      } else if (version < bestVersion) {
        throw new Error(
          "\nThe chosen QR Code version cannot contain this amount of data.\nMinimum version required to store current data is: " + bestVersion + ".\n"
        );
      }
      const dataBits = createData(version, errorCorrectionLevel, segments);
      const moduleCount = Utils.getSymbolSize(version);
      const modules = new BitMatrix(moduleCount);
      setupFinderPattern(modules, version);
      setupTimingPattern(modules);
      setupAlignmentPattern(modules, version);
      setupFormatInfo(modules, errorCorrectionLevel, 0);
      if (version >= 7) {
        setupVersionInfo(modules, version);
      }
      setupData(modules, dataBits);
      if (isNaN(maskPattern)) {
        maskPattern = MaskPattern.getBestMask(
          modules,
          setupFormatInfo.bind(null, modules, errorCorrectionLevel)
        );
      }
      MaskPattern.applyMask(maskPattern, modules);
      setupFormatInfo(modules, errorCorrectionLevel, maskPattern);
      return {
        modules,
        version,
        errorCorrectionLevel,
        maskPattern,
        segments
      };
    }
    exports.create = function create(data, options) {
      if (typeof data === "undefined" || data === "") {
        throw new Error("No input text");
      }
      let errorCorrectionLevel = ECLevel.M;
      let version;
      let mask;
      if (typeof options !== "undefined") {
        errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M);
        version = Version.from(options.version);
        mask = MaskPattern.from(options.maskPattern);
        if (options.toSJISFunc) {
          Utils.setToSJISFunction(options.toSJISFunc);
        }
      }
      return createSymbol(data, version, errorCorrectionLevel, mask);
    };
  }
});

// node_modules/qrcode/lib/renderer/utils.js
var require_utils2 = __commonJS({
  "node_modules/qrcode/lib/renderer/utils.js"(exports) {
    function hex2rgba(hex3) {
      if (typeof hex3 === "number") {
        hex3 = hex3.toString();
      }
      if (typeof hex3 !== "string") {
        throw new Error("Color should be defined as hex string");
      }
      let hexCode = hex3.slice().replace("#", "").split("");
      if (hexCode.length < 3 || hexCode.length === 5 || hexCode.length > 8) {
        throw new Error("Invalid hex color: " + hex3);
      }
      if (hexCode.length === 3 || hexCode.length === 4) {
        hexCode = Array.prototype.concat.apply([], hexCode.map(function(c) {
          return [c, c];
        }));
      }
      if (hexCode.length === 6) hexCode.push("F", "F");
      const hexValue = parseInt(hexCode.join(""), 16);
      return {
        r: hexValue >> 24 & 255,
        g: hexValue >> 16 & 255,
        b: hexValue >> 8 & 255,
        a: hexValue & 255,
        hex: "#" + hexCode.slice(0, 6).join("")
      };
    }
    exports.getOptions = function getOptions(options) {
      if (!options) options = {};
      if (!options.color) options.color = {};
      const margin = typeof options.margin === "undefined" || options.margin === null || options.margin < 0 ? 4 : options.margin;
      const width = options.width && options.width >= 21 ? options.width : void 0;
      const scale = options.scale || 4;
      return {
        width,
        scale: width ? 4 : scale,
        margin,
        color: {
          dark: hex2rgba(options.color.dark || "#000000ff"),
          light: hex2rgba(options.color.light || "#ffffffff")
        },
        type: options.type,
        rendererOpts: options.rendererOpts || {}
      };
    };
    exports.getScale = function getScale(qrSize, opts) {
      return opts.width && opts.width >= qrSize + opts.margin * 2 ? opts.width / (qrSize + opts.margin * 2) : opts.scale;
    };
    exports.getImageWidth = function getImageWidth(qrSize, opts) {
      const scale = exports.getScale(qrSize, opts);
      return Math.floor((qrSize + opts.margin * 2) * scale);
    };
    exports.qrToImageData = function qrToImageData(imgData, qr, opts) {
      const size = qr.modules.size;
      const data = qr.modules.data;
      const scale = exports.getScale(size, opts);
      const symbolSize = Math.floor((size + opts.margin * 2) * scale);
      const scaledMargin = opts.margin * scale;
      const palette = [opts.color.light, opts.color.dark];
      for (let i2 = 0; i2 < symbolSize; i2++) {
        for (let j = 0; j < symbolSize; j++) {
          let posDst = (i2 * symbolSize + j) * 4;
          let pxColor = opts.color.light;
          if (i2 >= scaledMargin && j >= scaledMargin && i2 < symbolSize - scaledMargin && j < symbolSize - scaledMargin) {
            const iSrc = Math.floor((i2 - scaledMargin) / scale);
            const jSrc = Math.floor((j - scaledMargin) / scale);
            pxColor = palette[data[iSrc * size + jSrc] ? 1 : 0];
          }
          imgData[posDst++] = pxColor.r;
          imgData[posDst++] = pxColor.g;
          imgData[posDst++] = pxColor.b;
          imgData[posDst] = pxColor.a;
        }
      }
    };
  }
});

// node_modules/qrcode/lib/renderer/canvas.js
var require_canvas = __commonJS({
  "node_modules/qrcode/lib/renderer/canvas.js"(exports) {
    var Utils = require_utils2();
    function clearCanvas(ctx, canvas, size) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!canvas.style) canvas.style = {};
      canvas.height = size;
      canvas.width = size;
      canvas.style.height = size + "px";
      canvas.style.width = size + "px";
    }
    function getCanvasElement() {
      try {
        return document.createElement("canvas");
      } catch (e) {
        throw new Error("You need to specify a canvas element");
      }
    }
    exports.render = function render(qrData, canvas, options) {
      let opts = options;
      let canvasEl = canvas;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!canvas) {
        canvasEl = getCanvasElement();
      }
      opts = Utils.getOptions(opts);
      const size = Utils.getImageWidth(qrData.modules.size, opts);
      const ctx = canvasEl.getContext("2d");
      const image = ctx.createImageData(size, size);
      Utils.qrToImageData(image.data, qrData, opts);
      clearCanvas(ctx, canvasEl, size);
      ctx.putImageData(image, 0, 0);
      return canvasEl;
    };
    exports.renderToDataURL = function renderToDataURL(qrData, canvas, options) {
      let opts = options;
      if (typeof opts === "undefined" && (!canvas || !canvas.getContext)) {
        opts = canvas;
        canvas = void 0;
      }
      if (!opts) opts = {};
      const canvasEl = exports.render(qrData, canvas, opts);
      const type = opts.type || "image/png";
      const rendererOpts = opts.rendererOpts || {};
      return canvasEl.toDataURL(type, rendererOpts.quality);
    };
  }
});

// node_modules/qrcode/lib/renderer/svg-tag.js
var require_svg_tag = __commonJS({
  "node_modules/qrcode/lib/renderer/svg-tag.js"(exports) {
    var Utils = require_utils2();
    function getColorAttrib(color, attrib) {
      const alpha = color.a / 255;
      const str = attrib + '="' + color.hex + '"';
      return alpha < 1 ? str + " " + attrib + '-opacity="' + alpha.toFixed(2).slice(1) + '"' : str;
    }
    function svgCmd(cmd, x, y) {
      let str = cmd + x;
      if (typeof y !== "undefined") str += " " + y;
      return str;
    }
    function qrToPath(data, size, margin) {
      let path = "";
      let moveBy = 0;
      let newRow = false;
      let lineLength = 0;
      for (let i2 = 0; i2 < data.length; i2++) {
        const col = Math.floor(i2 % size);
        const row = Math.floor(i2 / size);
        if (!col && !newRow) newRow = true;
        if (data[i2]) {
          lineLength++;
          if (!(i2 > 0 && col > 0 && data[i2 - 1])) {
            path += newRow ? svgCmd("M", col + margin, 0.5 + row + margin) : svgCmd("m", moveBy, 0);
            moveBy = 0;
            newRow = false;
          }
          if (!(col + 1 < size && data[i2 + 1])) {
            path += svgCmd("h", lineLength);
            lineLength = 0;
          }
        } else {
          moveBy++;
        }
      }
      return path;
    }
    exports.render = function render(qrData, options, cb) {
      const opts = Utils.getOptions(options);
      const size = qrData.modules.size;
      const data = qrData.modules.data;
      const qrcodesize = size + opts.margin * 2;
      const bg = !opts.color.light.a ? "" : "<path " + getColorAttrib(opts.color.light, "fill") + ' d="M0 0h' + qrcodesize + "v" + qrcodesize + 'H0z"/>';
      const path = "<path " + getColorAttrib(opts.color.dark, "stroke") + ' d="' + qrToPath(data, size, opts.margin) + '"/>';
      const viewBox = 'viewBox="0 0 ' + qrcodesize + " " + qrcodesize + '"';
      const width = !opts.width ? "" : 'width="' + opts.width + '" height="' + opts.width + '" ';
      const svgTag = '<svg xmlns="http://www.w3.org/2000/svg" ' + width + viewBox + ' shape-rendering="crispEdges">' + bg + path + "</svg>\n";
      if (typeof cb === "function") {
        cb(null, svgTag);
      }
      return svgTag;
    };
  }
});

// node_modules/qrcode/lib/browser.js
var require_browser = __commonJS({
  "node_modules/qrcode/lib/browser.js"(exports) {
    var canPromise = require_can_promise();
    var QRCode2 = require_qrcode();
    var CanvasRenderer = require_canvas();
    var SvgRenderer = require_svg_tag();
    function renderCanvas(renderFunc, canvas, text, opts, cb) {
      const args = [].slice.call(arguments, 1);
      const argsNum = args.length;
      const isLastArgCb = typeof args[argsNum - 1] === "function";
      if (!isLastArgCb && !canPromise()) {
        throw new Error("Callback required as last argument");
      }
      if (isLastArgCb) {
        if (argsNum < 2) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 2) {
          cb = text;
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 3) {
          if (canvas.getContext && typeof cb === "undefined") {
            cb = opts;
            opts = void 0;
          } else {
            cb = opts;
            opts = text;
            text = canvas;
            canvas = void 0;
          }
        }
      } else {
        if (argsNum < 1) {
          throw new Error("Too few arguments provided");
        }
        if (argsNum === 1) {
          text = canvas;
          canvas = opts = void 0;
        } else if (argsNum === 2 && !canvas.getContext) {
          opts = text;
          text = canvas;
          canvas = void 0;
        }
        return new Promise(function(resolve, reject) {
          try {
            const data = QRCode2.create(text, opts);
            resolve(renderFunc(data, canvas, opts));
          } catch (e) {
            reject(e);
          }
        });
      }
      try {
        const data = QRCode2.create(text, opts);
        cb(null, renderFunc(data, canvas, opts));
      } catch (e) {
        cb(e);
      }
    }
    exports.create = QRCode2.create;
    exports.toCanvas = renderCanvas.bind(null, CanvasRenderer.render);
    exports.toDataURL = renderCanvas.bind(null, CanvasRenderer.renderToDataURL);
    exports.toString = renderCanvas.bind(null, function(data, _, opts) {
      return SvgRenderer.render(data, opts);
    });
  }
});

// src/pwa.js
var INSTALL_PREFERENCE = "anmore-install-dismissed-at";
var COOLDOWN = 7 * 864e5;
function createInstallState(storage, now = Date.now) {
  let engaged = false, dismissed = 0;
  try {
    const value = Number(storage?.getItem(INSTALL_PREFERENCE));
    if (Number.isFinite(value) && value > 0 && value <= now())
      dismissed = value;
  } catch {
  }
  return {
    engage() {
      engaged = true;
    },
    eligible() {
      return engaged && (!dismissed || now() - dismissed >= COOLDOWN);
    },
    dismiss() {
      dismissed = now();
      try {
        storage?.setItem(INSTALL_PREFERENCE, String(dismissed));
      } catch {
      }
    }
  };
}
function setupWorker(win = window, doc = document) {
  if (!("serviceWorker" in win.navigator)) return;
  const sw = win.navigator.serviceWorker;
  const $3 = (id) => doc.getElementById(id);
  let registration, armed = false;
  const pending = () => {
    $3("app-update").hidden = !(registration?.waiting && sw.controller);
  };
  $3("update-confirm").addEventListener("change", () => {
    $3("update-reload").disabled = !$3("update-confirm").checked;
  });
  $3("update-reload").addEventListener("click", () => {
    if (!$3("update-confirm").checked || $3("zap-dialog").open) return;
    if (!registration?.waiting) return;
    armed = true;
    $3("update-reload").disabled = true;
    registration.waiting.postMessage({ type: "ACTIVATE_OFFLINE_UPDATE" });
  });
  sw.addEventListener("controllerchange", () => {
    pending();
    if (armed && !$3("zap-dialog").open) {
      armed = false;
      win.location.reload();
    }
  });
  sw.register("./sw.js", { scope: "./", updateViaCache: "none" }).then((r) => {
    registration = r;
    pending();
    r.addEventListener("updatefound", () => {
      r.installing?.addEventListener("statechange", pending);
    });
  }).catch(() => {
    $3("install-status").textContent = "Offline landing is unavailable in this browser session. You can still read online and use install help.";
  });
}
function setupInstall(win = window, doc = document) {
  const $3 = (id) => doc.getElementById(id);
  let storage;
  try {
    storage = win.localStorage;
  } catch {
  }
  const state = createInstallState(storage);
  let deferred = null, pending = false, completed = false;
  const standalone = () => win.matchMedia("(display-mode: standalone)").matches || win.navigator.standalone === true;
  const render = () => {
    const hidden = standalone() || completed;
    $3("install-area").hidden = hidden;
    $3("install-invitation").hidden = hidden || !state.eligible();
    $3("install-native").hidden = hidden || !deferred;
    $3("install-native").disabled = pending;
  };
  $3("install-instructions").textContent = installInstructions(win.navigator);
  const engage = (event) => {
    if (!event.isTrusted || !event.target.closest(
      '#feed summary, #feed a, #events summary, #events a, #load-more, #order-top, #order-newest, a[href="#upcoming"]'
    ))
      return;
    state.engage();
    render();
  };
  doc.addEventListener("click", engage);
  $3("install-dismiss").addEventListener("click", () => {
    state.dismiss();
    render();
    $3("install-help").querySelector("summary").focus({ preventScroll: true });
  });
  $3("install-show-help").addEventListener("click", () => {
    $3("install-help").open = true;
    $3("install-help").scrollIntoView({ block: "center" });
    $3("install-help").querySelector("summary").focus();
  });
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!standalone() && !completed && !pending) deferred = event;
    render();
  });
  $3("install-native").addEventListener("click", async () => {
    if (!deferred || pending || standalone() || completed) return;
    const event = deferred;
    deferred = null;
    pending = true;
    render();
    try {
      const result = await event.prompt();
      const choice = event.userChoice ? await event.userChoice : result;
      if (completed) return;
      if (choice?.outcome === "accepted") {
        state.dismiss();
        $3("install-status").textContent = "Installation requested. Your browser will finish adding the app.";
      } else {
        state.dismiss();
        $3("install-status").textContent = "Not installed. You can try again from your browser menu, or follow the instructions above.";
      }
    } catch {
      if (!completed)
        $3("install-status").textContent = "The install prompt could not open. Use your browser menu or the instructions above.";
    } finally {
      pending = false;
      render();
    }
  });
  win.addEventListener("appinstalled", () => {
    completed = true;
    deferred = null;
    state.dismiss();
    render();
  });
  win.matchMedia("(display-mode: standalone)").addEventListener?.("change", render);
  render();
}
function installInstructions({
  userAgent = "",
  maxTouchPoints = 0
} = {}) {
  if (/iPhone|iPad|iPod/.test(userAgent) || /Macintosh/.test(userAgent) && maxTouchPoints > 1)
    return "Open this site in Safari. Tap Share (you may need More), then Add to Home Screen. Turn on Open as Web App if offered, then tap Add. If you are in another app\u2019s browser, open Safari first.";
  if (/Android/.test(userAgent))
    return "Use Install app below when available, or your browser menu\u2019s Install app or Add to Home screen option. In an in-app browser, open this page in Chrome or another supporting browser first. If unavailable, bookmark this page.";
  return "Look for your browser\u2019s install icon in the address bar, or Install app / Install page as app in its menu. Availability varies by browser; if unavailable, bookmark this page. Safari on Mac may offer File \u2192 Add to Dock.";
}

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/_assert.js
function number(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`Wrong positive integer: ${n}`);
}
function bytes(b, ...lengths) {
  if (!(b instanceof Uint8Array))
    throw new Error("Expected Uint8Array");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
}
function hash(hash3) {
  if (typeof hash3 !== "function" || typeof hash3.create !== "function")
    throw new Error("Hash should be wrapped by utils.wrapConstructor");
  number(hash3.outputLen);
  number(hash3.blockLen);
}
function exists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function output(out, instance) {
  bytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error(`digestInto() expects output buffer of length at least ${min}`);
  }
}

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/crypto.js
var crypto = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/utils.js
var u8a = (a) => a instanceof Uint8Array;
var createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
var rotr = (word, shift) => word << 32 - shift | word >>> shift;
var isLE = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
if (!isLE)
  throw new Error("Non little-endian hardware is not supported");
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  if (!u8a(data))
    throw new Error(`expected Uint8Array, got ${typeof data}`);
  return data;
}
function concatBytes(...arrays) {
  const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let pad = 0;
  arrays.forEach((a) => {
    if (!u8a(a))
      throw new Error("Uint8Array expected");
    r.set(a, pad);
    pad += a.length;
  });
  return r;
}
var Hash = class {
  // Safe version that clones internal state
  clone() {
    return this._cloneInto();
  }
};
var toStr = {}.toString;
function wrapConstructor(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/_sha2.js
function setBigUint64(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
var SHA2 = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE3) {
    super();
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE3;
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    exists(this);
    const { view, buffer, blockLen } = this;
    data = toBytes(data);
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    exists(this);
    output(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE3 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    this.buffer.subarray(pos).fill(0);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i2 = pos; i2 < blockLen; i2++)
      buffer[i2] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE3);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i2 = 0; i2 < outLen; i2++)
      oview.setUint32(4 * i2, state[i2], isLE3);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.length = length;
    to.pos = pos;
    to.finished = finished;
    to.destroyed = destroyed;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
};

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/sha256.js
var Chi = (a, b, c) => a & b ^ ~a & c;
var Maj = (a, b, c) => a & b ^ a & c ^ b & c;
var SHA256_K = /* @__PURE__ */ new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var IV = /* @__PURE__ */ new Uint32Array([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends SHA2 {
  constructor() {
    super(64, 32, 8, false);
    this.A = IV[0] | 0;
    this.B = IV[1] | 0;
    this.C = IV[2] | 0;
    this.D = IV[3] | 0;
    this.E = IV[4] | 0;
    this.F = IV[5] | 0;
    this.G = IV[6] | 0;
    this.H = IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i2 = 0; i2 < 16; i2++, offset += 4)
      SHA256_W[i2] = view.getUint32(offset, false);
    for (let i2 = 16; i2 < 64; i2++) {
      const W15 = SHA256_W[i2 - 15];
      const W2 = SHA256_W[i2 - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i2] = s1 + SHA256_W[i2 - 7] + s0 + SHA256_W[i2 - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i2 = 0; i2 < 64; i2++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i2] + SHA256_W[i2] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    SHA256_W.fill(0);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    this.buffer.fill(0);
  }
};
var sha256 = /* @__PURE__ */ wrapConstructor(() => new SHA256());

// node_modules/@noble/curves/esm/abstract/utils.js
var utils_exports = {};
__export(utils_exports, {
  bitGet: () => bitGet,
  bitLen: () => bitLen,
  bitMask: () => bitMask,
  bitSet: () => bitSet,
  bytesToHex: () => bytesToHex,
  bytesToNumberBE: () => bytesToNumberBE,
  bytesToNumberLE: () => bytesToNumberLE,
  concatBytes: () => concatBytes2,
  createHmacDrbg: () => createHmacDrbg,
  ensureBytes: () => ensureBytes,
  equalBytes: () => equalBytes,
  hexToBytes: () => hexToBytes,
  hexToNumber: () => hexToNumber,
  numberToBytesBE: () => numberToBytesBE,
  numberToBytesLE: () => numberToBytesLE,
  numberToHexUnpadded: () => numberToHexUnpadded,
  numberToVarBytesBE: () => numberToVarBytesBE,
  utf8ToBytes: () => utf8ToBytes2,
  validateObject: () => validateObject
});
var _0n = BigInt(0);
var _1n = BigInt(1);
var _2n = BigInt(2);
var u8a2 = (a) => a instanceof Uint8Array;
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i2) => i2.toString(16).padStart(2, "0"));
function bytesToHex(bytes3) {
  if (!u8a2(bytes3))
    throw new Error("Uint8Array expected");
  let hex3 = "";
  for (let i2 = 0; i2 < bytes3.length; i2++) {
    hex3 += hexes[bytes3[i2]];
  }
  return hex3;
}
function numberToHexUnpadded(num) {
  const hex3 = num.toString(16);
  return hex3.length & 1 ? `0${hex3}` : hex3;
}
function hexToNumber(hex3) {
  if (typeof hex3 !== "string")
    throw new Error("hex string expected, got " + typeof hex3);
  return BigInt(hex3 === "" ? "0" : `0x${hex3}`);
}
function hexToBytes(hex3) {
  if (typeof hex3 !== "string")
    throw new Error("hex string expected, got " + typeof hex3);
  const len = hex3.length;
  if (len % 2)
    throw new Error("padded hex string expected, got unpadded hex of length " + len);
  const array = new Uint8Array(len / 2);
  for (let i2 = 0; i2 < array.length; i2++) {
    const j = i2 * 2;
    const hexByte = hex3.slice(j, j + 2);
    const byte = Number.parseInt(hexByte, 16);
    if (Number.isNaN(byte) || byte < 0)
      throw new Error("Invalid byte sequence");
    array[i2] = byte;
  }
  return array;
}
function bytesToNumberBE(bytes3) {
  return hexToNumber(bytesToHex(bytes3));
}
function bytesToNumberLE(bytes3) {
  if (!u8a2(bytes3))
    throw new Error("Uint8Array expected");
  return hexToNumber(bytesToHex(Uint8Array.from(bytes3).reverse()));
}
function numberToBytesBE(n, len) {
  return hexToBytes(n.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function numberToVarBytesBE(n) {
  return hexToBytes(numberToHexUnpadded(n));
}
function ensureBytes(title, hex3, expectedLength) {
  let res;
  if (typeof hex3 === "string") {
    try {
      res = hexToBytes(hex3);
    } catch (e) {
      throw new Error(`${title} must be valid hex string, got "${hex3}". Cause: ${e}`);
    }
  } else if (u8a2(hex3)) {
    res = Uint8Array.from(hex3);
  } else {
    throw new Error(`${title} must be hex string or Uint8Array`);
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
  return res;
}
function concatBytes2(...arrays) {
  const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let pad = 0;
  arrays.forEach((a) => {
    if (!u8a2(a))
      throw new Error("Uint8Array expected");
    r.set(a, pad);
    pad += a.length;
  });
  return r;
}
function equalBytes(b1, b2) {
  if (b1.length !== b2.length)
    return false;
  for (let i2 = 0; i2 < b1.length; i2++)
    if (b1[i2] !== b2[i2])
      return false;
  return true;
}
function utf8ToBytes2(str) {
  if (typeof str !== "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
  return new Uint8Array(new TextEncoder().encode(str));
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
function bitGet(n, pos) {
  return n >> BigInt(pos) & _1n;
}
var bitSet = (n, pos, value) => {
  return n | (value ? _1n : _0n) << BigInt(pos);
};
var bitMask = (n) => (_2n << BigInt(n - 1)) - _1n;
var u8n = (data) => new Uint8Array(data);
var u8fr = (arr) => Uint8Array.from(arr);
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i2 = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i2 = 0;
  };
  const h = (...b) => hmacFn(k, v, ...b);
  const reseed = (seed = u8n()) => {
    k = h(u8fr([0]), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8fr([1]), seed);
    v = h();
  };
  const gen = () => {
    if (i2++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
var validatorFns = {
  bigint: (val) => typeof val === "bigint",
  function: (val) => typeof val === "function",
  boolean: (val) => typeof val === "boolean",
  string: (val) => typeof val === "string",
  stringOrUint8Array: (val) => typeof val === "string" || val instanceof Uint8Array,
  isSafeInteger: (val) => Number.isSafeInteger(val),
  array: (val) => Array.isArray(val),
  field: (val, object) => object.Fp.isValid(val),
  hash: (val) => typeof val === "function" && Number.isSafeInteger(val.outputLen)
};
function validateObject(object, validators, optValidators = {}) {
  const checkField = (fieldName, type, isOptional) => {
    const checkVal = validatorFns[type];
    if (typeof checkVal !== "function")
      throw new Error(`Invalid validator "${type}", expected function`);
    const val = object[fieldName];
    if (isOptional && val === void 0)
      return;
    if (!checkVal(val, object)) {
      throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
    }
  };
  for (const [fieldName, type] of Object.entries(validators))
    checkField(fieldName, type, false);
  for (const [fieldName, type] of Object.entries(optValidators))
    checkField(fieldName, type, true);
  return object;
}

// node_modules/@noble/curves/esm/abstract/modular.js
var _0n2 = BigInt(0);
var _1n2 = BigInt(1);
var _2n2 = BigInt(2);
var _3n = BigInt(3);
var _4n = BigInt(4);
var _5n = BigInt(5);
var _8n = BigInt(8);
var _9n = BigInt(9);
var _16n = BigInt(16);
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num, power, modulo) {
  if (modulo <= _0n2 || power < _0n2)
    throw new Error("Expected power/modulo > 0");
  if (modulo === _1n2)
    return _0n2;
  let res = _1n2;
  while (power > _0n2) {
    if (power & _1n2)
      res = res * num % modulo;
    num = num * num % modulo;
    power >>= _1n2;
  }
  return res;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number3, modulo) {
  if (number3 === _0n2 || modulo <= _0n2) {
    throw new Error(`invert: expected positive integers, got n=${number3} mod=${modulo}`);
  }
  let a = mod(number3, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd2 = b;
  if (gcd2 !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function tonelliShanks(P) {
  const legendreC = (P - _1n2) / _2n2;
  let Q, S, Z;
  for (Q = P - _1n2, S = 0; Q % _2n2 === _0n2; Q /= _2n2, S++)
    ;
  for (Z = _2n2; Z < P && pow(Z, legendreC, P) !== P - _1n2; Z++)
    ;
  if (S === 1) {
    const p1div4 = (P + _1n2) / _4n;
    return function tonelliFast(Fp2, n) {
      const root = Fp2.pow(n, p1div4);
      if (!Fp2.eql(Fp2.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  const Q1div2 = (Q + _1n2) / _2n2;
  return function tonelliSlow(Fp2, n) {
    if (Fp2.pow(n, legendreC) === Fp2.neg(Fp2.ONE))
      throw new Error("Cannot find square root");
    let r = S;
    let g = Fp2.pow(Fp2.mul(Fp2.ONE, Z), Q);
    let x = Fp2.pow(n, Q1div2);
    let b = Fp2.pow(n, Q);
    while (!Fp2.eql(b, Fp2.ONE)) {
      if (Fp2.eql(b, Fp2.ZERO))
        return Fp2.ZERO;
      let m = 1;
      for (let t2 = Fp2.sqr(b); m < r; m++) {
        if (Fp2.eql(t2, Fp2.ONE))
          break;
        t2 = Fp2.sqr(t2);
      }
      const ge2 = Fp2.pow(g, _1n2 << BigInt(r - m - 1));
      g = Fp2.sqr(ge2);
      x = Fp2.mul(x, ge2);
      b = Fp2.mul(b, g);
      r = m;
    }
    return x;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n) {
    const p1div4 = (P + _1n2) / _4n;
    return function sqrt3mod4(Fp2, n) {
      const root = Fp2.pow(n, p1div4);
      if (!Fp2.eql(Fp2.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _8n === _5n) {
    const c1 = (P - _5n) / _8n;
    return function sqrt5mod8(Fp2, n) {
      const n2 = Fp2.mul(n, _2n2);
      const v = Fp2.pow(n2, c1);
      const nv = Fp2.mul(n, v);
      const i2 = Fp2.mul(Fp2.mul(nv, _2n2), v);
      const root = Fp2.mul(nv, Fp2.sub(i2, Fp2.ONE));
      if (!Fp2.eql(Fp2.sqr(root), n))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _16n === _9n) {
  }
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "isSafeInteger",
    BITS: "isSafeInteger"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  return validateObject(field, opts);
}
function FpPow(f, num, power) {
  if (power < _0n2)
    throw new Error("Expected power > 0");
  if (power === _0n2)
    return f.ONE;
  if (power === _1n2)
    return num;
  let p = f.ONE;
  let d = num;
  while (power > _0n2) {
    if (power & _1n2)
      p = f.mul(p, d);
    d = f.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(f, nums) {
  const tmp = new Array(nums.length);
  const lastMultiplied = nums.reduce((acc, num, i2) => {
    if (f.is0(num))
      return acc;
    tmp[i2] = acc;
    return f.mul(acc, num);
  }, f.ONE);
  const inverted = f.inv(lastMultiplied);
  nums.reduceRight((acc, num, i2) => {
    if (f.is0(num))
      return acc;
    tmp[i2] = f.mul(acc, tmp[i2]);
    return f.mul(acc, num);
  }, inverted);
  return tmp;
}
function nLength(n, nBitLength) {
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLen2, isLE3 = false, redef = {}) {
  if (ORDER <= _0n2)
    throw new Error(`Expected Field ORDER > 0, got ${ORDER}`);
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen2);
  if (BYTES > 2048)
    throw new Error("Field lengths over 2048 bytes are not supported");
  const sqrtP = FpSqrt(ORDER);
  const f = Object.freeze({
    ORDER,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n2,
    ONE: _1n2,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
      return _0n2 <= num && num < ORDER;
    },
    is0: (num) => num === _0n2,
    isOdd: (num) => (num & _1n2) === _1n2,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: redef.sqrt || ((n) => sqrtP(f, n)),
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // TODO: do we really need constant cmov?
    // We don't have const-time bigints anyway, so probably will be not very useful
    cmov: (a, b, c) => c ? b : a,
    toBytes: (num) => isLE3 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes3) => {
      if (bytes3.length !== BYTES)
        throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes3.length}`);
      return isLE3 ? bytesToNumberLE(bytes3) : bytesToNumberBE(bytes3);
    }
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE3 = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error(`expected ${minLen}-1024 bytes of input, got ${len}`);
  const num = isLE3 ? bytesToNumberBE(key) : bytesToNumberLE(key);
  const reduced = mod(num, fieldOrder - _1n2) + _1n2;
  return isLE3 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/@noble/curves/esm/abstract/curve.js
var _0n3 = BigInt(0);
var _1n3 = BigInt(1);
function wNAF(c, bits) {
  const constTimeNegate = (condition, item) => {
    const neg = item.negate();
    return condition ? neg : item;
  };
  const opts = (W) => {
    const windows = Math.ceil(bits / W) + 1;
    const windowSize = 2 ** (W - 1);
    return { windows, windowSize };
  };
  return {
    constTimeNegate,
    // non-const time multiplication ladder
    unsafeLadder(elm, n) {
      let p = c.ZERO;
      let d = elm;
      while (n > _0n3) {
        if (n & _1n3)
          p = p.add(d);
        d = d.double();
        n >>= _1n3;
      }
      return p;
    },
    /**
     * Creates a wNAF precomputation window. Used for caching.
     * Default window size is set by `utils.precompute()` and is equal to 8.
     * Number of precomputed points depends on the curve size:
     * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
     * - 𝑊 is the window size
     * - 𝑛 is the bitlength of the curve order.
     * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
     * @returns precomputed point tables flattened to a single array
     */
    precomputeWindow(elm, W) {
      const { windows, windowSize } = opts(W);
      const points = [];
      let p = elm;
      let base = p;
      for (let window2 = 0; window2 < windows; window2++) {
        base = p;
        points.push(base);
        for (let i2 = 1; i2 < windowSize; i2++) {
          base = base.add(p);
          points.push(base);
        }
        p = base.double();
      }
      return points;
    },
    /**
     * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
     * @param W window size
     * @param precomputes precomputed tables
     * @param n scalar (we don't check here, but should be less than curve order)
     * @returns real and fake (for const-time) points
     */
    wNAF(W, precomputes, n) {
      const { windows, windowSize } = opts(W);
      let p = c.ZERO;
      let f = c.BASE;
      const mask = BigInt(2 ** W - 1);
      const maxNumber = 2 ** W;
      const shiftBy = BigInt(W);
      for (let window2 = 0; window2 < windows; window2++) {
        const offset = window2 * windowSize;
        let wbits = Number(n & mask);
        n >>= shiftBy;
        if (wbits > windowSize) {
          wbits -= maxNumber;
          n += _1n3;
        }
        const offset1 = offset;
        const offset2 = offset + Math.abs(wbits) - 1;
        const cond1 = window2 % 2 !== 0;
        const cond2 = wbits < 0;
        if (wbits === 0) {
          f = f.add(constTimeNegate(cond1, precomputes[offset1]));
        } else {
          p = p.add(constTimeNegate(cond2, precomputes[offset2]));
        }
      }
      return { p, f };
    },
    wNAFCached(P, precomputesMap, n, transform) {
      const W = P._WINDOW_SIZE || 1;
      let comp = precomputesMap.get(P);
      if (!comp) {
        comp = this.precomputeWindow(P, W);
        if (W !== 1) {
          precomputesMap.set(P, transform(comp));
        }
      }
      return this.wNAF(W, comp, n);
    }
  };
}
function validateBasic(curve) {
  validateField(curve.Fp);
  validateObject(curve, {
    n: "bigint",
    h: "bigint",
    Gx: "field",
    Gy: "field"
  }, {
    nBitLength: "isSafeInteger",
    nByteLength: "isSafeInteger"
  });
  return Object.freeze({
    ...nLength(curve.n, curve.nBitLength),
    ...curve,
    ...{ p: curve.Fp.ORDER }
  });
}

// node_modules/@noble/curves/esm/abstract/weierstrass.js
function validatePointOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    a: "field",
    b: "field"
  }, {
    allowedPrivateKeyLengths: "array",
    wrapPrivateKey: "boolean",
    isTorsionFree: "function",
    clearCofactor: "function",
    allowInfinityPoint: "boolean",
    fromBytes: "function",
    toBytes: "function"
  });
  const { endo, Fp: Fp2, a } = opts;
  if (endo) {
    if (!Fp2.eql(a, Fp2.ZERO)) {
      throw new Error("Endomorphism can only be defined for Koblitz curves that have a=0");
    }
    if (typeof endo !== "object" || typeof endo.beta !== "bigint" || typeof endo.splitScalar !== "function") {
      throw new Error("Expected endomorphism with beta: bigint and splitScalar: function");
    }
  }
  return Object.freeze({ ...opts });
}
var { bytesToNumberBE: b2n, hexToBytes: h2b } = utils_exports;
var DER = {
  // asn.1 DER encoding utils
  Err: class DERErr extends Error {
    constructor(m = "") {
      super(m);
    }
  },
  _parseInt(data) {
    const { Err: E } = DER;
    if (data.length < 2 || data[0] !== 2)
      throw new E("Invalid signature integer tag");
    const len = data[1];
    const res = data.subarray(2, len + 2);
    if (!len || res.length !== len)
      throw new E("Invalid signature integer: wrong length");
    if (res[0] & 128)
      throw new E("Invalid signature integer: negative");
    if (res[0] === 0 && !(res[1] & 128))
      throw new E("Invalid signature integer: unnecessary leading zero");
    return { d: b2n(res), l: data.subarray(len + 2) };
  },
  toSig(hex3) {
    const { Err: E } = DER;
    const data = typeof hex3 === "string" ? h2b(hex3) : hex3;
    if (!(data instanceof Uint8Array))
      throw new Error("ui8a expected");
    let l = data.length;
    if (l < 2 || data[0] != 48)
      throw new E("Invalid signature tag");
    if (data[1] !== l - 2)
      throw new E("Invalid signature: incorrect length");
    const { d: r, l: sBytes } = DER._parseInt(data.subarray(2));
    const { d: s, l: rBytesLeft } = DER._parseInt(sBytes);
    if (rBytesLeft.length)
      throw new E("Invalid signature: left bytes after parsing");
    return { r, s };
  },
  hexFromSig(sig) {
    const slice = (s2) => Number.parseInt(s2[0], 16) & 8 ? "00" + s2 : s2;
    const h = (num) => {
      const hex3 = num.toString(16);
      return hex3.length & 1 ? `0${hex3}` : hex3;
    };
    const s = slice(h(sig.s));
    const r = slice(h(sig.r));
    const shl = s.length / 2;
    const rhl = r.length / 2;
    const sl = h(shl);
    const rl = h(rhl);
    return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
  }
};
var _0n4 = BigInt(0);
var _1n4 = BigInt(1);
var _2n3 = BigInt(2);
var _3n2 = BigInt(3);
var _4n2 = BigInt(4);
function weierstrassPoints(opts) {
  const CURVE = validatePointOpts(opts);
  const { Fp: Fp2 } = CURVE;
  const toBytes3 = CURVE.toBytes || ((_c, point, _isCompressed) => {
    const a = point.toAffine();
    return concatBytes2(Uint8Array.from([4]), Fp2.toBytes(a.x), Fp2.toBytes(a.y));
  });
  const fromBytes = CURVE.fromBytes || ((bytes3) => {
    const tail = bytes3.subarray(1);
    const x = Fp2.fromBytes(tail.subarray(0, Fp2.BYTES));
    const y = Fp2.fromBytes(tail.subarray(Fp2.BYTES, 2 * Fp2.BYTES));
    return { x, y };
  });
  function weierstrassEquation(x) {
    const { a, b } = CURVE;
    const x2 = Fp2.sqr(x);
    const x3 = Fp2.mul(x2, x);
    return Fp2.add(Fp2.add(x3, Fp2.mul(x, a)), b);
  }
  if (!Fp2.eql(Fp2.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
    throw new Error("bad generator point: equation left != right");
  function isWithinCurveOrder(num) {
    return typeof num === "bigint" && _0n4 < num && num < CURVE.n;
  }
  function assertGE(num) {
    if (!isWithinCurveOrder(num))
      throw new Error("Expected valid bigint: 0 < bigint < curve.n");
  }
  function normPrivateKeyToScalar(key) {
    const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n } = CURVE;
    if (lengths && typeof key !== "bigint") {
      if (key instanceof Uint8Array)
        key = bytesToHex(key);
      if (typeof key !== "string" || !lengths.includes(key.length))
        throw new Error("Invalid key");
      key = key.padStart(nByteLength * 2, "0");
    }
    let num;
    try {
      num = typeof key === "bigint" ? key : bytesToNumberBE(ensureBytes("private key", key, nByteLength));
    } catch (error) {
      throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
    }
    if (wrapPrivateKey)
      num = mod(num, n);
    assertGE(num);
    return num;
  }
  const pointPrecomputes = /* @__PURE__ */ new Map();
  function assertPrjPoint(other) {
    if (!(other instanceof Point2))
      throw new Error("ProjectivePoint expected");
  }
  class Point2 {
    constructor(px, py, pz) {
      this.px = px;
      this.py = py;
      this.pz = pz;
      if (px == null || !Fp2.isValid(px))
        throw new Error("x required");
      if (py == null || !Fp2.isValid(py))
        throw new Error("y required");
      if (pz == null || !Fp2.isValid(pz))
        throw new Error("z required");
    }
    // Does not validate if the point is on-curve.
    // Use fromHex instead, or call assertValidity() later.
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      const is0 = (i2) => Fp2.eql(i2, Fp2.ZERO);
      if (is0(x) && is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp2.ONE);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * Takes a bunch of Projective Points but executes only one
     * inversion on all of them. Inversion is very slow operation,
     * so this improves performance massively.
     * Optimization: converts a list of projective points to a list of identical points with Z=1.
     */
    static normalizeZ(points) {
      const toInv = Fp2.invertBatch(points.map((p) => p.pz));
      return points.map((p, i2) => p.toAffine(toInv[i2])).map(Point2.fromAffine);
    }
    /**
     * Converts hash string or Uint8Array to Point.
     * @param hex short/long ECDSA hex
     */
    static fromHex(hex3) {
      const P = Point2.fromAffine(fromBytes(ensureBytes("pointHex", hex3)));
      P.assertValidity();
      return P;
    }
    // Multiplies generator point by privateKey.
    static fromPrivateKey(privateKey) {
      return Point2.BASE.multiply(normPrivateKeyToScalar(privateKey));
    }
    // "Private method", don't use it directly
    _setWindowSize(windowSize) {
      this._WINDOW_SIZE = windowSize;
      pointPrecomputes.delete(this);
    }
    // A point on curve is valid if it conforms to equation.
    assertValidity() {
      if (this.is0()) {
        if (CURVE.allowInfinityPoint && !Fp2.is0(this.py))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x, y } = this.toAffine();
      if (!Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("bad point: x or y not FE");
      const left = Fp2.sqr(y);
      const right = weierstrassEquation(x);
      if (!Fp2.eql(left, right))
        throw new Error("bad point: equation left != right");
      if (!this.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (Fp2.isOdd)
        return !Fp2.isOdd(y);
      throw new Error("Field doesn't support isOdd");
    }
    /**
     * Compare one point to another.
     */
    equals(other) {
      assertPrjPoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      const U1 = Fp2.eql(Fp2.mul(X1, Z2), Fp2.mul(X2, Z1));
      const U2 = Fp2.eql(Fp2.mul(Y1, Z2), Fp2.mul(Y2, Z1));
      return U1 && U2;
    }
    /**
     * Flips point to one corresponding to (x, -y) in Affine coordinates.
     */
    negate() {
      return new Point2(this.px, Fp2.neg(this.py), this.pz);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp2.mul(b, _3n2);
      const { px: X1, py: Y1, pz: Z1 } = this;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      let t0 = Fp2.mul(X1, X1);
      let t1 = Fp2.mul(Y1, Y1);
      let t2 = Fp2.mul(Z1, Z1);
      let t3 = Fp2.mul(X1, Y1);
      t3 = Fp2.add(t3, t3);
      Z3 = Fp2.mul(X1, Z1);
      Z3 = Fp2.add(Z3, Z3);
      X3 = Fp2.mul(a, Z3);
      Y3 = Fp2.mul(b3, t2);
      Y3 = Fp2.add(X3, Y3);
      X3 = Fp2.sub(t1, Y3);
      Y3 = Fp2.add(t1, Y3);
      Y3 = Fp2.mul(X3, Y3);
      X3 = Fp2.mul(t3, X3);
      Z3 = Fp2.mul(b3, Z3);
      t2 = Fp2.mul(a, t2);
      t3 = Fp2.sub(t0, t2);
      t3 = Fp2.mul(a, t3);
      t3 = Fp2.add(t3, Z3);
      Z3 = Fp2.add(t0, t0);
      t0 = Fp2.add(Z3, t0);
      t0 = Fp2.add(t0, t2);
      t0 = Fp2.mul(t0, t3);
      Y3 = Fp2.add(Y3, t0);
      t2 = Fp2.mul(Y1, Z1);
      t2 = Fp2.add(t2, t2);
      t0 = Fp2.mul(t2, t3);
      X3 = Fp2.sub(X3, t0);
      Z3 = Fp2.mul(t2, t1);
      Z3 = Fp2.add(Z3, Z3);
      Z3 = Fp2.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      assertPrjPoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      const a = CURVE.a;
      const b3 = Fp2.mul(CURVE.b, _3n2);
      let t0 = Fp2.mul(X1, X2);
      let t1 = Fp2.mul(Y1, Y2);
      let t2 = Fp2.mul(Z1, Z2);
      let t3 = Fp2.add(X1, Y1);
      let t4 = Fp2.add(X2, Y2);
      t3 = Fp2.mul(t3, t4);
      t4 = Fp2.add(t0, t1);
      t3 = Fp2.sub(t3, t4);
      t4 = Fp2.add(X1, Z1);
      let t5 = Fp2.add(X2, Z2);
      t4 = Fp2.mul(t4, t5);
      t5 = Fp2.add(t0, t2);
      t4 = Fp2.sub(t4, t5);
      t5 = Fp2.add(Y1, Z1);
      X3 = Fp2.add(Y2, Z2);
      t5 = Fp2.mul(t5, X3);
      X3 = Fp2.add(t1, t2);
      t5 = Fp2.sub(t5, X3);
      Z3 = Fp2.mul(a, t4);
      X3 = Fp2.mul(b3, t2);
      Z3 = Fp2.add(X3, Z3);
      X3 = Fp2.sub(t1, Z3);
      Z3 = Fp2.add(t1, Z3);
      Y3 = Fp2.mul(X3, Z3);
      t1 = Fp2.add(t0, t0);
      t1 = Fp2.add(t1, t0);
      t2 = Fp2.mul(a, t2);
      t4 = Fp2.mul(b3, t4);
      t1 = Fp2.add(t1, t2);
      t2 = Fp2.sub(t0, t2);
      t2 = Fp2.mul(a, t2);
      t4 = Fp2.add(t4, t2);
      t0 = Fp2.mul(t1, t4);
      Y3 = Fp2.add(Y3, t0);
      t0 = Fp2.mul(t5, t4);
      X3 = Fp2.mul(t3, X3);
      X3 = Fp2.sub(X3, t0);
      t0 = Fp2.mul(t3, t1);
      Z3 = Fp2.mul(t5, Z3);
      Z3 = Fp2.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    wNAF(n) {
      return wnaf.wNAFCached(this, pointPrecomputes, n, (comp) => {
        const toInv = Fp2.invertBatch(comp.map((p) => p.pz));
        return comp.map((p, i2) => p.toAffine(toInv[i2])).map(Point2.fromAffine);
      });
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed private key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(n) {
      const I = Point2.ZERO;
      if (n === _0n4)
        return I;
      assertGE(n);
      if (n === _1n4)
        return this;
      const { endo } = CURVE;
      if (!endo)
        return wnaf.unsafeLadder(this, n);
      let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
      let k1p = I;
      let k2p = I;
      let d = this;
      while (k1 > _0n4 || k2 > _0n4) {
        if (k1 & _1n4)
          k1p = k1p.add(d);
        if (k2 & _1n4)
          k2p = k2p.add(d);
        d = d.double();
        k1 >>= _1n4;
        k2 >>= _1n4;
      }
      if (k1neg)
        k1p = k1p.negate();
      if (k2neg)
        k2p = k2p.negate();
      k2p = new Point2(Fp2.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
      return k1p.add(k2p);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      assertGE(scalar);
      let n = scalar;
      let point, fake;
      const { endo } = CURVE;
      if (endo) {
        const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n);
        let { p: k1p, f: f1p } = this.wNAF(k1);
        let { p: k2p, f: f2p } = this.wNAF(k2);
        k1p = wnaf.constTimeNegate(k1neg, k1p);
        k2p = wnaf.constTimeNegate(k2neg, k2p);
        k2p = new Point2(Fp2.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
        point = k1p.add(k2p);
        fake = f1p.add(f2p);
      } else {
        const { p, f } = this.wNAF(n);
        point = p;
        fake = f;
      }
      return Point2.normalizeZ([point, fake])[0];
    }
    /**
     * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
     * Not using Strauss-Shamir trick: precomputation tables are faster.
     * The trick could be useful if both P and Q are not G (not in our case).
     * @returns non-zero affine point
     */
    multiplyAndAddUnsafe(Q, a, b) {
      const G = Point2.BASE;
      const mul = (P, a2) => a2 === _0n4 || a2 === _1n4 || !P.equals(G) ? P.multiplyUnsafe(a2) : P.multiply(a2);
      const sum = mul(this, a).add(mul(Q, b));
      return sum.is0() ? void 0 : sum;
    }
    // Converts Projective point to affine (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    // (x, y, z) ∋ (x=x/z, y=y/z)
    toAffine(iz) {
      const { px: x, py: y, pz: z } = this;
      const is0 = this.is0();
      if (iz == null)
        iz = is0 ? Fp2.ONE : Fp2.inv(z);
      const ax = Fp2.mul(x, iz);
      const ay = Fp2.mul(y, iz);
      const zz = Fp2.mul(z, iz);
      if (is0)
        return { x: Fp2.ZERO, y: Fp2.ZERO };
      if (!Fp2.eql(zz, Fp2.ONE))
        throw new Error("invZ was invalid");
      return { x: ax, y: ay };
    }
    isTorsionFree() {
      const { h: cofactor, isTorsionFree } = CURVE;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      throw new Error("isTorsionFree() has not been declared for the elliptic curve");
    }
    clearCofactor() {
      const { h: cofactor, clearCofactor } = CURVE;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(CURVE.h);
    }
    toRawBytes(isCompressed = true) {
      this.assertValidity();
      return toBytes3(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toRawBytes(isCompressed));
    }
  }
  Point2.BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp2.ONE);
  Point2.ZERO = new Point2(Fp2.ZERO, Fp2.ONE, Fp2.ZERO);
  const _bits = CURVE.nBitLength;
  const wnaf = wNAF(Point2, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
  return {
    CURVE,
    ProjectivePoint: Point2,
    normPrivateKeyToScalar,
    weierstrassEquation,
    isWithinCurveOrder
  };
}
function validateOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    hash: "hash",
    hmac: "function",
    randomBytes: "function"
  }, {
    bits2int: "function",
    bits2int_modN: "function",
    lowS: "boolean"
  });
  return Object.freeze({ lowS: true, ...opts });
}
function weierstrass(curveDef) {
  const CURVE = validateOpts(curveDef);
  const { Fp: Fp2, n: CURVE_ORDER } = CURVE;
  const compressedLen = Fp2.BYTES + 1;
  const uncompressedLen = 2 * Fp2.BYTES + 1;
  function isValidFieldElement(num) {
    return _0n4 < num && num < Fp2.ORDER;
  }
  function modN2(a) {
    return mod(a, CURVE_ORDER);
  }
  function invN(a) {
    return invert(a, CURVE_ORDER);
  }
  const { ProjectivePoint: Point2, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder } = weierstrassPoints({
    ...CURVE,
    toBytes(_c, point, isCompressed) {
      const a = point.toAffine();
      const x = Fp2.toBytes(a.x);
      const cat = concatBytes2;
      if (isCompressed) {
        return cat(Uint8Array.from([point.hasEvenY() ? 2 : 3]), x);
      } else {
        return cat(Uint8Array.from([4]), x, Fp2.toBytes(a.y));
      }
    },
    fromBytes(bytes3) {
      const len = bytes3.length;
      const head = bytes3[0];
      const tail = bytes3.subarray(1);
      if (len === compressedLen && (head === 2 || head === 3)) {
        const x = bytesToNumberBE(tail);
        if (!isValidFieldElement(x))
          throw new Error("Point is not on curve");
        const y2 = weierstrassEquation(x);
        let y = Fp2.sqrt(y2);
        const isYOdd = (y & _1n4) === _1n4;
        const isHeadOdd = (head & 1) === 1;
        if (isHeadOdd !== isYOdd)
          y = Fp2.neg(y);
        return { x, y };
      } else if (len === uncompressedLen && head === 4) {
        const x = Fp2.fromBytes(tail.subarray(0, Fp2.BYTES));
        const y = Fp2.fromBytes(tail.subarray(Fp2.BYTES, 2 * Fp2.BYTES));
        return { x, y };
      } else {
        throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
      }
    }
  });
  const numToNByteStr = (num) => bytesToHex(numberToBytesBE(num, CURVE.nByteLength));
  function isBiggerThanHalfOrder(number3) {
    const HALF = CURVE_ORDER >> _1n4;
    return number3 > HALF;
  }
  function normalizeS(s) {
    return isBiggerThanHalfOrder(s) ? modN2(-s) : s;
  }
  const slcNum = (b, from, to) => bytesToNumberBE(b.slice(from, to));
  class Signature {
    constructor(r, s, recovery) {
      this.r = r;
      this.s = s;
      this.recovery = recovery;
      this.assertValidity();
    }
    // pair (bytes of r, bytes of s)
    static fromCompact(hex3) {
      const l = CURVE.nByteLength;
      hex3 = ensureBytes("compactSignature", hex3, l * 2);
      return new Signature(slcNum(hex3, 0, l), slcNum(hex3, l, 2 * l));
    }
    // DER encoded ECDSA signature
    // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
    static fromDER(hex3) {
      const { r, s } = DER.toSig(ensureBytes("DER", hex3));
      return new Signature(r, s);
    }
    assertValidity() {
      if (!isWithinCurveOrder(this.r))
        throw new Error("r must be 0 < r < CURVE.n");
      if (!isWithinCurveOrder(this.s))
        throw new Error("s must be 0 < s < CURVE.n");
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(msgHash) {
      const { r, s, recovery: rec } = this;
      const h = bits2int_modN(ensureBytes("msgHash", msgHash));
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
      if (radj >= Fp2.ORDER)
        throw new Error("recovery id 2 or 3 invalid");
      const prefix = (rec & 1) === 0 ? "02" : "03";
      const R = Point2.fromHex(prefix + numToNByteStr(radj));
      const ir = invN(radj);
      const u1 = modN2(-h * ir);
      const u2 = modN2(s * ir);
      const Q = Point2.BASE.multiplyAndAddUnsafe(R, u1, u2);
      if (!Q)
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    normalizeS() {
      return this.hasHighS() ? new Signature(this.r, modN2(-this.s), this.recovery) : this;
    }
    // DER-encoded
    toDERRawBytes() {
      return hexToBytes(this.toDERHex());
    }
    toDERHex() {
      return DER.hexFromSig({ r: this.r, s: this.s });
    }
    // padded bytes of r, then padded bytes of s
    toCompactRawBytes() {
      return hexToBytes(this.toCompactHex());
    }
    toCompactHex() {
      return numToNByteStr(this.r) + numToNByteStr(this.s);
    }
  }
  const utils = {
    isValidPrivateKey(privateKey) {
      try {
        normPrivateKeyToScalar(privateKey);
        return true;
      } catch (error) {
        return false;
      }
    },
    normPrivateKeyToScalar,
    /**
     * Produces cryptographically secure private key from random of size
     * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
     */
    randomPrivateKey: () => {
      const length = getMinHashLength(CURVE.n);
      return mapHashToField(CURVE.randomBytes(length), CURVE.n);
    },
    /**
     * Creates precompute table for an arbitrary EC point. Makes point "cached".
     * Allows to massively speed-up `point.multiply(scalar)`.
     * @returns cached point
     * @example
     * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
     * fast.multiply(privKey); // much faster ECDH now
     */
    precompute(windowSize = 8, point = Point2.BASE) {
      point._setWindowSize(windowSize);
      point.multiply(BigInt(3));
      return point;
    }
  };
  function getPublicKey2(privateKey, isCompressed = true) {
    return Point2.fromPrivateKey(privateKey).toRawBytes(isCompressed);
  }
  function isProbPub(item) {
    const arr = item instanceof Uint8Array;
    const str = typeof item === "string";
    const len = (arr || str) && item.length;
    if (arr)
      return len === compressedLen || len === uncompressedLen;
    if (str)
      return len === 2 * compressedLen || len === 2 * uncompressedLen;
    if (item instanceof Point2)
      return true;
    return false;
  }
  function getSharedSecret(privateA, publicB, isCompressed = true) {
    if (isProbPub(privateA))
      throw new Error("first arg must be private key");
    if (!isProbPub(publicB))
      throw new Error("second arg must be public key");
    const b = Point2.fromHex(publicB);
    return b.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
  }
  const bits2int = CURVE.bits2int || function(bytes3) {
    const num = bytesToNumberBE(bytes3);
    const delta = bytes3.length * 8 - CURVE.nBitLength;
    return delta > 0 ? num >> BigInt(delta) : num;
  };
  const bits2int_modN = CURVE.bits2int_modN || function(bytes3) {
    return modN2(bits2int(bytes3));
  };
  const ORDER_MASK = bitMask(CURVE.nBitLength);
  function int2octets(num) {
    if (typeof num !== "bigint")
      throw new Error("bigint expected");
    if (!(_0n4 <= num && num < ORDER_MASK))
      throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
    return numberToBytesBE(num, CURVE.nByteLength);
  }
  function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { hash: hash3, randomBytes: randomBytes2 } = CURVE;
    let { lowS, prehash, extraEntropy: ent } = opts;
    if (lowS == null)
      lowS = true;
    msgHash = ensureBytes("msgHash", msgHash);
    if (prehash)
      msgHash = ensureBytes("prehashed msgHash", hash3(msgHash));
    const h1int = bits2int_modN(msgHash);
    const d = normPrivateKeyToScalar(privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (ent != null) {
      const e = ent === true ? randomBytes2(Fp2.BYTES) : ent;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!isWithinCurveOrder(k))
        return;
      const ik = invN(k);
      const q = Point2.BASE.multiply(k).toAffine();
      const r = modN2(q.x);
      if (r === _0n4)
        return;
      const s = modN2(ik * modN2(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = normalizeS(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, recovery);
    }
    return { seed, k2sig };
  }
  const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
  const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
  function sign(msgHash, privKey, opts = defaultSigOpts) {
    const { seed, k2sig } = prepSig(msgHash, privKey, opts);
    const C = CURVE;
    const drbg = createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
    return drbg(seed, k2sig);
  }
  Point2.BASE._setWindowSize(8);
  function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
    const sg = signature;
    msgHash = ensureBytes("msgHash", msgHash);
    publicKey = ensureBytes("publicKey", publicKey);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    const { lowS, prehash } = opts;
    let _sig = void 0;
    let P;
    try {
      if (typeof sg === "string" || sg instanceof Uint8Array) {
        try {
          _sig = Signature.fromDER(sg);
        } catch (derError) {
          if (!(derError instanceof DER.Err))
            throw derError;
          _sig = Signature.fromCompact(sg);
        }
      } else if (typeof sg === "object" && typeof sg.r === "bigint" && typeof sg.s === "bigint") {
        const { r: r2, s: s2 } = sg;
        _sig = new Signature(r2, s2);
      } else {
        throw new Error("PARSE");
      }
      P = Point2.fromHex(publicKey);
    } catch (error) {
      if (error.message === "PARSE")
        throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
      return false;
    }
    if (lowS && _sig.hasHighS())
      return false;
    if (prehash)
      msgHash = CURVE.hash(msgHash);
    const { r, s } = _sig;
    const h = bits2int_modN(msgHash);
    const is = invN(s);
    const u1 = modN2(h * is);
    const u2 = modN2(r * is);
    const R = Point2.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine();
    if (!R)
      return false;
    const v = modN2(R.x);
    return v === r;
  }
  return {
    CURVE,
    getPublicKey: getPublicKey2,
    getSharedSecret,
    sign,
    verify,
    ProjectivePoint: Point2,
    Signature,
    utils
  };
}

// node_modules/@noble/curves/node_modules/@noble/hashes/esm/hmac.js
var HMAC = class extends Hash {
  constructor(hash3, _key) {
    super();
    this.finished = false;
    this.destroyed = false;
    hash(hash3);
    const key = toBytes(_key);
    this.iHash = hash3.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad = new Uint8Array(blockLen);
    pad.set(key.length > blockLen ? hash3.create().update(key).digest() : key);
    for (let i2 = 0; i2 < pad.length; i2++)
      pad[i2] ^= 54;
    this.iHash.update(pad);
    this.oHash = hash3.create();
    for (let i2 = 0; i2 < pad.length; i2++)
      pad[i2] ^= 54 ^ 92;
    this.oHash.update(pad);
    pad.fill(0);
  }
  update(buf) {
    exists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    exists(this);
    bytes(out, this.outputLen);
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to || (to = Object.create(Object.getPrototypeOf(this), {}));
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash3, key, message) => new HMAC(hash3, key).update(message).digest();
hmac.create = (hash3, key) => new HMAC(hash3, key);

// node_modules/@noble/curves/esm/_shortw_utils.js
function getHash(hash3) {
  return {
    hash: hash3,
    hmac: (key, ...msgs) => hmac(hash3, key, concatBytes(...msgs)),
    randomBytes
  };
}
function createCurve(curveDef, defHash) {
  const create = (hash3) => weierstrass({ ...curveDef, ...getHash(hash3) });
  return Object.freeze({ ...create(defHash), create });
}

// node_modules/@noble/curves/esm/secp256k1.js
var secp256k1P = BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f");
var secp256k1N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
var _1n5 = BigInt(1);
var _2n4 = BigInt(2);
var divNearest = (a, b) => (a + b / _2n4) / b;
function sqrtMod(y) {
  const P = secp256k1P;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n4, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n4, P);
  if (!Fp.eql(Fp.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fp = Field(secp256k1P, void 0, void 0, { sqrt: sqrtMod });
var secp256k1 = createCurve({
  a: BigInt(0),
  b: BigInt(7),
  Fp,
  n: secp256k1N,
  // Base point (x, y) aka generator point
  Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
  Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
  h: BigInt(1),
  lowS: true,
  /**
   * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
   * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
   * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
   * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
   */
  endo: {
    beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
    splitScalar: (k) => {
      const n = secp256k1N;
      const a1 = BigInt("0x3086d221a7d46bcde86c90e49284eb15");
      const b1 = -_1n5 * BigInt("0xe4437ed6010e88286f547fa90abfe4c3");
      const a2 = BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8");
      const b2 = a1;
      const POW_2_128 = BigInt("0x100000000000000000000000000000000");
      const c1 = divNearest(b2 * k, n);
      const c2 = divNearest(-b1 * k, n);
      let k1 = mod(k - c1 * a1 - c2 * a2, n);
      let k2 = mod(-c1 * b1 - c2 * b2, n);
      const k1neg = k1 > POW_2_128;
      const k2neg = k2 > POW_2_128;
      if (k1neg)
        k1 = n - k1;
      if (k2neg)
        k2 = n - k2;
      if (k1 > POW_2_128 || k2 > POW_2_128) {
        throw new Error("splitScalar: Endomorphism failed, k=" + k);
      }
      return { k1neg, k1, k2neg, k2 };
    }
  }
}, sha256);
var _0n5 = BigInt(0);
var fe = (x) => typeof x === "bigint" && _0n5 < x && x < secp256k1P;
var ge = (x) => typeof x === "bigint" && _0n5 < x && x < secp256k1N;
var TAGGED_HASH_PREFIXES = {};
function taggedHash(tag2, ...messages) {
  let tagP = TAGGED_HASH_PREFIXES[tag2];
  if (tagP === void 0) {
    const tagH = sha256(Uint8Array.from(tag2, (c) => c.charCodeAt(0)));
    tagP = concatBytes2(tagH, tagH);
    TAGGED_HASH_PREFIXES[tag2] = tagP;
  }
  return sha256(concatBytes2(tagP, ...messages));
}
var pointToBytes = (point) => point.toRawBytes(true).slice(1);
var numTo32b = (n) => numberToBytesBE(n, 32);
var modP = (x) => mod(x, secp256k1P);
var modN = (x) => mod(x, secp256k1N);
var Point = secp256k1.ProjectivePoint;
var GmulAdd = (Q, a, b) => Point.BASE.multiplyAndAddUnsafe(Q, a, b);
function schnorrGetExtPubKey(priv) {
  let d_ = secp256k1.utils.normPrivateKeyToScalar(priv);
  let p = Point.fromPrivateKey(d_);
  const scalar = p.hasEvenY() ? d_ : modN(-d_);
  return { scalar, bytes: pointToBytes(p) };
}
function lift_x(x) {
  if (!fe(x))
    throw new Error("bad x: need 0 < x < p");
  const xx = modP(x * x);
  const c = modP(xx * x + BigInt(7));
  let y = sqrtMod(c);
  if (y % _2n4 !== _0n5)
    y = modP(-y);
  const p = new Point(x, y, _1n5);
  p.assertValidity();
  return p;
}
function challenge(...args) {
  return modN(bytesToNumberBE(taggedHash("BIP0340/challenge", ...args)));
}
function schnorrGetPublicKey(privateKey) {
  return schnorrGetExtPubKey(privateKey).bytes;
}
function schnorrSign(message, privateKey, auxRand = randomBytes(32)) {
  const m = ensureBytes("message", message);
  const { bytes: px, scalar: d } = schnorrGetExtPubKey(privateKey);
  const a = ensureBytes("auxRand", auxRand, 32);
  const t = numTo32b(d ^ bytesToNumberBE(taggedHash("BIP0340/aux", a)));
  const rand = taggedHash("BIP0340/nonce", t, px, m);
  const k_ = modN(bytesToNumberBE(rand));
  if (k_ === _0n5)
    throw new Error("sign failed: k is zero");
  const { bytes: rx, scalar: k } = schnorrGetExtPubKey(k_);
  const e = challenge(rx, px, m);
  const sig = new Uint8Array(64);
  sig.set(rx, 0);
  sig.set(numTo32b(modN(k + e * d)), 32);
  if (!schnorrVerify(sig, m, px))
    throw new Error("sign: Invalid signature produced");
  return sig;
}
function schnorrVerify(signature, message, publicKey) {
  const sig = ensureBytes("signature", signature, 64);
  const m = ensureBytes("message", message);
  const pub = ensureBytes("publicKey", publicKey, 32);
  try {
    const P = lift_x(bytesToNumberBE(pub));
    const r = bytesToNumberBE(sig.subarray(0, 32));
    if (!fe(r))
      return false;
    const s = bytesToNumberBE(sig.subarray(32, 64));
    if (!ge(s))
      return false;
    const e = challenge(numTo32b(r), pointToBytes(P), m);
    const R = GmulAdd(P, s, modN(-e));
    if (!R || !R.hasEvenY() || R.toAffine().x !== r)
      return false;
    return true;
  } catch (error) {
    return false;
  }
}
var schnorr = /* @__PURE__ */ (() => ({
  getPublicKey: schnorrGetPublicKey,
  sign: schnorrSign,
  verify: schnorrVerify,
  utils: {
    randomPrivateKey: secp256k1.utils.randomPrivateKey,
    lift_x,
    pointToBytes,
    numberToBytesBE,
    bytesToNumberBE,
    taggedHash,
    mod
  }
}))();

// node_modules/@noble/hashes/esm/crypto.js
var crypto2 = typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : void 0;

// node_modules/@noble/hashes/esm/utils.js
var u8a3 = (a) => a instanceof Uint8Array;
var createView2 = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
var rotr2 = (word, shift) => word << 32 - shift | word >>> shift;
var isLE2 = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
if (!isLE2)
  throw new Error("Non little-endian hardware is not supported");
var hexes2 = Array.from({ length: 256 }, (v, i2) => i2.toString(16).padStart(2, "0"));
function bytesToHex2(bytes3) {
  if (!u8a3(bytes3))
    throw new Error("Uint8Array expected");
  let hex3 = "";
  for (let i2 = 0; i2 < bytes3.length; i2++) {
    hex3 += hexes2[bytes3[i2]];
  }
  return hex3;
}
function utf8ToBytes3(str) {
  if (typeof str !== "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes2(data) {
  if (typeof data === "string")
    data = utf8ToBytes3(data);
  if (!u8a3(data))
    throw new Error(`expected Uint8Array, got ${typeof data}`);
  return data;
}
function concatBytes3(...arrays) {
  const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let pad = 0;
  arrays.forEach((a) => {
    if (!u8a3(a))
      throw new Error("Uint8Array expected");
    r.set(a, pad);
    pad += a.length;
  });
  return r;
}
var Hash2 = class {
  // Safe version that clones internal state
  clone() {
    return this._cloneInto();
  }
};
function wrapConstructor2(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes2(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/_assert.js
function number2(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error(`Wrong positive integer: ${n}`);
}
function bool(b) {
  if (typeof b !== "boolean")
    throw new Error(`Expected boolean, not ${b}`);
}
function bytes2(b, ...lengths) {
  if (!(b instanceof Uint8Array))
    throw new Error("Expected Uint8Array");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b.length}`);
}
function hash2(hash3) {
  if (typeof hash3 !== "function" || typeof hash3.create !== "function")
    throw new Error("Hash should be wrapped by utils.wrapConstructor");
  number2(hash3.outputLen);
  number2(hash3.blockLen);
}
function exists2(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function output2(out, instance) {
  bytes2(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error(`digestInto() expects output buffer of length at least ${min}`);
  }
}
var assert = {
  number: number2,
  bool,
  bytes: bytes2,
  hash: hash2,
  exists: exists2,
  output: output2
};
var assert_default = assert;

// node_modules/@noble/hashes/esm/_sha2.js
function setBigUint642(view, byteOffset, value, isLE3) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE3);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE3 ? 4 : 0;
  const l = isLE3 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE3);
  view.setUint32(byteOffset + l, wl, isLE3);
}
var SHA22 = class extends Hash2 {
  constructor(blockLen, outputLen, padOffset, isLE3) {
    super();
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE3;
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView2(this.buffer);
  }
  update(data) {
    assert_default.exists(this);
    const { view, buffer, blockLen } = this;
    data = toBytes2(data);
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView2(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    assert_default.exists(this);
    assert_default.output(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE3 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    this.buffer.subarray(pos).fill(0);
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i2 = pos; i2 < blockLen; i2++)
      buffer[i2] = 0;
    setBigUint642(view, blockLen - 8, BigInt(this.length * 8), isLE3);
    this.process(view, 0);
    const oview = createView2(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i2 = 0; i2 < outLen; i2++)
      oview.setUint32(4 * i2, state[i2], isLE3);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.length = length;
    to.pos = pos;
    to.finished = finished;
    to.destroyed = destroyed;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
};

// node_modules/@noble/hashes/esm/sha256.js
var Chi2 = (a, b, c) => a & b ^ ~a & c;
var Maj2 = (a, b, c) => a & b ^ a & c ^ b & c;
var SHA256_K2 = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var IV2 = new Uint32Array([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);
var SHA256_W2 = new Uint32Array(64);
var SHA2562 = class extends SHA22 {
  constructor() {
    super(64, 32, 8, false);
    this.A = IV2[0] | 0;
    this.B = IV2[1] | 0;
    this.C = IV2[2] | 0;
    this.D = IV2[3] | 0;
    this.E = IV2[4] | 0;
    this.F = IV2[5] | 0;
    this.G = IV2[6] | 0;
    this.H = IV2[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i2 = 0; i2 < 16; i2++, offset += 4)
      SHA256_W2[i2] = view.getUint32(offset, false);
    for (let i2 = 16; i2 < 64; i2++) {
      const W15 = SHA256_W2[i2 - 15];
      const W2 = SHA256_W2[i2 - 2];
      const s0 = rotr2(W15, 7) ^ rotr2(W15, 18) ^ W15 >>> 3;
      const s1 = rotr2(W2, 17) ^ rotr2(W2, 19) ^ W2 >>> 10;
      SHA256_W2[i2] = s1 + SHA256_W2[i2 - 7] + s0 + SHA256_W2[i2 - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i2 = 0; i2 < 64; i2++) {
      const sigma1 = rotr2(E, 6) ^ rotr2(E, 11) ^ rotr2(E, 25);
      const T1 = H + sigma1 + Chi2(E, F, G) + SHA256_K2[i2] + SHA256_W2[i2] | 0;
      const sigma0 = rotr2(A, 2) ^ rotr2(A, 13) ^ rotr2(A, 22);
      const T2 = sigma0 + Maj2(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    SHA256_W2.fill(0);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    this.buffer.fill(0);
  }
};
var SHA224 = class extends SHA2562 {
  constructor() {
    super();
    this.A = 3238371032 | 0;
    this.B = 914150663 | 0;
    this.C = 812702999 | 0;
    this.D = 4144912697 | 0;
    this.E = 4290775857 | 0;
    this.F = 1750603025 | 0;
    this.G = 1694076839 | 0;
    this.H = 3204075428 | 0;
    this.outputLen = 28;
  }
};
var sha2562 = wrapConstructor2(() => new SHA2562());
var sha224 = wrapConstructor2(() => new SHA224());

// node_modules/nostr-tools/lib/esm/pure.js
var verifiedSymbol = Symbol("verified");
var isRecord = (obj) => obj instanceof Object;
function validateEvent(event) {
  if (!isRecord(event))
    return false;
  if (typeof event.kind !== "number")
    return false;
  if (typeof event.content !== "string")
    return false;
  if (typeof event.created_at !== "number")
    return false;
  if (typeof event.pubkey !== "string")
    return false;
  if (!event.pubkey.match(/^[a-f0-9]{64}$/))
    return false;
  if (!Array.isArray(event.tags))
    return false;
  for (let i2 = 0; i2 < event.tags.length; i2++) {
    let tag2 = event.tags[i2];
    if (!Array.isArray(tag2))
      return false;
    for (let j = 0; j < tag2.length; j++) {
      if (typeof tag2[j] !== "string")
        return false;
    }
  }
  return true;
}
var utf8Decoder = new TextDecoder("utf-8");
var utf8Encoder = new TextEncoder();
var JS = class {
  generateSecretKey() {
    return schnorr.utils.randomPrivateKey();
  }
  getPublicKey(secretKey) {
    return bytesToHex2(schnorr.getPublicKey(secretKey));
  }
  finalizeEvent(t, secretKey) {
    const event = t;
    event.pubkey = bytesToHex2(schnorr.getPublicKey(secretKey));
    event.id = getEventHash(event);
    event.sig = bytesToHex2(schnorr.sign(getEventHash(event), secretKey));
    event[verifiedSymbol] = true;
    return event;
  }
  verifyEvent(event) {
    if (typeof event[verifiedSymbol] === "boolean")
      return event[verifiedSymbol];
    const hash3 = getEventHash(event);
    if (hash3 !== event.id) {
      event[verifiedSymbol] = false;
      return false;
    }
    try {
      const valid = schnorr.verify(event.sig, hash3, event.pubkey);
      event[verifiedSymbol] = valid;
      return valid;
    } catch (err) {
      event[verifiedSymbol] = false;
      return false;
    }
  }
};
function serializeEvent(evt) {
  if (!validateEvent(evt))
    throw new Error("can't serialize event with wrong or missing properties");
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
}
function getEventHash(event) {
  let eventHash = sha2562(utf8Encoder.encode(serializeEvent(event)));
  return bytesToHex2(eventHash);
}
var i = new JS();
var generateSecretKey = i.generateSecretKey;
var getPublicKey = i.getPublicKey;
var finalizeEvent = i.finalizeEvent;
var verifyEvent = i.verifyEvent;

// src/core.js
var RELAY = "wss://relay.anmore.me";
function validEvent(input, now = Math.floor(Date.now() / 1e3)) {
  try {
    if (!input || !/^[0-9a-f]{64}$/.test(input.id) || !/^[0-9a-f]{64}$/.test(input.pubkey) || !/^[0-9a-f]{128}$/.test(input.sig) || !Number.isSafeInteger(input.created_at) || input.created_at < 0 || input.created_at > now || !Number.isSafeInteger(input.kind) || input.kind < 0 || input.kind > 65535 || typeof input.content !== "string" || input.content.length > 1e5 || !Array.isArray(input.tags) || input.tags.length > 2e3 || input.tags.some(
      (t) => !Array.isArray(t) || t.length === 0 || t.some((v) => typeof v !== "string")
    ))
      return false;
    return verifyEvent({
      id: input.id,
      pubkey: input.pubkey,
      sig: input.sig,
      created_at: input.created_at,
      kind: input.kind,
      tags: input.tags,
      content: input.content
    });
  } catch {
    return false;
  }
}
async function identify(profile, fetcher = fetch, now) {
  if (!validEvent(profile, now) || profile.kind !== 0) return null;
  let metadata;
  try {
    metadata = JSON.parse(profile.content);
  } catch {
    return null;
  }
  if (!metadata || typeof metadata.nip05 !== "string" || !/^[a-z0-9_.-]+@trailscoffee\.com$/.test(metadata.nip05))
    return null;
  const name = metadata.nip05.split("@")[0];
  const response = await fetcher(
    `https://trailscoffee.com/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
    {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8e3)
    }
  );
  if (!response.ok) throw Error("Identity endpoint unavailable");
  const mapping = await response.json();
  if (!mapping?.names || !Object.hasOwn(mapping.names, name) || mapping.names[name] !== profile.pubkey)
    return null;
  return {
    pubkey: profile.pubkey,
    nip05: metadata.nip05,
    name: typeof metadata.display_name === "string" ? metadata.display_name.slice(0, 100) : typeof metadata.name === "string" ? metadata.name.slice(0, 100) : name,
    picture: typeof metadata.picture === "string" ? metadata.picture : null
  };
}
var tag = (event, name) => event.tags.find((t) => t[0] === name)?.[1];
var address = (e) => `${e.kind}:${e.pubkey}:${tag(e, "d") ?? ""}`;
function visibleEvents(input, now) {
  const events = [
    ...new Map(
      input.filter((e) => validEvent(e, now)).map((e) => [e.id, e])
    ).values()
  ];
  const deletions = events.filter((e) => e.kind === 5), latest = /* @__PURE__ */ new Map();
  for (const e of events.filter((e2) => [0, 31922, 31923].includes(e2.kind))) {
    const key = e.kind === 0 ? e.pubkey : address(e), previous = latest.get(key);
    if (!previous || e.created_at > previous.created_at || e.created_at === previous.created_at && e.id < previous.id)
      latest.set(key, e);
  }
  return events.filter((e) => [1, 20, 31922, 31923].includes(e.kind)).filter((e) => e.kind < 3e4 || latest.get(address(e)) === e).filter(
    (e) => !deletions.some(
      (d) => d.pubkey === e.pubkey && d.tags.some(
        (t) => t[0] === "e" && t[1] === e.id || t[0] === "a" && e.kind >= 3e4 && t[1] === address(e) && d.created_at >= e.created_at
      )
    )
  ).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
}
function latestProfile(events, pubkey, now) {
  return events.filter((e) => e.pubkey === pubkey && e.kind === 0 && validEvent(e, now)).sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
}
function safeURL(value) {
  try {
    const u = new URL(value), h = u.hostname;
    if (u.protocol !== "https:" || u.username || u.password || u.port || h.endsWith(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(h) || !h.includes("."))
      return null;
    return u.href;
  } catch {
    return null;
  }
}
function calendarInfo(e, now = Math.floor(Date.now() / 1e3)) {
  const title = tag(e, "title") || tag(e, "name"), start = tag(e, "start"), end = tag(e, "end");
  if (!tag(e, "d") || !title || !start) return null;
  if (e.kind === 31922) {
    const dateValid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
    if (!dateValid(start) || end && (!dateValid(end) || end <= start))
      return null;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(now * 1e3));
    if (end && end <= today || !end && start < today) return null;
    return {
      title,
      date: start,
      sort: Date.parse(start) / 1e3,
      allDay: true,
      location: tag(e, "location") || "Location in event details"
    };
  }
  if (e.kind !== 31923 || !/^\d+$/.test(start) || !Number.isSafeInteger(Number(start)) || end && (!/^\d+$/.test(end) || Number(end) <= Number(start)) || Number(end || start) < now || Number(start) > 864e10)
    return null;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Number(start) * 1e3));
  return {
    title,
    date,
    sort: Number(start),
    allDay: false,
    location: tag(e, "location") || "Location in event details"
  };
}

// src/media.js
function bodyURLs(text) {
  return [...text.matchAll(/(?<!\S)https:\/\/[^\s<>"\u0000-\u001f]+/g)].map((m) => {
    const raw = /[?#]/.test(m[0]) ? m[0] : m[0].replace(/[.,!;:)]+$/, "");
    return { raw, index: m.index };
  });
}
var directVideo = (url) => /\.(mp4|webm|mov)$/i.test(new URL(url).pathname);
var mediaURL = (raw) => typeof raw === "string" && /^https:\/\//.test(raw) && !/[\s\\\u0000-\u001f\u007f]/.test(raw) && safeURL(raw) ? raw : null;
function postVideos(e) {
  const videos = /* @__PURE__ */ new Map();
  const add = (raw, label) => {
    const url = mediaURL(raw);
    if (url && directVideo(url) && !videos.has(url) && videos.size < 4)
      videos.set(url, { url, label: label || "Video attached to this community update" });
  };
  for (const { raw } of bodyURLs(e.content)) add(raw);
  for (const t of e.tags) {
    if (t[0] !== "imeta") continue;
    const urls = t.slice(1).filter((v) => v.startsWith("url "));
    if (urls.length !== 1) continue;
    const alt = t.slice(1).find((v) => v.startsWith("alt "))?.slice(4, 204);
    add(urls[0].slice(4), alt);
  }
  return [...videos.values()];
}
function withoutVideos(text, videos) {
  const urls = new Set(videos.map((v) => v.url));
  for (const { raw, index } of bodyURLs(text).reverse())
    if (urls.has(raw)) text = text.slice(0, index) + text.slice(index + raw.length);
  return text.trim();
}

// src/relay.js
function matches(e, f) {
  return (!f.kinds || f.kinds.includes(e.kind)) && (!f.authors || f.authors.includes(e.pubkey)) && (!f.ids || f.ids.includes(e.id)) && (f.until === void 0 || e.created_at <= f.until) && (f.since === void 0 || e.created_at >= f.since) && Object.entries(f).every(
    ([k, v]) => !k.startsWith("#") || e.tags.some((t) => t[0] === k.slice(1) && v.includes(t[1]))
  );
}
var Relay = class {
  constructor(Socket = WebSocket) {
    this.Socket = Socket;
    this.pending = /* @__PURE__ */ new Map();
    this.counter = 0;
  }
  async open() {
    this.socket = new this.Socket(RELAY);
    this.socket.addEventListener("message", (ev) => this.receive(ev));
    this.socket.addEventListener("close", () => {
      for (const p of this.pending.values())
        p.finish(Error("Relay disconnected. Please retry."));
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(Error("Relay connection timed out."));
      }, 1e4);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(Error("Cannot reach relay.anmore.me. Please retry."));
      });
    });
  }
  query(filters, timeout = 12e3, { rejectAtLimit = false } = {}) {
    if (this.socket?.readyState !== 1)
      return Promise.reject(Error("Relay is not connected."));
    const id = `anmore-${++this.counter}`, cap = filters.reduce((s, f) => s + (f.limit || 40), 0);
    return new Promise((resolve, reject) => {
      const events = /* @__PURE__ */ new Map();
      let count = 0;
      const timer = setTimeout(
        () => finish(
          Error("Relay query timed out; no unverified results were added.")
        ),
        timeout
      );
      const finish = (err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (this.socket.readyState === 1)
          this.socket.send(JSON.stringify(["CLOSE", id]));
        err ? reject(err) : resolve([...events.values()]);
      };
      this.pending.set(id, {
        finish,
        filters,
        events,
        accept: (e) => {
          count++;
          if (rejectAtLimit && count >= cap)
            return finish(Error("Receipt snapshot truncated."));
          if (count > cap + 20)
            return finish(Error("Relay response exceeded the safety limit."));
          if (validEvent(e) && filters.some((f) => matches(e, f)))
            events.set(e.id, e);
        }
      });
      this.socket.send(JSON.stringify(["REQ", id, ...filters]));
    });
  }
  receive(ev) {
    if (typeof ev.data !== "string" || ev.data.length > 12e5) {
      for (const p2 of this.pending.values())
        p2.finish(Error("Relay sent an oversized response."));
      return;
    }
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (!Array.isArray(m)) return;
    const p = this.pending.get(m[1]);
    if (m[0] === "NOTICE") {
      for (const item of this.pending.values())
        item.finish(
          Error("Relay reported a service notice. Please retry later.")
        );
      return;
    }
    if (!p) return;
    if (m[0] === "EVENT") p.accept(m[2]);
    if (m[0] === "EOSE") p.finish();
    if (m[0] === "CLOSED")
      p.finish(Error("Relay declined the read request. Please retry later."));
  }
  close() {
    this.socket?.close();
  }
};

// node_modules/@scure/base/lib/esm/index.js
function assertNumber(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`Wrong integer: ${n}`);
}
function chain(...args) {
  const wrap = (a, b) => (c) => a(b(c));
  const encode = Array.from(args).reverse().reduce((acc, i2) => acc ? wrap(acc, i2.encode) : i2.encode, void 0);
  const decode = args.reduce((acc, i2) => acc ? wrap(acc, i2.decode) : i2.decode, void 0);
  return { encode, decode };
}
function alphabet(alphabet2) {
  return {
    encode: (digits) => {
      if (!Array.isArray(digits) || digits.length && typeof digits[0] !== "number")
        throw new Error("alphabet.encode input should be an array of numbers");
      return digits.map((i2) => {
        assertNumber(i2);
        if (i2 < 0 || i2 >= alphabet2.length)
          throw new Error(`Digit index outside alphabet: ${i2} (alphabet: ${alphabet2.length})`);
        return alphabet2[i2];
      });
    },
    decode: (input) => {
      if (!Array.isArray(input) || input.length && typeof input[0] !== "string")
        throw new Error("alphabet.decode input should be array of strings");
      return input.map((letter) => {
        if (typeof letter !== "string")
          throw new Error(`alphabet.decode: not string element=${letter}`);
        const index = alphabet2.indexOf(letter);
        if (index === -1)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${alphabet2}`);
        return index;
      });
    }
  };
}
function join(separator = "") {
  if (typeof separator !== "string")
    throw new Error("join separator should be string");
  return {
    encode: (from) => {
      if (!Array.isArray(from) || from.length && typeof from[0] !== "string")
        throw new Error("join.encode input should be array of strings");
      for (let i2 of from)
        if (typeof i2 !== "string")
          throw new Error(`join.encode: non-string input=${i2}`);
      return from.join(separator);
    },
    decode: (to) => {
      if (typeof to !== "string")
        throw new Error("join.decode input should be string");
      return to.split(separator);
    }
  };
}
function padding(bits, chr = "=") {
  assertNumber(bits);
  if (typeof chr !== "string")
    throw new Error("padding chr should be string");
  return {
    encode(data) {
      if (!Array.isArray(data) || data.length && typeof data[0] !== "string")
        throw new Error("padding.encode input should be array of strings");
      for (let i2 of data)
        if (typeof i2 !== "string")
          throw new Error(`padding.encode: non-string input=${i2}`);
      while (data.length * bits % 8)
        data.push(chr);
      return data;
    },
    decode(input) {
      if (!Array.isArray(input) || input.length && typeof input[0] !== "string")
        throw new Error("padding.encode input should be array of strings");
      for (let i2 of input)
        if (typeof i2 !== "string")
          throw new Error(`padding.decode: non-string input=${i2}`);
      let end = input.length;
      if (end * bits % 8)
        throw new Error("Invalid padding: string should have whole number of bytes");
      for (; end > 0 && input[end - 1] === chr; end--) {
        if (!((end - 1) * bits % 8))
          throw new Error("Invalid padding: string has too much padding");
      }
      return input.slice(0, end);
    }
  };
}
function normalize(fn) {
  if (typeof fn !== "function")
    throw new Error("normalize fn should be function");
  return { encode: (from) => from, decode: (to) => fn(to) };
}
function convertRadix(data, from, to) {
  if (from < 2)
    throw new Error(`convertRadix: wrong from=${from}, base cannot be less than 2`);
  if (to < 2)
    throw new Error(`convertRadix: wrong to=${to}, base cannot be less than 2`);
  if (!Array.isArray(data))
    throw new Error("convertRadix: data should be array");
  if (!data.length)
    return [];
  let pos = 0;
  const res = [];
  const digits = Array.from(data);
  digits.forEach((d) => {
    assertNumber(d);
    if (d < 0 || d >= from)
      throw new Error(`Wrong integer: ${d}`);
  });
  while (true) {
    let carry = 0;
    let done = true;
    for (let i2 = pos; i2 < digits.length; i2++) {
      const digit = digits[i2];
      const digitBase = from * carry + digit;
      if (!Number.isSafeInteger(digitBase) || from * carry / from !== carry || digitBase - digit !== from * carry) {
        throw new Error("convertRadix: carry overflow");
      }
      carry = digitBase % to;
      digits[i2] = Math.floor(digitBase / to);
      if (!Number.isSafeInteger(digits[i2]) || digits[i2] * to + carry !== digitBase)
        throw new Error("convertRadix: carry overflow");
      if (!done)
        continue;
      else if (!digits[i2])
        pos = i2;
      else
        done = false;
    }
    res.push(carry);
    if (done)
      break;
  }
  for (let i2 = 0; i2 < data.length - 1 && data[i2] === 0; i2++)
    res.push(0);
  return res.reverse();
}
var gcd = (a, b) => !b ? a : gcd(b, a % b);
var radix2carry = (from, to) => from + (to - gcd(from, to));
function convertRadix2(data, from, to, padding2) {
  if (!Array.isArray(data))
    throw new Error("convertRadix2: data should be array");
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const mask = 2 ** to - 1;
  const res = [];
  for (const n of data) {
    assertNumber(n);
    if (n >= 2 ** from)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    carry &= 2 ** pos - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding2 && pos >= from)
    throw new Error("Excess padding");
  if (!padding2 && carry)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding2 && pos > 0)
    res.push(carry >>> 0);
  return res;
}
function radix(num) {
  assertNumber(num);
  return {
    encode: (bytes3) => {
      if (!(bytes3 instanceof Uint8Array))
        throw new Error("radix.encode input should be Uint8Array");
      return convertRadix(Array.from(bytes3), 2 ** 8, num);
    },
    decode: (digits) => {
      if (!Array.isArray(digits) || digits.length && typeof digits[0] !== "number")
        throw new Error("radix.decode input should be array of strings");
      return Uint8Array.from(convertRadix(digits, num, 2 ** 8));
    }
  };
}
function radix2(bits, revPadding = false) {
  assertNumber(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (radix2carry(8, bits) > 32 || radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (bytes3) => {
      if (!(bytes3 instanceof Uint8Array))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes3), 8, bits, !revPadding);
    },
    decode: (digits) => {
      if (!Array.isArray(digits) || digits.length && typeof digits[0] !== "number")
        throw new Error("radix2.decode input should be array of strings");
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }
  };
}
function unsafeWrapper(fn) {
  if (typeof fn !== "function")
    throw new Error("unsafeWrapper fn should be function");
  return function(...args) {
    try {
      return fn.apply(null, args);
    } catch (e) {
    }
  };
}
var base16 = chain(radix2(4), alphabet("0123456789ABCDEF"), join(""));
var base32 = chain(radix2(5), alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"), padding(5), join(""));
var base32hex = chain(radix2(5), alphabet("0123456789ABCDEFGHIJKLMNOPQRSTUV"), padding(5), join(""));
var base32crockford = chain(radix2(5), alphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ"), join(""), normalize((s) => s.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1")));
var base64 = chain(radix2(6), alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), padding(6), join(""));
var base64url = chain(radix2(6), alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"), padding(6), join(""));
var genBase58 = (abc) => chain(radix(58), alphabet(abc), join(""));
var base58 = genBase58("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz");
var base58flickr = genBase58("123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ");
var base58xrp = genBase58("rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz");
var XMR_BLOCK_LEN = [0, 2, 3, 5, 6, 7, 9, 10, 11];
var base58xmr = {
  encode(data) {
    let res = "";
    for (let i2 = 0; i2 < data.length; i2 += 8) {
      const block = data.subarray(i2, i2 + 8);
      res += base58.encode(block).padStart(XMR_BLOCK_LEN[block.length], "1");
    }
    return res;
  },
  decode(str) {
    let res = [];
    for (let i2 = 0; i2 < str.length; i2 += 11) {
      const slice = str.slice(i2, i2 + 11);
      const blockLen = XMR_BLOCK_LEN.indexOf(slice.length);
      const block = base58.decode(slice);
      for (let j = 0; j < block.length - blockLen; j++) {
        if (block[j] !== 0)
          throw new Error("base58xmr: wrong padding");
      }
      res = res.concat(Array.from(block.slice(block.length - blockLen)));
    }
    return Uint8Array.from(res);
  }
};
var BECH_ALPHABET = chain(alphabet("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), join(""));
var POLYMOD_GENERATORS = [996825010, 642813549, 513874426, 1027748829, 705979059];
function bech32Polymod(pre) {
  const b = pre >> 25;
  let chk = (pre & 33554431) << 5;
  for (let i2 = 0; i2 < POLYMOD_GENERATORS.length; i2++) {
    if ((b >> i2 & 1) === 1)
      chk ^= POLYMOD_GENERATORS[i2];
  }
  return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
  const len = prefix.length;
  let chk = 1;
  for (let i2 = 0; i2 < len; i2++) {
    const c = prefix.charCodeAt(i2);
    if (c < 33 || c > 126)
      throw new Error(`Invalid prefix (${prefix})`);
    chk = bech32Polymod(chk) ^ c >> 5;
  }
  chk = bech32Polymod(chk);
  for (let i2 = 0; i2 < len; i2++)
    chk = bech32Polymod(chk) ^ prefix.charCodeAt(i2) & 31;
  for (let v of words)
    chk = bech32Polymod(chk) ^ v;
  for (let i2 = 0; i2 < 6; i2++)
    chk = bech32Polymod(chk);
  chk ^= encodingConst;
  return BECH_ALPHABET.encode(convertRadix2([chk % 2 ** 30], 30, 5, false));
}
function genBech32(encoding) {
  const ENCODING_CONST = encoding === "bech32" ? 1 : 734539939;
  const _words = radix2(5);
  const fromWords = _words.decode;
  const toWords = _words.encode;
  const fromWordsUnsafe = unsafeWrapper(fromWords);
  function encode(prefix, words, limit2 = 90) {
    if (typeof prefix !== "string")
      throw new Error(`bech32.encode prefix should be string, not ${typeof prefix}`);
    if (!Array.isArray(words) || words.length && typeof words[0] !== "number")
      throw new Error(`bech32.encode words should be array of numbers, not ${typeof words}`);
    const actualLength = prefix.length + 7 + words.length;
    if (limit2 !== false && actualLength > limit2)
      throw new TypeError(`Length ${actualLength} exceeds limit ${limit2}`);
    prefix = prefix.toLowerCase();
    return `${prefix}1${BECH_ALPHABET.encode(words)}${bechChecksum(prefix, words, ENCODING_CONST)}`;
  }
  function decode(str, limit2 = 90) {
    if (typeof str !== "string")
      throw new Error(`bech32.decode input should be string, not ${typeof str}`);
    if (str.length < 8 || limit2 !== false && str.length > limit2)
      throw new TypeError(`Wrong string length: ${str.length} (${str}). Expected (8..${limit2})`);
    const lowered = str.toLowerCase();
    if (str !== lowered && str !== str.toUpperCase())
      throw new Error(`String must be lowercase or uppercase`);
    str = lowered;
    const sepIndex = str.lastIndexOf("1");
    if (sepIndex === 0 || sepIndex === -1)
      throw new Error(`Letter "1" must be present between prefix and data only`);
    const prefix = str.slice(0, sepIndex);
    const _words2 = str.slice(sepIndex + 1);
    if (_words2.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const words = BECH_ALPHABET.decode(_words2).slice(0, -6);
    const sum = bechChecksum(prefix, words, ENCODING_CONST);
    if (!_words2.endsWith(sum))
      throw new Error(`Invalid checksum in ${str}: expected "${sum}"`);
    return { prefix, words };
  }
  const decodeUnsafe = unsafeWrapper(decode);
  function decodeToBytes(str) {
    const { prefix, words } = decode(str, false);
    return { prefix, words, bytes: fromWords(words) };
  }
  return { encode, decode, decodeToBytes, decodeUnsafe, fromWords, fromWordsUnsafe, toWords };
}
var bech32 = genBech32("bech32");
var bech32m = genBech32("bech32m");
var utf8 = {
  encode: (data) => new TextDecoder().decode(data),
  decode: (str) => new TextEncoder().encode(str)
};
var hex = chain(radix2(4), alphabet("0123456789abcdef"), join(""), normalize((s) => {
  if (typeof s !== "string" || s.length % 2)
    throw new TypeError(`hex.decode: expected string, got ${typeof s} with length ${s.length}`);
  return s.toLowerCase();
}));
var CODERS = {
  utf8,
  hex,
  base16,
  base32,
  base64,
  base64url,
  base58,
  base58xmr
};
var coderTypeError = `Invalid encoding type. Available types: ${Object.keys(CODERS).join(", ")}`;

// src/invoice.js
var integer = (words) => words.reduce((n, w) => n * 32n + BigInt(w), 0n);
function padded(words) {
  let bits = 0, value = 0;
  const bytes3 = [];
  for (const w of words) {
    value = value << 5 | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes3.push(value >>> bits & 255);
    }
  }
  if (bits) bytes3.push(value << 8 - bits & 255);
  return Uint8Array.from(bytes3);
}
var hashText = (text) => bytesToHex2(sha2562(utf8ToBytes3(text)));
function readInvoice(invoice) {
  if (typeof invoice !== "string" || invoice.length > 8192)
    throw Error("Invalid invoice");
  const { prefix, words } = bech32.decode(invoice, 8192);
  const m = /^lnbc([1-9][0-9]*)([munp]?)$/.exec(prefix);
  if (!m || words.length < 111) throw Error("Mainnet amount invoice required");
  let msats = BigInt(m[1]);
  if (m[2] === "p") {
    if (msats % 10n) throw Error("Fractional millisatoshi");
    msats /= 10n;
  } else
    msats *= { m: 100000000n, u: 100000n, n: 100n, "": 100000000000n }[m[2]];
  if (msats <= 0n || msats % 1000n || msats > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Whole-satoshi amount out of range");
  const unsigned = words.slice(0, -104), signature = bech32.fromWords(words.slice(-104));
  const fields = /* @__PURE__ */ new Map();
  for (let i2 = 7; i2 < unsigned.length; ) {
    if (i2 + 3 > unsigned.length) throw Error("Truncated invoice");
    const type = unsigned[i2], len = unsigned[i2 + 1] * 32 + unsigned[i2 + 2];
    i2 += 3;
    if (i2 + len > unsigned.length) throw Error("Truncated field");
    const data = unsigned.slice(i2, i2 + len);
    i2 += len;
    if ([1, 16, 23, 19, 6, 24, 5, 13, 27].includes(type)) {
      if (fields.has(type)) throw Error("Duplicate invoice field");
      fields.set(type, data);
    }
  }
  for (const [type, length] of [
    [1, 52],
    [16, 52],
    [23, 52],
    [19, 53]
  ]) {
    const f = fields.get(type);
    if (type !== 19 && !f || f && f.length !== length)
      throw Error("Missing or malformed invoice field");
    if (f) {
      const decoded = bech32.fromWords(f);
      if (decoded.length !== (type === 19 ? 33 : 32))
        throw Error("Malformed invoice field");
    }
  }
  if (fields.has(13)) throw Error("Hashed description required");
  for (const type of [6, 24, 5])
    if (fields.has(type) && (!fields.get(type).length || fields.get(type)[0] === 0))
      throw Error("Nonminimal integer");
  const features = integer(fields.get(5) ?? []);
  for (let bit = 0; bit < 5120; bit += 2)
    if (features & 1n << BigInt(bit) && ![8, 14, 16, 48].includes(bit))
      throw Error("Unsupported required feature");
  const has = (bit) => (features & 3n << BigInt(bit)) !== 0n;
  if (has(16) && !has(14) || has(48) && !fields.has(27))
    throw Error("Feature dependency missing");
  const hash3 = sha2562(concatBytes3(utf8ToBytes3(prefix), padded(unsigned)));
  if (signature.length !== 65 || signature[64] > 3)
    throw Error("Invalid invoice signature");
  const sig = secp256k1.Signature.fromCompact(signature.slice(0, 64));
  const n = fields.get(19);
  const publicKey = n ? bech32.fromWords(n) : sig.addRecoveryBit(signature[64]).recoverPublicKey(hash3).toRawBytes(true);
  if (!secp256k1.verify(sig, hash3, publicKey, { lowS: !!n }))
    throw Error("Invalid invoice signature");
  const timestamp = integer(unsigned.slice(0, 7)), expiry = fields.has(6) ? integer(fields.get(6)) : 3600n;
  if (timestamp + expiry > BigInt(Number.MAX_SAFE_INTEGER) || expiry === 0n)
    throw Error("Invalid expiry");
  return {
    msats,
    paymentHash: bytesToHex2(bech32.fromWords(fields.get(1))),
    descriptionHash: bytesToHex2(bech32.fromWords(fields.get(23))),
    timestamp: Number(timestamp),
    expiresAt: Number(timestamp + expiry)
  };
}

// src/zaps.js
var COMMUNITY_ADDRESS = "coffeeloverc2c2cd@pay.trailscoffee.com";
var PAY_ENDPOINT = "https://pay.trailscoffee.com/.well-known/lnurlp/coffeeloverc2c2cd";
var PAY_CALLBACK = "https://pay.trailscoffee.com/lnurlp/coffeeloverc2c2cd/invoice";
var COMMUNITY_LNURL = bech32.encode(
  "lnurl",
  bech32.toWords(new TextEncoder().encode(PAY_ENDPOINT)),
  2e3
);
var hex2 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
async function boundedJSON(url, fetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(1e4)
  });
  if (!response.ok)
    throw Error(
      `Zap service returned HTTP ${response.status}. No payment was sent.`
    );
  const reader = response.body?.getReader();
  if (!reader) throw Error("Zap service response unavailable");
  let size = 0;
  const parts = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072)
        throw Error("Zap service response exceeded safety limit");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const bytes3 = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    bytes3.set(p, offset);
    offset += p.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes3));
}
async function resolveCommunity(relay, fetcher = fetch, now = Math.floor(Date.now() / 1e3)) {
  const directory = await boundedJSON(
    "https://trailscoffee.com/.well-known/nostr.json",
    fetcher
  );
  if (!directory?.names || Array.isArray(directory.names))
    throw Error("Community recipient directory unavailable");
  const entries = Object.entries(directory.names);
  if (entries.length > 128 || entries.some(([n, p]) => !/^[a-z0-9_.-]+$/.test(n) || !hex2(p)))
    throw Error("Community recipient directory exceeds safety contract");
  const authors = [...new Set(entries.map(([, p]) => p))];
  const profiles = [];
  for (let i2 = 0; i2 < authors.length; i2 += 16)
    profiles.push(
      ...await relay.query(
        authors.slice(i2, i2 + 16).map((pubkey) => ({ kinds: [0], authors: [pubkey], limit: 1 }))
      )
    );
  const matches2 = [];
  for (const pubkey of authors) {
    const profile2 = latestProfile(profiles, pubkey, now);
    if (!profile2) continue;
    let metadata;
    try {
      metadata = JSON.parse(profile2.content);
    } catch {
      continue;
    }
    if (metadata?.lud16 !== COMMUNITY_ADDRESS || typeof metadata.nip05 !== "string" || !/^[a-z0-9_.-]+@trailscoffee\.com$/.test(metadata.nip05))
      continue;
    const name = metadata.nip05.split("@")[0];
    if (directory.names[name] !== pubkey) continue;
    matches2.push(profile2);
  }
  if (matches2.length !== 1)
    throw Error(
      "Community recipient is not yet verifiable: a current signed profile must bind the exact Lightning address to its directory identity."
    );
  const profile = matches2[0];
  const deletions = await relay.query([
    { kinds: [5], authors: [profile.pubkey], limit: 500 }
  ]);
  if (deletions.length >= 500 || deletions.some(
    (d) => validEvent(d, now) && d.pubkey === profile.pubkey && d.tags.some(
      (t) => t[0] === "e" && t[1] === profile.id || t[0] === "a" && t[1] === `0:${profile.pubkey}:` && d.created_at >= profile.created_at
    )
  ))
    throw Error("Community recipient profile deletion check failed");
  const endpoint = await boundedJSON(PAY_ENDPOINT, fetcher);
  if (endpoint?.tag !== "payRequest" || endpoint.allowsNostr !== true || !hex2(endpoint.nostrPubkey) || endpoint.callback !== PAY_CALLBACK || !Number.isSafeInteger(endpoint.minSendable) || !Number.isSafeInteger(endpoint.maxSendable) || endpoint.minSendable < 1 || endpoint.maxSendable < endpoint.minSendable || endpoint.maxSendable > Number.MAX_SAFE_INTEGER)
    throw Error(
      "Community endpoint does not support the approved zap contract"
    );
  try {
    secp256k1.ProjectivePoint.fromHex("02" + endpoint.nostrPubkey);
  } catch {
    throw Error("Invalid receipt issuer key");
  }
  return {
    recipient: profile.pubkey,
    profileId: profile.id,
    issuer: endpoint.nostrPubkey,
    min: endpoint.minSendable,
    max: endpoint.maxSendable,
    checkedAt: now
  };
}
function one(event, name, required = true) {
  const tags = event.tags.filter((t) => t[0] === name);
  if (tags.length === 0 && !required) return void 0;
  if (tags.length !== 1 || tags[0].length !== 2)
    throw Error("Ambiguous zap tag");
  return tags[0][1];
}
function zapAmount(sats, authority) {
  if (typeof sats !== "string" || !/^[1-9][0-9]{0,8}$/.test(sats))
    throw Error("Enter a whole-satoshi amount.");
  const msats = BigInt(sats) * 1000n;
  if (!authority || msats < BigInt(authority.min) || msats > BigInt(authority.max))
    throw Error("Amount is outside the receiving service range.");
  return msats;
}
async function createZap(post2, authority, sats, fetcher = fetch, now = Math.floor(Date.now() / 1e3)) {
  if (!validEvent(post2, now) || ![1, 20].includes(post2.kind) || !authority || !hex2(authority.recipient) || !hex2(authority.issuer) || authority.checkedAt > now || now - authority.checkedAt > 60)
    throw Error("Refresh to recheck the post and community recipient.");
  const msats = zapAmount(sats, authority);
  const key = generateSecretKey();
  let request;
  try {
    request = finalizeEvent(
      {
        kind: 9734,
        created_at: now,
        content: "",
        tags: [
          ["p", authority.recipient],
          ["e", post2.id],
          ["k", String(post2.kind)],
          ["amount", String(msats)],
          ["lnurl", COMMUNITY_LNURL],
          ["relays", RELAY]
        ]
      },
      key
    );
  } finally {
    key.fill(0);
  }
  const serialized = JSON.stringify({
    id: request.id,
    pubkey: request.pubkey,
    created_at: request.created_at,
    kind: request.kind,
    tags: request.tags,
    content: request.content,
    sig: request.sig
  }), url = new URL(PAY_CALLBACK);
  url.searchParams.set("amount", String(msats));
  url.searchParams.set("nostr", serialized);
  url.searchParams.set("lnurl", COMMUNITY_LNURL);
  const result = await boundedJSON(url.href, fetcher);
  if (typeof result?.pr !== "string")
    throw Error(
      "The community service did not return a zap invoice. No payment was sent."
    );
  const parsed = readInvoice(result.pr);
  if (parsed.msats !== msats || parsed.descriptionHash !== hashText(serialized) || parsed.timestamp < now - 60 || parsed.timestamp > now + 60 || parsed.expiresAt <= now)
    throw Error("Zap invoice binding failed. No payment was sent.");
  return {
    invoice: result.pr,
    uri: "lightning:" + result.pr,
    postId: post2.id,
    request,
    serialized,
    msats,
    ...parsed
  };
}
function zapPeriodWindow(period, now = Math.floor(Date.now() / 1e3)) {
  if (period === "all") return null;
  if (!["week", "month"].includes(period)) throw Error("Unknown zap period");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const permanent = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Etc/GMT+7",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = (ms) => Object.fromEntries((ms >= Date.UTC(2026, 2, 8, 10) ? permanent : formatter).formatToParts(new Date(ms)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const local = parts(now * 1e3);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  if (period === "week") date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  else date.setUTCDate(1);
  const midnight = (date2) => {
    const civil = date2.getTime();
    let utc = civil;
    for (let i2 = 0; i2 < 3; i2++) {
      const p = parts(utc);
      utc += civil - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    }
    return utc / 1e3;
  };
  const start = midnight(date);
  if (period === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return { start, end: midnight(date) };
}
function verifiedTotals(receipts, posts, authority, now = Math.floor(Date.now() / 1e3), period = "all") {
  const window2 = zapPeriodWindow(period, now);
  const targets = new Map(posts.map((e) => [e.id, e])), payments = /* @__PURE__ */ new Map(), totals2 = /* @__PURE__ */ new Map();
  if (!authority) return totals2;
  for (const receipt of receipts) {
    try {
      if (receipt.kind !== 9735 || receipt.pubkey !== authority.issuer || !validEvent(receipt, now))
        continue;
      const postId = one(receipt, "e"), post2 = targets.get(postId);
      if (!post2 || one(receipt, "p") !== authority.recipient || receipt.tags.some((t) => t[0] === "a"))
        continue;
      const description = one(receipt, "description"), request = JSON.parse(description), parsed = readInvoice(one(receipt, "bolt11"));
      if (request.kind !== 9734 || !validEvent(request, now) || one(request, "e") !== postId || one(request, "p") !== authority.recipient || one(request, "lnurl", false) !== void 0 && one(request, "lnurl", false) !== COMMUNITY_LNURL || request.tags.some((t) => t[0] === "a"))
        continue;
      const amount = one(request, "amount", false), kind = one(request, "k", false), sender = one(receipt, "P", false);
      if (amount !== void 0 && (!/^[1-9][0-9]*$/.test(amount) || BigInt(amount) !== parsed.msats) || kind !== void 0 && kind !== String(post2.kind) || sender !== void 0 && sender !== request.pubkey)
        continue;
      if (parsed.descriptionHash !== hashText(description) || request.created_at > receipt.created_at || parsed.timestamp > receipt.created_at || parsed.expiresAt < receipt.created_at)
        continue;
      const payment = {
        receivedAt: receipt.created_at,
        postId,
        msats: parsed.msats,
        descriptionHash: parsed.descriptionHash
      };
      const previous = payments.get(parsed.paymentHash);
      if (previous && (previous.postId !== postId || previous.msats !== payment.msats || previous.descriptionHash !== payment.descriptionHash))
        payments.set(parsed.paymentHash, { conflict: true });
      else if (!previous) payments.set(parsed.paymentHash, payment);
      else if (!previous.conflict) previous.receivedAt = Math.min(previous.receivedAt, payment.receivedAt);
    } catch {
    }
  }
  for (const p of payments.values())
    if (!p.conflict && (!window2 || p.receivedAt >= window2.start && p.receivedAt < window2.end))
      totals2.set(p.postId, (totals2.get(p.postId) ?? 0n) + p.msats);
  return totals2;
}
function sortPosts(posts, totals2, mode = "newest") {
  return [...posts].sort((a, b) => {
    const aa = totals2.get(a.id) ?? 0n, bb = totals2.get(b.id) ?? 0n;
    return (mode === "top" && aa !== bb ? aa > bb ? -1 : 1 : 0) || b.created_at - a.created_at || a.id.localeCompare(b.id);
  });
}

// src/receipts.js
var RECEIPT_PEER = "wss://relay.primal.net";
var DEADLINE = 4e3;
var CAP = 1e3;
function publicReceipts(filter, Socket) {
  return new Promise((resolve, reject) => {
    const socket = new Socket(RECEIPT_PEER), events = /* @__PURE__ */ new Map();
    let count = 0, bytes3 = 0, finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket.readyState === 1)
        socket.send(JSON.stringify(["CLOSE", "receipts"]));
      socket.close();
      error ? reject(error) : resolve([...events.values()]);
    };
    const timer = setTimeout(
      () => finish(Error("Receipt peer deadline exceeded.")),
      DEADLINE
    );
    socket.addEventListener("open", () => {
      if (!finished) socket.send(JSON.stringify(["REQ", "receipts", filter]));
    });
    socket.addEventListener(
      "error",
      () => finish(Error("Receipt peer unavailable."))
    );
    socket.addEventListener(
      "close",
      () => finish(Error("Receipt peer disconnected."))
    );
    socket.addEventListener("message", ({ data }) => {
      if (finished) return;
      if (typeof data !== "string" || data.length > 12e5)
        return finish(Error("Receipt peer response exceeded safety limit."));
      bytes3 += new TextEncoder().encode(data).byteLength;
      if (bytes3 > 8 * 1024 * 1024)
        return finish(Error("Receipt peer snapshot byte limit exceeded."));
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(m)) return;
      if (m[0] === "NOTICE") return finish(Error("Receipt peer unavailable."));
      if (m[1] !== "receipts") return;
      if (m[0] === "EOSE") return finish();
      if (m[0] === "CLOSED")
        return finish(Error("Receipt peer declined query."));
      if (m[0] !== "EVENT") return;
      if (++count >= CAP)
        return finish(Error("Receipt snapshot truncated."));
      const e = m[2];
      if (validEvent(e) && e.kind === 9735 && filter.authors.includes(e.pubkey) && e.tags.some((t) => t[0] === "p" && filter["#p"].includes(t[1])) && e.tags.some((t) => t[0] === "e" && filter["#e"].includes(t[1])))
        events.set(e.id, e);
    });
  });
}
async function collectReceipts(posts, authority, relay, Socket = WebSocket, now = Math.floor(Date.now() / 1e3)) {
  if (posts.length > 1200 || posts.some((e) => !validEvent(e, now) || ![1, 20].includes(e.kind)))
    throw Error("Invalid receipt target snapshot.");
  const receipts = /* @__PURE__ */ new Map(), provenance2 = /* @__PURE__ */ new Map();
  if (!posts.length)
    return {
      receipts: [],
      provenance: provenance2,
      totals: /* @__PURE__ */ new Map(),
      partial: false,
      sources: []
    };
  const filter = {
    kinds: [9735],
    authors: [authority.issuer],
    "#p": [authority.recipient],
    "#e": [...new Set(posts.map((e) => e.id))],
    limit: CAP
  };
  const results = await Promise.allSettled([
    relay.query([filter], DEADLINE, { rejectAtLimit: true }),
    publicReceipts(filter, Socket)
  ]);
  const sources = [];
  results.forEach((result, i2) => {
    if (result.status !== "fulfilled" || result.value.length >= CAP) return;
    const source = [RELAY, RECEIPT_PEER][i2];
    sources.push(source);
    for (const e of result.value) {
      if (e.kind !== 9735) continue;
      receipts.set(e.id, e);
      if (!provenance2.has(e.id)) provenance2.set(e.id, /* @__PURE__ */ new Set());
      provenance2.get(e.id).add(source);
    }
  });
  if (!sources.length) throw Error("Community receipt checks unavailable.");
  return {
    receipts: [...receipts.values()],
    provenance: provenance2,
    totals: verifiedTotals([...receipts.values()], posts, authority, now),
    partial: sources.length !== 2,
    sources
  };
}

// src/zap-ui.js
var import_qrcode = __toESM(require_browser(), 1);
var $ = (id) => document.getElementById(id);
function setupZaps({ getPost, getState, recheck }) {
  const dialog = $("zap-dialog"), attempts = /* @__PURE__ */ new Map();
  let selected, opener, epoch = 0, expiryTimer;
  const message = (text) => {
    $("zap-message").textContent = text;
  };
  function clearInvoice() {
    clearTimeout(expiryTimer);
    $("zap-invoice").hidden = true;
    $("zap-wallet").removeAttribute("href");
    $("zap-invoice-text").value = "";
    $("zap-qr-details").open = false;
    $("zap-copy-fallback").open = false;
    $("zap-copy-fallback").hidden = true;
    const c = $("zap-qr");
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
  }
  async function showInvoice(result, token) {
    if (!dialog.open || token !== epoch || !getPost(result.postId)) return;
    clearInvoice();
    if (result.expiresAt <= Math.floor(Date.now() / 1e3)) {
      message(
        "This invoice has expired. Check your wallet before reloading to create another."
      );
      return;
    }
    await import_qrcode.default.toCanvas($("zap-qr"), result.uri, {
      width: 600,
      margin: 4,
      errorCorrectionLevel: "M"
    });
    if (!dialog.open || token !== epoch || !getPost(result.postId)) {
      clearInvoice();
      return;
    }
    $("zap-wallet").href = result.uri;
    $("zap-invoice-text").value = result.invoice;
    $("zap-invoice-amount").textContent = `${result.msats / 1000n} sats`;
    $("zap-expiry").textContent = `Expires ${new Date(result.expiresAt * 1e3).toLocaleTimeString()}`;
    $("zap-create").hidden = true;
    $("zap-invoice").hidden = false;
    message("");
    $("copy-zap").focus();
    expiryTimer = setTimeout(
      () => {
        clearInvoice();
        message(
          "This invoice has expired. Check your wallet before reloading to create another."
        );
      },
      Math.min(2147483647, result.expiresAt * 1e3 - Date.now())
    );
  }
  function invalidate() {
    epoch++;
    selected = void 0;
    clearInvoice();
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener("close", () => {
    epoch++;
    selected = void 0;
    clearInvoice();
    if (opener?.isConnected) opener.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (!dialog.open || event.key !== "Tab") return;
    const controls = [
      ...dialog.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]'
      )
    ].filter((node) => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1), active = document.activeElement;
    if (!first) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    if (!dialog.contains(active) || event.shiftKey && active === first || !event.shiftKey && active === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  $("close-zap").addEventListener("click", () => dialog.close());
  $("create-zap").addEventListener("click", async () => {
    const id = selected, token = epoch;
    if (!getPost(id) || attempts.has(id)) return;
    const sats = $("zap-amount").value;
    try {
      zapAmount(sats, getState().authority);
    } catch (error) {
      message(
        error.message.includes("whole-satoshi") ? "Use whole sats (1 or more)." : error.message
      );
      return;
    }
    if (attempts.size >= 32) {
      message(
        "This session reached the invoice safety limit. No invoice was requested."
      );
      return;
    }
    attempts.set(id, { pending: true });
    $("create-zap").disabled = true;
    $("zap-amount").disabled = true;
    message("Checking post\u2026");
    try {
      const authority = await recheck(id);
      if (token !== epoch || !dialog.open || !getPost(id))
        throw Error("Post check changed. No new invoice was requested.");
      const result = await createZap(getPost(id), authority, sats);
      attempts.set(id, {
        result,
        recipient: authority.recipient,
        issuer: authority.issuer
      });
      await showInvoice(result, token);
    } catch (error) {
      attempts.set(id, { error: true });
      if (dialog.open && token === epoch)
        message(
          error.message || "Zap invoice unavailable. No payment was sent. Check your wallet before trying elsewhere."
        );
    }
  });
  $("copy-zap").addEventListener("click", async () => {
    const text = $("zap-invoice-text").value;
    if (!text || $("zap-invoice").hidden) return;
    try {
      await navigator.clipboard.writeText(text);
      message("Invoice copied. Paste in Trails Wallet.");
    } catch {
      $("zap-copy-fallback").hidden = false;
      $("zap-copy-fallback").open = true;
      $("zap-invoice-text").focus();
      $("zap-invoice-text").select();
      message("Clipboard unavailable. Copy the invoice below.");
    }
  });
  return {
    invalidate,
    open(id, button) {
      const post2 = getPost(id);
      if (!post2) return;
      selected = id;
      opener = button;
      const token = ++epoch;
      clearInvoice();
      $("zap-create").hidden = false;
      dialog.querySelector(".zap-details").open = false;
      $("zap-post").textContent = post2.content.slice(0, 220) || "Photo community update";
      $("zap-post-id").textContent = id;
      $("zap-amount").value = "21";
      const state = getState(), attempt = attempts.get(id);
      $("create-zap").disabled = !state.authority || !!attempt;
      $("zap-amount").disabled = !state.authority || !!attempt;
      message(
        state.authority ? "" : state.error || "Community zap verification is unavailable. No invoice can be created."
      );
      dialog.showModal();
      if (attempt?.result && attempt.recipient === state.authority?.recipient && attempt.issuer === state.authority?.issuer)
        showInvoice(attempt.result, token).catch(
          () => message("QR rendering failed. No payment was sent.")
        );
      else if (attempt)
        message(
          "Invoice already requested. Check your wallet before reloading."
        );
    }
  };
}

// src/app.js
setupInstall();
var $2 = (id) => document.getElementById(id);
var currentPosts = /* @__PURE__ */ new Map();
var currentIdentities = /* @__PURE__ */ new Map();
var totals = /* @__PURE__ */ new Map();
var zapState = {
  authority: null,
  error: "Community zap verification has not completed."
};
var zapUI = setupZaps({
  getPost: (id) => currentPosts.get(id),
  getState: () => zapState,
  recheck: recheckZap
});
var feedOrder = "newest";
var zapPeriod = "all";
var periodLabels = { week: "This week \xB7 since Monday 00:00", month: "This month \xB7 since the 1st 00:00", all: "All time" };
var TOP_PAGES = 6;
var TOP_ENTRIES = 600;
function renderFeed() {
  $2("zap-periods").hidden = feedOrder !== "top";
  for (const period of ["week", "month", "all"]) {
    $2("period-" + period).setAttribute("aria-pressed", String(zapPeriod === period));
    $2("period-" + period).disabled = busy;
  }
  if (zapState.snapshot && zapState.authority)
    totals = feedOrder !== "top" || zapPeriod === "all" ? zapState.snapshot.totals : verifiedTotals(
      zapState.snapshot.receipts,
      [...currentPosts.values()],
      zapState.authority,
      Math.floor(Date.now() / 1e3),
      zapPeriod
    );
  $2("order-newest").setAttribute(
    "aria-pressed",
    String(feedOrder === "newest")
  );
  $2("order-top").setAttribute("aria-pressed", String(feedOrder === "top"));
  $2("sort-note").hidden = feedOrder !== "top";
  $2("sort-note").textContent = busy ? "Checking earlier updates\u2026" : zapState.error ? "Zap checks unavailable \xB7 showing newest first." : `Top zapped among loaded posts \xB7 ${currentPosts.size} posts. ${periodLabels[zapPeriod]}${zapPeriod === "all" ? "" : " America/Vancouver"} \xB7 verified receipts received in this period. ${zapState.snapshot?.partial ? "Partial receipt check \xB7 totals/order may change as receipts become available. " : ""}${ended ? "Refresh to recheck." : "Load more to widen coverage."}`;
  $2("feed").replaceChildren(
    ...sortPosts([...currentPosts.values()], totals, feedOrder).map(
      (e) => post(e, currentIdentities.get(e.pubkey))
    )
  );
}
async function recheckZap(id) {
  const target = currentPosts.get(id);
  if (!target || busy)
    throw Error("The post is no longer available. Refresh to recheck.");
  const relay = new Relay();
  try {
    await relay.open();
    const profiles = await relay.query([
      { kinds: [0], authors: [target.pubkey], limit: 1 }
    ]);
    const deletions = await relay.query([
      { kinds: [5], authors: [target.pubkey], limit: 500 }
    ]);
    const exact = await relay.query([
      { ids: [id], kinds: [target.kind], limit: 1 }
    ]);
    const profile = latestProfile(profiles, target.pubkey);
    if (deletions.length >= 500 || !profile || deletions.some(
      (d) => d.tags.some(
        (t) => t[0] === "e" && t[1] === profile.id || t[0] === "a" && t[1] === `0:${target.pubkey}:` && d.created_at >= profile.created_at
      )
    ) || !visibleEvents([...exact, ...deletions]).some((e) => e.id === id) || !await identify(profile))
      throw Error(
        "The post or its author could not be reverified. No invoice was requested."
      );
    const authority = await resolveCommunity(relay);
    if (currentPosts.get(id) !== target || busy)
      throw Error(
        "The feed changed during verification. No invoice was requested."
      );
    return authority;
  } finally {
    relay.close();
  }
}
var el = (name, cls, text) => {
  const n = document.createElement(name);
  if (cls) n.className = cls;
  if (text !== void 0) n.textContent = text;
  return n;
};
var link = (text, url) => {
  const a = el("a", "", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
};
var format = (ts, options) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  ...options
}).format(new Date(ts * 1e3));
var stored = [];
var cursor;
var limit = 12;
var busy = false;
var ended = false;
function richText(text) {
  const p = el("p");
  let last = 0;
  for (const m of text.matchAll(/https:\/\/[^\s<>"\u0000-\u001f]+/g)) {
    p.append(document.createTextNode(text.slice(last, m.index)));
    const raw = m[0].replace(/[.,!;:)]+$/, "");
    const url = safeURL(raw);
    p.append(url ? link(raw, url) : document.createTextNode(raw));
    p.append(document.createTextNode(m[0].slice(raw.length)));
    last = m.index + m[0].length;
  }
  p.append(document.createTextNode(text.slice(last)));
  return p;
}
function provenance(e, identity) {
  const details = el("details", "provenance");
  details.append(el("summary", "", "Source"));
  const dl = el("dl");
  for (const [label, value] of [
    ["Community identity", identity.nip05],
    ["Relay", RELAY],
    [
      "Published",
      format(e.created_at, { dateStyle: "medium", timeStyle: "short" }) + " Pacific"
    ],
    ["Event ID", e.id],
    ["Author public key", e.pubkey],
    ["Event kind", String(e.kind)],
    ["Signature", e.sig]
  ]) {
    dl.append(el("dt", "", label), el("dd", "", value));
  }
  details.append(
    dl,
    el(
      "p",
      "",
      "Signature and domain association checked for this snapshot. This is not a guarantee of the post\u2019s accuracy."
    )
  );
  return details;
}
function imageURLs(e) {
  const urls = [];
  for (const t of e.tags) {
    if (t[0] === "image") urls.push(t[1]);
    if (t[0] === "imeta") {
      for (const v of t.slice(1))
        if (v.startsWith("url ")) urls.push(v.slice(4));
    }
  }
  for (const m of e.content.matchAll(/https:\/\/[^\s<>"\u0000-\u001f]+/g)) {
    const u = safeURL(m[0]);
    if (u && /\.(jpe?g|png|webp|gif|avif)$/i.test(new URL(u).pathname))
      urls.push(u);
  }
  return [...new Set(urls.map(safeURL).filter(Boolean))].slice(0, 4);
}
function post(e, identity) {
  const article = el("article", "post");
  article.dataset.createdAt = e.created_at;
  article.dataset.eventId = e.id;
  const top = el("header", "post-top");
  const avatar = el(
    "span",
    "avatar",
    Array.from(identity.name)[0]?.toUpperCase() || "A"
  );
  avatar.setAttribute("aria-hidden", "true");
  const author = el("div", "author");
  author.append(
    el("strong", "", identity.name),
    el("span", "identity", identity.nip05)
  );
  const time = el(
    "time",
    "post-time",
    format(e.created_at, { month: "short", day: "numeric" })
  );
  time.dateTime = new Date(e.created_at * 1e3).toISOString();
  time.title = format(e.created_at, { dateStyle: "full", timeStyle: "short" }) + " Pacific";
  top.append(avatar, author, time);
  article.append(top);
  const videos = postVideos(e);
  const videoURLs = new Set(videos.map((v) => v.url));
  const images = imageURLs(e).filter((url) => !videoURLs.has(url) && !/\.(mp4|webm|mov)$/i.test(new URL(url).pathname));
  let text = withoutVideos(e.content, videos);
  for (const url of images)
    text = text.split("\n").filter((line) => line.trim() !== url).join("\n");
  text = text.trim();
  const body = el("div", "post-body");
  if (text.length > 700) {
    body.append(richText(text.slice(0, 650)));
    const more = el("details");
    more.append(
      el("summary", "", "Read the full update"),
      richText(text.slice(650))
    );
    body.append(more);
  } else if (text) body.append(richText(text));
  article.append(body);
  if (images.length) {
    const media = el("div", "post-media");
    for (const url of images) {
      const img = el("img");
      img.src = url;
      img.alt = tag(e, "alt") || "Photo attached to this community update";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener(
        "error",
        () => {
          const p = el("p", "media-failure", "Photo unavailable. ");
          p.append(link("Open original image (new tab)", url));
          img.replaceWith(p);
        },
        { once: true }
      );
      media.append(img);
    }
    article.append(media);
  }
  for (const { url, label } of videos) {
    const media = el("div", "post-video");
    const video = el("video");
    video.controls = true;
    video.setAttribute("playsinline", "");
    video.preload = "none";
    video.setAttribute("aria-label", label);
    const failure = el("p", "video-error", "Video unavailable in this browser.");
    failure.hidden = true;
    video.addEventListener("error", () => {
      failure.hidden = false;
    });
    video.addEventListener("play", () => {
      for (const other of document.querySelectorAll("#feed video"))
        if (other !== video) other.pause();
    });
    video.src = url;
    media.append(video, failure, link("Open original video (new tab)", url));
    article.append(media);
  }
  const tipping = el("div", "post-zap");
  const confirmed = totals.get(e.id) ?? 0n;
  const amount = el(
    "span",
    "zap-total",
    zapState.error || zapState.snapshot?.partial && confirmed === 0n ? "\u2014" : `${new Intl.NumberFormat("en-CA").format(confirmed / 1000n)} sats${zapState.snapshot?.partial ? " \xB7 provisional" : ""}`
  );
  amount.title = zapState.error ? "Zap checks unavailable \u2014 not proof that no payments exist." : `${zapState.snapshot?.partial ? "Partial receipt check \xB7 totals/order may change as receipts become available. Missing receipts are not zero payments. " : ""}Verified community receipts \xB7 ${zapState.snapshot?.sources.join(" + ")}. Provider-attested payments, not independent settlement proofs.`;
  amount.setAttribute(
    "aria-label",
    zapState.error || zapState.snapshot?.partial && confirmed === 0n ? "Zap total unavailable" : `${amount.textContent} ${zapState.snapshot?.partial ? "partial receipt check; totals/order may change" : "verified to community"}`
  );
  const zap = el("button", "zap-button");
  zap.type = "button";
  zap.setAttribute("aria-label", "Zap this post");
  zap.title = "Zap this post \xB7 Tips support community";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(icon.namespaceURI, "path");
  path.setAttribute("d", "m13 2-9 12h7l-1 8 10-13h-7l0-7Z");
  icon.append(path);
  zap.append(icon);
  zap.addEventListener("click", () => zapUI.open(e.id, zap));
  tipping.append(zap, amount, provenance(e, identity));
  article.append(tipping);
  return article;
}
function eventCard(e, identity, info) {
  const item = el("article", "event"), date = el("div", "event-date"), day = /* @__PURE__ */ new Date(info.date + "T12:00:00Z");
  date.append(
    el("b", "", String(day.getUTCDate())),
    el(
      "span",
      "",
      new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
        day
      )
    )
  );
  const content = el("div");
  content.append(
    el("h3", "", info.title),
    el(
      "p",
      "",
      info.allDay ? "All day" : format(info.sort, {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit"
      })
    ),
    el("p", "", info.location)
  );
  const details = el("details");
  details.append(
    el("summary", "", "Event details"),
    richText(e.content),
    el("p", "", identity.nip05),
    provenance(e, identity)
  );
  item.append(date, content, details);
  return item;
}
function status(text, error = false) {
  $2("status").textContent = text;
  $2("status").classList.toggle("error", error);
}
async function batches(items, size, fn) {
  const result = [];
  for (let i2 = 0; i2 < items.length; i2 += size)
    result.push(...await fn(items.slice(i2, i2 + size)));
  return result;
}
async function load(reset = false) {
  if (busy) return;
  busy = true;
  zapUI.invalidate();
  currentPosts = /* @__PURE__ */ new Map();
  currentIdentities = /* @__PURE__ */ new Map();
  totals = /* @__PURE__ */ new Map();
  zapState = { authority: null, error: "Zap checks unavailable." };
  $2("refresh").disabled = true;
  $2("order-newest").disabled = true;
  $2("order-top").disabled = true;
  renderFeed();
  $2("load-more").disabled = true;
  $2("feed").setAttribute("aria-busy", "true");
  status(
    reset ? "Checking the latest stories and community identities\u2026" : "Checking earlier updates and refreshing identity associations\u2026"
  );
  const relay = new Relay();
  try {
    if (!navigator.onLine)
      throw Error(
        "You\u2019re offline. Community updates need an internet connection."
      );
    await relay.open();
    let until = reset ? Math.floor(Date.now() / 1e3) : cursor ?? Math.floor(Date.now() / 1e3);
    let requested = reset ? 12 : limit;
    const page = [];
    let nextCursor = until, nextLimit = requested, pageEnded = false;
    for (let i2 = 0; i2 < (feedOrder === "top" ? TOP_PAGES : 1); i2++) {
      if (requested > 600 || page.length + requested > TOP_ENTRIES) break;
      const chunk = await relay.query([
        { kinds: [1, 20], until, limit: requested }
      ]);
      if (feedOrder === "top" && (chunk.length > requested || page.length + chunk.length > TOP_ENTRIES))
        throw Error("Relay exceeded the Top reading limit. Please retry.");
      page.push(...chunk);
      const oldest = chunk.length ? Math.min(...chunk.map((e) => e.created_at)) : until;
      nextLimit = oldest === until ? requested + 12 : chunk.filter((e) => e.created_at === oldest).length + 12;
      nextCursor = oldest;
      pageEnded = chunk.length < requested;
      if (pageEnded || nextLimit > 600) break;
      until = nextCursor;
      requested = nextLimit;
    }
    const calendar = reset ? await relay.query([
      {
        kinds: [31922, 31923],
        until: Math.floor(Date.now() / 1e3),
        limit: 60
      }
    ]) : [];
    const retained = reset ? [] : stored;
    const retainedPosts = retained.filter((e) => [1, 20].includes(e.kind));
    const present = new Set((await batches(retainedPosts, 100, async (chunk) => {
      const ids = chunk.map((e) => e.id);
      const found = await relay.query([{ ids, limit: ids.length }]);
      if (found.length > ids.length || found.some((e) => !ids.includes(e.id)))
        throw Error("Source presence check exceeded its exact-ID boundary.");
      return found;
    })).map((e) => e.id));
    const retainedIds = new Set(retainedPosts.map((e) => e.id));
    const available = (e) => !retainedIds.has(e.id) || present.has(e.id);
    let candidates = [...retained.filter(available), ...page.filter(available), ...calendar];
    if (candidates.length > 1200)
      throw Error(
        "This reading session has reached its safety limit. Refresh to start again."
      );
    const coordinates = [
      ...new Map(
        candidates.filter((e) => e.kind >= 3e4).map((e) => [address(e), e])
      ).values()
    ];
    const revisions = await batches(
      coordinates,
      20,
      (chunk) => relay.query(
        chunk.map((e) => ({
          authors: [e.pubkey],
          kinds: [e.kind],
          "#d": [tag(e, "d") ?? ""],
          limit: 1
        }))
      )
    );
    candidates.push(...revisions);
    const authors = [
      ...new Set(candidates.filter((e) => e.kind !== 5).map((e) => e.pubkey))
    ];
    const profiles = await batches(
      authors,
      20,
      (chunk) => relay.query(
        chunk.map((pubkey) => ({ kinds: [0], authors: [pubkey], limit: 1 }))
      )
    );
    const deletions = await batches(authors, 20, async (chunk) => {
      const d = await relay.query([{ kinds: [5], authors: chunk, limit: 500 }]);
      if (d.length >= 500)
        throw Error(
          "Deletion history is too large to verify safely. Please retry later."
        );
      return d;
    });
    candidates = [
      ...new Map([...candidates, ...deletions].map((e) => [e.id, e])).values()
    ];
    let unavailable = 0;
    const identities = /* @__PURE__ */ new Map();
    await batches(authors, 4, async (chunk) => {
      await Promise.all(
        chunk.map(async (pubkey) => {
          const profile = latestProfile(profiles, pubkey);
          if (!profile || deletions.some(
            (d) => d.pubkey === pubkey && d.tags.some(
              (t) => t[0] === "e" && t[1] === profile.id || t[0] === "a" && t[1] === `0:${pubkey}:` && d.created_at >= profile.created_at
            )
          ))
            return;
          try {
            const identity = await identify(profile);
            if (identity) identities.set(pubkey, identity);
          } catch {
            unavailable++;
          }
        })
      );
      return [];
    });
    const visible = visibleEvents(candidates).filter(
      (e) => identities.has(e.pubkey)
    );
    const feed = visible.filter((e) => [1, 20].includes(e.kind));
    currentPosts = new Map(feed.map((e) => [e.id, e]));
    currentIdentities = identities;
    renderFeed();
    try {
      const authority = await resolveCommunity(relay);
      const snapshot = await collectReceipts(feed, authority, relay);
      totals = snapshot.totals;
      zapState = { authority, error: null, snapshot };
    } catch (error) {
      zapState = {
        authority: null,
        error: error.message || "Community zap verification is unavailable."
      };
    }
    currentPosts = new Map(feed.map((e) => [e.id, e]));
    currentIdentities = identities;
    renderFeed();
    $2("empty").hidden = feed.length > 0;
    const events = visible.filter((e) => e.kind >= 3e4).map((e) => ({ e, info: calendarInfo(e) })).filter((x) => x.info).sort((a, b) => a.info.sort - b.info.sort || a.e.id.localeCompare(b.e.id)).slice(0, 4);
    $2("events").replaceChildren(
      ...events.length ? events.map(
        ({ e, info }) => eventCard(e, identities.get(e.pubkey), info)
      ) : [
        el(
          "p",
          "small muted",
          "No upcoming events in the latest verified calendar updates. Check back soon."
        )
      ]
    );
    stored = candidates;
    limit = nextLimit;
    cursor = nextCursor;
    ended = pageEnded;
    if (limit > 600) {
      ended = true;
      status(
        "Many updates share one timestamp. The reading limit was reached; no older timestamps were skipped.",
        true
      );
    } else
      status(
        unavailable ? `Some author identities could not be checked (${unavailable}). Their posts are hidden. Refresh to retry.` : `Updated ${format(Math.floor(Date.now() / 1e3), { hour: "numeric", minute: "2-digit" })} PT \xB7 identities checked.`,
        unavailable > 0
      );
    $2("connection").textContent = "Connected";
    $2("connection").dataset.state = "ready";
    $2("page-note").textContent = ended ? "You\u2019ve reached the end of this relay page. Refresh for new updates." : "No endless scroll. Take your time.";
  } catch (error) {
    zapUI.invalidate();
    currentPosts = /* @__PURE__ */ new Map();
    currentIdentities = /* @__PURE__ */ new Map();
    totals = /* @__PURE__ */ new Map();
    zapState = {
      authority: null,
      error: "Feed checks unavailable. No invoice can be created."
    };
    renderFeed();
    $2("empty").hidden = true;
    $2("events").replaceChildren(
      el(
        "p",
        "small muted",
        "Events could not be verified. Please refresh to retry."
      )
    );
    status(
      error.message || "Community updates could not be verified. Please retry.",
      true
    );
    $2("connection").textContent = navigator.onLine ? "Relay check unavailable" : "Offline";
    $2("connection").dataset.state = "error";
    ended = false;
  } finally {
    relay.close();
    busy = false;
    $2("refresh").disabled = false;
    $2("order-newest").disabled = false;
    $2("order-top").disabled = false;
    renderFeed();
    $2("load-more").disabled = ended;
    $2("feed").setAttribute("aria-busy", "false");
  }
}
$2("refresh").addEventListener("click", () => load(true));
$2("order-newest").addEventListener("click", () => {
  if (busy) return;
  feedOrder = "newest";
  renderFeed();
});
$2("order-top").addEventListener("click", () => {
  if (busy || feedOrder === "top") return;
  feedOrder = "top";
  load(false);
});
for (const period of ["week", "month", "all"])
  $2("period-" + period).addEventListener("click", () => {
    if (busy || feedOrder !== "top") return;
    zapPeriod = period;
    renderFeed();
  });
$2("load-more").addEventListener("click", () => load(false));
window.addEventListener("offline", () => {
  status(
    "You\u2019re offline. These are the last checked updates, not a live feed. Refresh when you\u2019re back online.",
    true
  );
  $2("connection").textContent = "Offline \xB7 last snapshot";
  $2("connection").dataset.state = "error";
});
setupWorker();
load(true);
/*! Bundled license information:

@noble/hashes/esm/utils.js:
@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/utils.js:
@noble/curves/esm/abstract/modular.js:
@noble/curves/esm/abstract/curve.js:
@noble/curves/esm/abstract/weierstrass.js:
@noble/curves/esm/_shortw_utils.js:
@noble/curves/esm/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/base/lib/esm/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
