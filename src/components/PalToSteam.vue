<script setup lang="ts">
import { ref } from 'vue'
import type { Ref } from 'vue'
import { parse, isInteger } from 'lossless-json'
import BruteforceWorker from '../worker/PalToSteamWorker?worker'
import WebGPUResultWorker from '../worker/WebGPUResultWorker?worker'
import computeShaderString from './compute_shader.wgsl?raw'

const playerUidInputs = ref([{ uid: '' }])
const bruteforcing = ref(false)
const bruteforceMethod = ref('lookup')
const webgpuAvailable = !!navigator.gpu
const threadsAvailable = navigator.hardwareConcurrency
const webworkersThreadCount = ref(threadsAvailable)
const webworkersProgress = ref([{ current: 0, start: 0, end: 0 }])
const foundSteamIds = ref([
  {
    accountId: 0,
    targetHash: 0
  }
])
const foundNoSteamIds = ref([
  {
    accountId: 0,
    targetHash: 0
  }
])
const webgpuProgress = ref({ current: 0, start: 0, end: 0 })
const webgpuDeviceName = ref('')
const bruteforceStartTime = ref(0)
const bruteforceStopTime: Ref<number | null> = ref(null)

const steamAccountIdToString = (accountId: number) => {
  return (BigInt(accountId) + 76561197960265728n).toString()
}

const steamIdToAccountId = (steamId: bigint) => {
  return Number(steamId - 76561197960265728n)
}

function customNumberParser(value: string) {
  return isInteger(value) ? BigInt(value) : parseFloat(value)
}

const playerUidToSteamId = async () => {
  resetState()
  console.log('Brute forcing player UID to Steam ID', playerUidInputs)
  bruteforcing.value = true
  bruteforceStartTime.value = Date.now()
  let targets = playerUidInputs.value.map((x) => parseInt(x.uid, 16))
  if (bruteforceMethod.value == 'webgpu') {
    await webgpuBruteForce(targets)
  } else if (bruteforceMethod.value == 'webworkers') {
    await webworkerBruteForce(targets)
  } else if (bruteforceMethod.value == 'lookup') {
    await lookupUids(targets)
  }
}

interface UidLookupResult {
  steam: bigint[]
  no_steam: bigint[]
}

const lookupUids = async (targets: number[]) => {
  for (let target of targets) {
    // Not for general use - use of this API will be subject to strict bot detection if abused
    const response = await fetch(`/uidlookup?uid=${target}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const rawData = await response.text()
    const data = parse(rawData, customNumberParser) as UidLookupResult
    for (let steamId of data.steam) {
      foundSteamIds.value.push({
        accountId: steamIdToAccountId(steamId),
        targetHash: target
      })
    }
    for (let steamId of data.no_steam) {
      foundNoSteamIds.value.push({
        accountId: steamIdToAccountId(steamId),
        targetHash: target
      })
    }
  }
}

const webworkerBruteForce = async (targets: number[]) => {
  const stride = Math.floor(2 ** 32 / webworkersThreadCount.value)
  const tasks = []
  for (let i = 0; i < webworkersThreadCount.value; i++) {
    webworkersProgress.value.push({ current: 0, start: 0, end: 0 })
    const worker = new BruteforceWorker()
    const start = i * stride
    const end = i == webworkersThreadCount.value - 1 ? 2 ** 32 + 1 : (i + 1) * stride
    worker.postMessage({
      targets: targets,
      start: start,
      end: end
    })
    tasks.push(
      new Promise((resolve) => {
        worker.onmessage = (e) => {
          if (e.data.progress) {
            webworkersProgress.value[i] = e.data.progress
          } else if (e.data.accountId) {
            console.log('Steam ID found', e.data.accountId)
            foundSteamIds.value.push({
              accountId: e.data.accountId,
              targetHash: e.data.uid
            })
          } else if (e.data.type == 'done') {
            console.log(`Worker ${i} done`)
            worker.terminate()
            resolve(null)
          }
        }
        return void 0
      })
    )
  }
  await Promise.all(tasks)
  bruteforceStopTime.value = Date.now()
}

const webgpuBruteForce = async (targets: number[]) => {
  // Setup WebGPU for compute shader
  const adapter = await navigator.gpu?.requestAdapter({
    powerPreference: 'high-performance'
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
    code: computeShaderString
  })

  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module,
      entryPoint: 'main'
    }
  })

  const WORKGROUP_SIZE = 64
  const DISPATCH_GROUP_SIZE = 32768
  const TOTAL_INVOCATIONS_PER_DISPATCH = WORKGROUP_SIZE * DISPATCH_GROUP_SIZE
  const TOTAL_DISPATCHES = Math.ceil(2 ** 32 / TOTAL_INVOCATIONS_PER_DISPATCH)

  // create worker to process results
  let resultWorker = new WebGPUResultWorker()
  resultWorker.onmessage = (e) => {
    if (e.data.account_id) {
      console.log('Steam ID found', e.data.account_id)
      foundSteamIds.value.push({
        accountId: e.data.account_id,
        targetHash: e.data.hash
      })
    }
  }
  // Create two of each buffer
  // create a buffer on the GPU to hold our computation output
  const outputBuffers = [
    createOnGpuBuffer(device, 'output_result_0', TOTAL_INVOCATIONS_PER_DISPATCH * 4),
    createOnGpuBuffer(device, 'output_result_1', TOTAL_INVOCATIONS_PER_DISPATCH * 4)
  ]
  // create a buffer on the GPU to get a copy of the results
  const stagingResultBuffers = [
    createStagingBuffer(device, 'staging: output_result_0', outputBuffers[0].size),
    createStagingBuffer(device, 'staging: output_result_1', outputBuffers[1].size)
  ]
  // create two buffers on the GPU to hold our current start
  const startNumBuffers = [
    createUniformBuffer(device, 'start_num_0', 4),
    createUniformBuffer(device, 'start_num_1', 4)
  ]
  // create a buffer on the GPU to signal if we found a result
  const signalBuffers = [
    createOnGpuBuffer(device, 'signal_result_0', 4),
    createOnGpuBuffer(device, 'signal_result_1', 4)
  ]
  const stagingSignalResultBuffers = [
    createStagingBuffer(device, 'staging: signal_result_0', 4),
    createStagingBuffer(device, 'staging: signal_result_1', 4)
  ]
  // create a buffer on the GPU to hold our target hashes
  const targetHashBuffer = createOnGpuBuffer(device, 'target_hashes', targets.length * 4)
  device.queue.writeBuffer(targetHashBuffer, 0, new Uint32Array(targets))

  // Setup a bindGroup to tell the shader which buffer to use for the computation
  const bindGroups = [
    device.createBindGroup({
      label: 'bindGroup for work buffer 0',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outputBuffers[0] } },
        { binding: 1, resource: { buffer: targetHashBuffer } },
        { binding: 2, resource: { buffer: startNumBuffers[0] } },
        { binding: 3, resource: { buffer: signalBuffers[0] } }
      ]
    }),
    device.createBindGroup({
      label: 'bindGroup for work buffer 1',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: outputBuffers[1] } },
        { binding: 1, resource: { buffer: targetHashBuffer } },
        { binding: 2, resource: { buffer: startNumBuffers[1] } },
        { binding: 3, resource: { buffer: signalBuffers[1] } }
      ]
    })
  ]
  let previousPromise: Promise<void>[] = [
    new Promise((resolve) => resolve()),
    new Promise((resolve) => resolve())
  ]
  for (let i = 0; i < TOTAL_DISPATCHES; i++) {
    // Wait for the previous computation to finish before starting the next one
    await previousPromise[i % 2]

    {
      device.queue.writeBuffer(
        startNumBuffers[i % 2],
        0,
        new Uint32Array([i * TOTAL_INVOCATIONS_PER_DISPATCH])
      )
      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, bindGroups[i % 2])
      pass.dispatchWorkgroups(DISPATCH_GROUP_SIZE)
      pass.end()

      // Copy the results to a staging buffer
      encoder.copyBufferToBuffer(
        outputBuffers[i % 2],
        0,
        stagingResultBuffers[i % 2],
        0,
        stagingResultBuffers[i % 2].size
      )
      encoder.copyBufferToBuffer(
        signalBuffers[i % 2],
        0,
        stagingSignalResultBuffers[i % 2],
        0,
        stagingSignalResultBuffers[i % 2].size
      )

      // Finish encoding and submit the commands
      const commandBuffer = encoder.finish()
      device.queue.submit([commandBuffer])
    }

    // Read the results
    previousPromise[i % 2] = (async () => {
      await stagingSignalResultBuffers[i % 2].mapAsync(GPUMapMode.READ)
      const signalResult = new Uint32Array(
        stagingSignalResultBuffers[i % 2].getMappedRange().slice(0)
      )
      stagingSignalResultBuffers[i % 2].unmap()
      if (signalResult[0] > 0) {
        await stagingResultBuffers[i % 2].mapAsync(GPUMapMode.READ)
        const result = new Uint32Array(stagingResultBuffers[i % 2].getMappedRange().slice(0))
        stagingResultBuffers[i % 2].unmap()
        resultWorker.postMessage(
          {
            start: i * TOTAL_INVOCATIONS_PER_DISPATCH,
            end: (i + 1) * TOTAL_INVOCATIONS_PER_DISPATCH,
            resultBuffer: result,
            targets: targets
          },
          [result.buffer]
        )
      }
    })()

    if (i % 8 == 0) {
      const progress = {
        current: (i + 1) * TOTAL_INVOCATIONS_PER_DISPATCH,
        start: 0,
        end: TOTAL_INVOCATIONS_PER_DISPATCH * TOTAL_DISPATCHES
      }
      webgpuProgress.value = progress
    }
  }
  await Promise.all(previousPromise)
  webgpuProgress.value = {
    current: TOTAL_INVOCATIONS_PER_DISPATCH * TOTAL_DISPATCHES,
    start: 0,
    end: TOTAL_INVOCATIONS_PER_DISPATCH * TOTAL_DISPATCHES
  }
  bruteforceStopTime.value = Date.now()
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
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })
}

// Create a buffer for var<uniform> on the GPU
const createUniformBuffer = (device: GPUDevice, label: string, size: number) => {
  // Align to 4 bytes
  if (size % 4 != 0) {
    size += 4 - (size % 4)
  }
  return device.createBuffer({
    label: label,
    size: size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  })
}

// Create a buffer for staging outputs on the GPU
const createStagingBuffer = (device: GPUDevice, label: string, size: number) => {
  return device.createBuffer({
    label: label,
    size: size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })
}

const getProgressValue = (progress: { current: number; start: number; end: number }) => {
  return progress.current == progress.start
    ? 0
    : ((progress.current - progress.start) / (progress.end - progress.start)) * 100
}

const getSteamProfileUrl = (accountId: number) => {
  return `https://steamcommunity.com/profiles/${steamAccountIdToString(accountId)}`
}

const resetState = () => {
  bruteforcing.value = false
  foundSteamIds.value = []
  foundNoSteamIds.value = []
  webworkersProgress.value = []
  webgpuProgress.value = { current: 0, start: 0, end: 0 }
  bruteforceStopTime.value = null
}

const addUidField = () => {
  playerUidInputs.value.push({ uid: '' })
}
const removeUid = (index: number) => {
  playerUidInputs.value.splice(index, 1)
}
</script>

<template>
  <div>
    <h2>Convert Palworld Player UID to Steam ID(s) <strong>(EXPERIMENTAL!)</strong></h2>
    <p>
      The process of converting a Steam ID to a Player UID is a one-way process. As such, we
      "convert" Palworld Player UIDs back to Steam IDs by bruteforcing every Steam ID. The process
      means that multiple different Steam IDs can map onto the same Palworld Player UID.
    </p>
    <p>
      This only currently supports the regular Palworld Player UID, and not the No Steam UIDs that
      are used when Steam is not available.
    </p>
    <form @submit.prevent="playerUidToSteamId" v-if="!bruteforcing">
      <button type="button" @click="addUidField()">Add more UIDs to search</button>
      <label class="label">Palworld Player UID (Hex)</label>
      <div v-for="(uidInput, index) in playerUidInputs" :key="index" class="uid-input-container">
        <input
          v-model="uidInput.uid"
          type="text"
          placeholder="Enter your Palworld Player UID in hexadecimal (eg 1234ABCD)"
          required
          minlength="8"
          maxlength="8"
          pattern="[0-9a-fA-F]{8}"
        />
        <button type="button" @click="removeUid(index)" v-show="index != 0" class="remove-button">
          Remove
        </button>
      </div>
      <label class="label">Bruteforce method</label>
      <select v-model="bruteforceMethod">
        <option value="lookup" selected>Database Lookup</option>
        <option v-if="webgpuAvailable" value="webgpu">WebGPU (GPU)</option>
        <option value="webworkers">Web Workers (CPU)</option></select
      ><br />
      <label v-if="bruteforceMethod == 'webworkers'" class="label">Number of Web Workers</label>
      <input
        v-if="bruteforceMethod == 'webworkers'"
        type="number"
        min="1"
        step="1"
        v-model="webworkersThreadCount"
      /><br />
      <button type="submit">Convert</button>
    </form>
    <div v-else>
      <div v-if="bruteforceMethod == 'lookup'">
        <div>
          Database is provided on a best-effort basis, it may not always be available. Use GPU or
          CPU brute-force methods if lookup fails.
        </div>
        <div>
          Looking up Steam IDs that match UIDs in the database:
          <ul>
            <li v-for="uidInput in playerUidInputs" :key="uidInput.uid">{{ uidInput.uid }}</li>
          </ul>
        </div>
        <h3>Found Steam IDs</h3>
        <ul>
          <li v-for="steamId in foundSteamIds" :key="steamId.accountId">
            <a :href="getSteamProfileUrl(steamId.accountId)">{{
              steamAccountIdToString(steamId.accountId)
            }}</a>
            > Steam UID: {{ steamId.targetHash.toString(16).toUpperCase() }}
          </li>
        </ul>
        <ul>
          <li v-for="steamId in foundNoSteamIds" :key="steamId.accountId">
            <a :href="getSteamProfileUrl(steamId.accountId)">{{
              steamAccountIdToString(steamId.accountId)
            }}</a>
            > No Steam UID: {{ steamId.targetHash.toString(16).toUpperCase() }}
          </li>
        </ul>
      </div>
      <div v-else>
        <div>
          Bruteforcing Steam IDs that match UIDs:
          <ul>
            <li v-for="uidInput in playerUidInputs" :key="uidInput.uid">{{ uidInput.uid }}</li>
          </ul>
        </div>
        <p>This process may take a while. Please be patient.</p>
        <p v-if="bruteforceStopTime == null">
          Elapsed time: {{ Date.now() - bruteforceStartTime }}ms
        </p>
        <p v-else>Time taken: {{ bruteforceStopTime - bruteforceStartTime }}ms</p>
        <h3>Found Steam IDs</h3>
        <ul>
          <li v-for="steamId in foundSteamIds" :key="steamId.accountId">
            <a :href="getSteamProfileUrl(steamId.accountId)">{{
              steamAccountIdToString(steamId.accountId)
            }}</a>
            > {{ steamId.targetHash.toString(16).toUpperCase() }}
          </li>
        </ul>
        <h3>Status</h3>
        <ul v-if="bruteforceMethod == 'webworkers'">
          <li v-for="progress in webworkersProgress" :key="progress.start">
            {{ progress.current - progress.start }}/{{ progress.end - progress.start }} ({{
              (
                ((progress.current - progress.start) / (progress.end - progress.start)) *
                100
              ).toPrecision(5)
            }}%) <progress max="100" :value="getProgressValue(progress)" />
          </li>
        </ul>
        <p v-if="bruteforceMethod == 'webgpu'">Using GPU: {{ webgpuDeviceName }}</p>
        <p v-if="bruteforceMethod == 'webgpu'">
          {{ webgpuProgress.current - webgpuProgress.start }}/{{
            webgpuProgress.end - webgpuProgress.start
          }}
          ({{
            (
              ((webgpuProgress.current - webgpuProgress.start) /
                (webgpuProgress.end - webgpuProgress.start)) *
              100
            ).toPrecision(5)
          }}%) <progress max="100" :value="getProgressValue(webgpuProgress)" />
        </p>
      </div>
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
.uid-input-container {
  display: flex;
  align-items: center;
}

.remove-button {
  margin-left: 10px;
}
</style>
