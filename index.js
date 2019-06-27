/** @see https://github.com/zephrax/restify-etag-cache/blob/dafbd6fb194787e02690bd13b7b6823f15874cb5/lib/index.js */
'use strict';

const etagLog = require('debug')('restify-wetag:etag');
const etag = require('etag');
const async = require('async');
const plugin = require('./lib/plugin/conditionalRequest');

function factory(opts) {
  let options = {};

  Object.assign(options, {
    weak: false,
    chain: plugin(),
  }, opts);

  function middleware(req, res, nextM) {
    if (options.ignore_routes) {
      if (options.ignore_routes.indexOf(req.route.path) > -1) {
        return nextM();
      }
    } else if (options.ignore_urls) {
      if (options.ignore_urls.indexOf(req.url) > -1) {
        return nextM();
      }
    }

    let oldWrite,
      oldWriteHead,
      oldEnd;

    let chunks = [];
    let headers = [];

    oldWrite = res.write;
    oldWriteHead = res.writeHead;
    oldEnd = res.end;

    chunks = [];
    headers = [];

    res.writeHead = function() {
      headers.push(arguments);
    };

    res.write = function(chunk) {
      chunks.push(chunk);
    };

    res.end = function(chunk) {
      if (chunk) {
        chunks.push(chunk);
      }

      res.writeHead = oldWriteHead;
      res.write = oldWrite;
      res.end = oldEnd;

      const strEtag = etag(chunks.join(''), { weak: options.weak });
      res.setHeader('etag', strEtag);
      etagLog('%s', strEtag);

      async.eachSeries(options.chain, (conditionalRequestMiddleware, nextConditionalRequestMiddleware) => {
        conditionalRequestMiddleware(req, res, (stopChainFlag) => {
          if (stopChainFlag === false) {
            nextConditionalRequestMiddleware(new Error('Send client cache headers'));
          } else {
            nextConditionalRequestMiddleware();
          }
        });
      }, (err) => {
        if (!err) {
          headers.forEach((header) => {
            oldWriteHead.apply(res, header);
          });

          chunks.forEach((chunk) => {
            oldWrite.apply(res, [chunk]);
          });

          oldEnd.apply(res, arguments);
        }
      });
    };

    nextM();
  }

  return middleware;
}

module.exports = factory;
