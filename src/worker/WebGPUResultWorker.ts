onmessage = (e) => {
    const resultBuffer: Uint32Array = e.data.resultBuffer;
    const start: number = e.data.start;
    const end: number = e.data.end;
    for (let idIdx = start; idIdx < end; idIdx++) {
        if (resultBuffer[idIdx-start] != 0) {
            postMessage({
                account_id: idIdx,
            })
        }
    }
}
