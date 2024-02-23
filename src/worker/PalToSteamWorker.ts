import { city64 } from '../lib/bling.js'

const steamIdToPlayerUid = (steamId: string) => {
  const hash = city64(steamId)
  return ((hash.getLowBitsUnsigned() + hash.getHighBitsUnsigned() * 23) & 0xffffffff) >>> 0
}

const steamAccountIdToBuf = (accountId: number) => {
  return (BigInt(accountId) + 76561197960265728n).toString()
}

const reportEvery = 50000

onmessage = (event) => {
  const targets: number[] = event.data.targets
  const start: number = event.data.start
  const end: number = event.data.end
  console.log('worker start', start, end, targets)
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
    const uid = steamIdToPlayerUid(steamAccountIdToBuf(i))
    if (targets.includes(uid)) {
      postMessage({
        type: 'found',
        accountId: i,
        uid: uid
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
