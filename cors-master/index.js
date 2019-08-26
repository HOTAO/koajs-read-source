'use strict'

const vary = require('vary')

/**
 * CORS middleware
 *
 * @param {Object} [options]
 *  - {String|Function(ctx)} origin `Access-Control-Allow-Origin`, default is request Origin header
 *  - {String|Array} allowMethods `Access-Control-Allow-Methods`, default is 'GET,HEAD,PUT,POST,DELETE,PATCH'
 *  - {String|Array} exposeHeaders `Access-Control-Expose-Headers`
 *  - {String|Array} allowHeaders `Access-Control-Allow-Headers`
 *  - {String|Number} maxAge `Access-Control-Max-Age` in seconds
 *  - {Boolean} credentials `Access-Control-Allow-Credentials`
 *  - {Boolean} keepHeadersOnError Add set headers to `err.header` if an error is thrown
 * @return {Function} cors middleware
 * @api public
 */
module.exports = function(options) {
  const defaults = {
    allowMethods: 'GET,HEAD,PUT,POST,DELETE,PATCH'
  }

  options = Object.assign({}, defaults, options)

  if (Array.isArray(options.exposeHeaders)) {
    options.exposeHeaders = options.exposeHeaders.join(',')
  }

  if (Array.isArray(options.allowMethods)) {
    options.allowMethods = options.allowMethods.join(',')
  }

  if (Array.isArray(options.allowHeaders)) {
    options.allowHeaders = options.allowHeaders.join(',')
  }

  if (options.maxAge) {
    options.maxAge = String(options.maxAge)
  }

  options.credentials = !!options.credentials
  options.keepHeadersOnError =
    options.keepHeadersOnError === undefined || !!options.keepHeadersOnError

  return async function cors(ctx, next) {
    // If the Origin header is not present terminate this set of steps.
    // The request is outside the scope of this specification.
    const requestOrigin = ctx.get('Origin')

    // Always set Vary header
    // https://github.com/rs/cors/issues/10
    ctx.vary('Origin')
    // 如果请求体中没有origin，那么不需要做跨域处理，直接下一个next()
    if (!requestOrigin) return await next()

    let origin
    /**
     * 如果是函数，则把上下文(ctx)当做参数传下去，并执行一遍该函数
     * 如果有返回值，并且是个Promise对象，则等待该对象执行完毕
     * 如果没有返回值，则结束cors，执行下一个中间件
     * */
    if (typeof options.origin === 'function') {
      origin = options.origin(ctx)
      if (origin instanceof Promise) origin = await origin
      if (!origin) return await next()
    } else {
      // 如果不是函数，则取传进来的origin或者request的origin
      origin = options.origin || requestOrigin
    }

    const headersSet = {}

    function set(key, value) {
      ctx.set(key, value)
      headersSet[key] = value
    }

    if (ctx.method !== 'OPTIONS') {
      // Simple Cross-Origin Request, Actual Request, and Redirects
      set('Access-Control-Allow-Origin', origin)

      if (options.credentials === true) {
        set('Access-Control-Allow-Credentials', 'true')
      }

      if (options.exposeHeaders) {
        set('Access-Control-Expose-Headers', options.exposeHeaders)
      }

      if (!options.keepHeadersOnError) {
        return await next()
      }
      try {
        return await next()
      } catch (err) {
        const errHeadersSet = err.headers || {}
        const varyWithOrigin = vary.append(
          errHeadersSet.vary || errHeadersSet.Vary || '',
          'Origin'
        )
        delete errHeadersSet.Vary

        err.headers = Object.assign({}, errHeadersSet, headersSet, {
          vary: varyWithOrigin
        })

        throw err
      }
    } else {
      // Preflight Request

      // If there is no Access-Control-Request-Method header or if parsing failed,
      // do not set any additional headers and terminate this set of steps.
      // The request is outside the scope of this specification.
      if (!ctx.get('Access-Control-Request-Method')) {
        // this not preflight request, ignore it
        return await next()
      }

      ctx.set('Access-Control-Allow-Origin', origin)

      if (options.credentials === true) {
        ctx.set('Access-Control-Allow-Credentials', 'true')
      }

      if (options.maxAge) {
        ctx.set('Access-Control-Max-Age', options.maxAge)
      }

      if (options.allowMethods) {
        ctx.set('Access-Control-Allow-Methods', options.allowMethods)
      }

      let allowHeaders = options.allowHeaders
      if (!allowHeaders) {
        allowHeaders = ctx.get('Access-Control-Request-Headers')
      }
      if (allowHeaders) {
        ctx.set('Access-Control-Allow-Headers', allowHeaders)
      }

      ctx.status = 204
    }
  }
}
