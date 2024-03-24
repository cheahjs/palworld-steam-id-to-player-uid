<script setup lang="ts">
import SteamToPal from './components/SteamToPal.vue'
import PalToSteam from './components/PalToSteam.vue'
</script>

<template>
  <header>
    <nav>
      <a href="https://palservers.xyz">Community Server List</a>
      <a href="https://ping.palservers.xyz">Server Ping Tool</a>
    </nav>
    <h1>Palworld Steam&lt;&gt;Player UID Converter</h1>
  </header>
  <hr />
  <main>
    <div id="app">
      <p>This only supports Steam-based servers, either co-op or dedicated.</p>
      <SteamToPal />
      <hr />
      <PalToSteam />
    </div>
  </main>
  <hr />
  <footer>
    <p>
      Created by <a href="https://github.com/cheahjs">@cheahjs</a><br />
      <a href="https://github.com/cheahjs/palworld-steam-id-to-player-uid">Source Code</a>
    </p>
  </footer>
</template>

<style scoped>
header {
  text-align: center;
}
footer {
  text-align: center;
  font-size: 0.85em;
}
</style>
