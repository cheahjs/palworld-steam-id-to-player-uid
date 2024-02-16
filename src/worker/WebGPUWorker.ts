const readyBuffers: Uint8Array[] = []
const bufferCount = 10
let currentDispatchIndex = 0
const PER_INPUT_SIZE = 9 * 4 // 9 32-bit integers
const WORKGROUP_SIZE = 64
const DISPATCH_GROUP_SIZE = 1024
const TOTAL_INVOCATIONS_PER_DISPATCH = WORKGROUP_SIZE * DISPATCH_GROUP_SIZE
const waitingPromises: { resolve: () => void }[] = []

const steamAccountIdToString = (accountId: number) => {
    return (BigInt(accountId) + 76561197960265728n).toString()
}

const keepInputBuffersPopulated = () => {
    if (readyBuffers.length >= bufferCount) {
        setTimeout(keepInputBuffersPopulated, 10)
        return
    }
    const buffersToCreate = bufferCount - readyBuffers.length
    for (let i = 0; i < buffersToCreate; i++) {
        const buffer = new Uint8Array(TOTAL_INVOCATIONS_PER_DISPATCH * PER_INPUT_SIZE)
        generateInputBuffer(buffer, currentDispatchIndex * TOTAL_INVOCATIONS_PER_DISPATCH, (currentDispatchIndex + 1) * TOTAL_INVOCATIONS_PER_DISPATCH)
        currentDispatchIndex++
        readyBuffers.push(buffer)
        if (waitingPromises.length > 0) {
            waitingPromises.pop()?.resolve()
        }
    }
    setTimeout(keepInputBuffersPopulated, 10)
}

const generateInputBuffer = (buffer: Uint8Array, start: number, end: number) => {
    for (let i = 0; i < end - start; i++) {
        const steamId = steamAccountIdToString(start + i)
        for (let j = 0; j < 17; j++) {
            buffer[i * 36 + j * 2] = steamId.charCodeAt(j)
        }
    }
}

onmessage = (event) => {
    if (event.data.type == 'init') {
        keepInputBuffersPopulated()
    }
    else if (event.data.type == 'pop') {
        if (readyBuffers.length > 0) {
            postMessage({ type: 'pop', buffer: readyBuffers.pop() })
        } else {
            waitingPromises.push({
                resolve: () => {
                    postMessage({ type: 'pop', buffer: readyBuffers.pop() })
                }
            })
        }
    }
}
