'use strict'

/**
 * Expose compositor.
 */

module.exports = compose

/**
 * Compose `middleware` returning
 * a fully valid middleware comprised
 * of all those which are passed.
 *
 * @param {Array} middleware
 * @return {Function}
 * @api public
 */

function compose(middleware) {
  if (!Array.isArray(middleware))
    throw new TypeError('Middleware stack must be an array!')
  for (const fn of middleware) {
    if (typeof fn !== 'function')
      throw new TypeError('Middleware must be composed of functions!')
  }
  /**
   * @param {Object} context
   * @return {Promise}
   * @api public
   */
  // 返回一个函数
  return function(context, next) {
    // last called middleware #
    let index = -1
    // 再返回dispatch函数的执行结果，默认执行的i为0
    return dispatch(0)
    // dispatch函数的定义
    function dispatch(i) {
      if (i <= index)
        // i<index，则报错并结束循环
        return Promise.reject(new Error('next() called multiple times'))
      index = i
      let fn = middleware[i] // 获取中间件数组的第i个中间间(默认从0开始)
      if (i === middleware.length) fn = next // 说明中间件函数以及递归完毕，则把fn设置为next
      if (!fn) return Promise.resolve() // fn不存在，则直接返回（递归结束）
      try {
        // 返回一个Promise对象，并调用dispatch函数，实现递归调用
        // 最终得到一个类似 fn1(fn2(fn3()))这样的函数，执行顺序是1->3,返回顺序是3->1。即（FILO）
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)))
      } catch (err) {
        return Promise.reject(err)
      }
    }
  }
}
