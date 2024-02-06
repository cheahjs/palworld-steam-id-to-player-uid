import Long from 'long'

export { city64 }

import { Module } from '../lib/export'
import { Buffer } from 'buffer'

let module
let raw
let city64
Module().then((instance) => {
  module = instance

  raw = {
    newUInt64: module.cwrap('new_uint64', 'number', []),
    heapMalloc: module.cwrap('heap_malloc', 'number', []),

    calcCityHash64: module.cwrap('CalcCityHash64', 'null', ['number', 'number', 'number'])
  }

  city64 = function (str) {
    const strSize = (str.length + 1) * 2
    const strPtr = raw.heapMalloc(strSize)
    module.stringToUTF16(str, strPtr, strSize)
    const retPtr = raw.newUInt64()
    raw.calcCityHash64(strPtr, strSize - 2, retPtr)
    const buff = Buffer.from(module.HEAPU8.subarray(retPtr, retPtr + 8))
    module._free(retPtr)
    module._free(strPtr)

    const int64 = new Long(buff.readInt32LE(0), buff.readInt32LE(4), true)
    return int64
  }
})
