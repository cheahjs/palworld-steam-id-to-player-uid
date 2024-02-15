import Long from 'long'
import { city64 } from '../lib/bling.js'

const steamIdToPlayerUid = (steamId: string) => {
  const hash = city64(steamId)
  return ((hash.getLowBitsUnsigned() + hash.getHighBitsUnsigned() * 23) & 0xffffffff) >>> 0
}

const steamAccountIdToBuf = (accountId: number) => {
  return Long.fromBits(accountId, 17825793, true).toString()
}

const reportEvery = 50000

onmessage = (event) => {
  const target: number = event.data.target
  const start: number = event.data.start
  const end: number = event.data.end
  console.log('worker start', start, end, target)
  for (let i = start; i < end; i++) {
    if ((i - start) % reportEvery === 0) {
      postMessage({
        type: 'progress',
        progress: {
          current: i,
          start: start,
          end: end
        }
      })
    }
    if (steamIdToPlayerUid(steamAccountIdToBuf(i)) === target) {
      postMessage({
        type: 'found',
        accountId: i
      })
    }
  }
  postMessage({ type: 'done' })
  postMessage({
    type: 'progress',
    progress: {
      current: end,
      start: start,
      end: end
    }
  })
}
