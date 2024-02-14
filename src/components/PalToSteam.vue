<script setup lang="ts">
import { ref } from 'vue'
import BruteforceWorker from '../worker/PalToSteamWorker?worker'
import Long from 'long';
import computeShaderString from './compute_shader.wgsl?raw'

const playerUidInput = ref('')
const bruteforcing = ref(false)
const bruteforceMethod = ref('webgpu')
const webgpuAvailable = !!navigator.gpu
const threadsAvailable = navigator.hardwareConcurrency
const webworkersThreadCount = ref(threadsAvailable)
const webworkersProgress = ref([{ current: 0, start: 0, end: 0 }])
const foundSteamIds = ref([0])

const steamAccountIdToString = (accountId: number) => {
  return Long.fromBits(accountId, 17825793, true).toString()
}

const playerUidToSteamId = async () => {
  resetState()
  console.log('Brute forcing player UID to Steam ID', playerUidInput)
  bruteforcing.value = true

  if (bruteforceMethod.value == 'webgpu') {
    await webgpuBruteForce(parseInt(playerUidInput.value, 16))
  } else if (bruteforceMethod.value == 'webworkers') {
    await webworkerBruteForce(parseInt(playerUidInput.value, 16))
  }
}

const webworkerBruteForce = async (target: number) => {
  const stride = Math.floor(2 ** 32 / webworkersThreadCount.value)
  const tasks = []
  for (let i = 0; i < webworkersThreadCount.value; i++) {
    webworkersProgress.value.push({ current: 0, start: 0, end: 0 })
    const worker = new BruteforceWorker()
    const start = i * stride
    const end = i == webworkersThreadCount.value - 1 ? 2 ** 32 + 1 : (i + 1) * stride
    worker.postMessage({
      target: target,
      start: start,
      end: end,
    })
    tasks.push(new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.progress) {
          webworkersProgress.value[i] = e.data.progress
        } else if (e.data.accountId) {
          console.log('Steam ID found', e.data.accountId)
          foundSteamIds.value.push(e.data.accountId)
        } else if (e.data.type == 'done') {
          console.log(`Worker ${i} done`)
          worker.terminate()
          resolve(null)
        }
      }
      return void 0
    }))
  }
  await Promise.all(tasks)
}

const webgpuBruteForce = async (target: number) => {
  // Setup WebGPU for compute shader
  const adapter = await navigator.gpu?.requestAdapter()
  const device = await adapter?.requestDevice()
  if (!device) {
    console.error('WebGPU not supported')
    alert('WebGPU not supported')
    return
  }
  const module = device.createShaderModule({
    code: computeShaderString,
  });

  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'main',
    },
  });

  const input = new ArrayBuffer(9 * 4)

  // create a buffer on the GPU to hold our computation input
  const workBuffer = device.createBuffer({
    label: 'work input buffer',
    size: input.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  // Copy our input data to that buffer
  device.queue.writeBuffer(workBuffer, 0, input);

  // create a buffer on the GPU to hold our computation output
  let minSize = Math.ceil(input.byteLength / (9 * 4) / 8)
  if (minSize % 4 != 0) { 
    minSize += 4 - (minSize % 4)
  }
  const outputBuffer = device.createBuffer({
    label: 'work output buffer',
    size: minSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

  // create a buffer on the GPU to get a copy of the results
    const stagingResultBuffer = device.createBuffer({
      label: 'result buffer',
    size: outputBuffer.size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // create a buffer on the GPU to hold our target hash
  const targetHashBuffer = device.createBuffer({
    label: 'target hash buffer',
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(targetHashBuffer, 0, new Uint32Array([target]))

  // Setup a bindGroup to tell the shader which
  // buffer to use for the computation
  const bindGroup = device.createBindGroup({
    label: 'bindGroup for work buffer',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
      { binding: 2, resource: { buffer: targetHashBuffer } },
    ],
  });

  // Encode commands to do the computation
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(1);
  pass.end();

  // Encode a command to copy the results to a mappable buffer.
  encoder.copyBufferToBuffer(outputBuffer, 0, stagingResultBuffer, 0, stagingResultBuffer.size);

  // Finish encoding and submit the commands
  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  // Read the results
  await stagingResultBuffer.mapAsync(GPUMapMode.READ);
  const result = new Uint32Array(stagingResultBuffer.getMappedRange().slice(0));
  stagingResultBuffer.unmap();

  console.log('input', input);
  console.log('result', result);
}

const getProgressValue = (progress: { current: number, start: number, end: number }) => {
  return progress.current == progress.start ? 0 : ((progress.current - progress.start) / (progress.end - progress.start) * 100)
}

const getSteamProfileUrl = (steamId: number) => {
  return `https://steamcommunity.com/profiles/${steamId}`
}

const resetState = () => {
  bruteforcing.value = false
  foundSteamIds.value = []
  webworkersProgress.value = []
}

</script>

<template>
  <div>
    <h2>Convert Palworld Player UID to Steam ID(s)</h2>
    <p>The process of converting a Steam ID to a Player UID is a one-way process. As such, we "convert" Palworld Player
      UIDs back to Steam IDs by bruteforcing every Steam ID. This process means that multiple different Steam IDs can map
      onto the same Palworld Player UID.</p>
    <form @submit.prevent="playerUidToSteamId" v-if="!bruteforcing">
      <label class="label">Palworld Player UID (Hex)</label>
      <input v-model="playerUidInput" type="text" placeholder="Enter your Palworld Player UID in hexadecimal" required
        minlength="8" maxlength="8" pattern="[0-9a-fA-F]{8}" /><br />
      <label class="label">Bruteforce method</label>
      <select v-model="bruteforceMethod">
        <option v-if="webgpuAvailable" value="webgpu">WebGPU (GPU)</option>
        <option value="webworkers">Web Workers (CPU) - VERY SLOW!</option>
      </select><br />
      <label v-if="bruteforceMethod == 'webworkers'" class="label">Number of Web Workers</label>
      <input v-if="bruteforceMethod == 'webworkers'" type="number" min="1" step="1"
        v-model="webworkersThreadCount" /><br />
      <button type="submit">Convert</button>
    </form>
    <div v-else>
      <p>Bruteforcing Steam IDs that match UID {{ playerUidInput }} ({{ parseInt(playerUidInput, 16) }})...</p>
      <p>This process may take a while. Please be patient.</p>
      <h3>Found Steam IDs</h3>
      <ul>
        <li v-for="steamId in foundSteamIds" :key="steamId"><a :href="getSteamProfileUrl(steamId)">{{
          steamAccountIdToString(steamId) }}</a></li>
      </ul>
      <h3>Status</h3>
      <ul v-if="bruteforceMethod == 'webworkers'">
        <li v-for="progress in webworkersProgress" :key="progress.start">{{ progress.current - progress.start }}/{{
          progress.end - progress.start }} ({{ ((progress.current - progress.start) / (progress.end - progress.start) *
    100).toPrecision(5)
  }}%) <progress max="100" :value="getProgressValue(progress)" />
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
input {
  width: 100%;
}

input:invalid {
  border-color: red;
}
</style>