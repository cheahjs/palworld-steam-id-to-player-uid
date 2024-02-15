<script setup lang="ts">
import SteamToPal from './components/SteamToPal.vue'
import PalToSteam from './components/PalToSteam.vue'
</script>

<template>
  <header>
    <h1>Palworld Steam&lt;&gt;Player UID Converter</h1>
  </header>
  <hr />
  <div id="app">
    <p>
      This only works for servers that translate Steam IDs into Player UIDs. There are
      configurations that convert a different ID which this tool does not currently support.
    </p>
    <SteamToPal />
    <hr />
    <PalToSteam />
  </div>
  <footer>
    <p><a href="https://github.com/cheahjs/palworld-steam-id-to-player-uid">Source Code</a></p>
  </footer>
</template>
