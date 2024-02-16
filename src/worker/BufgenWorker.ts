import init, { generate_buffer } from '../../bufgen/pkg'

let alreadyInitialized = false

onmessage = async (event) => {
  if (!alreadyInitialized) {
    await init()
    alreadyInitialized = true
  }
  const start: number = event.data.start
  const end: number = event.data.end
  const id: number = event.data.id
  postMessage({
    id: id,
    buffer: generate_buffer(start, end)
  })
}
