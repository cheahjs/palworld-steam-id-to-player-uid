<script setup lang="ts">
import { watch, ref } from 'vue'
import { city64 } from '../lib/bling.js'

const steamId = ref('')

const playerUid = ref(0)
const noSteamPlayerUid = ref(0)

const u32 = (value: number) => {
  return (value & 0xffffffff) >>> 0
}

const steamIdToPlayerUid = (steamId: string) => {
  let hash = city64(steamId)
  let unrealHashType =
    ((hash.getLowBitsUnsigned() + hash.getHighBitsUnsigned() * 23) & 0xffffffff) >>> 0
  // math for when Steam's subsystem is not available
  let a = u32(u32(unrealHashType << 8) ^ u32(2654435769 - unrealHashType))
  let b = u32((a >>> 13) ^ u32(-(unrealHashType + a)))
  let c = u32((b >>> 12) ^ u32(unrealHashType - a - b))
  let d = u32(u32(c << 16) ^ u32(a - c - b))
  let e = u32((d >>> 5) ^ (b - d - c))
  let f = u32((e >>> 3) ^ (c - d - e))
  let result = u32(
    (u32(u32(f << 10) ^ u32(d - f - e)) >>> 15) ^ (e - (u32(f << 10) ^ u32(d - f - e)) - f)
  )

  playerUid.value = unrealHashType
  noSteamPlayerUid.value = result
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
Palworld Player UID (Hex - Save Files): {{ playerUid.toString(16).toUpperCase() }}
Palworld Player UID (Decimal - RCON): {{ playerUid }}
-------------------------
No Steam:
Palworld Player UID (Hex - Save Files): {{ noSteamPlayerUid.toString(16).toUpperCase() }}
Palworld Player UID (Decimal - RCON): {{ noSteamPlayerUid }}</pre
    >
    <p>What is the No Steam UID?</p>
    <p>
      In the event the Steam system is not available, for example if <code>-nosteam</code> is used
      or if the Steam client (either the desktop client or SteamCMD) is not available, Palworld uses
      a different algorithm for player UIDs.
    </p>
  </div>
</template>

<style scoped>
input {
  width: 100%;
}
</style>
