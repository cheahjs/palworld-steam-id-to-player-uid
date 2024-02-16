onmessage = (e) => {
  const resultBuffer: Uint32Array = e.data.resultBuffer
  // console.log('resultBuffer', resultBuffer)
  const start: number = e.data.start
  const end: number = e.data.end
  for (let idIdx = start; idIdx < end; idIdx++) {
    if (resultBuffer[idIdx - start] != 0) {
      // log element as hex
      console.log(resultBuffer[idIdx - start].toString(16).padStart(8, '0'))
      postMessage({
        account_id: idIdx
      })
    }
  }
}
