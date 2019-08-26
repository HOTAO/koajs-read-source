'use strict'

/**
 * Module dependencies.
 */

const isGeneratorFunction = require('is-generator-function')
const debug = require('debug')('koa:application')
const onFinished = require('on-finished')
const response = require('./response')
const compose = require('koa-compose')
const isJSON = require('koa-is-json')
const context = require('./context')
const request = require('./request')
const statuses = require('statuses')
const Emitter = require('events')
const util = require('util')
const Stream = require('stream')
const http = require('http')
const only = require('only')
const convert = require('koa-convert')
const deprecate = require('depd')('koa')

/**
 * Expose `Application` class.
 * Inherits from `Emitter.prototype`.
 */

module.exports = class Application extends Emitter {
  /**
   * Initialize a new `Application`.
   *
   * @api public
   */

  constructor() {
    super()

    this.proxy = false
    this.middleware = [] // 保存中间件数组
    this.subdomainOffset = 2 // 子域偏移量
    this.env = process.env.NODE_ENV || 'development'
    this.context = Object.create(context) // 创建一个空对象，其原型指向 context 对象
    this.request = Object.create(request) // 创建一个空对象，其原型指向 request 对象
    this.response = Object.create(response) // 创建一个空对象，其原型指向 response 对象
    if (util.inspect.custom) {
      this[util.inspect.custom] = this.inspect
    }
  }

  /**
   * Shorthand for:
   *
   *    http.createServer(app.callback()).listen(...)
   *
   * @param {Mixed} ...
   * @return {Server}
   * @api public
   */
  // listen函数，调用http.createServer方法创建一个http服务，并且传入一个回调函数（`callback`）
  listen(...args) {
    debug('listen')
    const server = http.createServer(this.callback())
    return server.listen(...args)
  }

  /**
   * Return JSON representation.
   * We only bother showing settings.
   *
   * @return {Object}
   * @api public
   */

  toJSON() {
    return only(this, ['subdomainOffset', 'proxy', 'env'])
  }

  /**
   * Inspect implementation.
   *
   * @return {Object}
   * @api public
   */

  inspect() {
    return this.toJSON()
  }

  /**
   * Use the given middleware `fn`.
   *
   * Old-style middleware will be converted.
   *
   * @param {Function} fn
   * @return {Application} self
   * @api public
   */
  // use方法很简单，就是往middleware中push传进来的函数（中间件必须是个函数）
  use(fn) {
    // 不是函数就报错
    if (typeof fn !== 'function')
      throw new TypeError('middleware must be a function!')
    // 如果是generator函数，就转成普通函数
    if (isGeneratorFunction(fn)) {
      deprecate(
        'Support for generators will be removed in v3. ' +
          'See the documentation for examples of how to convert old middleware ' +
          'https://github.com/koajs/koa/blob/master/docs/migration.md'
      )
      fn = convert(fn)
    }
    debug('use %s', fn._name || fn.name || '-')
    // 往中间件数组添加中间件 （中间件就是一个函数）
    this.middleware.push(fn)
    return this
  }

  /**
   * Return a request handler callback
   * for node's native http server.
   *
   * @return {Function}
   * @api public
   */
  // 为node的原生HTTP服务器返回处理请求的回调
  callback() {
    // 使用koa-compose中的compose函数，把所有的中间件穿起来，达到先进后出的效果
    const fn = compose(this.middleware)

    if (!this.listenerCount('error')) this.on('error', this.onerror)

    const handleRequest = (req, res) => {
      // 创建一个context对象
      const ctx = this.createContext(req, res)
      return this.handleRequest(ctx, fn) // 这个是下面定义的handleRequest。
    }

    return handleRequest
  }

  /**
   * Handle request in callback.
   *
   * @api private
   */
  // 处理请求（传入上下文对象和compose之后的中间件函数）
  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res
    res.statusCode = 404
    const onerror = err => ctx.onerror(err) // 错误回调
    const handleResponse = () => respond(ctx) // 成功回调
    onFinished(res, onerror)
    return fnMiddleware(ctx)
      .then(handleResponse)
      .catch(onerror)
  }

  /**
   * Initialize a new context.
   *
   * @api private
   */
  // 创建context上下文，一顿赋值操作，为了方便使用ctx
  // 这就是为什么可以使用ctx.res或者ctx.req这样的语法
  createContext(req, res) {
    const context = Object.create(this.context)
    const request = (context.request = Object.create(this.request))
    const response = (context.response = Object.create(this.response))
    context.app = request.app = response.app = this
    context.req = request.req = response.req = req
    context.res = request.res = response.res = res
    request.ctx = response.ctx = context
    request.response = response
    response.request = request
    context.originalUrl = request.originalUrl = req.url
    context.state = {}
    return context
  }

  /**
   * Default error handler.
   *
   * @param {Error} err
   * @api private
   */

  onerror(err) {
    if (!(err instanceof Error))
      throw new TypeError(util.format('non-error thrown: %j', err))

    if (404 == err.status || err.expose) return
    if (this.silent) return

    const msg = err.stack || err.toString()
    console.error()
    console.error(msg.replace(/^/gm, '  '))
    console.error()
  }
}

/**
 * Response helper.
 */

function respond(ctx) {
  // allow bypassing koa
  if (false === ctx.respond) return

  if (!ctx.writable) return

  const res = ctx.res
  let body = ctx.body
  const code = ctx.status

  // ignore body
  if (statuses.empty[code]) {
    // strip headers
    ctx.body = null
    return res.end()
  }

  if ('HEAD' == ctx.method) {
    if (!res.headersSent && isJSON(body)) {
      ctx.length = Buffer.byteLength(JSON.stringify(body))
    }
    return res.end()
  }

  // status body
  if (null == body) {
    if (ctx.req.httpVersionMajor >= 2) {
      body = String(code)
    } else {
      body = ctx.message || String(code)
    }
    if (!res.headersSent) {
      ctx.type = 'text'
      ctx.length = Buffer.byteLength(body)
    }
    return res.end(body)
  }

  // responses
  if (Buffer.isBuffer(body)) return res.end(body)
  if ('string' == typeof body) return res.end(body)
  if (body instanceof Stream) return body.pipe(res)

  // body: json
  body = JSON.stringify(body)
  if (!res.headersSent) {
    ctx.length = Buffer.byteLength(body)
  }
  res.end(body)
}
