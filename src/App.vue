<script setup lang="ts">
import SteamToPal from './components/SteamToPal.vue';
import PalToSteam from './components/PalToSteam.vue';
</script>

<template>
  <header>
    <h1>Palworld Steam&lt;&gt;Player UID Converter</h1>
  </header>
  <hr/>
  <div id="app">
    <SteamToPal />
    <hr>
    <PalToSteam />
  </div>
  <footer>
    <p><a href="https://github.com/cheahjs/palworld-steam-id-to-player-uid">Source Code</a></p>
  </footer>
</template>
