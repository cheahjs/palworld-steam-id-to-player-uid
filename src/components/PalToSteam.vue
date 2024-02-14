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
const webgpuProgress = ref({ current: 0, start: 0, end: 0 })
const webgpuDeviceName = ref('')

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
  const adapter = await navigator.gpu?.requestAdapter({
    powerPreference: 'high-performance',
  })
  const device = await adapter?.requestDevice()
  if (!device) {
    console.error('WebGPU not supported')
    alert('WebGPU not supported')
    return
  }
  const adapterInfo = await adapter?.requestAdapterInfo()
  webgpuDeviceName.value = `Vendor: ${adapterInfo?.vendor} Arch: ${adapterInfo?.architecture} Device: ${adapterInfo?.device} Desc: ${adapterInfo?.description}`
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

  const WORKGROUP_SIZE = 64
  const DISPATCH_GROUP_SIZE = 1024
  const TOTAL_INVOCATIONS_PER_DISPATCH = WORKGROUP_SIZE * DISPATCH_GROUP_SIZE
  const TOTAL_DISPATCHES = Math.ceil(2 ** 32 / TOTAL_INVOCATIONS_PER_DISPATCH)
  const PER_INPUT_SIZE = 9 * 4 // 9 32-bit integers

  // create a buffer on the GPU to hold our computation input
  const workBuffer = createOnGpuBuffer(device, 'input_data', TOTAL_INVOCATIONS_PER_DISPATCH * PER_INPUT_SIZE)

  // create a buffer on the GPU to copy input data
  const mappedWorkBuffer = createOnGpuMapped(device, 'mapped: input_data', workBuffer.size)

  // create a buffer on the GPU to hold our computation output
  const outputBuffer = createOnGpuBuffer(device, 'output_result', TOTAL_INVOCATIONS_PER_DISPATCH * 4)//Math.ceil(input.byteLength / (9 * 4) / 8))

  // create a buffer on the GPU to get a copy of the results
  const stagingResultBuffer = createStagingBuffer(device, 'staging: output_result', outputBuffer.size);

  // create a buffer on the GPU to hold our target hash
  const targetHashBuffer = createOnGpuBuffer(device, 'target_hash', 4)
  device.queue.writeBuffer(targetHashBuffer, 0, new Uint32Array([target]))

  // Setup a bindGroup to tell the shader which buffer to use for the computation
  const bindGroup = device.createBindGroup({
    label: 'bindGroup for work buffer',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: workBuffer } },
      { binding: 1, resource: { buffer: outputBuffer } },
      { binding: 2, resource: { buffer: targetHashBuffer } },
    ],
  });

  for (let i = 0; i < TOTAL_DISPATCHES; i++) {
    console.log('Dispatch', i + 1, 'of', TOTAL_DISPATCHES)
    // Generate input data
    await generateInputBuffer(mappedWorkBuffer, i * TOTAL_INVOCATIONS_PER_DISPATCH, (i + 1) * TOTAL_INVOCATIONS_PER_DISPATCH)
    // Encode commands to do the computation
    const encoder = device.createCommandEncoder();
    // Copy the mapped buffer to the work buffer
    encoder.copyBufferToBuffer(mappedWorkBuffer, 0, workBuffer, 0, workBuffer.size);
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(DISPATCH_GROUP_SIZE);
    pass.end();

    // Encode a command to copy the results to a mappable buffer.
    encoder.copyBufferToBuffer(outputBuffer, 0, stagingResultBuffer, 0, stagingResultBuffer.size);

    // Finish encoding and submit the commands
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    // Wait for the computation to finish
    await device.queue.onSubmittedWorkDone();

    // Read the results
    await stagingResultBuffer.mapAsync(GPUMapMode.READ);
    const result = new Uint32Array(stagingResultBuffer.getMappedRange().slice(0));
    stagingResultBuffer.unmap();
    for (let j = 0; j < result.length; j++) {
      if (result[j] != 0) {
        console.log('Steam ID found at', steamAccountIdToString(i * TOTAL_INVOCATIONS_PER_DISPATCH + j), result[j])
        foundSteamIds.value.push(i * TOTAL_INVOCATIONS_PER_DISPATCH + j)
      }
    }

    const progress = { current: (i + 1) * TOTAL_INVOCATIONS_PER_DISPATCH, start: 0, end: TOTAL_INVOCATIONS_PER_DISPATCH * TOTAL_DISPATCHES }
    webgpuProgress.value = progress
  }
}

const generateInputBuffer = async (buffer: GPUBuffer, start: number, end: number) => {
  await buffer.mapAsync(GPUMapMode.WRITE);
  const data = new DataView(buffer.getMappedRange());
  for (let i = 0; i < (end - start); i++) {
    let steamId = steamAccountIdToString(start + i)
    for (let j = 0; j < 17; j++) {
      data.setUint8((i * 36) + (j * 2), steamId.charCodeAt(j))
    }
    data.setUint16((i * 36) + 34, 0)
    // console.log('Generated input for', i, steamId, data.buffer.slice(i * 36, (i + 1) * 36))
  }

  buffer.unmap();
}

// Create a buffer for var<storage, read_write> on the GPU
const createOnGpuBuffer = (device: GPUDevice, label: string, size: number) => {
  // Align to 4 bytes
  if (size % 4 != 0) {
    size += 4 - (size % 4)
  }
  return device.createBuffer({
    label: label,
    size: size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });
}

// Create a mapped buffer on the GPU
const createOnGpuMapped = (device: GPUDevice, label: string, size: number) => {
  // Align to 4 bytes
  if (size % 4 != 0) {
    size += 4 - (size % 4)
  }
  return device.createBuffer({
    label: label,
    size: size,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
  });
}

// Create a buffer for staging outputs on the GPU
const createStagingBuffer = (device: GPUDevice, label: string, size: number) => {
  return device.createBuffer({
    label: label,
    size: size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
}

const getProgressValue = (progress: { current: number, start: number, end: number }) => {
  return progress.current == progress.start ? 0 : ((progress.current - progress.start) / (progress.end - progress.start) * 100)
}

const getSteamProfileUrl = (accountId: number) => {
  return `https://steamcommunity.com/profiles/${steamAccountIdToString(accountId)}`
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
      <p>Using GPU: {{ webgpuDeviceName }}</p>
      <p v-if="bruteforceMethod == 'webgpu'">
        {{ webgpuProgress.current - webgpuProgress.start }}/{{ webgpuProgress.end - webgpuProgress.start }} ({{
          ((webgpuProgress.current - webgpuProgress.start) / (webgpuProgress.end - webgpuProgress.start) *
            100).toPrecision(5) }}%) <progress max="100" :value="getProgressValue(webgpuProgress)" />
      </p>
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