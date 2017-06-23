/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
let path = require('path');
let fs = require('fs');
let Diff = require('text-diff');
let mime = require('mime');
let PNG = require('pngjs').PNG;
let pixelmatch = require('pixelmatch');
let rm = require('rimraf').sync;

let GOLDEN_DIR = path.join(__dirname, 'golden');
let OUTPUT_DIR = path.join(__dirname, 'output');

module.exports = {
  addMatchers: function(jasmine) {
    jasmine.addMatchers(customMatchers);
  },

  removeOutputDir: function() {
    if (fs.existsSync(OUTPUT_DIR))
      rm(OUTPUT_DIR);
  },
};

let GoldenComparators = {
  'image/png': compareImages,
  'text/plain': compareText
};

/**
 * @param {?Object} actualBuffer
 * @param {!Buffer} expectedBuffer
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareImages(actualBuffer, expectedBuffer) {
  if (!actualBuffer || !(actualBuffer instanceof Buffer))
    return { errorMessage: 'Actual result should be Buffer.' };

  let actual = PNG.sync.read(actualBuffer);
  let expected = PNG.sync.read(expectedBuffer);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      errorMessage: `Sizes differ: expected image ${expected.width}px X ${expected.height}px, but got ${actual.width}px X ${actual.height}px. `
    };
  }
  let diff = new PNG({width: expected.width, height: expected.height});
  let count = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, {threshold: 0.1});
  return count > 0 ? { diff: PNG.sync.write(diff) } : null;
}

/**
 * @param {?Object} actual
 * @param {!Buffer} expectedBuffer
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareText(actual, expectedBuffer) {
  if (typeof actual !== 'string')
    return { errorMessage: 'Actual result should be string' };
  let expected = expectedBuffer.toString('utf-8');
  if (expected === actual)
    return null;
  let diff = new Diff();
  let result = diff.main(expected, actual);
  diff.cleanupSemantic(result);
  let html = diff.prettyHtml(result);
  let diffStylePath = path.join(__dirname, 'diffstyle.css');
  html = `<link rel="stylesheet" href="file://${diffStylePath}">` + html;
  return {
    diff: html,
    diffExtension: '.html'
  };
}

let customMatchers = {
  toBeGolden: function(util, customEqualityTesters) {
    return {
      /**
             * @param {?Object} actual
             * @param {string} goldenName
             * @return {!{pass: boolean, message: (undefined|string)}}
             */
      compare: function(actual, goldenName) {
        let expectedPath = path.join(GOLDEN_DIR, goldenName);
        let actualPath = path.join(OUTPUT_DIR, goldenName);

        let messageSuffix = 'Output is saved in "' + path.basename(OUTPUT_DIR + '" directory');

        if (!fs.existsSync(expectedPath)) {
          ensureOutputDir();
          fs.writeFileSync(actualPath, actual);
          return {
            pass: false,
            message: goldenName + ' is missing in golden results. ' + messageSuffix
          };
        }
        let expected = fs.readFileSync(expectedPath);
        let comparator = GoldenComparators[mime.lookup(goldenName)];
        if (!comparator) {
          return {
            pass: false,
            message: 'Failed to find comparator with type ' + mime.lookup(goldenName) + ': '  + goldenName
          };
        }
        let result = comparator(actual, expected);
        if (!result)
          return { pass: true };
        ensureOutputDir();
        fs.writeFileSync(actualPath, actual);
        // Copy expected to the output/ folder for convenience.
        fs.writeFileSync(addSuffix(actualPath, '-expected'), expected);
        if (result.diff) {
          let diffPath = addSuffix(actualPath, '-diff', result.diffExtension);
          fs.writeFileSync(diffPath, result.diff);
        }

        let message = goldenName + ' mismatch!';
        if (result.errorMessage)
          message += ' ' + result.errorMessage;
        return {
          pass: false,
          message: message + ' ' + messageSuffix
        };

        function ensureOutputDir() {
          if (!fs.existsSync(OUTPUT_DIR))
            fs.mkdirSync(OUTPUT_DIR);
        }
      }
    };
  },
};

/**
 * @param {string} filePath
 * @param {string} suffix
 * @param {string=} customExtension
 * @return {string}
 */
function addSuffix(filePath, suffix, customExtension) {
  let dirname = path.dirname(filePath);
  let ext = path.extname(filePath);
  let name = path.basename(filePath, ext);
  return path.join(dirname, name + suffix + (customExtension || ext));
}