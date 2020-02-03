'use strict';

/**
 * This module provides Node "Transform" streams [1] that wrap an underlying
 * transform stream and add persistent caching.
 *
 * This is useful to speed up tasks that involve repeatedly applying expensive
 * transforms (eg. parsing and transforming source code) to mostly-unchanged
 * inputs (eg. a source tree where most source files stay the same from one
 * build to the next).
 *
 * It works as follows:
 *
 *  1. A caching transform is created using `cacheTransform`
 *     or `cacheTransformFactory` which wraps an underyling "Transform" stream.
 *  2. Input to the caching transform is buffered and then, when all the input
 *     has been provided, a cache key is computed from the combination of
 *     a) the input and b) an object representing the configuration of the
 *     source transform (eg. compilation settings)
 *  3. If no cache file exists that matches the cache key, the input is fed to
 *     the underlying source stream and the output of the source stream is
 *     written to a cache file for future use and returned as the output of the
 *     caching transform.
 *  4. If a cache file does exist that matches the cache key, the existing cached
 *     output is read and returned as the output of the cache transform,
 *     bypassing the source transform.
 *
 * [1] https://nodejs.org/api/stream.html
 */

const { createHash } = require('crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs');
const { Transform } = require('stream');

function md5(buffer) {
  const hash = createHash('md5');
  hash.update(buffer);
  return hash.digest('hex');
}

// Format of files in the cache directory. Bump this whenever the format of
// cache entries changes.
const CACHE_FORMAT_VERSION = 1;

// Default directory to write cache files to.
const DEFAULT_CACHE_DIR = '.cache';

/**
 * @typedef CacheOptions
 * @prop {string} [cacheDir] - Path of directory to store cache files in
 * @prop {Object} [configData] -
 *   A JSON-serializable object that is used when generating the cache key.
 *   This typically represents the configuration of the underyling source transform
 *   and is used to ensure that cached outputs from previous runs with different
 *   configuration are ignored.
 *
 *   If no `configData` is passed, an empty object is used.
 */

/**
 * Create a new transform stream which caches outputs from an underyling "source"
 * transform.
 *
 * @param {string} name -
 *   A short, descriptive name for the cache. Used in the naming of cache files.
 * @param {Transform} sourceTransform -
 *   The source `Transform` stream
 * @param {CacheOptions} options
 */
function cacheTransform(
  name,
  sourceTransform,
  { cacheDir = DEFAULT_CACHE_DIR, configData = {} } = {}
) {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir);
  }

  const configHash = md5(JSON.stringify(configData));

  // Fetch the transformed `input` data from the cache if available, or transform
  // the data and cache it for future otherwise.
  const transform = (input, callback) => {
    const cacheKey = `${md5(input)}-${configHash}-v${CACHE_FORMAT_VERSION}`;
    const cacheFile = `${cacheDir}/${name}-${cacheKey}`;

    let transformed = null;
    try {
      transformed = readFileSync(cacheFile, { encoding: 'utf8' });
    } catch (err) {
      // No-op.
    }

    if (transformed !== null) {
      // Transformed data found in the cache, read and return it.
      callback(null, transformed);
    } else {
      // No cache entry found. Transform the data using the source transform
      // and cache it for future uses.
      let transformed = '';
      sourceTransform.on('readable', () => {
        const chunk = sourceTransform.read();
        if (chunk !== null) {
          transformed += chunk;
        }
      });
      sourceTransform.on('end', () => {
        writeFileSync(cacheFile, transformed);
        callback(null, transformed);
      });

      // Propagate any errors from the original transform.
      sourceTransform.on('error', err => {
        callback(err, null);
      });

      //
      sourceTransform.write(input.toString());
      sourceTransform.end();
    }
  };

  return new Transform({
    transform(buf, encoding, callback) {
      // Buffer the data to be transformed. Once all the data has been received,
      // we will compute a cache key and either returned the cached transformed
      // data or compute new data to cache.
      if (!this._buffer) {
        this._buffer = buf;
      } else {
        this._buffer = Buffer.concat([this._buffer, buf]);
      }
      callback();
    },

    flush(callback) {
      transform(this._buffer, (err, transformed) => callback(err, transformed));
    },
  });
}

/**
 * Return a function which constructs a transform stream using a given function
 * and adds caching by wrapping it with `cacheTransform`.
 *
 * This function is useful to add caching to, for example, Browserify transforms
 * (which are functions that create transform streams). For example:
 *
 * ```
 * // `babelify` is a function which accepts (filename, options) arguments and
 * // returns a `Transform` stream.
 * const babelify = require('babelify');
 *
 * // `cachingBabelify` has the same signature as `babelify`, but the returned
 * // stream will cache the results of the underlying Babel transform.
 * const cachingBabelify = cacheTransformFactory('babelify', babelify);
 * ```
 *
 * @param {string} name -
 *   Short, descriptive name used when creating cache files. See `cacheTransform`.
 * @param {Function} sourceTransformFactory -
 *   Factory function that creates source transforms which are to be cached.
 * @param {Object} cacheOptions -
 *   Configuration for caching. See `cacheTransform`.
 */
function cacheTransformFactory(name, sourceTransformFactory, cacheOptions) {
  return (...sourceTransformArgs) => {
    const sourceTransform = sourceTransformFactory(...sourceTransformArgs);
    return cacheTransform(name, sourceTransform, cacheOptions);
  };
}

module.exports = {
  cacheTransform,
  cacheTransformFactory,
};
