return {
  async testdev_testRpcMethod1(context, params) {
    console.log('testdev_testRpcMethod 1', params)
    return { methods: 1, params }
  },
  async testdev_testRpcMethod2(context, params) {
    console.log('testdev_testRpcMethod 2', params)
    return { methods: 2, params }
  },
}
