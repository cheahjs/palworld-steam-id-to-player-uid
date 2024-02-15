<script setup lang="ts">
import { watch, ref } from 'vue'
import { city64 } from '../lib/bling.js'

const steamId = ref('')
const playerUid = ref('')
const playerUidDecimal = ref('')

const steamIdToPlayerUid = (steamId: string) => {
  let hash = city64(steamId)
  console.log(hash.toString())
  let unrealHashType =
    ((hash.getLowBitsUnsigned() + hash.getHighBitsUnsigned() * 23) & 0xffffffff) >>> 0
  console.log(unrealHashType)
  playerUid.value = unrealHashType.toString(16).toUpperCase()
  playerUidDecimal.value = unrealHashType.toString()
}

watch(steamId, async (newVal, _oldVal) => {
  steamIdToPlayerUid(newVal)
})
</script>

<template>
  <div>
    <h2>Convert Steam ID to Palworld Player UID</h2>
    <label class="label">Steam ID</label>
    <input v-model="steamId" type="text" placeholder="Enter your Steam ID" /><br />
    <pre v-if="steamId">
Steam ID: {{ steamId }}
Palworld Player UID (Hex - Save Files): {{ playerUid }}
Palworld Player UID (Decimal - RCON): {{ playerUidDecimal }}</pre
    >
  </div>
</template>

<style scoped>
input {
  width: 100%;
}
</style>
