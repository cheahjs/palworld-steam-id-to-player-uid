<script setup lang="ts">
import Form from './components/Form.vue'
</script>

<template>
  <h1>Palworld Steam to Player UID Generator</h1>
  <div id="app">
    <Form />
  </div>
  <div class="footer">
    <p><a href="https://github.com/cheahjs/palworld-steam-id-to-player-uid">Source Code</a></p>
  </div>
</template>

<style scoped>
.footer {
  position: fixed;
  left: 0;
  bottom: 0;
  width: 100%;
  text-align: center;
  background-color: cadetblue;
}
</style>