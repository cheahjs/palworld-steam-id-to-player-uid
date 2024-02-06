var Module = (() => {
  var _scriptDir =
    typeof document !== 'undefined' && document.currentScript
      ? document.currentScript.src
      : undefined

  return function (moduleArg = {}) {
    // include: shell.js
    // The Module object: Our interface to the outside world. We import
    // and export values on it. There are various ways Module can be used:
    // 1. Not defined. We create it here
    // 2. A function parameter, function(Module) { ..generated code.. }
    // 3. pre-run appended it, var Module = {}; ..generated code..
    // 4. External script tag defines var Module.
    // We need to check if Module already exists (e.g. case 3 above).
    // Substitution will be replaced with actual code on later stage of the build,
    // this way Closure Compiler will not mangle it (e.g. case 4. above).
    // Note that if you want to run closure, and also to use Module
    // after the generated code, you will need to define   var Module = {};
    // before the code. Then that object will be used in the code, and you
    // can continue to use Module afterwards as well.
    var Module = moduleArg

    // Set up the promise that indicates the Module is initialized
    var readyPromiseResolve, readyPromiseReject
    Module['ready'] = new Promise((resolve, reject) => {
      readyPromiseResolve = resolve
      readyPromiseReject = reject
    })
    ;[
      '_new_uint64',
      '_heap_malloc',
      '_CalcCityHash64',
      '_free',
      '___indirect_function_table',
      'onRuntimeInitialized'
    ].forEach((prop) => {
      if (!Object.getOwnPropertyDescriptor(Module['ready'], prop)) {
        Object.defineProperty(Module['ready'], prop, {
          get: () =>
            abort(
              'You are getting ' +
                prop +
                ' on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js'
            ),
          set: () =>
            abort(
              'You are setting ' +
                prop +
                ' on the Promise object, instead of the instance. Use .then() to get called back with the instance, see the MODULARIZE docs in src/settings.js'
            )
        })
      }
    })

    // --pre-jses are emitted after the Module integration code, so that they can
    // refer to Module (if they choose; they can also define Module)

    // Sometimes an existing Module object exists with properties
    // meant to overwrite the default module functionality. Here
    // we collect those properties and reapply _after_ we configure
    // the current environment's defaults to avoid having to be so
    // defensive during initialization.
    var moduleOverrides = Object.assign({}, Module)

    var arguments_ = []
    var thisProgram = './this.program'
    var quit_ = (status, toThrow) => {
      throw toThrow
    }

    // Determine the runtime environment we are in. You can customize this by
    // setting the ENVIRONMENT setting at compile time (see settings.js).

    var ENVIRONMENT_IS_WEB = true
    var ENVIRONMENT_IS_WORKER = false
    var ENVIRONMENT_IS_NODE = false
    var ENVIRONMENT_IS_SHELL = false

    if (Module['ENVIRONMENT']) {
      throw new Error(
        'Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)'
      )
    }

    // `/` should be present at the end if `scriptDirectory` is not empty
    var scriptDirectory = ''
    function locateFile(path) {
      if (Module['locateFile']) {
        return Module['locateFile'](path, scriptDirectory)
      }
      return scriptDirectory + path
    }

    // Hooks that are implemented differently in different runtime environments.
    var read_, readAsync, readBinary

    if (ENVIRONMENT_IS_SHELL) {
      if (
        (typeof process == 'object' && typeof require === 'function') ||
        typeof window == 'object' ||
        typeof importScripts == 'function'
      )
        throw new Error(
          'not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)'
        )

      if (typeof read != 'undefined') {
        read_ = read
      }

      readBinary = (f) => {
        if (typeof readbuffer == 'function') {
          return new Uint8Array(readbuffer(f))
        }
        let data = read(f, 'binary')
        assert(typeof data == 'object')
        return data
      }

      readAsync = (f, onload, onerror) => {
        setTimeout(() => onload(readBinary(f)))
      }

      if (typeof clearTimeout == 'undefined') {
        globalThis.clearTimeout = (id) => {}
      }

      if (typeof setTimeout == 'undefined') {
        // spidermonkey lacks setTimeout but we use it above in readAsync.
        globalThis.setTimeout = (f) => (typeof f == 'function' ? f() : abort())
      }

      if (typeof scriptArgs != 'undefined') {
        arguments_ = scriptArgs
      } else if (typeof arguments != 'undefined') {
        arguments_ = arguments
      }

      if (typeof quit == 'function') {
        quit_ = (status, toThrow) => {
          // Unlike node which has process.exitCode, d8 has no such mechanism. So we
          // have no way to set the exit code and then let the program exit with
          // that code when it naturally stops running (say, when all setTimeouts
          // have completed). For that reason, we must call `quit` - the only way to
          // set the exit code - but quit also halts immediately.  To increase
          // consistency with node (and the web) we schedule the actual quit call
          // using a setTimeout to give the current stack and any exception handlers
          // a chance to run.  This enables features such as addOnPostRun (which
          // expected to be able to run code after main returns).
          setTimeout(() => {
            if (!(toThrow instanceof ExitStatus)) {
              let toLog = toThrow
              if (toThrow && typeof toThrow == 'object' && toThrow.stack) {
                toLog = [toThrow, toThrow.stack]
              }
              err(`exiting due to exception: ${toLog}`)
            }
            quit(status)
          })
          throw toThrow
        }
      }

      if (typeof print != 'undefined') {
        // Prefer to use print/printErr where they exist, as they usually work better.
        if (typeof console == 'undefined') console = /** @type{!Console} */ ({})
        console.log = /** @type{!function(this:Console, ...*): undefined} */ (print)
        console.warn = console.error = /** @type{!function(this:Console, ...*): undefined} */ (
          typeof printErr != 'undefined' ? printErr : print
        )
      }
    }

    // Note that this includes Node.js workers when relevant (pthreads is enabled).
    // Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
    // ENVIRONMENT_IS_NODE.
    else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        // Check worker, not web, since window could be polyfilled
        scriptDirectory = self.location.href
      } else if (typeof document != 'undefined' && document.currentScript) {
        // web
        scriptDirectory = document.currentScript.src
      }
      // When MODULARIZE, this JS may be executed later, after document.currentScript
      // is gone, so we saved it, and we use it here instead of any other info.
      if (_scriptDir) {
        scriptDirectory = _scriptDir
      }
      // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
      // otherwise, slice off the final part of the url to find the script directory.
      // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
      // and scriptDirectory will correctly be replaced with an empty string.
      // If scriptDirectory contains a query (starting with ?) or a fragment (starting with #),
      // they are removed because they could contain a slash.
      if (scriptDirectory.startsWith('blob:')) {
        scriptDirectory = ''
      } else {
        scriptDirectory = scriptDirectory.substr(
          0,
          scriptDirectory.replace(/[?#].*/, '').lastIndexOf('/') + 1
        )
      }

      if (!(typeof window == 'object' || typeof importScripts == 'function'))
        throw new Error(
          'not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)'
        )

      // Differentiate the Web Worker from the Node Worker case, as reading must
      // be done differently.
      {
        // include: web_or_worker_shell_read.js
        read_ = (url) => {
          var xhr = new XMLHttpRequest()
          xhr.open('GET', url, false)
          xhr.send(null)
          return xhr.responseText
        }

        if (ENVIRONMENT_IS_WORKER) {
          readBinary = (url) => {
            var xhr = new XMLHttpRequest()
            xhr.open('GET', url, false)
            xhr.responseType = 'arraybuffer'
            xhr.send(null)
            return new Uint8Array(/** @type{!ArrayBuffer} */ (xhr.response))
          }
        }

        readAsync = (url, onload, onerror) => {
          var xhr = new XMLHttpRequest()
          xhr.open('GET', url, true)
          xhr.responseType = 'arraybuffer'
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
              // file URLs can return 0
              onload(xhr.response)
              return
            }
            onerror()
          }
          xhr.onerror = onerror
          xhr.send(null)
        }

        // end include: web_or_worker_shell_read.js
      }
    } else {
      throw new Error('environment detection error')
    }

    var out = Module['print'] || console.log.bind(console)
    var err = Module['printErr'] || console.error.bind(console)

    // Merge back in the overrides
    Object.assign(Module, moduleOverrides)
    // Free the object hierarchy contained in the overrides, this lets the GC
    // reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
    moduleOverrides = null
    checkIncomingModuleAPI()

    // Emit code to handle expected values on the Module object. This applies Module.x
    // to the proper local x. This has two benefits: first, we only emit it if it is
    // expected to arrive, and second, by using a local everywhere else that can be
    // minified.

    if (Module['arguments']) arguments_ = Module['arguments']
    legacyModuleProp('arguments', 'arguments_')

    if (Module['thisProgram']) thisProgram = Module['thisProgram']
    legacyModuleProp('thisProgram', 'thisProgram')

    if (Module['quit']) quit_ = Module['quit']
    legacyModuleProp('quit', 'quit_')

    // perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
    // Assertions on removed incoming Module JS APIs.
    assert(
      typeof Module['memoryInitializerPrefixURL'] == 'undefined',
      'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead'
    )
    assert(
      typeof Module['pthreadMainPrefixURL'] == 'undefined',
      'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead'
    )
    assert(
      typeof Module['cdInitializerPrefixURL'] == 'undefined',
      'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead'
    )
    assert(
      typeof Module['filePackagePrefixURL'] == 'undefined',
      'Module.filePackagePrefixURL option was removed, use Module.locateFile instead'
    )
    assert(
      typeof Module['read'] == 'undefined',
      'Module.read option was removed (modify read_ in JS)'
    )
    assert(
      typeof Module['readAsync'] == 'undefined',
      'Module.readAsync option was removed (modify readAsync in JS)'
    )
    assert(
      typeof Module['readBinary'] == 'undefined',
      'Module.readBinary option was removed (modify readBinary in JS)'
    )
    assert(
      typeof Module['setWindowTitle'] == 'undefined',
      'Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)'
    )
    assert(
      typeof Module['TOTAL_MEMORY'] == 'undefined',
      'Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY'
    )
    legacyModuleProp('asm', 'wasmExports')
    legacyModuleProp('read', 'read_')
    legacyModuleProp('readAsync', 'readAsync')
    legacyModuleProp('readBinary', 'readBinary')
    legacyModuleProp('setWindowTitle', 'setWindowTitle')
    var IDBFS = 'IDBFS is no longer included by default; build with -lidbfs.js'
    var PROXYFS = 'PROXYFS is no longer included by default; build with -lproxyfs.js'
    var WORKERFS = 'WORKERFS is no longer included by default; build with -lworkerfs.js'
    var FETCHFS = 'FETCHFS is no longer included by default; build with -lfetchfs.js'
    var ICASEFS = 'ICASEFS is no longer included by default; build with -licasefs.js'
    var JSFILEFS = 'JSFILEFS is no longer included by default; build with -ljsfilefs.js'
    var OPFS = 'OPFS is no longer included by default; build with -lopfs.js'

    var NODEFS = 'NODEFS is no longer included by default; build with -lnodefs.js'

    assert(
      !ENVIRONMENT_IS_WORKER,
      'worker environment detected but not enabled at build time.  Add `worker` to `-sENVIRONMENT` to enable.'
    )

    assert(
      !ENVIRONMENT_IS_NODE,
      'node environment detected but not enabled at build time.  Add `node` to `-sENVIRONMENT` to enable.'
    )

    assert(
      !ENVIRONMENT_IS_SHELL,
      'shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.'
    )

    // end include: shell.js
    // include: preamble.js
    // === Preamble library stuff ===

    // Documentation for the public APIs defined in this file must be updated in:
    //    site/source/docs/api_reference/preamble.js.rst
    // A prebuilt local version of the documentation is available at:
    //    site/build/text/docs/api_reference/preamble.js.txt
    // You can also build docs locally as HTML or other formats in site/
    // An online HTML version (which may be of a different version of Emscripten)
    //    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

    var wasmBinary
    if (Module['wasmBinary']) wasmBinary = Module['wasmBinary']
    legacyModuleProp('wasmBinary', 'wasmBinary')

    // include: wasm2js.js
    // wasm2js.js - enough of a polyfill for the WebAssembly object so that we can load
    // wasm2js code that way.

    // Emit "var WebAssembly" if definitely using wasm2js. Otherwise, in MAYBE_WASM2JS
    // mode, we can't use a "var" since it would prevent normal wasm from working.
    /** @suppress{duplicate, const} */
    var WebAssembly = {
      // Note that we do not use closure quoting (this['buffer'], etc.) on these
      // functions, as they are just meant for internal use. In other words, this is
      // not a fully general polyfill.
      /** @constructor */
      Memory: function (opts) {
        this.buffer = new ArrayBuffer(opts['initial'] * 65536)
      },

      Module: function (binary) {
        // TODO: use the binary and info somehow - right now the wasm2js output is embedded in
        // the main JS
      },

      /** @constructor */
      Instance: function (module, info) {
        // TODO: use the module somehow - right now the wasm2js output is embedded in
        // the main JS
        // This will be replaced by the actual wasm2js code.
        this.exports = (function instantiate(info) {
          function Table(ret) {
            // grow method not included; table is not growable
            ret.set = function (i, func) {
              this[i] = func
            }
            ret.get = function (i) {
              return this[i]
            }
            return ret
          }

          var bufferView
          var base64ReverseLookup = new Uint8Array(123 /*'z'+1*/)
          for (var i = 25; i >= 0; --i) {
            base64ReverseLookup[48 + i] = 52 + i // '0-9'
            base64ReverseLookup[65 + i] = i // 'A-Z'
            base64ReverseLookup[97 + i] = 26 + i // 'a-z'
          }
          base64ReverseLookup[43] = 62 // '+'
          base64ReverseLookup[47] = 63 // '/'
          /** @noinline Inlining this function would mean expanding the base64 string 4x times in the source code, which Closure seems to be happy to do. */
          function base64DecodeToExistingUint8Array(uint8Array, offset, b64) {
            var b1,
              b2,
              i = 0,
              j = offset,
              bLength = b64.length,
              end =
                offset +
                ((bLength * 3) >> 2) -
                (b64[bLength - 2] == '=') -
                (b64[bLength - 1] == '=')
            for (; i < bLength; i += 4) {
              b1 = base64ReverseLookup[b64.charCodeAt(i + 1)]
              b2 = base64ReverseLookup[b64.charCodeAt(i + 2)]
              uint8Array[j++] = (base64ReverseLookup[b64.charCodeAt(i)] << 2) | (b1 >> 4)
              if (j < end) uint8Array[j++] = (b1 << 4) | (b2 >> 2)
              if (j < end) uint8Array[j++] = (b2 << 6) | base64ReverseLookup[b64.charCodeAt(i + 3)]
            }
          }
          function initActiveSegments(imports) {
            base64DecodeToExistingUint8Array(
              bufferView,
              65536,
              'dW5zaWduZWQgc2hvcnQAdW5zaWduZWQgaW50AGZsb2F0AHVpbnQ2NF90AHVuc2lnbmVkIGNoYXIAYm9vbAB1bnNpZ25lZCBsb25nAHN0ZDo6d3N0cmluZwBzdGQ6OnN0cmluZwBzdGQ6OnUxNnN0cmluZwBzdGQ6OnUzMnN0cmluZwBkb3VibGUAdm9pZABlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgc2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgaW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxmbG9hdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDhfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDY0X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDY0X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBjaGFyPgBzdGQ6OmJhc2ljX3N0cmluZzx1bnNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgbG9uZz4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZG91YmxlPgBOU3QzX18yMTJiYXNpY19zdHJpbmdJY05TXzExY2hhcl90cmFpdHNJY0VFTlNfOWFsbG9jYXRvckljRUVFRQAAAACUCAEAMgMBAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0loTlNfMTFjaGFyX3RyYWl0c0loRUVOU185YWxsb2NhdG9ySWhFRUVFAACUCAEAfAMBAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0l3TlNfMTFjaGFyX3RyYWl0c0l3RUVOU185YWxsb2NhdG9ySXdFRUVFAACUCAEAxAMBAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0lEc05TXzExY2hhcl90cmFpdHNJRHNFRU5TXzlhbGxvY2F0b3JJRHNFRUVFAAAAlAgBAAwEAQBOU3QzX18yMTJiYXNpY19zdHJpbmdJRGlOU18xMWNoYXJfdHJhaXRzSURpRUVOU185YWxsb2NhdG9ySURpRUVFRQAAAJQIAQBYBAEATjEwZW1zY3JpcHRlbjN2YWxFAACUCAEApAQBAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWNFRQAAlAgBAMAEAQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lhRUUAAJQIAQDoBAEATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaEVFAACUCAEAEAUBAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXNFRQAAlAgBADgFAQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l0RUUAAJQIAQBgBQEATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJaUVFAACUCAEAiAUBAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWpFRQAAlAgBALAFAQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lsRUUAAJQIAQDYBQEATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJbUVFAACUCAEAAAYBAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXhFRQAAlAgBACgGAQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l5RUUAAJQIAQBQBgEATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZkVFAACUCAEAeAYBAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWRFRQAAlAgBAKAGAQBOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQAAAAC8CAEAyAYBACAJAQBOMTBfX2N4eGFiaXYxMTdfX2NsYXNzX3R5cGVfaW5mb0UAAAC8CAEA+AYBAOwGAQBOMTBfX2N4eGFiaXYxMTdfX3BiYXNlX3R5cGVfaW5mb0UAAAC8CAEAKAcBAOwGAQBOMTBfX2N4eGFiaXYxMTlfX3BvaW50ZXJfdHlwZV9pbmZvRQC8CAEAWAcBAEwHAQAAAAAAzAcBAAUAAAAGAAAABwAAAAgAAAAJAAAATjEwX19jeHhhYml2MTIzX19mdW5kYW1lbnRhbF90eXBlX2luZm9FALwIAQCkBwEA7AYBAHYAAACQBwEA2AcBAGIAAACQBwEA5AcBAGMAAACQBwEA8AcBAGgAAACQBwEA/AcBAGEAAACQBwEACAgBAHMAAACQBwEAFAgBAHQAAACQBwEAIAgBAGkAAACQBwEALAgBAGoAAACQBwEAOAgBAGwAAACQBwEARAgBAG0AAACQBwEAUAgBAHgAAACQBwEAXAgBAHkAAACQBwEAaAgBAGYAAACQBwEAdAgBAGQAAACQBwEAgAgBAAAAAAAcBwEABQAAAAoAAAAHAAAACAAAAAsAAAAMAAAADQAAAA4AAAAAAAAABAkBAAUAAAAPAAAABwAAAAgAAAALAAAAEAAAABEAAAASAAAATjEwX19jeHhhYml2MTIwX19zaV9jbGFzc190eXBlX2luZm9FAAAAALwIAQDcCAEAHAcBAFN0OXR5cGVfaW5mbwAAAACUCAEAEAkBAA=='
            )
            base64DecodeToExistingUint8Array(
              bufferView,
              67880,
              '4AsBAAAAAAAFAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAABAAAAMwLAQAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAA//////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwCQEA'
            )
            base64DecodeToExistingUint8Array(
              bufferView,
              68036,
              'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='
            )
          }
          function asmFunc(imports) {
            var env = imports.env
            var memory = env.memory
            var buffer = memory.buffer
            var HEAP8 = new Int8Array(buffer)
            var HEAP16 = new Int16Array(buffer)
            var HEAP32 = new Int32Array(buffer)
            var HEAPU8 = new Uint8Array(buffer)
            var HEAPU16 = new Uint16Array(buffer)
            var HEAPU32 = new Uint32Array(buffer)
            var HEAPF32 = new Float32Array(buffer)
            var HEAPF64 = new Float64Array(buffer)
            var Math_imul = Math.imul
            var Math_fround = Math.fround
            var Math_abs = Math.abs
            var Math_clz32 = Math.clz32
            var Math_min = Math.min
            var Math_max = Math.max
            var Math_floor = Math.floor
            var Math_ceil = Math.ceil
            var Math_trunc = Math.trunc
            var Math_sqrt = Math.sqrt
            var fimport$0 = env._embind_register_void
            var fimport$1 = env._embind_register_bool
            var fimport$2 = env._embind_register_integer
            var fimport$3 = env._embind_register_float
            var fimport$4 = env._embind_register_std_string
            var fimport$5 = env._embind_register_std_wstring
            var fimport$6 = env._embind_register_emval
            var fimport$7 = env._embind_register_memory_view
            var fimport$8 = env.emscripten_resize_heap
            var wasi_snapshot_preview1 = imports.wasi_snapshot_preview1
            var fimport$9 = wasi_snapshot_preview1.fd_close
            var fimport$10 = wasi_snapshot_preview1.fd_write
            var fimport$11 = env._embind_register_bigint
            var fimport$12 = wasi_snapshot_preview1.fd_seek
            var global$0 = 65536
            var global$1 = 0
            var global$2 = 0
            var global$3 = 0
            var i64toi32_i32$HIGH_BITS = 0
            // EMSCRIPTEN_START_FUNCS
            function $0() {
              $54()
              $7()
            }

            function $1() {
              return $12(8 | 0) | 0 | 0
            }

            function $2($0_1) {
              $0_1 = $0_1 | 0
              var $3_1 = 0,
                $5_1 = 0
              $3_1 = (global$0 - 16) | 0
              global$0 = $3_1
              HEAP32[(($3_1 + 12) | 0) >> 2] = $0_1
              $5_1 = $12(HEAP32[(($3_1 + 12) | 0) >> 2] | 0 | 0) | 0
              global$0 = ($3_1 + 16) | 0
              return $5_1 | 0
            }

            function $3($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              var $5_1 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$0 = 0,
                $8_1 = 0,
                $32_1 = 0,
                $38_1 = 0
              $5_1 = (global$0 - 32) | 0
              global$0 = $5_1
              HEAP32[(($5_1 + 28) | 0) >> 2] = $0_1
              HEAP32[(($5_1 + 24) | 0) >> 2] = $1_1
              HEAP32[(($5_1 + 20) | 0) >> 2] = $2_1
              i64toi32_i32$0 =
                $4(HEAP32[(($5_1 + 28) | 0) >> 2] | 0 | 0, HEAP32[(($5_1 + 24) | 0) >> 2] | 0 | 0) |
                0
              i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
              $32_1 = i64toi32_i32$0
              i64toi32_i32$0 = $5_1
              HEAP32[(($5_1 + 8) | 0) >> 2] = $32_1
              HEAP32[(($5_1 + 12) | 0) >> 2] = i64toi32_i32$1
              i64toi32_i32$1 = HEAP32[(($5_1 + 8) | 0) >> 2] | 0
              i64toi32_i32$0 = HEAP32[(($5_1 + 12) | 0) >> 2] | 0
              $38_1 = i64toi32_i32$1
              i64toi32_i32$1 = HEAP32[(($5_1 + 20) | 0) >> 2] | 0
              $8_1 = $38_1
              HEAP8[i64toi32_i32$1 >> 0] = $8_1
              HEAP8[((i64toi32_i32$1 + 1) | 0) >> 0] = ($8_1 >>> 8) | 0
              HEAP8[((i64toi32_i32$1 + 2) | 0) >> 0] = ($8_1 >>> 16) | 0
              HEAP8[((i64toi32_i32$1 + 3) | 0) >> 0] = ($8_1 >>> 24) | 0
              HEAP8[((i64toi32_i32$1 + 4) | 0) >> 0] = i64toi32_i32$0
              HEAP8[((i64toi32_i32$1 + 5) | 0) >> 0] = (i64toi32_i32$0 >>> 8) | 0
              HEAP8[((i64toi32_i32$1 + 6) | 0) >> 0] = (i64toi32_i32$0 >>> 16) | 0
              HEAP8[((i64toi32_i32$1 + 7) | 0) >> 0] = (i64toi32_i32$0 >>> 24) | 0
              global$0 = ($5_1 + 32) | 0
              return
            }

            function $4($0_1, $1_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              var i64toi32_i32$5 = 0,
                i64toi32_i32$4 = 0,
                i64toi32_i32$2 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$3 = 0,
                $4$hi = 0,
                $4_1 = 0,
                $2$hi = 0,
                $2_1 = 0,
                $3$hi = 0,
                $5$hi = 0,
                $7$hi = 0,
                $3_1 = 0,
                $6$hi = 0,
                $5_1 = 0,
                $7_1 = 0,
                $9$hi = 0,
                $18_1 = 0,
                $8$hi = 0,
                $6_1 = 0,
                $9_1 = 0,
                $10$hi = 0,
                $8_1 = 0,
                $10_1 = 0,
                $14$hi = 0,
                $14_1 = 0,
                $277 = 0,
                $278 = 0,
                $279 = 0,
                $280 = 0,
                $281 = 0,
                $282 = 0,
                $283 = 0,
                $284 = 0,
                $285 = 0,
                $287 = 0,
                $288 = 0,
                $289 = 0,
                $290 = 0,
                $291 = 0,
                $293 = 0,
                $294 = 0,
                $295 = 0,
                $298 = 0,
                $299 = 0,
                $300 = 0,
                $301 = 0,
                $302 = 0,
                $303 = 0,
                $304 = 0,
                $305 = 0,
                $306 = 0,
                $307 = 0,
                $308 = 0,
                $309 = 0,
                $11$hi = 0,
                $13$hi = 0,
                $16_1 = 0,
                $16$hi = 0,
                $17$hi = 0,
                $310 = 0,
                $311 = 0,
                $312 = 0,
                $313 = 0,
                $314 = 0,
                $315 = 0,
                $317 = 0,
                $30_1 = 0,
                $30$hi = 0,
                $318 = 0,
                $35_1 = 0,
                $35$hi = 0,
                $41_1 = 0,
                $41$hi = 0,
                $50_1 = 0,
                $50$hi = 0,
                $51_1 = 0,
                $51$hi = 0,
                $53_1 = 0,
                $53$hi = 0,
                $57_1 = 0,
                $57$hi = 0,
                $58$hi = 0,
                $319 = 0,
                $62_1 = 0,
                $62$hi = 0,
                $63$hi = 0,
                $64$hi = 0,
                $320 = 0,
                $68$hi = 0,
                $69$hi = 0,
                $71$hi = 0,
                $321 = 0,
                $75$hi = 0,
                $77$hi = 0,
                $322 = 0,
                $87 = 0,
                $87$hi = 0,
                $99 = 0,
                $99$hi = 0,
                $323 = 0,
                $324 = 0,
                $106 = 0,
                $106$hi = 0,
                $118 = 0,
                $118$hi = 0,
                $124 = 0,
                $124$hi = 0,
                $126$hi = 0,
                $130 = 0,
                $130$hi = 0,
                $131 = 0,
                $131$hi = 0,
                $325 = 0,
                $135 = 0,
                $135$hi = 0,
                $139$hi = 0,
                $144 = 0,
                $144$hi = 0,
                $146 = 0,
                $146$hi = 0,
                $148$hi = 0,
                $151 = 0,
                $151$hi = 0,
                $152$hi = 0,
                $154$hi = 0,
                $158 = 0,
                $158$hi = 0,
                $161$hi = 0,
                $162 = 0,
                $162$hi = 0,
                $165 = 0,
                $165$hi = 0,
                $168$hi = 0,
                $169 = 0,
                $169$hi = 0,
                $170 = 0,
                $170$hi = 0,
                $173 = 0,
                $173$hi = 0,
                $176 = 0,
                $176$hi = 0,
                $177 = 0,
                $177$hi = 0,
                $180 = 0,
                $180$hi = 0,
                $182$hi = 0,
                $183 = 0,
                $183$hi = 0,
                $184 = 0,
                $184$hi = 0,
                $185 = 0,
                $185$hi = 0,
                $186$hi = 0,
                $190 = 0,
                $190$hi = 0,
                $193$hi = 0,
                $194 = 0,
                $194$hi = 0,
                $197 = 0,
                $197$hi = 0,
                $200$hi = 0,
                $201 = 0,
                $201$hi = 0,
                $202 = 0,
                $202$hi = 0,
                $205 = 0,
                $205$hi = 0,
                $208 = 0,
                $208$hi = 0,
                $209 = 0,
                $209$hi = 0,
                $212 = 0,
                $212$hi = 0,
                $214$hi = 0,
                $215 = 0,
                $215$hi = 0,
                $216 = 0,
                $216$hi = 0,
                $217 = 0,
                $217$hi = 0,
                $218$hi = 0,
                $222 = 0,
                $222$hi = 0,
                $225$hi = 0,
                $226 = 0,
                $226$hi = 0,
                $229 = 0,
                $229$hi = 0,
                $232$hi = 0,
                $233 = 0,
                $233$hi = 0,
                $234 = 0,
                $234$hi = 0,
                $237 = 0,
                $237$hi = 0,
                $240 = 0,
                $240$hi = 0,
                $241 = 0,
                $241$hi = 0,
                $244 = 0,
                $244$hi = 0,
                $246$hi = 0,
                $247 = 0,
                $247$hi = 0,
                $248 = 0,
                $248$hi = 0,
                $249 = 0,
                $249$hi = 0,
                $250$hi = 0,
                $252 = 0,
                $252$hi = 0,
                $255$hi = 0,
                $257$hi = 0,
                $326 = 0,
                $259$hi = 0,
                $267$hi = 0,
                $277$hi = 0,
                $284$hi = 0,
                $286 = 0,
                $286$hi = 0,
                $292 = 0,
                $292$hi = 0,
                $296 = 0,
                $296$hi = 0,
                $297 = 0,
                $297$hi = 0,
                $300$hi = 0,
                $328 = 0,
                $304$hi = 0,
                $305$hi = 0,
                $329 = 0,
                $310$hi = 0,
                $330 = 0,
                $316 = 0,
                $316$hi = 0,
                $327 = 0,
                $327$hi = 0,
                $332$hi = 0,
                $336$hi = 0,
                $338 = 0,
                $338$hi = 0,
                $341$hi = 0,
                $347 = 0,
                $347$hi = 0,
                $359 = 0,
                $359$hi = 0,
                $361 = 0,
                $361$hi = 0,
                $11_1 = 0,
                $12_1 = 0,
                $12$hi = 0,
                $13_1 = 0,
                $15_1 = 0,
                $15$hi = 0,
                $381 = 0,
                $381$hi = 0,
                $383 = 0,
                $383$hi = 0,
                $389$hi = 0,
                $17_1 = 0,
                $395$hi = 0,
                $397 = 0,
                $397$hi = 0,
                $400 = 0,
                $400$hi = 0,
                $403$hi = 0,
                $405$hi = 0,
                $331 = 0,
                $409$hi = 0,
                $413$hi = 0,
                $418 = 0,
                $418$hi = 0,
                $425 = 0,
                $425$hi = 0,
                $426 = 0,
                $426$hi = 0,
                $427 = 0,
                $427$hi = 0,
                $428 = 0,
                $428$hi = 0,
                $332 = 0,
                $434$hi = 0,
                $437$hi = 0,
                $442$hi = 0,
                $444 = 0,
                $444$hi = 0,
                $445 = 0,
                $445$hi = 0,
                $446 = 0,
                $446$hi = 0,
                $447 = 0,
                $447$hi = 0,
                $333 = 0,
                $452 = 0,
                $452$hi = 0,
                $455$hi = 0,
                $457$hi = 0,
                $459 = 0,
                $459$hi = 0,
                $467 = 0,
                $467$hi = 0,
                $334 = 0,
                $473$hi = 0,
                $474$hi = 0,
                $335 = 0,
                $479$hi = 0,
                $336 = 0,
                $482$hi = 0,
                $485 = 0,
                $485$hi = 0,
                $486 = 0,
                $486$hi = 0,
                $488$hi = 0,
                $337 = 0,
                $491$hi = 0,
                $493 = 0,
                $493$hi = 0,
                $494 = 0,
                $494$hi = 0,
                $339 = 0,
                $500$hi = 0,
                $501$hi = 0,
                $340 = 0,
                $506$hi = 0,
                $341 = 0,
                $509 = 0,
                $509$hi = 0,
                $510$hi = 0,
                $342 = 0,
                $514$hi = 0,
                $515$hi = 0,
                $343 = 0,
                $520$hi = 0,
                $344 = 0
              label$1: {
                if ($1_1 >>> 0 > 32 >>> 0) {
                  break label$1
                }
                label$2: {
                  if ($1_1 >>> 0 > 16 >>> 0) {
                    break label$2
                  }
                  i64toi32_i32$0 = $5($0_1 | 0, $1_1 | 0) | 0
                  i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                  i64toi32_i32$HIGH_BITS = i64toi32_i32$1
                  return i64toi32_i32$0 | 0
                }
                i64toi32_i32$2 = $0_1
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$2 + 8) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 9) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 10) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 11) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$2 + 12) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 13) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 14) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 15) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $2_1 = i64toi32_i32$0
                $2$hi = i64toi32_i32$1
                i64toi32_i32$2 = i64toi32_i32$0
                i64toi32_i32$0 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$1 + i64toi32_i32$0) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                i64toi32_i32$2 = 0
                i64toi32_i32$2 =
                  __wasm_rotl_i64(
                    i64toi32_i32$4 | 0,
                    i64toi32_i32$5 | 0,
                    46 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $30_1 = i64toi32_i32$2
                $30$hi = i64toi32_i32$5
                i64toi32_i32$1 = $0_1
                i64toi32_i32$5 =
                  HEAPU8[i64toi32_i32$1 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$1 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $318 = i64toi32_i32$5
                i64toi32_i32$5 = -1265453457
                i64toi32_i32$5 =
                  __wasm_i64_mul(
                    $318 | 0,
                    i64toi32_i32$2 | 0,
                    -1097272717 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $3_1 = i64toi32_i32$5
                $3$hi = i64toi32_i32$2
                i64toi32_i32$2 = $30$hi
                i64toi32_i32$1 = $30_1
                i64toi32_i32$5 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $35_1 = i64toi32_i32$0
                $35$hi = i64toi32_i32$4
                $0_1 = ($0_1 + $1_1) | 0
                i64toi32_i32$2 = ($0_1 + -8) | 0
                i64toi32_i32$4 =
                  HEAPU8[i64toi32_i32$2 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $41_1 = i64toi32_i32$4
                $41$hi = i64toi32_i32$1
                i64toi32_i32$1 = 0
                i64toi32_i32$2 = ($1_1 << 1) | 0
                i64toi32_i32$4 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $4_1 = i64toi32_i32$5
                $4$hi = i64toi32_i32$0
                i64toi32_i32$0 = $41$hi
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$2 =
                  __wasm_i64_mul(
                    $41_1 | 0,
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$5 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $5_1 = i64toi32_i32$2
                $5$hi = i64toi32_i32$0
                i64toi32_i32$0 = $35$hi
                i64toi32_i32$1 = $35_1
                i64toi32_i32$2 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $6_1 = i64toi32_i32$4
                $6$hi = i64toi32_i32$5
                $50_1 = i64toi32_i32$4
                $50$hi = i64toi32_i32$5
                $51_1 = i64toi32_i32$4
                $51$hi = i64toi32_i32$5
                i64toi32_i32$5 = $5$hi
                i64toi32_i32$1 = 0
                i64toi32_i32$1 =
                  __wasm_rotl_i64($5_1 | 0, i64toi32_i32$5 | 0, 34 | 0, i64toi32_i32$1 | 0) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $53_1 = i64toi32_i32$1
                $53$hi = i64toi32_i32$5
                i64toi32_i32$5 = $3$hi
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $3$hi
                i64toi32_i32$0 = $3_1
                i64toi32_i32$1 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                i64toi32_i32$0 = 0
                i64toi32_i32$0 =
                  __wasm_rotl_i64(
                    i64toi32_i32$2 | 0,
                    i64toi32_i32$4 | 0,
                    21 | 0,
                    i64toi32_i32$0 | 0
                  ) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $57_1 = i64toi32_i32$0
                $57$hi = i64toi32_i32$4
                i64toi32_i32$4 = $53$hi
                i64toi32_i32$5 = $53_1
                i64toi32_i32$0 = $57$hi
                i64toi32_i32$3 = $57_1
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $58$hi = i64toi32_i32$2
                i64toi32_i32$4 = ($0_1 + -16) | 0
                i64toi32_i32$2 =
                  HEAPU8[i64toi32_i32$4 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$4 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $319 = i64toi32_i32$2
                i64toi32_i32$2 = -1696503237
                i64toi32_i32$2 =
                  __wasm_i64_mul($319 | 0, i64toi32_i32$5 | 0, 797982799 | 0, i64toi32_i32$2 | 0) |
                  0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $62_1 = i64toi32_i32$2
                $62$hi = i64toi32_i32$5
                i64toi32_i32$5 = $58$hi
                i64toi32_i32$4 = i64toi32_i32$1
                i64toi32_i32$2 = $62$hi
                i64toi32_i32$3 = $62_1
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$2) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $63$hi = i64toi32_i32$1
                i64toi32_i32$1 = $51$hi
                i64toi32_i32$5 = $51_1
                i64toi32_i32$4 = $63$hi
                i64toi32_i32$3 = i64toi32_i32$0
                i64toi32_i32$4 = (i64toi32_i32$1 ^ i64toi32_i32$4) | 0
                $64$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $64$hi
                $320 = (i64toi32_i32$5 ^ i64toi32_i32$0) | 0
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul($320 | 0, i64toi32_i32$4 | 0, $4_1 | 0, i64toi32_i32$5 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $2_1 = i64toi32_i32$5
                $2$hi = i64toi32_i32$4
                i64toi32_i32$1 = i64toi32_i32$5
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $277 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                  $277 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$1 >>> i64toi32_i32$2) | 0) |
                    0
                }
                $68$hi = i64toi32_i32$5
                i64toi32_i32$5 = $50$hi
                i64toi32_i32$4 = $50_1
                i64toi32_i32$1 = $68$hi
                i64toi32_i32$3 = $277
                i64toi32_i32$1 = (i64toi32_i32$5 ^ i64toi32_i32$1) | 0
                $69$hi = i64toi32_i32$1
                i64toi32_i32$1 = $2$hi
                i64toi32_i32$1 = $69$hi
                i64toi32_i32$5 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
                i64toi32_i32$4 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$4 = (i64toi32_i32$1 ^ i64toi32_i32$4) | 0
                $71$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $71$hi
                $321 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul($321 | 0, i64toi32_i32$4 | 0, $4_1 | 0, i64toi32_i32$5 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $2_1 = i64toi32_i32$5
                $2$hi = i64toi32_i32$4
                i64toi32_i32$1 = i64toi32_i32$5
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $278 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                  $278 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$1 >>> i64toi32_i32$2) | 0) |
                    0
                }
                $75$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $75$hi
                i64toi32_i32$4 = $278
                i64toi32_i32$1 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$1 = (i64toi32_i32$5 ^ i64toi32_i32$1) | 0
                $77$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$1 = $77$hi
                $322 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 =
                  __wasm_i64_mul($322 | 0, i64toi32_i32$1 | 0, $4_1 | 0, i64toi32_i32$4 | 0) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                i64toi32_i32$HIGH_BITS = i64toi32_i32$1
                return i64toi32_i32$4 | 0
              }
              label$3: {
                if ($1_1 >>> 0 > 64 >>> 0) {
                  break label$3
                }
                $18_1 = ($0_1 + $1_1) | 0
                i64toi32_i32$5 = ($18_1 + -16) | 0
                i64toi32_i32$4 =
                  HEAPU8[i64toi32_i32$5 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$5 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $87 = i64toi32_i32$4
                $87$hi = i64toi32_i32$1
                i64toi32_i32$1 = 0
                i64toi32_i32$5 = ($1_1 << 1) | 0
                i64toi32_i32$4 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $2_1 = i64toi32_i32$2
                $2$hi = i64toi32_i32$0
                i64toi32_i32$0 = $87$hi
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul(
                    $87 | 0,
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$2 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $3_1 = i64toi32_i32$5
                $3$hi = i64toi32_i32$0
                i64toi32_i32$1 = ($18_1 + -32) | 0
                i64toi32_i32$0 =
                  HEAPU8[i64toi32_i32$1 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$1 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $5_1 = i64toi32_i32$0
                $5$hi = i64toi32_i32$5
                i64toi32_i32$5 = $3$hi
                i64toi32_i32$1 = $3_1
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$0) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $99 = i64toi32_i32$4
                $99$hi = i64toi32_i32$2
                i64toi32_i32$5 = $0_1
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$5 + 24) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 25) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 26) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 27) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$5 + 28) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 29) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 30) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 31) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $323 = i64toi32_i32$2
                i64toi32_i32$2 = 0
                i64toi32_i32$2 =
                  __wasm_i64_mul($323 | 0, i64toi32_i32$1 | 0, 9 | 0, i64toi32_i32$2 | 0) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                $6_1 = i64toi32_i32$2
                $6$hi = i64toi32_i32$1
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$5 + 16) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 17) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 18) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 19) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$5 + 20) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 21) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 22) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 23) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $324 = i64toi32_i32$1
                i64toi32_i32$1 = -1696503237
                i64toi32_i32$1 =
                  __wasm_i64_mul($324 | 0, i64toi32_i32$2 | 0, 797982799 | 0, i64toi32_i32$1 | 0) |
                  0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $106 = i64toi32_i32$1
                $106$hi = i64toi32_i32$2
                i64toi32_i32$2 = $6$hi
                i64toi32_i32$5 = $6_1
                i64toi32_i32$1 = $106$hi
                i64toi32_i32$3 = $106
                i64toi32_i32$0 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$1) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $7_1 = i64toi32_i32$0
                $7$hi = i64toi32_i32$4
                i64toi32_i32$2 = ($18_1 + -24) | 0
                i64toi32_i32$4 =
                  HEAPU8[i64toi32_i32$2 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $4_1 = i64toi32_i32$4
                $4$hi = i64toi32_i32$5
                i64toi32_i32$5 = $7$hi
                i64toi32_i32$2 = i64toi32_i32$0
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$5 + i64toi32_i32$4) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $8_1 = i64toi32_i32$1
                $8$hi = i64toi32_i32$0
                i64toi32_i32$5 = $0_1
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$5 + 8) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 9) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 10) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 11) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$5 + 12) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 13) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 14) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 15) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $9_1 = i64toi32_i32$0
                $9$hi = i64toi32_i32$2
                i64toi32_i32$2 = $8$hi
                i64toi32_i32$5 = i64toi32_i32$1
                i64toi32_i32$0 = $9$hi
                i64toi32_i32$3 = $9_1
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $118 = i64toi32_i32$4
                $118$hi = i64toi32_i32$1
                i64toi32_i32$1 = $8$hi
                i64toi32_i32$2 = ($18_1 + -8) | 0
                i64toi32_i32$1 =
                  HEAPU8[i64toi32_i32$2 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $10_1 = i64toi32_i32$1
                $10$hi = i64toi32_i32$5
                i64toi32_i32$5 = $8$hi
                i64toi32_i32$2 = $8_1
                i64toi32_i32$1 = $10$hi
                i64toi32_i32$3 = $10_1
                i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $124 = i64toi32_i32$0
                $124$hi = i64toi32_i32$4
                i64toi32_i32$4 = $7$hi
                i64toi32_i32$2 = 0
                i64toi32_i32$2 =
                  __wasm_rotl_i64($7_1 | 0, i64toi32_i32$4 | 0, 22 | 0, i64toi32_i32$2 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $126$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $126$hi
                i64toi32_i32$5 = i64toi32_i32$2
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$2) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $7_1 = i64toi32_i32$1
                $7$hi = i64toi32_i32$0
                i64toi32_i32$0 = $124$hi
                i64toi32_i32$4 = $124
                i64toi32_i32$5 = $7$hi
                i64toi32_i32$3 = i64toi32_i32$1
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$1) | 0
                i64toi32_i32$1 = (i64toi32_i32$0 + i64toi32_i32$5) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $130 = i64toi32_i32$2
                $130$hi = i64toi32_i32$1
                i64toi32_i32$1 = $6$hi
                $131 = $6_1
                $131$hi = i64toi32_i32$1
                i64toi32_i32$1 = $10$hi
                i64toi32_i32$0 = $0_1
                i64toi32_i32$1 =
                  HEAPU8[i64toi32_i32$0 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$4 =
                  HEAPU8[((i64toi32_i32$0 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $325 = i64toi32_i32$1
                i64toi32_i32$1 = -1696503237
                i64toi32_i32$1 =
                  __wasm_i64_mul($325 | 0, i64toi32_i32$4 | 0, 797982799 | 0, i64toi32_i32$1 | 0) |
                  0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $135 = i64toi32_i32$1
                $135$hi = i64toi32_i32$4
                i64toi32_i32$4 = $10$hi
                i64toi32_i32$0 = $10_1
                i64toi32_i32$1 = $135$hi
                i64toi32_i32$3 = $135
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $8_1 = i64toi32_i32$5
                $8$hi = i64toi32_i32$2
                i64toi32_i32$2 = $5$hi
                i64toi32_i32$2 = $8$hi
                i64toi32_i32$4 = i64toi32_i32$5
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$0 = (i64toi32_i32$2 ^ i64toi32_i32$0) | 0
                $139$hi = i64toi32_i32$0
                i64toi32_i32$0 = $131$hi
                i64toi32_i32$2 = $131
                i64toi32_i32$4 = $139$hi
                i64toi32_i32$3 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$4) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                i64toi32_i32$0 = i64toi32_i32$1
                i64toi32_i32$2 = 0
                i64toi32_i32$3 = 1
                i64toi32_i32$4 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $5_1 = i64toi32_i32$4
                $5$hi = i64toi32_i32$1
                i64toi32_i32$1 = $3$hi
                i64toi32_i32$1 = $5$hi
                i64toi32_i32$5 = i64toi32_i32$4
                i64toi32_i32$0 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$0) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $144 = i64toi32_i32$2
                $144$hi = i64toi32_i32$4
                i64toi32_i32$4 = $8$hi
                i64toi32_i32$5 = 0
                i64toi32_i32$5 =
                  __wasm_rotl_i64($8_1 | 0, i64toi32_i32$4 | 0, 21 | 0, i64toi32_i32$5 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $146 = i64toi32_i32$5
                $146$hi = i64toi32_i32$4
                i64toi32_i32$4 = $9$hi
                i64toi32_i32$5 = 0
                i64toi32_i32$5 =
                  __wasm_rotl_i64($9_1 | 0, i64toi32_i32$4 | 0, 34 | 0, i64toi32_i32$5 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $148$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $148$hi
                i64toi32_i32$1 = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                i64toi32_i32$1 = 0
                i64toi32_i32$1 =
                  __wasm_i64_mul(
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$2 | 0,
                    9 | 0,
                    i64toi32_i32$1 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $151 = i64toi32_i32$1
                $151$hi = i64toi32_i32$2
                i64toi32_i32$2 = $146$hi
                i64toi32_i32$4 = $146
                i64toi32_i32$1 = $151$hi
                i64toi32_i32$3 = $151
                i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $152$hi = i64toi32_i32$0
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$0 = $152$hi
                i64toi32_i32$2 = i64toi32_i32$5
                i64toi32_i32$4 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$4) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $154$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $154$hi
                i64toi32_i32$2 = $2$hi
                i64toi32_i32$2 =
                  __wasm_i64_mul(
                    i64toi32_i32$1 | 0,
                    i64toi32_i32$5 | 0,
                    $2_1 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $4_1 = i64toi32_i32$2
                $4$hi = i64toi32_i32$5
                i64toi32_i32$0 = i64toi32_i32$2
                i64toi32_i32$2 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$0 << i64toi32_i32$4) | 0
                  $279 = 0
                } else {
                  i64toi32_i32$2 =
                    (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                      ((i64toi32_i32$0 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$5 << i64toi32_i32$4) | 0) |
                    0
                  $279 = (i64toi32_i32$0 << i64toi32_i32$4) | 0
                }
                $158 = $279
                $158$hi = i64toi32_i32$2
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$0 = (i64toi32_i32$2 & i64toi32_i32$0) | 0
                i64toi32_i32$2 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                  $280 = 0
                } else {
                  i64toi32_i32$5 =
                    (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                      ((i64toi32_i32$2 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$0 << i64toi32_i32$4) | 0) |
                    0
                  $280 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                }
                $161$hi = i64toi32_i32$5
                i64toi32_i32$5 = $158$hi
                i64toi32_i32$0 = $158
                i64toi32_i32$2 = $161$hi
                i64toi32_i32$3 = $280
                i64toi32_i32$2 = i64toi32_i32$5 | i64toi32_i32$2 | 0
                $162 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $162$hi = i64toi32_i32$2
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$0 = (i64toi32_i32$2 & i64toi32_i32$0) | 0
                i64toi32_i32$2 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                  $281 = 0
                } else {
                  i64toi32_i32$5 =
                    (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                      ((i64toi32_i32$2 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$0 << i64toi32_i32$4) | 0) |
                    0
                  $281 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                }
                $165 = $281
                $165$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$0 = $4_1
                i64toi32_i32$2 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$2 = (i64toi32_i32$5 & i64toi32_i32$2) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$3) | 0
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$5 << i64toi32_i32$4) | 0
                  $282 = 0
                } else {
                  i64toi32_i32$0 =
                    (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                      ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$2 << i64toi32_i32$4) | 0) |
                    0
                  $282 = (i64toi32_i32$5 << i64toi32_i32$4) | 0
                }
                $168$hi = i64toi32_i32$0
                i64toi32_i32$0 = $165$hi
                i64toi32_i32$2 = $165
                i64toi32_i32$5 = $168$hi
                i64toi32_i32$3 = $282
                i64toi32_i32$5 = i64toi32_i32$0 | i64toi32_i32$5 | 0
                $169 = i64toi32_i32$2 | i64toi32_i32$3 | 0
                $169$hi = i64toi32_i32$5
                i64toi32_i32$5 = $162$hi
                i64toi32_i32$0 = $162
                i64toi32_i32$2 = $169$hi
                i64toi32_i32$3 = $169
                i64toi32_i32$2 = i64toi32_i32$5 | i64toi32_i32$2 | 0
                $170 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $170$hi = i64toi32_i32$2
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = 0
                  $283 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$0 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
                  $283 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$2) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$4) | 0) |
                    0
                }
                i64toi32_i32$2 = $283
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$5) | 0
                $173 = (i64toi32_i32$2 & i64toi32_i32$3) | 0
                $173$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$0 = $4_1
                i64toi32_i32$2 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$2 = 0
                  $284 = (i64toi32_i32$5 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$2 = (i64toi32_i32$5 >>> i64toi32_i32$4) | 0
                  $284 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                    0
                }
                i64toi32_i32$5 = $284
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$0 = (i64toi32_i32$2 & i64toi32_i32$0) | 0
                $176 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                $176$hi = i64toi32_i32$0
                i64toi32_i32$0 = $173$hi
                i64toi32_i32$2 = $173
                i64toi32_i32$5 = $176$hi
                i64toi32_i32$3 = $176
                i64toi32_i32$5 = i64toi32_i32$0 | i64toi32_i32$5 | 0
                $177 = i64toi32_i32$2 | i64toi32_i32$3 | 0
                $177$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$0 = $4_1
                i64toi32_i32$2 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$2 = 0
                  $285 = (i64toi32_i32$5 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$2 = (i64toi32_i32$5 >>> i64toi32_i32$4) | 0
                  $285 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                    0
                }
                i64toi32_i32$5 = $285
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$0 = (i64toi32_i32$2 & i64toi32_i32$0) | 0
                $180 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                $180$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$2 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $287 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                  $287 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$2 >>> i64toi32_i32$4) | 0) |
                    0
                }
                $182$hi = i64toi32_i32$5
                i64toi32_i32$5 = $180$hi
                i64toi32_i32$0 = $180
                i64toi32_i32$2 = $182$hi
                i64toi32_i32$3 = $287
                i64toi32_i32$2 = i64toi32_i32$5 | i64toi32_i32$2 | 0
                $183 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $183$hi = i64toi32_i32$2
                i64toi32_i32$2 = $177$hi
                i64toi32_i32$5 = $177
                i64toi32_i32$0 = $183$hi
                i64toi32_i32$3 = $183
                i64toi32_i32$0 = i64toi32_i32$2 | i64toi32_i32$0 | 0
                $184 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $184$hi = i64toi32_i32$0
                i64toi32_i32$0 = $170$hi
                i64toi32_i32$2 = $170
                i64toi32_i32$5 = $184$hi
                i64toi32_i32$3 = $184
                i64toi32_i32$5 = i64toi32_i32$0 | i64toi32_i32$5 | 0
                $185 = i64toi32_i32$2 | i64toi32_i32$3 | 0
                $185$hi = i64toi32_i32$5
                i64toi32_i32$5 = $144$hi
                i64toi32_i32$0 = $144
                i64toi32_i32$2 = $185$hi
                i64toi32_i32$3 = $185
                i64toi32_i32$4 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $186$hi = i64toi32_i32$1
                i64toi32_i32$1 = $2$hi
                i64toi32_i32$1 = $186$hi
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$0 =
                  __wasm_i64_mul(
                    i64toi32_i32$4 | 0,
                    i64toi32_i32$1 | 0,
                    $2_1 | 0,
                    i64toi32_i32$0 | 0
                  ) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                $4_1 = i64toi32_i32$0
                $4$hi = i64toi32_i32$1
                i64toi32_i32$5 = i64toi32_i32$0
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$5 << i64toi32_i32$2) | 0
                  $288 = 0
                } else {
                  i64toi32_i32$0 =
                    (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                      ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$1 << i64toi32_i32$2) | 0) |
                    0
                  $288 = (i64toi32_i32$5 << i64toi32_i32$2) | 0
                }
                $190 = $288
                $190$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$5) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                  $289 = 0
                } else {
                  i64toi32_i32$1 =
                    (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                      ((i64toi32_i32$0 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$5 << i64toi32_i32$2) | 0) |
                    0
                  $289 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                }
                $193$hi = i64toi32_i32$1
                i64toi32_i32$1 = $190$hi
                i64toi32_i32$5 = $190
                i64toi32_i32$0 = $193$hi
                i64toi32_i32$3 = $289
                i64toi32_i32$0 = i64toi32_i32$1 | i64toi32_i32$0 | 0
                $194 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $194$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$5) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                  $290 = 0
                } else {
                  i64toi32_i32$1 =
                    (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                      ((i64toi32_i32$0 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$5 << i64toi32_i32$2) | 0) |
                    0
                  $290 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                }
                $197 = $290
                $197$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$0 = (i64toi32_i32$1 & i64toi32_i32$0) | 0
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$1 << i64toi32_i32$2) | 0
                  $291 = 0
                } else {
                  i64toi32_i32$5 =
                    (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                      ((i64toi32_i32$1 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$0 << i64toi32_i32$2) | 0) |
                    0
                  $291 = (i64toi32_i32$1 << i64toi32_i32$2) | 0
                }
                $200$hi = i64toi32_i32$5
                i64toi32_i32$5 = $197$hi
                i64toi32_i32$0 = $197
                i64toi32_i32$1 = $200$hi
                i64toi32_i32$3 = $291
                i64toi32_i32$1 = i64toi32_i32$5 | i64toi32_i32$1 | 0
                $201 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $201$hi = i64toi32_i32$1
                i64toi32_i32$1 = $194$hi
                i64toi32_i32$5 = $194
                i64toi32_i32$0 = $201$hi
                i64toi32_i32$3 = $201
                i64toi32_i32$0 = i64toi32_i32$1 | i64toi32_i32$0 | 0
                $202 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $202$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $293 = (i64toi32_i32$0 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$0 >>> i64toi32_i32$2) | 0
                  $293 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$1 >>> i64toi32_i32$2) | 0) |
                    0
                }
                i64toi32_i32$0 = $293
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$1) | 0
                $205 = (i64toi32_i32$0 & i64toi32_i32$3) | 0
                $205$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = 0
                  $294 = (i64toi32_i32$1 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$0 = (i64toi32_i32$1 >>> i64toi32_i32$2) | 0
                  $294 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$2) | 0) |
                    0
                }
                i64toi32_i32$1 = $294
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$5) | 0
                $208 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
                $208$hi = i64toi32_i32$5
                i64toi32_i32$5 = $205$hi
                i64toi32_i32$0 = $205
                i64toi32_i32$1 = $208$hi
                i64toi32_i32$3 = $208
                i64toi32_i32$1 = i64toi32_i32$5 | i64toi32_i32$1 | 0
                $209 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $209$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = 0
                  $295 = (i64toi32_i32$1 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$0 = (i64toi32_i32$1 >>> i64toi32_i32$2) | 0
                  $295 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$2) | 0) |
                    0
                }
                i64toi32_i32$1 = $295
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$5 = (i64toi32_i32$0 & i64toi32_i32$5) | 0
                $212 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
                $212$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$0 = $4_1
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$1 = 0
                  $298 = (i64toi32_i32$5 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$1 = (i64toi32_i32$5 >>> i64toi32_i32$2) | 0
                  $298 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$0 >>> i64toi32_i32$2) | 0) |
                    0
                }
                $214$hi = i64toi32_i32$1
                i64toi32_i32$1 = $212$hi
                i64toi32_i32$5 = $212
                i64toi32_i32$0 = $214$hi
                i64toi32_i32$3 = $298
                i64toi32_i32$0 = i64toi32_i32$1 | i64toi32_i32$0 | 0
                $215 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $215$hi = i64toi32_i32$0
                i64toi32_i32$0 = $209$hi
                i64toi32_i32$1 = $209
                i64toi32_i32$5 = $215$hi
                i64toi32_i32$3 = $215
                i64toi32_i32$5 = i64toi32_i32$0 | i64toi32_i32$5 | 0
                $216 = i64toi32_i32$1 | i64toi32_i32$3 | 0
                $216$hi = i64toi32_i32$5
                i64toi32_i32$5 = $202$hi
                i64toi32_i32$0 = $202
                i64toi32_i32$1 = $216$hi
                i64toi32_i32$3 = $216
                i64toi32_i32$1 = i64toi32_i32$5 | i64toi32_i32$1 | 0
                $217 = i64toi32_i32$0 | i64toi32_i32$3 | 0
                $217$hi = i64toi32_i32$1
                i64toi32_i32$1 = $130$hi
                i64toi32_i32$5 = $130
                i64toi32_i32$0 = $217$hi
                i64toi32_i32$3 = $217
                i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$0) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $218$hi = i64toi32_i32$4
                i64toi32_i32$4 = $2$hi
                i64toi32_i32$4 = $218$hi
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul(
                    i64toi32_i32$2 | 0,
                    i64toi32_i32$4 | 0,
                    $2_1 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $4_1 = i64toi32_i32$5
                $4$hi = i64toi32_i32$4
                i64toi32_i32$1 = i64toi32_i32$5
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$1 << i64toi32_i32$0) | 0
                  $299 = 0
                } else {
                  i64toi32_i32$5 =
                    (((((1 << i64toi32_i32$0) | 0) - 1) | 0) &
                      ((i64toi32_i32$1 >>> ((32 - i64toi32_i32$0) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$4 << i64toi32_i32$0) | 0) |
                    0
                  $299 = (i64toi32_i32$1 << i64toi32_i32$0) | 0
                }
                $222 = $299
                $222$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$4 = $4_1
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$1) | 0
                i64toi32_i32$5 = (i64toi32_i32$4 & i64toi32_i32$3) | 0
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$5 << i64toi32_i32$0) | 0
                  $300 = 0
                } else {
                  i64toi32_i32$4 =
                    (((((1 << i64toi32_i32$0) | 0) - 1) | 0) &
                      ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$0) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$1 << i64toi32_i32$0) | 0) |
                    0
                  $300 = (i64toi32_i32$5 << i64toi32_i32$0) | 0
                }
                $225$hi = i64toi32_i32$4
                i64toi32_i32$4 = $222$hi
                i64toi32_i32$1 = $222
                i64toi32_i32$5 = $225$hi
                i64toi32_i32$3 = $300
                i64toi32_i32$5 = i64toi32_i32$4 | i64toi32_i32$5 | 0
                $226 = i64toi32_i32$1 | i64toi32_i32$3 | 0
                $226$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$4 = $4_1
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$1) | 0
                i64toi32_i32$5 = (i64toi32_i32$4 & i64toi32_i32$3) | 0
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$5 << i64toi32_i32$0) | 0
                  $301 = 0
                } else {
                  i64toi32_i32$4 =
                    (((((1 << i64toi32_i32$0) | 0) - 1) | 0) &
                      ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$0) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$1 << i64toi32_i32$0) | 0) |
                    0
                  $301 = (i64toi32_i32$5 << i64toi32_i32$0) | 0
                }
                $229 = $301
                $229$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$5 = (i64toi32_i32$4 & i64toi32_i32$5) | 0
                i64toi32_i32$4 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$4 << i64toi32_i32$0) | 0
                  $302 = 0
                } else {
                  i64toi32_i32$1 =
                    (((((1 << i64toi32_i32$0) | 0) - 1) | 0) &
                      ((i64toi32_i32$4 >>> ((32 - i64toi32_i32$0) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$5 << i64toi32_i32$0) | 0) |
                    0
                  $302 = (i64toi32_i32$4 << i64toi32_i32$0) | 0
                }
                $232$hi = i64toi32_i32$1
                i64toi32_i32$1 = $229$hi
                i64toi32_i32$5 = $229
                i64toi32_i32$4 = $232$hi
                i64toi32_i32$3 = $302
                i64toi32_i32$4 = i64toi32_i32$1 | i64toi32_i32$4 | 0
                $233 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $233$hi = i64toi32_i32$4
                i64toi32_i32$4 = $226$hi
                i64toi32_i32$1 = $226
                i64toi32_i32$5 = $233$hi
                i64toi32_i32$3 = $233
                i64toi32_i32$5 = i64toi32_i32$4 | i64toi32_i32$5 | 0
                $234 = i64toi32_i32$1 | i64toi32_i32$3 | 0
                $234$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$4 = $4_1
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 8
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$1 = 0
                  $303 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                } else {
                  i64toi32_i32$1 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                  $303 =
                    (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                      ((32 - i64toi32_i32$0) | 0)) |
                    0 |
                    ((i64toi32_i32$4 >>> i64toi32_i32$0) | 0) |
                    0
                }
                i64toi32_i32$5 = $303
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = -16777216
                i64toi32_i32$4 = (i64toi32_i32$1 & i64toi32_i32$4) | 0
                $237 = (i64toi32_i32$5 & i64toi32_i32$3) | 0
                $237$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 24
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $304 = (i64toi32_i32$4 >>> i64toi32_i32$0) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$4 >>> i64toi32_i32$0) | 0
                  $304 =
                    (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$0) | 0)) |
                    0 |
                    ((i64toi32_i32$1 >>> i64toi32_i32$0) | 0) |
                    0
                }
                i64toi32_i32$4 = $304
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 16711680
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$1) | 0
                $240 = (i64toi32_i32$4 & i64toi32_i32$3) | 0
                $240$hi = i64toi32_i32$1
                i64toi32_i32$1 = $237$hi
                i64toi32_i32$5 = $237
                i64toi32_i32$4 = $240$hi
                i64toi32_i32$3 = $240
                i64toi32_i32$4 = i64toi32_i32$1 | i64toi32_i32$4 | 0
                $241 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $241$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$1 = $4_1
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 40
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $305 = (i64toi32_i32$4 >>> i64toi32_i32$0) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$4 >>> i64toi32_i32$0) | 0
                  $305 =
                    (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$0) | 0)) |
                    0 |
                    ((i64toi32_i32$1 >>> i64toi32_i32$0) | 0) |
                    0
                }
                i64toi32_i32$4 = $305
                i64toi32_i32$1 = 0
                i64toi32_i32$3 = 65280
                i64toi32_i32$1 = (i64toi32_i32$5 & i64toi32_i32$1) | 0
                $244 = (i64toi32_i32$4 & i64toi32_i32$3) | 0
                $244$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$5 = $4_1
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = 56
                i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$4 = 0
                  $306 = (i64toi32_i32$1 >>> i64toi32_i32$0) | 0
                } else {
                  i64toi32_i32$4 = (i64toi32_i32$1 >>> i64toi32_i32$0) | 0
                  $306 =
                    (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                      ((32 - i64toi32_i32$0) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$0) | 0) |
                    0
                }
                $246$hi = i64toi32_i32$4
                i64toi32_i32$4 = $244$hi
                i64toi32_i32$1 = $244
                i64toi32_i32$5 = $246$hi
                i64toi32_i32$3 = $306
                i64toi32_i32$5 = i64toi32_i32$4 | i64toi32_i32$5 | 0
                $247 = i64toi32_i32$1 | i64toi32_i32$3 | 0
                $247$hi = i64toi32_i32$5
                i64toi32_i32$5 = $241$hi
                i64toi32_i32$4 = $241
                i64toi32_i32$1 = $247$hi
                i64toi32_i32$3 = $247
                i64toi32_i32$1 = i64toi32_i32$5 | i64toi32_i32$1 | 0
                $248 = i64toi32_i32$4 | i64toi32_i32$3 | 0
                $248$hi = i64toi32_i32$1
                i64toi32_i32$1 = $234$hi
                i64toi32_i32$5 = $234
                i64toi32_i32$4 = $248$hi
                i64toi32_i32$3 = $248
                i64toi32_i32$4 = i64toi32_i32$1 | i64toi32_i32$4 | 0
                $249 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $249$hi = i64toi32_i32$4
                i64toi32_i32$4 = $118$hi
                i64toi32_i32$1 = $118
                i64toi32_i32$5 = $249$hi
                i64toi32_i32$3 = $249
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $250$hi = i64toi32_i32$2
                i64toi32_i32$2 = $2$hi
                i64toi32_i32$2 = $250$hi
                i64toi32_i32$1 = $2$hi
                i64toi32_i32$1 =
                  __wasm_i64_mul(
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$2 | 0,
                    $2_1 | 0,
                    i64toi32_i32$1 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $252 = i64toi32_i32$1
                $252$hi = i64toi32_i32$2
                i64toi32_i32$2 = $99$hi
                i64toi32_i32$4 = $99
                i64toi32_i32$1 = $252$hi
                i64toi32_i32$3 = $252
                i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $4_1 = i64toi32_i32$5
                $4$hi = i64toi32_i32$0
                i64toi32_i32$2 = i64toi32_i32$5
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$1 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$4 = 0
                  $307 = (i64toi32_i32$0 >>> i64toi32_i32$1) | 0
                } else {
                  i64toi32_i32$4 = (i64toi32_i32$0 >>> i64toi32_i32$1) | 0
                  $307 =
                    (((((((1 << i64toi32_i32$1) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                      ((32 - i64toi32_i32$1) | 0)) |
                    0 |
                    ((i64toi32_i32$2 >>> i64toi32_i32$1) | 0) |
                    0
                }
                $255$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $255$hi
                i64toi32_i32$0 = $307
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
                $257$hi = i64toi32_i32$2
                i64toi32_i32$2 = $2$hi
                i64toi32_i32$2 = $257$hi
                $326 = (i64toi32_i32$0 ^ i64toi32_i32$3) | 0
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$0 =
                  __wasm_i64_mul($326 | 0, i64toi32_i32$2 | 0, $2_1 | 0, i64toi32_i32$0 | 0) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $259$hi = i64toi32_i32$2
                i64toi32_i32$2 = $7$hi
                i64toi32_i32$2 = $259$hi
                i64toi32_i32$4 = i64toi32_i32$0
                i64toi32_i32$0 = $7$hi
                i64toi32_i32$3 = $7_1
                i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                i64toi32_i32$4 = i64toi32_i32$1
                i64toi32_i32$HIGH_BITS = i64toi32_i32$5
                return i64toi32_i32$4 | 0
              }
              $18_1 = ($0_1 + $1_1) | 0
              i64toi32_i32$2 = ($18_1 + -64) | 0
              i64toi32_i32$4 =
                HEAPU8[i64toi32_i32$2 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$5 =
                HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $267$hi = i64toi32_i32$5
              i64toi32_i32$5 = 0
              $2_1 = $1_1
              $2$hi = i64toi32_i32$5
              i64toi32_i32$5 = $267$hi
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$4 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$4) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              $4_1 = i64toi32_i32$0
              $4$hi = i64toi32_i32$1
              i64toi32_i32$5 = ($18_1 + -56) | 0
              i64toi32_i32$1 =
                HEAPU8[i64toi32_i32$5 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$2 =
                HEAPU8[((i64toi32_i32$5 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $3_1 = i64toi32_i32$1
              $3$hi = i64toi32_i32$2
              i64toi32_i32$2 = $4$hi
              i64toi32_i32$5 = i64toi32_i32$0
              i64toi32_i32$1 = $3$hi
              i64toi32_i32$3 = $3_1
              i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$1) | 0
              if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              $277$hi = i64toi32_i32$0
              i64toi32_i32$2 = ($18_1 + -48) | 0
              i64toi32_i32$0 =
                HEAPU8[i64toi32_i32$2 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$5 =
                HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $5_1 = i64toi32_i32$0
              $5$hi = i64toi32_i32$5
              i64toi32_i32$5 = $277$hi
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$0 = $5$hi
              i64toi32_i32$3 = $5_1
              i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$0) | 0
              if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
              }
              $8_1 = i64toi32_i32$1
              $8$hi = i64toi32_i32$4
              i64toi32_i32$2 = 0
              i64toi32_i32$2 =
                __wasm_rotl_i64(
                  i64toi32_i32$1 | 0,
                  i64toi32_i32$4 | 0,
                  20 | 0,
                  i64toi32_i32$2 | 0
                ) | 0
              i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
              $284$hi = i64toi32_i32$4
              i64toi32_i32$4 = $4$hi
              i64toi32_i32$4 = $284$hi
              i64toi32_i32$5 = i64toi32_i32$2
              i64toi32_i32$2 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$0 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$2) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              $286 = i64toi32_i32$0
              $286$hi = i64toi32_i32$1
              i64toi32_i32$4 = ($18_1 + -40) | 0
              i64toi32_i32$1 =
                HEAPU8[i64toi32_i32$4 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$5 =
                HEAPU8[((i64toi32_i32$4 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $7_1 = i64toi32_i32$1
              $7$hi = i64toi32_i32$5
              i64toi32_i32$5 = $4$hi
              i64toi32_i32$5 = $7$hi
              i64toi32_i32$4 = i64toi32_i32$1
              i64toi32_i32$1 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
              if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              $292 = i64toi32_i32$2
              $292$hi = i64toi32_i32$0
              i64toi32_i32$5 = ($18_1 + -24) | 0
              i64toi32_i32$0 =
                HEAPU8[i64toi32_i32$5 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$4 =
                HEAPU8[((i64toi32_i32$5 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$5 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $4_1 = i64toi32_i32$0
              $4$hi = i64toi32_i32$4
              $296 = i64toi32_i32$0
              $296$hi = i64toi32_i32$4
              $297 = i64toi32_i32$0
              $297$hi = i64toi32_i32$4
              i64toi32_i32$4 = $5$hi
              i64toi32_i32$4 = $2$hi
              i64toi32_i32$4 = $5$hi
              i64toi32_i32$5 = $5_1
              i64toi32_i32$0 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
              if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
              }
              $300$hi = i64toi32_i32$2
              i64toi32_i32$2 = $297$hi
              i64toi32_i32$4 = $297
              i64toi32_i32$5 = $300$hi
              i64toi32_i32$3 = i64toi32_i32$1
              i64toi32_i32$5 = (i64toi32_i32$2 ^ i64toi32_i32$5) | 0
              $328 = (i64toi32_i32$4 ^ i64toi32_i32$1) | 0
              i64toi32_i32$4 = -1646269944
              i64toi32_i32$4 =
                __wasm_i64_mul($328 | 0, i64toi32_i32$5 | 0, -348639895 | 0, i64toi32_i32$4 | 0) | 0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              $2_1 = i64toi32_i32$4
              $2$hi = i64toi32_i32$5
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$4 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$4 = 0
                $308 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
              } else {
                i64toi32_i32$4 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                $308 =
                  (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                    ((32 - i64toi32_i32$0) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$0) | 0) |
                  0
              }
              $304$hi = i64toi32_i32$4
              i64toi32_i32$4 = $296$hi
              i64toi32_i32$5 = $296
              i64toi32_i32$2 = $304$hi
              i64toi32_i32$3 = $308
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
              $305$hi = i64toi32_i32$2
              i64toi32_i32$2 = $2$hi
              i64toi32_i32$2 = $305$hi
              i64toi32_i32$4 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
              i64toi32_i32$5 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$5 = (i64toi32_i32$2 ^ i64toi32_i32$5) | 0
              $329 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
              i64toi32_i32$4 = -1646269944
              i64toi32_i32$4 =
                __wasm_i64_mul($329 | 0, i64toi32_i32$5 | 0, -348639895 | 0, i64toi32_i32$4 | 0) | 0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              $2_1 = i64toi32_i32$4
              $2$hi = i64toi32_i32$5
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$4 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$4 = 0
                $309 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
              } else {
                i64toi32_i32$4 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                $309 =
                  (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                    ((32 - i64toi32_i32$0) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$0) | 0) |
                  0
              }
              $310$hi = i64toi32_i32$4
              i64toi32_i32$4 = $2$hi
              i64toi32_i32$4 = $310$hi
              i64toi32_i32$5 = $309
              i64toi32_i32$2 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
              $330 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
              i64toi32_i32$5 = -1646269944
              i64toi32_i32$5 =
                __wasm_i64_mul($330 | 0, i64toi32_i32$2 | 0, -348639895 | 0, i64toi32_i32$5 | 0) | 0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $9_1 = i64toi32_i32$5
              $9$hi = i64toi32_i32$2
              i64toi32_i32$2 = $292$hi
              i64toi32_i32$4 = $292
              i64toi32_i32$5 = $9$hi
              i64toi32_i32$3 = $9_1
              i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              i64toi32_i32$4 = 0
              i64toi32_i32$4 =
                __wasm_rotl_i64(
                  i64toi32_i32$0 | 0,
                  i64toi32_i32$1 | 0,
                  43 | 0,
                  i64toi32_i32$4 | 0
                ) | 0
              i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
              $316 = i64toi32_i32$4
              $316$hi = i64toi32_i32$1
              i64toi32_i32$1 = $286$hi
              i64toi32_i32$2 = $286
              i64toi32_i32$4 = $316$hi
              i64toi32_i32$3 = $316
              i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
              if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              $2_1 = i64toi32_i32$5
              $2$hi = i64toi32_i32$0
              i64toi32_i32$0 = $3$hi
              i64toi32_i32$1 = ($18_1 + -16) | 0
              i64toi32_i32$0 =
                HEAPU8[i64toi32_i32$1 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$2 =
                HEAPU8[((i64toi32_i32$1 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $6_1 = i64toi32_i32$0
              $6$hi = i64toi32_i32$2
              i64toi32_i32$2 = $3$hi
              i64toi32_i32$1 = $3_1
              i64toi32_i32$0 = $6$hi
              i64toi32_i32$3 = $6_1
              i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
              i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
              if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
              }
              $5_1 = i64toi32_i32$4
              $5$hi = i64toi32_i32$5
              i64toi32_i32$2 = ($18_1 + -32) | 0
              i64toi32_i32$5 =
                HEAPU8[i64toi32_i32$2 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$1 =
                HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $327 = i64toi32_i32$5
              $327$hi = i64toi32_i32$1
              i64toi32_i32$1 = $5$hi
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$5 = $327$hi
              i64toi32_i32$3 = $327
              i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$5) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
              }
              i64toi32_i32$1 = i64toi32_i32$0
              i64toi32_i32$2 = -1265453457
              i64toi32_i32$3 = -1097272717
              i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$2) | 0
              if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              $3_1 = i64toi32_i32$5
              $3$hi = i64toi32_i32$0
              i64toi32_i32$0 = $4$hi
              i64toi32_i32$0 = $3$hi
              i64toi32_i32$4 = i64toi32_i32$5
              i64toi32_i32$1 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$1) | 0
              if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
              }
              $332$hi = i64toi32_i32$5
              i64toi32_i32$5 = $6$hi
              i64toi32_i32$5 = $332$hi
              i64toi32_i32$0 = i64toi32_i32$2
              i64toi32_i32$4 = $6$hi
              i64toi32_i32$3 = $6_1
              i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$4) | 0
              if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
              }
              $4_1 = i64toi32_i32$1
              $4$hi = i64toi32_i32$2
              i64toi32_i32$0 = 0
              i64toi32_i32$0 =
                __wasm_rotl_i64(
                  i64toi32_i32$1 | 0,
                  i64toi32_i32$2 | 0,
                  20 | 0,
                  i64toi32_i32$0 | 0
                ) | 0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $336$hi = i64toi32_i32$2
              i64toi32_i32$2 = $3$hi
              i64toi32_i32$2 = $336$hi
              i64toi32_i32$5 = i64toi32_i32$0
              i64toi32_i32$0 = $3$hi
              i64toi32_i32$3 = $3_1
              i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
              if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              $338 = i64toi32_i32$4
              $338$hi = i64toi32_i32$1
              i64toi32_i32$1 = $3$hi
              i64toi32_i32$1 = $7$hi
              i64toi32_i32$1 = $3$hi
              i64toi32_i32$2 = $3_1
              i64toi32_i32$5 = $7$hi
              i64toi32_i32$3 = $7_1
              i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$5) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
              }
              $341$hi = i64toi32_i32$4
              i64toi32_i32$1 = ($18_1 + -8) | 0
              i64toi32_i32$4 =
                HEAPU8[i64toi32_i32$1 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$2 =
                HEAPU8[((i64toi32_i32$1 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$1 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $10_1 = i64toi32_i32$4
              $10$hi = i64toi32_i32$2
              i64toi32_i32$2 = $341$hi
              i64toi32_i32$1 = i64toi32_i32$0
              i64toi32_i32$4 = $10$hi
              i64toi32_i32$3 = $10_1
              i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$4) | 0
              if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              i64toi32_i32$1 = 0
              i64toi32_i32$1 =
                __wasm_rotl_i64(
                  i64toi32_i32$5 | 0,
                  i64toi32_i32$0 | 0,
                  43 | 0,
                  i64toi32_i32$1 | 0
                ) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              $347 = i64toi32_i32$1
              $347$hi = i64toi32_i32$0
              i64toi32_i32$0 = $338$hi
              i64toi32_i32$2 = $338
              i64toi32_i32$1 = $347$hi
              i64toi32_i32$3 = $347
              i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$1) | 0
              if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
              }
              $6_1 = i64toi32_i32$4
              $6$hi = i64toi32_i32$5
              i64toi32_i32$5 = $8$hi
              i64toi32_i32$5 = $7$hi
              i64toi32_i32$5 = $8$hi
              i64toi32_i32$0 = $8_1
              i64toi32_i32$2 = $7$hi
              i64toi32_i32$3 = $7_1
              i64toi32_i32$1 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
              i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$2) | 0
              if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
              }
              $3_1 = i64toi32_i32$1
              $3$hi = i64toi32_i32$4
              i64toi32_i32$4 = $4$hi
              i64toi32_i32$4 = $10$hi
              i64toi32_i32$4 = $4$hi
              i64toi32_i32$5 = $4_1
              i64toi32_i32$0 = $10$hi
              i64toi32_i32$3 = $10_1
              i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
              if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              $4_1 = i64toi32_i32$2
              $4$hi = i64toi32_i32$1
              $1_1 = ((($1_1 + -1) | 0) & -64) | 0
              i64toi32_i32$4 = $0_1
              i64toi32_i32$1 =
                HEAPU8[i64toi32_i32$4 >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 1) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 2) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 3) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              i64toi32_i32$5 =
                HEAPU8[((i64toi32_i32$4 + 4) | 0) >> 0] |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 5) | 0) >> 0] | 0) << 8) | 0) |
                0 |
                (((HEAPU8[((i64toi32_i32$4 + 6) | 0) >> 0] | 0) << 16) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 7) | 0) >> 0] | 0) << 24) | 0) |
                  0) |
                0
              $359 = i64toi32_i32$1
              $359$hi = i64toi32_i32$5
              i64toi32_i32$5 = $7$hi
              i64toi32_i32$1 = -1265453457
              i64toi32_i32$1 =
                __wasm_i64_mul($7_1 | 0, i64toi32_i32$5 | 0, -1097272717 | 0, i64toi32_i32$1 | 0) |
                0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              $361 = i64toi32_i32$1
              $361$hi = i64toi32_i32$5
              i64toi32_i32$5 = $359$hi
              i64toi32_i32$4 = $359
              i64toi32_i32$1 = $361$hi
              i64toi32_i32$3 = $361
              i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
              }
              $10_1 = i64toi32_i32$0
              $10$hi = i64toi32_i32$2
              label$4: while (1) {
                i64toi32_i32$5 = $0_1
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$5 + 40) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 41) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 42) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 43) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$4 =
                  HEAPU8[((i64toi32_i32$5 + 44) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 45) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$5 + 46) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$5 + 47) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $11_1 = i64toi32_i32$2
                $11$hi = i64toi32_i32$4
                i64toi32_i32$4 = $3$hi
                i64toi32_i32$4 = $11$hi
                i64toi32_i32$5 = i64toi32_i32$2
                i64toi32_i32$2 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$2) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $12_1 = i64toi32_i32$1
                $12$hi = i64toi32_i32$0
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$4 = $5_1
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$0 + i64toi32_i32$5) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $13_1 = i64toi32_i32$2
                $13$hi = i64toi32_i32$1
                i64toi32_i32$0 = $0_1
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$0 + 48) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 49) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 50) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 51) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$4 =
                  HEAPU8[((i64toi32_i32$0 + 52) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 53) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 54) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 55) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $7_1 = i64toi32_i32$1
                $7$hi = i64toi32_i32$4
                i64toi32_i32$4 = $9$hi
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $9$hi
                i64toi32_i32$0 = $9_1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $14_1 = i64toi32_i32$5
                $14$hi = i64toi32_i32$2
                i64toi32_i32$4 = $0_1
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$4 + 32) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 33) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 34) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 35) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$4 + 36) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 37) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 38) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 39) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $15_1 = i64toi32_i32$2
                $15$hi = i64toi32_i32$0
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$4 + 56) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 57) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 58) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 59) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$4 + 60) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 61) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 62) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 63) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $8_1 = i64toi32_i32$0
                $8$hi = i64toi32_i32$2
                i64toi32_i32$2 =
                  HEAPU8[i64toi32_i32$4 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$4 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $381 = i64toi32_i32$2
                $381$hi = i64toi32_i32$0
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$2 = -1265453457
                i64toi32_i32$2 =
                  __wasm_i64_mul(
                    $2_1 | 0,
                    i64toi32_i32$0 | 0,
                    -1097272717 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $383 = i64toi32_i32$2
                $383$hi = i64toi32_i32$0
                i64toi32_i32$0 = $381$hi
                i64toi32_i32$4 = $381
                i64toi32_i32$2 = $383$hi
                i64toi32_i32$3 = $383
                i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $2_1 = i64toi32_i32$1
                $2$hi = i64toi32_i32$5
                i64toi32_i32$0 = $0_1
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$0 + 8) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 9) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 10) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 11) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$4 =
                  HEAPU8[((i64toi32_i32$0 + 12) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 13) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 14) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 15) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $9_1 = i64toi32_i32$5
                $9$hi = i64toi32_i32$4
                i64toi32_i32$4 = $2$hi
                i64toi32_i32$0 = i64toi32_i32$1
                i64toi32_i32$5 = $9$hi
                i64toi32_i32$3 = $9_1
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$5) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $389$hi = i64toi32_i32$1
                i64toi32_i32$4 = $0_1
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$4 + 16) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 17) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 18) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 19) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$0 =
                  HEAPU8[((i64toi32_i32$4 + 20) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 21) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 22) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 23) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $16_1 = i64toi32_i32$1
                $16$hi = i64toi32_i32$0
                i64toi32_i32$0 = $389$hi
                i64toi32_i32$4 = i64toi32_i32$2
                i64toi32_i32$1 = $16$hi
                i64toi32_i32$3 = $16_1
                i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $17_1 = i64toi32_i32$5
                $17$hi = i64toi32_i32$2
                i64toi32_i32$4 = 0
                i64toi32_i32$4 =
                  __wasm_rotl_i64(
                    i64toi32_i32$5 | 0,
                    i64toi32_i32$2 | 0,
                    20 | 0,
                    i64toi32_i32$4 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $395$hi = i64toi32_i32$2
                i64toi32_i32$2 = $2$hi
                i64toi32_i32$2 = $395$hi
                i64toi32_i32$0 = i64toi32_i32$4
                i64toi32_i32$4 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$1 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$4) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $397 = i64toi32_i32$1
                $397$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$2 = $2_1
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$0) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $400 = i64toi32_i32$4
                $400$hi = i64toi32_i32$1
                i64toi32_i32$1 = $10$hi
                i64toi32_i32$1 = $3$hi
                i64toi32_i32$1 = $10$hi
                i64toi32_i32$5 = $10_1
                i64toi32_i32$2 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$0 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$2) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $403$hi = i64toi32_i32$4
                i64toi32_i32$4 = $5$hi
                i64toi32_i32$4 = $403$hi
                i64toi32_i32$1 = i64toi32_i32$0
                i64toi32_i32$5 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$5) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $405$hi = i64toi32_i32$0
                i64toi32_i32$0 = $9$hi
                i64toi32_i32$0 = $405$hi
                i64toi32_i32$4 = i64toi32_i32$2
                i64toi32_i32$1 = $9$hi
                i64toi32_i32$3 = $9_1
                i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                i64toi32_i32$4 = 0
                i64toi32_i32$4 =
                  __wasm_rotl_i64(
                    i64toi32_i32$5 | 0,
                    i64toi32_i32$2 | 0,
                    27 | 0,
                    i64toi32_i32$4 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $331 = i64toi32_i32$4
                i64toi32_i32$4 = -1265453457
                i64toi32_i32$4 =
                  __wasm_i64_mul(
                    $331 | 0,
                    i64toi32_i32$2 | 0,
                    -1097272717 | 0,
                    i64toi32_i32$4 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $409$hi = i64toi32_i32$2
                i64toi32_i32$2 = $6$hi
                i64toi32_i32$2 = $409$hi
                i64toi32_i32$0 = i64toi32_i32$4
                i64toi32_i32$4 = $6$hi
                i64toi32_i32$3 = $6_1
                i64toi32_i32$4 = (i64toi32_i32$2 ^ i64toi32_i32$4) | 0
                $9_1 = (i64toi32_i32$0 ^ i64toi32_i32$3) | 0
                $9$hi = i64toi32_i32$4
                i64toi32_i32$4 = $400$hi
                i64toi32_i32$2 = $400
                i64toi32_i32$0 = $9$hi
                i64toi32_i32$3 = $9_1
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $413$hi = i64toi32_i32$5
                i64toi32_i32$4 = $0_1
                i64toi32_i32$5 =
                  HEAPU8[((i64toi32_i32$4 + 24) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 25) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 26) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 27) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$4 + 28) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 29) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 30) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 31) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $4_1 = i64toi32_i32$5
                $4$hi = i64toi32_i32$2
                i64toi32_i32$2 = $413$hi
                i64toi32_i32$4 = i64toi32_i32$1
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                i64toi32_i32$4 = 0
                i64toi32_i32$4 =
                  __wasm_rotl_i64(
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$1 | 0,
                    43 | 0,
                    i64toi32_i32$4 | 0
                  ) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                $418 = i64toi32_i32$4
                $418$hi = i64toi32_i32$1
                i64toi32_i32$1 = $397$hi
                i64toi32_i32$2 = $397
                i64toi32_i32$4 = $418$hi
                i64toi32_i32$3 = $418
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $2_1 = i64toi32_i32$5
                $2$hi = i64toi32_i32$0
                $0_1 = ($0_1 + 64) | 0
                i64toi32_i32$0 = $17$hi
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$0 = $17$hi
                i64toi32_i32$1 = $17_1
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$3 = $4_1
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $3_1 = i64toi32_i32$4
                $3$hi = i64toi32_i32$5
                i64toi32_i32$5 = $8$hi
                $425 = $8_1
                $425$hi = i64toi32_i32$5
                i64toi32_i32$5 = $7$hi
                $426 = $7_1
                $426$hi = i64toi32_i32$5
                i64toi32_i32$5 = $11$hi
                $427 = $11_1
                $427$hi = i64toi32_i32$5
                i64toi32_i32$5 = $15$hi
                $428 = $15_1
                $428$hi = i64toi32_i32$5
                i64toi32_i32$5 = $14$hi
                i64toi32_i32$1 = 0
                i64toi32_i32$1 =
                  __wasm_rotl_i64($14_1 | 0, i64toi32_i32$5 | 0, 31 | 0, i64toi32_i32$1 | 0) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $332 = i64toi32_i32$1
                i64toi32_i32$1 = -1265453457
                i64toi32_i32$1 =
                  __wasm_i64_mul(
                    $332 | 0,
                    i64toi32_i32$5 | 0,
                    -1097272717 | 0,
                    i64toi32_i32$1 | 0
                  ) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $14_1 = i64toi32_i32$1
                $14$hi = i64toi32_i32$5
                i64toi32_i32$5 = $6$hi
                i64toi32_i32$5 = $14$hi
                i64toi32_i32$0 = i64toi32_i32$1
                i64toi32_i32$1 = $6$hi
                i64toi32_i32$3 = $6_1
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $434$hi = i64toi32_i32$4
                i64toi32_i32$4 = $428$hi
                i64toi32_i32$5 = $428
                i64toi32_i32$0 = $434$hi
                i64toi32_i32$3 = i64toi32_i32$2
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$2) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $5_1 = i64toi32_i32$1
                $5$hi = i64toi32_i32$2
                i64toi32_i32$2 = $427$hi
                i64toi32_i32$4 = $427
                i64toi32_i32$5 = $5$hi
                i64toi32_i32$3 = i64toi32_i32$1
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$1) | 0
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $437$hi = i64toi32_i32$1
                i64toi32_i32$1 = $426$hi
                i64toi32_i32$2 = $426
                i64toi32_i32$4 = $437$hi
                i64toi32_i32$3 = i64toi32_i32$0
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $6_1 = i64toi32_i32$5
                $6$hi = i64toi32_i32$0
                i64toi32_i32$0 = $425$hi
                i64toi32_i32$1 = $425
                i64toi32_i32$2 = $6$hi
                i64toi32_i32$3 = i64toi32_i32$5
                i64toi32_i32$4 = (i64toi32_i32$1 + i64toi32_i32$5) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $4_1 = i64toi32_i32$4
                $4$hi = i64toi32_i32$5
                i64toi32_i32$5 = $6$hi
                i64toi32_i32$1 = 0
                i64toi32_i32$1 =
                  __wasm_rotl_i64($6_1 | 0, i64toi32_i32$5 | 0, 20 | 0, i64toi32_i32$1 | 0) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $442$hi = i64toi32_i32$5
                i64toi32_i32$5 = $5$hi
                i64toi32_i32$5 = $442$hi
                i64toi32_i32$0 = i64toi32_i32$1
                i64toi32_i32$1 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $444 = i64toi32_i32$2
                $444$hi = i64toi32_i32$4
                i64toi32_i32$4 = $8$hi
                $445 = $8_1
                $445$hi = i64toi32_i32$4
                i64toi32_i32$4 = $16$hi
                $446 = $16_1
                $446$hi = i64toi32_i32$4
                i64toi32_i32$4 = $12$hi
                $447 = $12_1
                $447$hi = i64toi32_i32$4
                i64toi32_i32$4 = $13$hi
                i64toi32_i32$4 = $7$hi
                i64toi32_i32$4 = $13$hi
                i64toi32_i32$5 = $13_1
                i64toi32_i32$0 = $7$hi
                i64toi32_i32$3 = $7_1
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                i64toi32_i32$5 = 0
                i64toi32_i32$5 =
                  __wasm_rotl_i64(
                    i64toi32_i32$1 | 0,
                    i64toi32_i32$2 | 0,
                    22 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $333 = i64toi32_i32$5
                i64toi32_i32$5 = -1265453457
                i64toi32_i32$5 =
                  __wasm_i64_mul(
                    $333 | 0,
                    i64toi32_i32$2 | 0,
                    -1097272717 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
                $452 = i64toi32_i32$5
                $452$hi = i64toi32_i32$2
                i64toi32_i32$2 = $447$hi
                i64toi32_i32$4 = $447
                i64toi32_i32$5 = $452$hi
                i64toi32_i32$3 = $452
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $7_1 = i64toi32_i32$0
                $7$hi = i64toi32_i32$1
                i64toi32_i32$1 = $446$hi
                i64toi32_i32$2 = $446
                i64toi32_i32$4 = $7$hi
                i64toi32_i32$3 = i64toi32_i32$0
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$0) | 0
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$4) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $455$hi = i64toi32_i32$0
                i64toi32_i32$0 = $5$hi
                i64toi32_i32$0 = $455$hi
                i64toi32_i32$1 = i64toi32_i32$5
                i64toi32_i32$2 = $5$hi
                i64toi32_i32$3 = $5_1
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $457$hi = i64toi32_i32$5
                i64toi32_i32$5 = $445$hi
                i64toi32_i32$0 = $445
                i64toi32_i32$1 = $457$hi
                i64toi32_i32$3 = i64toi32_i32$4
                i64toi32_i32$2 = (i64toi32_i32$0 + i64toi32_i32$4) | 0
                i64toi32_i32$4 = (i64toi32_i32$5 + i64toi32_i32$1) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                i64toi32_i32$0 = 0
                i64toi32_i32$0 =
                  __wasm_rotl_i64(
                    i64toi32_i32$2 | 0,
                    i64toi32_i32$4 | 0,
                    43 | 0,
                    i64toi32_i32$0 | 0
                  ) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $459 = i64toi32_i32$0
                $459$hi = i64toi32_i32$4
                i64toi32_i32$4 = $444$hi
                i64toi32_i32$5 = $444
                i64toi32_i32$0 = $459$hi
                i64toi32_i32$3 = $459
                i64toi32_i32$1 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$2 = (i64toi32_i32$4 + i64toi32_i32$0) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$2 = (i64toi32_i32$2 + 1) | 0
                }
                $8_1 = i64toi32_i32$1
                $8$hi = i64toi32_i32$2
                $6_1 = i64toi32_i32$1
                $6$hi = i64toi32_i32$2
                i64toi32_i32$2 = $14$hi
                $10_1 = $14_1
                $10$hi = i64toi32_i32$2
                i64toi32_i32$2 = $7$hi
                $5_1 = $7_1
                $5$hi = i64toi32_i32$2
                $1_1 = ($1_1 + -64) | 0
                if ($1_1) {
                  continue label$4
                }
                break label$4
              }
              i64toi32_i32$2 = $6$hi
              $467 = i64toi32_i32$1
              $467$hi = i64toi32_i32$2
              i64toi32_i32$2 = $2$hi
              i64toi32_i32$2 = $6$hi
              i64toi32_i32$4 = i64toi32_i32$1
              i64toi32_i32$5 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$5 = (i64toi32_i32$2 ^ i64toi32_i32$5) | 0
              $334 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
              i64toi32_i32$4 = -1646269944
              i64toi32_i32$4 =
                __wasm_i64_mul($334 | 0, i64toi32_i32$5 | 0, -348639895 | 0, i64toi32_i32$4 | 0) | 0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              $2_1 = i64toi32_i32$4
              $2$hi = i64toi32_i32$5
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$4 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$4 = 0
                $310 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
              } else {
                i64toi32_i32$4 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                $310 =
                  (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                    ((32 - i64toi32_i32$0) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$0) | 0) |
                  0
              }
              $473$hi = i64toi32_i32$4
              i64toi32_i32$4 = $467$hi
              i64toi32_i32$5 = $467
              i64toi32_i32$2 = $473$hi
              i64toi32_i32$3 = $310
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
              $474$hi = i64toi32_i32$2
              i64toi32_i32$2 = $2$hi
              i64toi32_i32$2 = $474$hi
              i64toi32_i32$4 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
              i64toi32_i32$5 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$5 = (i64toi32_i32$2 ^ i64toi32_i32$5) | 0
              $335 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
              i64toi32_i32$4 = -1646269944
              i64toi32_i32$4 =
                __wasm_i64_mul($335 | 0, i64toi32_i32$5 | 0, -348639895 | 0, i64toi32_i32$4 | 0) | 0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              $2_1 = i64toi32_i32$4
              $2$hi = i64toi32_i32$5
              i64toi32_i32$2 = i64toi32_i32$4
              i64toi32_i32$4 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$0 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$4 = 0
                $311 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
              } else {
                i64toi32_i32$4 = (i64toi32_i32$5 >>> i64toi32_i32$0) | 0
                $311 =
                  (((((((1 << i64toi32_i32$0) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                    ((32 - i64toi32_i32$0) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$0) | 0) |
                  0
              }
              $479$hi = i64toi32_i32$4
              i64toi32_i32$4 = $2$hi
              i64toi32_i32$4 = $479$hi
              i64toi32_i32$5 = $311
              i64toi32_i32$2 = $2$hi
              i64toi32_i32$3 = $2_1
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
              $336 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
              i64toi32_i32$5 = -1646269944
              i64toi32_i32$5 =
                __wasm_i64_mul($336 | 0, i64toi32_i32$2 | 0, -348639895 | 0, i64toi32_i32$5 | 0) | 0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $482$hi = i64toi32_i32$2
              i64toi32_i32$2 = $14$hi
              i64toi32_i32$2 = $482$hi
              i64toi32_i32$4 = i64toi32_i32$5
              i64toi32_i32$5 = $14$hi
              i64toi32_i32$3 = $14_1
              i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
              if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
              }
              $2_1 = i64toi32_i32$0
              $2$hi = i64toi32_i32$1
              $485 = i64toi32_i32$0
              $485$hi = i64toi32_i32$1
              $486 = i64toi32_i32$0
              $486$hi = i64toi32_i32$1
              i64toi32_i32$1 = $7$hi
              i64toi32_i32$2 = $7_1
              i64toi32_i32$4 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$5 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$4 = 0
                $312 = (i64toi32_i32$1 >>> i64toi32_i32$5) | 0
              } else {
                i64toi32_i32$4 = (i64toi32_i32$1 >>> i64toi32_i32$5) | 0
                $312 =
                  (((((((1 << i64toi32_i32$5) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                    ((32 - i64toi32_i32$5) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$5) | 0) |
                  0
              }
              $488$hi = i64toi32_i32$4
              i64toi32_i32$4 = $7$hi
              i64toi32_i32$4 = $488$hi
              i64toi32_i32$1 = $312
              i64toi32_i32$2 = $7$hi
              i64toi32_i32$3 = $7_1
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$2) | 0
              $337 = (i64toi32_i32$1 ^ i64toi32_i32$3) | 0
              i64toi32_i32$1 = -1265453457
              i64toi32_i32$1 =
                __wasm_i64_mul($337 | 0, i64toi32_i32$2 | 0, -1097272717 | 0, i64toi32_i32$1 | 0) |
                0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $491$hi = i64toi32_i32$2
              i64toi32_i32$2 = $9$hi
              i64toi32_i32$2 = $491$hi
              i64toi32_i32$4 = i64toi32_i32$1
              i64toi32_i32$1 = $9$hi
              i64toi32_i32$3 = $9_1
              i64toi32_i32$5 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
              i64toi32_i32$0 = (i64toi32_i32$2 + i64toi32_i32$1) | 0
              if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
              }
              $493 = i64toi32_i32$5
              $493$hi = i64toi32_i32$0
              i64toi32_i32$0 = $4$hi
              $494 = $4_1
              $494$hi = i64toi32_i32$0
              i64toi32_i32$0 = $3$hi
              i64toi32_i32$0 = $4$hi
              i64toi32_i32$2 = $4_1
              i64toi32_i32$4 = $3$hi
              i64toi32_i32$3 = $3_1
              i64toi32_i32$4 = (i64toi32_i32$0 ^ i64toi32_i32$4) | 0
              $339 = (i64toi32_i32$2 ^ i64toi32_i32$3) | 0
              i64toi32_i32$2 = -1646269944
              i64toi32_i32$2 =
                __wasm_i64_mul($339 | 0, i64toi32_i32$4 | 0, -348639895 | 0, i64toi32_i32$2 | 0) | 0
              i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
              $3_1 = i64toi32_i32$2
              $3$hi = i64toi32_i32$4
              i64toi32_i32$0 = i64toi32_i32$2
              i64toi32_i32$2 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$1 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $313 = (i64toi32_i32$4 >>> i64toi32_i32$1) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$4 >>> i64toi32_i32$1) | 0
                $313 =
                  (((((((1 << i64toi32_i32$1) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                    ((32 - i64toi32_i32$1) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$1) | 0) |
                  0
              }
              $500$hi = i64toi32_i32$2
              i64toi32_i32$2 = $494$hi
              i64toi32_i32$4 = $494
              i64toi32_i32$0 = $500$hi
              i64toi32_i32$3 = $313
              i64toi32_i32$0 = (i64toi32_i32$2 ^ i64toi32_i32$0) | 0
              $501$hi = i64toi32_i32$0
              i64toi32_i32$0 = $3$hi
              i64toi32_i32$0 = $501$hi
              i64toi32_i32$2 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
              i64toi32_i32$4 = $3$hi
              i64toi32_i32$3 = $3_1
              i64toi32_i32$4 = (i64toi32_i32$0 ^ i64toi32_i32$4) | 0
              $340 = (i64toi32_i32$2 ^ i64toi32_i32$3) | 0
              i64toi32_i32$2 = -1646269944
              i64toi32_i32$2 =
                __wasm_i64_mul($340 | 0, i64toi32_i32$4 | 0, -348639895 | 0, i64toi32_i32$2 | 0) | 0
              i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
              $4_1 = i64toi32_i32$2
              $4$hi = i64toi32_i32$4
              i64toi32_i32$0 = i64toi32_i32$2
              i64toi32_i32$2 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$1 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $314 = (i64toi32_i32$4 >>> i64toi32_i32$1) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$4 >>> i64toi32_i32$1) | 0
                $314 =
                  (((((((1 << i64toi32_i32$1) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                    ((32 - i64toi32_i32$1) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$1) | 0) |
                  0
              }
              $506$hi = i64toi32_i32$2
              i64toi32_i32$2 = $4$hi
              i64toi32_i32$2 = $506$hi
              i64toi32_i32$4 = $314
              i64toi32_i32$0 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$0 = (i64toi32_i32$2 ^ i64toi32_i32$0) | 0
              $341 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
              i64toi32_i32$4 = -1646269944
              i64toi32_i32$4 =
                __wasm_i64_mul($341 | 0, i64toi32_i32$0 | 0, -348639895 | 0, i64toi32_i32$4 | 0) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              $509 = i64toi32_i32$4
              $509$hi = i64toi32_i32$0
              i64toi32_i32$0 = $493$hi
              i64toi32_i32$2 = $493
              i64toi32_i32$4 = $509$hi
              i64toi32_i32$3 = $509
              i64toi32_i32$1 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
              i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$4) | 0
              if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
              }
              $510$hi = i64toi32_i32$5
              i64toi32_i32$5 = $486$hi
              i64toi32_i32$0 = $486
              i64toi32_i32$2 = $510$hi
              i64toi32_i32$3 = i64toi32_i32$1
              i64toi32_i32$2 = (i64toi32_i32$5 ^ i64toi32_i32$2) | 0
              $342 = (i64toi32_i32$0 ^ i64toi32_i32$1) | 0
              i64toi32_i32$0 = -1646269944
              i64toi32_i32$0 =
                __wasm_i64_mul($342 | 0, i64toi32_i32$2 | 0, -348639895 | 0, i64toi32_i32$0 | 0) | 0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $4_1 = i64toi32_i32$0
              $4$hi = i64toi32_i32$2
              i64toi32_i32$5 = i64toi32_i32$0
              i64toi32_i32$0 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$0 = 0
                $315 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$0 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
                $315 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$2) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$5 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $514$hi = i64toi32_i32$0
              i64toi32_i32$0 = $485$hi
              i64toi32_i32$2 = $485
              i64toi32_i32$5 = $514$hi
              i64toi32_i32$3 = $315
              i64toi32_i32$5 = (i64toi32_i32$0 ^ i64toi32_i32$5) | 0
              $515$hi = i64toi32_i32$5
              i64toi32_i32$5 = $4$hi
              i64toi32_i32$5 = $515$hi
              i64toi32_i32$0 = (i64toi32_i32$2 ^ i64toi32_i32$3) | 0
              i64toi32_i32$2 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$2 = (i64toi32_i32$5 ^ i64toi32_i32$2) | 0
              $343 = (i64toi32_i32$0 ^ i64toi32_i32$3) | 0
              i64toi32_i32$0 = -1646269944
              i64toi32_i32$0 =
                __wasm_i64_mul($343 | 0, i64toi32_i32$2 | 0, -348639895 | 0, i64toi32_i32$0 | 0) | 0
              i64toi32_i32$2 = i64toi32_i32$HIGH_BITS
              $4_1 = i64toi32_i32$0
              $4$hi = i64toi32_i32$2
              i64toi32_i32$5 = i64toi32_i32$0
              i64toi32_i32$0 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$0 = 0
                $317 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$0 = (i64toi32_i32$2 >>> i64toi32_i32$4) | 0
                $317 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$2) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$5 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $520$hi = i64toi32_i32$0
              i64toi32_i32$0 = $4$hi
              i64toi32_i32$0 = $520$hi
              i64toi32_i32$2 = $317
              i64toi32_i32$5 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$5 = (i64toi32_i32$0 ^ i64toi32_i32$5) | 0
              $344 = (i64toi32_i32$2 ^ i64toi32_i32$3) | 0
              i64toi32_i32$2 = -1646269944
              i64toi32_i32$2 =
                __wasm_i64_mul($344 | 0, i64toi32_i32$5 | 0, -348639895 | 0, i64toi32_i32$2 | 0) | 0
              i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
              i64toi32_i32$HIGH_BITS = i64toi32_i32$5
              return i64toi32_i32$2 | 0
            }

            function $5($0_1, $1_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              var i64toi32_i32$0 = 0,
                i64toi32_i32$5 = 0,
                i64toi32_i32$4 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$3 = 0,
                i64toi32_i32$2 = 0,
                $4$hi = 0,
                $2$hi = 0,
                $2_1 = 0,
                $4_1 = 0,
                $3$hi = 0,
                $3_1 = 0,
                $50_1 = 0,
                $51_1 = 0,
                $52 = 0,
                $53_1 = 0,
                $54_1 = 0,
                $55_1 = 0,
                $56_1 = 0,
                $12_1 = 0,
                $12$hi = 0,
                $19_1 = 0,
                $19$hi = 0,
                $26_1 = 0,
                $26$hi = 0,
                $27_1 = 0,
                $27$hi = 0,
                $29$hi = 0,
                $58_1 = 0,
                $31$hi = 0,
                $33$hi = 0,
                $34$hi = 0,
                $59_1 = 0,
                $38$hi = 0,
                $39$hi = 0,
                $41$hi = 0,
                $60_1 = 0,
                $45$hi = 0,
                $47$hi = 0,
                $61_1 = 0,
                $54$hi = 0,
                $56$hi = 0,
                $57_1 = 0,
                $57$hi = 0,
                $64_1 = 0,
                $64$hi = 0,
                $72$hi = 0,
                $74$hi = 0,
                $76$hi = 0,
                $62_1 = 0,
                $80$hi = 0,
                $82$hi = 0,
                $63_1 = 0,
                $95 = 0,
                $95$hi = 0,
                $101$hi = 0,
                $103 = 0,
                $103$hi = 0,
                $65_1 = 0,
                $105 = 0,
                $105$hi = 0,
                $108$hi = 0,
                $66 = 0
              label$1: {
                if ($1_1 >>> 0 < 8 >>> 0) {
                  break label$1
                }
                i64toi32_i32$2 = $0_1
                i64toi32_i32$0 =
                  HEAPU8[i64toi32_i32$2 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$1 =
                  HEAPU8[((i64toi32_i32$2 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$2 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$2 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 = i64toi32_i32$0
                i64toi32_i32$0 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$1 + i64toi32_i32$0) | 0
                if (i64toi32_i32$4 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $2_1 = i64toi32_i32$4
                $2$hi = i64toi32_i32$5
                i64toi32_i32$2 = 0
                i64toi32_i32$2 =
                  __wasm_rotl_i64(
                    i64toi32_i32$4 | 0,
                    i64toi32_i32$5 | 0,
                    39 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                $12_1 = i64toi32_i32$2
                $12$hi = i64toi32_i32$5
                i64toi32_i32$1 = ((($0_1 + $1_1) | 0) + -8) | 0
                i64toi32_i32$5 =
                  HEAPU8[i64toi32_i32$1 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$2 =
                  HEAPU8[((i64toi32_i32$1 + 4) | 0) >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 5) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$1 + 6) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$1 + 7) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                $3_1 = i64toi32_i32$5
                $3$hi = i64toi32_i32$2
                i64toi32_i32$2 = $12$hi
                i64toi32_i32$1 = $12_1
                i64toi32_i32$5 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$0 = (i64toi32_i32$1 + i64toi32_i32$3) | 0
                i64toi32_i32$4 = (i64toi32_i32$2 + i64toi32_i32$5) | 0
                if (i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$4 + 1) | 0
                }
                $19_1 = i64toi32_i32$0
                $19$hi = i64toi32_i32$4
                i64toi32_i32$4 = 0
                i64toi32_i32$2 = ($1_1 << 1) | 0
                i64toi32_i32$1 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$5 = (i64toi32_i32$2 + i64toi32_i32$3) | 0
                i64toi32_i32$0 = (i64toi32_i32$4 + i64toi32_i32$1) | 0
                if (i64toi32_i32$5 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$0 = (i64toi32_i32$0 + 1) | 0
                }
                $4_1 = i64toi32_i32$5
                $4$hi = i64toi32_i32$0
                i64toi32_i32$0 = $19$hi
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$2 =
                  __wasm_i64_mul(
                    $19_1 | 0,
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$5 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $26_1 = i64toi32_i32$2
                $26$hi = i64toi32_i32$0
                $27_1 = i64toi32_i32$2
                $27$hi = i64toi32_i32$0
                i64toi32_i32$0 = $3$hi
                i64toi32_i32$2 = 0
                i64toi32_i32$2 =
                  __wasm_rotl_i64($3_1 | 0, i64toi32_i32$0 | 0, 27 | 0, i64toi32_i32$2 | 0) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $29$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$0 = $29$hi
                $58_1 = i64toi32_i32$2
                i64toi32_i32$2 = $4$hi
                i64toi32_i32$2 =
                  __wasm_i64_mul(
                    $58_1 | 0,
                    i64toi32_i32$0 | 0,
                    i64toi32_i32$5 | 0,
                    i64toi32_i32$2 | 0
                  ) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $31$hi = i64toi32_i32$0
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$0 = $31$hi
                i64toi32_i32$4 = i64toi32_i32$2
                i64toi32_i32$2 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$1 = (i64toi32_i32$4 + i64toi32_i32$3) | 0
                i64toi32_i32$5 = (i64toi32_i32$0 + i64toi32_i32$2) | 0
                if (i64toi32_i32$1 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$5 = (i64toi32_i32$5 + 1) | 0
                }
                $33$hi = i64toi32_i32$5
                i64toi32_i32$5 = $27$hi
                i64toi32_i32$0 = $27_1
                i64toi32_i32$4 = $33$hi
                i64toi32_i32$3 = i64toi32_i32$1
                i64toi32_i32$4 = (i64toi32_i32$5 ^ i64toi32_i32$4) | 0
                $34$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $34$hi
                $59_1 = (i64toi32_i32$0 ^ i64toi32_i32$1) | 0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$0 =
                  __wasm_i64_mul($59_1 | 0, i64toi32_i32$4 | 0, $4_1 | 0, i64toi32_i32$0 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $2_1 = i64toi32_i32$0
                $2$hi = i64toi32_i32$4
                i64toi32_i32$5 = i64toi32_i32$0
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = 0
                  $50_1 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$0 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                  $50_1 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$2) | 0) |
                    0
                }
                $38$hi = i64toi32_i32$0
                i64toi32_i32$0 = $26$hi
                i64toi32_i32$4 = $26_1
                i64toi32_i32$5 = $38$hi
                i64toi32_i32$3 = $50_1
                i64toi32_i32$5 = (i64toi32_i32$0 ^ i64toi32_i32$5) | 0
                $39$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $39$hi
                i64toi32_i32$0 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
                i64toi32_i32$4 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$4 = (i64toi32_i32$5 ^ i64toi32_i32$4) | 0
                $41$hi = i64toi32_i32$4
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 = $41$hi
                $60_1 = (i64toi32_i32$0 ^ i64toi32_i32$3) | 0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$0 =
                  __wasm_i64_mul($60_1 | 0, i64toi32_i32$4 | 0, $4_1 | 0, i64toi32_i32$0 | 0) | 0
                i64toi32_i32$4 = i64toi32_i32$HIGH_BITS
                $2_1 = i64toi32_i32$0
                $2$hi = i64toi32_i32$4
                i64toi32_i32$5 = i64toi32_i32$0
                i64toi32_i32$0 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$0 = 0
                  $51_1 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                } else {
                  i64toi32_i32$0 = (i64toi32_i32$4 >>> i64toi32_i32$2) | 0
                  $51_1 =
                    (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$4) | 0) <<
                      ((32 - i64toi32_i32$2) | 0)) |
                    0 |
                    ((i64toi32_i32$5 >>> i64toi32_i32$2) | 0) |
                    0
                }
                $45$hi = i64toi32_i32$0
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$0 = $45$hi
                i64toi32_i32$4 = $51_1
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$5 = (i64toi32_i32$0 ^ i64toi32_i32$5) | 0
                $47$hi = i64toi32_i32$5
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 = $47$hi
                $61_1 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
                i64toi32_i32$4 = $4$hi
                i64toi32_i32$4 =
                  __wasm_i64_mul($61_1 | 0, i64toi32_i32$5 | 0, $4_1 | 0, i64toi32_i32$4 | 0) | 0
                i64toi32_i32$5 = i64toi32_i32$HIGH_BITS
                i64toi32_i32$HIGH_BITS = i64toi32_i32$5
                return i64toi32_i32$4 | 0
              }
              label$2: {
                if ($1_1 >>> 0 < 4 >>> 0) {
                  break label$2
                }
                i64toi32_i32$0 = $0_1
                i64toi32_i32$4 =
                  HEAPU8[i64toi32_i32$0 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$0 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$0 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 = 0
                i64toi32_i32$0 = i64toi32_i32$4
                i64toi32_i32$4 = 0
                i64toi32_i32$3 = 3
                i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$4 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                  $52 = 0
                } else {
                  i64toi32_i32$4 =
                    (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                      ((i64toi32_i32$0 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                    0 |
                    ((i64toi32_i32$5 << i64toi32_i32$2) | 0) |
                    0
                  $52 = (i64toi32_i32$0 << i64toi32_i32$2) | 0
                }
                $54$hi = i64toi32_i32$4
                i64toi32_i32$4 = 0
                $56$hi = i64toi32_i32$4
                i64toi32_i32$4 = $54$hi
                i64toi32_i32$5 = $52
                i64toi32_i32$0 = $56$hi
                i64toi32_i32$3 = $1_1
                i64toi32_i32$0 = i64toi32_i32$4 | i64toi32_i32$0 | 0
                $57_1 = i64toi32_i32$5 | i64toi32_i32$3 | 0
                $57$hi = i64toi32_i32$0
                i64toi32_i32$4 = ((($0_1 + i64toi32_i32$3) | 0) + -4) | 0
                i64toi32_i32$0 =
                  HEAPU8[i64toi32_i32$4 >> 0] |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 1) | 0) >> 0] | 0) << 8) | 0) |
                  0 |
                  (((HEAPU8[((i64toi32_i32$4 + 2) | 0) >> 0] | 0) << 16) |
                    0 |
                    (((HEAPU8[((i64toi32_i32$4 + 3) | 0) >> 0] | 0) << 24) | 0) |
                    0) |
                  0
                i64toi32_i32$5 = 0
                $2_1 = i64toi32_i32$0
                $2$hi = i64toi32_i32$5
                i64toi32_i32$5 = $57$hi
                i64toi32_i32$4 = $57_1
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$0 = (i64toi32_i32$5 ^ i64toi32_i32$0) | 0
                $64_1 = (i64toi32_i32$4 ^ i64toi32_i32$3) | 0
                $64$hi = i64toi32_i32$0
                i64toi32_i32$0 = 0
                i64toi32_i32$5 = ($1_1 << 1) | 0
                i64toi32_i32$4 = -1696503237
                i64toi32_i32$3 = 797982799
                i64toi32_i32$2 = (i64toi32_i32$5 + i64toi32_i32$3) | 0
                i64toi32_i32$1 = (i64toi32_i32$0 + i64toi32_i32$4) | 0
                if (i64toi32_i32$2 >>> 0 < i64toi32_i32$3 >>> 0) {
                  i64toi32_i32$1 = (i64toi32_i32$1 + 1) | 0
                }
                $4_1 = i64toi32_i32$2
                $4$hi = i64toi32_i32$1
                i64toi32_i32$1 = $64$hi
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul(
                    $64_1 | 0,
                    i64toi32_i32$1 | 0,
                    i64toi32_i32$2 | 0,
                    i64toi32_i32$5 | 0
                  ) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                $3_1 = i64toi32_i32$5
                $3$hi = i64toi32_i32$1
                i64toi32_i32$0 = i64toi32_i32$5
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $53_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                  $53_1 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                    0
                }
                $72$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $72$hi
                i64toi32_i32$1 = $53_1
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$0 = (i64toi32_i32$5 ^ i64toi32_i32$0) | 0
                $74$hi = i64toi32_i32$0
                i64toi32_i32$0 = $3$hi
                i64toi32_i32$0 = $74$hi
                i64toi32_i32$5 = (i64toi32_i32$1 ^ i64toi32_i32$3) | 0
                i64toi32_i32$1 = $3$hi
                i64toi32_i32$3 = $3_1
                i64toi32_i32$1 = (i64toi32_i32$0 ^ i64toi32_i32$1) | 0
                $76$hi = i64toi32_i32$1
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$1 = $76$hi
                $62_1 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
                i64toi32_i32$5 = $4$hi
                i64toi32_i32$5 =
                  __wasm_i64_mul($62_1 | 0, i64toi32_i32$1 | 0, $4_1 | 0, i64toi32_i32$5 | 0) | 0
                i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                $2_1 = i64toi32_i32$5
                $2$hi = i64toi32_i32$1
                i64toi32_i32$0 = i64toi32_i32$5
                i64toi32_i32$5 = 0
                i64toi32_i32$3 = 47
                i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
                if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                  i64toi32_i32$5 = 0
                  $54_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                } else {
                  i64toi32_i32$5 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                  $54_1 =
                    (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                      ((32 - i64toi32_i32$4) | 0)) |
                    0 |
                    ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                    0
                }
                $80$hi = i64toi32_i32$5
                i64toi32_i32$5 = $2$hi
                i64toi32_i32$5 = $80$hi
                i64toi32_i32$1 = $54_1
                i64toi32_i32$0 = $2$hi
                i64toi32_i32$3 = $2_1
                i64toi32_i32$0 = (i64toi32_i32$5 ^ i64toi32_i32$0) | 0
                $82$hi = i64toi32_i32$0
                i64toi32_i32$0 = $4$hi
                i64toi32_i32$0 = $82$hi
                $63_1 = (i64toi32_i32$1 ^ i64toi32_i32$3) | 0
                i64toi32_i32$1 = $4$hi
                i64toi32_i32$1 =
                  __wasm_i64_mul($63_1 | 0, i64toi32_i32$0 | 0, $4_1 | 0, i64toi32_i32$1 | 0) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                i64toi32_i32$HIGH_BITS = i64toi32_i32$0
                return i64toi32_i32$1 | 0
              }
              label$3: {
                if ($1_1) {
                  break label$3
                }
                i64toi32_i32$1 = -1696503237
                i64toi32_i32$0 = 797982799
                i64toi32_i32$HIGH_BITS = i64toi32_i32$1
                return i64toi32_i32$0 | 0
              }
              i64toi32_i32$0 = 0
              i64toi32_i32$1 = -1012545444
              i64toi32_i32$1 =
                __wasm_i64_mul(
                  ((HEAPU8[(((($0_1 + $1_1) | 0) + -1) | 0) >> 0] | 0) << 2) | 0 | $1_1 | 0 | 0,
                  i64toi32_i32$0 | 0,
                  -1748291289 | 0,
                  i64toi32_i32$1 | 0
                ) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              $95 = i64toi32_i32$1
              $95$hi = i64toi32_i32$0
              i64toi32_i32$5 = ($0_1 + (($1_1 >>> 1) | 0)) | 0
              i64toi32_i32$0 = HEAPU8[i64toi32_i32$5 >> 0] | 0
              i64toi32_i32$1 = 0
              i64toi32_i32$5 = i64toi32_i32$0
              i64toi32_i32$0 = 0
              i64toi32_i32$3 = 8
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$5 << i64toi32_i32$4) | 0
                $55_1 = 0
              } else {
                i64toi32_i32$0 =
                  (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                    ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                  0 |
                  ((i64toi32_i32$1 << i64toi32_i32$4) | 0) |
                  0
                $55_1 = (i64toi32_i32$5 << i64toi32_i32$4) | 0
              }
              $101$hi = i64toi32_i32$0
              i64toi32_i32$1 = $0_1
              i64toi32_i32$0 = HEAPU8[i64toi32_i32$1 >> 0] | 0
              i64toi32_i32$5 = 0
              $103 = i64toi32_i32$0
              $103$hi = i64toi32_i32$5
              i64toi32_i32$5 = $101$hi
              i64toi32_i32$1 = $55_1
              i64toi32_i32$0 = $103$hi
              i64toi32_i32$3 = $103
              i64toi32_i32$0 = i64toi32_i32$5 | i64toi32_i32$0 | 0
              $65_1 = i64toi32_i32$1 | i64toi32_i32$3 | 0
              i64toi32_i32$1 = -1696503237
              i64toi32_i32$1 =
                __wasm_i64_mul($65_1 | 0, i64toi32_i32$0 | 0, 797982799 | 0, i64toi32_i32$1 | 0) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              $105 = i64toi32_i32$1
              $105$hi = i64toi32_i32$0
              i64toi32_i32$0 = $95$hi
              i64toi32_i32$5 = $95
              i64toi32_i32$1 = $105$hi
              i64toi32_i32$3 = $105
              i64toi32_i32$1 = (i64toi32_i32$0 ^ i64toi32_i32$1) | 0
              $4_1 = (i64toi32_i32$5 ^ i64toi32_i32$3) | 0
              $4$hi = i64toi32_i32$1
              i64toi32_i32$0 = $4_1
              i64toi32_i32$5 = 0
              i64toi32_i32$3 = 47
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$5 = 0
                $56_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$5 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                $56_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $108$hi = i64toi32_i32$5
              i64toi32_i32$5 = $4$hi
              i64toi32_i32$5 = $108$hi
              i64toi32_i32$1 = $56_1
              i64toi32_i32$0 = $4$hi
              i64toi32_i32$3 = $4_1
              i64toi32_i32$0 = (i64toi32_i32$5 ^ i64toi32_i32$0) | 0
              $66 = (i64toi32_i32$1 ^ i64toi32_i32$3) | 0
              i64toi32_i32$1 = -1696503237
              i64toi32_i32$1 =
                __wasm_i64_mul($66 | 0, i64toi32_i32$0 | 0, 797982799 | 0, i64toi32_i32$1 | 0) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              i64toi32_i32$HIGH_BITS = i64toi32_i32$0
              return i64toi32_i32$1 | 0
            }

            function $6() {
              var i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0
              fimport$0(67548 | 0, 65674 | 0)
              fimport$1(67560 | 0, 65593 | 0, 1 | 0, 0 | 0)
              fimport$2(67572 | 0, 65588 | 0, 1 | 0, -128 | 0, 127 | 0)
              fimport$2(67596 | 0, 65581 | 0, 1 | 0, -128 | 0, 127 | 0)
              fimport$2(67584 | 0, 65579 | 0, 1 | 0, 0 | 0, 255 | 0)
              fimport$2(67608 | 0, 65545 | 0, 2 | 0, -32768 | 0, 32767 | 0)
              fimport$2(67620 | 0, 65536 | 0, 2 | 0, 0 | 0, 65535 | 0)
              fimport$2(67632 | 0, 65560 | 0, 4 | 0, -2147483648 | 0, 2147483647 | 0)
              fimport$2(67644 | 0, 65551 | 0, 4 | 0, 0 | 0, -1 | 0)
              fimport$2(67656 | 0, 65607 | 0, 4 | 0, -2147483648 | 0, 2147483647 | 0)
              fimport$2(67668 | 0, 65598 | 0, 4 | 0, 0 | 0, -1 | 0)
              i64toi32_i32$0 = -2147483648
              i64toi32_i32$1 = 2147483647
              $64(
                67680 | 0,
                65571 | 0,
                8 | 0,
                0 | 0,
                i64toi32_i32$0 | 0,
                -1 | 0,
                i64toi32_i32$1 | 0
              )
              i64toi32_i32$1 = 0
              i64toi32_i32$0 = -1
              $64(
                67692 | 0,
                65570 | 0,
                8 | 0,
                0 | 0,
                i64toi32_i32$1 | 0,
                -1 | 0,
                i64toi32_i32$0 | 0
              )
              fimport$3(67704 | 0, 65564 | 0, 4 | 0)
              fimport$3(67716 | 0, 65667 | 0, 8 | 0)
              fimport$4(66420 | 0, 65625 | 0)
              fimport$4(66492 | 0, 66183 | 0)
              fimport$5(66564 | 0, 4 | 0, 65612 | 0)
              fimport$5(66640 | 0, 2 | 0, 65637 | 0)
              fimport$5(66716 | 0, 4 | 0, 65652 | 0)
              fimport$6(66744 | 0)
              fimport$7(66784 | 0, 0 | 0, 66114 | 0)
              fimport$7(66824 | 0, 0 | 0, 66216 | 0)
              fimport$7(66864 | 0, 1 | 0, 66144 | 0)
              fimport$7(66904 | 0, 2 | 0, 65679 | 0)
              fimport$7(66944 | 0, 3 | 0, 65710 | 0)
              fimport$7(66984 | 0, 4 | 0, 65750 | 0)
              fimport$7(67024 | 0, 5 | 0, 65779 | 0)
              fimport$7(67064 | 0, 4 | 0, 66253 | 0)
              fimport$7(67104 | 0, 5 | 0, 66283 | 0)
              fimport$7(66824 | 0, 0 | 0, 65881 | 0)
              fimport$7(66864 | 0, 1 | 0, 65848 | 0)
              fimport$7(66904 | 0, 2 | 0, 65947 | 0)
              fimport$7(66944 | 0, 3 | 0, 65913 | 0)
              fimport$7(66984 | 0, 4 | 0, 66081 | 0)
              fimport$7(67024 | 0, 5 | 0, 66047 | 0)
              fimport$7(67144 | 0, 8 | 0, 66014 | 0)
              fimport$7(67184 | 0, 9 | 0, 65980 | 0)
              fimport$7(67224 | 0, 6 | 0, 65817 | 0)
              fimport$7(67264 | 0, 7 | 0, 66322 | 0)
            }

            function $7() {
              HEAP32[((0 + 68040) | 0) >> 2] = 1
              HEAP32[((0 + 68044) | 0) >> 2] = 0
              $6()
              HEAP32[((0 + 68044) | 0) >> 2] = HEAP32[((0 + 68036) | 0) >> 2] | 0
              HEAP32[((0 + 68036) | 0) >> 2] = 68040
            }

            function $8($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              var $3_1 = 0,
                i64toi32_i32$0 = 0,
                $4_1 = 0,
                i64toi32_i32$1 = 0,
                $6_1 = 0,
                $5_1 = 0,
                $6$hi = 0
              label$1: {
                if (!$2_1) {
                  break label$1
                }
                HEAP8[$0_1 >> 0] = $1_1
                $3_1 = ($0_1 + $2_1) | 0
                HEAP8[(($3_1 + -1) | 0) >> 0] = $1_1
                if ($2_1 >>> 0 < 3 >>> 0) {
                  break label$1
                }
                HEAP8[(($0_1 + 2) | 0) >> 0] = $1_1
                HEAP8[(($0_1 + 1) | 0) >> 0] = $1_1
                HEAP8[(($3_1 + -3) | 0) >> 0] = $1_1
                HEAP8[(($3_1 + -2) | 0) >> 0] = $1_1
                if ($2_1 >>> 0 < 7 >>> 0) {
                  break label$1
                }
                HEAP8[(($0_1 + 3) | 0) >> 0] = $1_1
                HEAP8[(($3_1 + -4) | 0) >> 0] = $1_1
                if ($2_1 >>> 0 < 9 >>> 0) {
                  break label$1
                }
                $4_1 = (((0 - $0_1) | 0) & 3) | 0
                $3_1 = ($0_1 + $4_1) | 0
                $1_1 = Math_imul(($1_1 & 255) | 0, 16843009)
                HEAP32[$3_1 >> 2] = $1_1
                $4_1 = ((($2_1 - $4_1) | 0) & -4) | 0
                $2_1 = ($3_1 + $4_1) | 0
                HEAP32[(($2_1 + -4) | 0) >> 2] = $1_1
                if ($4_1 >>> 0 < 9 >>> 0) {
                  break label$1
                }
                HEAP32[(($3_1 + 8) | 0) >> 2] = $1_1
                HEAP32[(($3_1 + 4) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -8) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -12) | 0) >> 2] = $1_1
                if ($4_1 >>> 0 < 25 >>> 0) {
                  break label$1
                }
                HEAP32[(($3_1 + 24) | 0) >> 2] = $1_1
                HEAP32[(($3_1 + 20) | 0) >> 2] = $1_1
                HEAP32[(($3_1 + 16) | 0) >> 2] = $1_1
                HEAP32[(($3_1 + 12) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -16) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -20) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -24) | 0) >> 2] = $1_1
                HEAP32[(($2_1 + -28) | 0) >> 2] = $1_1
                $5_1 = ($3_1 & 4) | 0 | 24 | 0
                $2_1 = ($4_1 - $5_1) | 0
                if ($2_1 >>> 0 < 32 >>> 0) {
                  break label$1
                }
                i64toi32_i32$0 = 0
                i64toi32_i32$1 = 1
                i64toi32_i32$1 =
                  __wasm_i64_mul($1_1 | 0, i64toi32_i32$0 | 0, 1 | 0, i64toi32_i32$1 | 0) | 0
                i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
                $6_1 = i64toi32_i32$1
                $6$hi = i64toi32_i32$0
                $1_1 = ($3_1 + $5_1) | 0
                label$2: while (1) {
                  i64toi32_i32$0 = $6$hi
                  i64toi32_i32$1 = $1_1
                  HEAP32[(($1_1 + 24) | 0) >> 2] = $6_1
                  HEAP32[(($1_1 + 28) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = $1_1
                  HEAP32[(($1_1 + 16) | 0) >> 2] = $6_1
                  HEAP32[(($1_1 + 20) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = $1_1
                  HEAP32[(($1_1 + 8) | 0) >> 2] = $6_1
                  HEAP32[(($1_1 + 12) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = $1_1
                  HEAP32[$1_1 >> 2] = $6_1
                  HEAP32[(($1_1 + 4) | 0) >> 2] = i64toi32_i32$0
                  $1_1 = ($1_1 + 32) | 0
                  $2_1 = ($2_1 + -32) | 0
                  if ($2_1 >>> 0 > 31 >>> 0) {
                    continue label$2
                  }
                  break label$2
                }
              }
              return $0_1 | 0
            }

            function $9() {
              return (__wasm_memory_size() << 16) | 0 | 0
            }

            function $10() {
              return 68048 | 0
            }

            function $11($0_1) {
              $0_1 = $0_1 | 0
              var $1_1 = 0,
                $2_1 = 0
              $1_1 = HEAP32[((0 + 67880) | 0) >> 2] | 0
              $2_1 = ((($0_1 + 7) | 0) & -8) | 0
              $0_1 = ($1_1 + $2_1) | 0
              label$1: {
                label$2: {
                  label$3: {
                    if (!$2_1) {
                      break label$3
                    }
                    if ($0_1 >>> 0 <= $1_1 >>> 0) {
                      break label$2
                    }
                  }
                  if ($0_1 >>> 0 <= ($9() | 0) >>> 0) {
                    break label$1
                  }
                  if (fimport$8($0_1 | 0) | 0) {
                    break label$1
                  }
                }
                HEAP32[($10() | 0) >> 2] = 48
                return -1 | 0
              }
              HEAP32[((0 + 67880) | 0) >> 2] = $0_1
              return $1_1 | 0
            }

            function $12($0_1) {
              $0_1 = $0_1 | 0
              var $5_1 = 0,
                $4_1 = 0,
                $7_1 = 0,
                $8_1 = 0,
                $3_1 = 0,
                $2_1 = 0,
                $6_1 = 0,
                $10_1 = 0,
                $11_1 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$2 = 0,
                $1_1 = 0,
                $9_1 = 0,
                $79 = 0,
                $183 = 0,
                $782 = 0,
                $784 = 0
              $1_1 = (global$0 - 16) | 0
              global$0 = $1_1
              label$1: {
                label$2: {
                  label$3: {
                    label$4: {
                      label$5: {
                        label$6: {
                          label$7: {
                            label$8: {
                              label$9: {
                                label$10: {
                                  label$11: {
                                    if ($0_1 >>> 0 > 244 >>> 0) {
                                      break label$11
                                    }
                                    label$12: {
                                      $2_1 = HEAP32[((0 + 68052) | 0) >> 2] | 0
                                      $3_1 =
                                        $0_1 >>> 0 < 11 >>> 0 ? 16 : ((($0_1 + 11) | 0) & 504) | 0
                                      $4_1 = ($3_1 >>> 3) | 0
                                      $0_1 = ($2_1 >>> $4_1) | 0
                                      if (!(($0_1 & 3) | 0)) {
                                        break label$12
                                      }
                                      label$13: {
                                        label$14: {
                                          $3_1 = ((((($0_1 ^ -1) | 0) & 1) | 0) + $4_1) | 0
                                          $4_1 = ($3_1 << 3) | 0
                                          $0_1 = ($4_1 + 68092) | 0
                                          $4_1 = HEAP32[(($4_1 + 68100) | 0) >> 2] | 0
                                          $5_1 = HEAP32[(($4_1 + 8) | 0) >> 2] | 0
                                          if (($0_1 | 0) != ($5_1 | 0)) {
                                            break label$14
                                          }
                                          HEAP32[((0 + 68052) | 0) >> 2] =
                                            ($2_1 & (__wasm_rotl_i32(-2 | 0, $3_1 | 0) | 0)) | 0
                                          break label$13
                                        }
                                        HEAP32[(($5_1 + 12) | 0) >> 2] = $0_1
                                        HEAP32[(($0_1 + 8) | 0) >> 2] = $5_1
                                      }
                                      $0_1 = ($4_1 + 8) | 0
                                      $3_1 = ($3_1 << 3) | 0
                                      HEAP32[(($4_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                                      $4_1 = ($4_1 + $3_1) | 0
                                      HEAP32[(($4_1 + 4) | 0) >> 2] =
                                        HEAP32[(($4_1 + 4) | 0) >> 2] | 0 | 1 | 0
                                      break label$1
                                    }
                                    $6_1 = HEAP32[((0 + 68060) | 0) >> 2] | 0
                                    if ($3_1 >>> 0 <= $6_1 >>> 0) {
                                      break label$10
                                    }
                                    label$15: {
                                      if (!$0_1) {
                                        break label$15
                                      }
                                      label$16: {
                                        label$17: {
                                          $79 = ($0_1 << $4_1) | 0
                                          $0_1 = (2 << $4_1) | 0
                                          $4_1 =
                                            __wasm_ctz_i32(
                                              ($79 & ($0_1 | ((0 - $0_1) | 0) | 0)) | 0 | 0
                                            ) | 0
                                          $0_1 = ($4_1 << 3) | 0
                                          $5_1 = ($0_1 + 68092) | 0
                                          $0_1 = HEAP32[(($0_1 + 68100) | 0) >> 2] | 0
                                          $7_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                                          if (($5_1 | 0) != ($7_1 | 0)) {
                                            break label$17
                                          }
                                          $2_1 =
                                            ($2_1 & (__wasm_rotl_i32(-2 | 0, $4_1 | 0) | 0)) | 0
                                          HEAP32[((0 + 68052) | 0) >> 2] = $2_1
                                          break label$16
                                        }
                                        HEAP32[(($7_1 + 12) | 0) >> 2] = $5_1
                                        HEAP32[(($5_1 + 8) | 0) >> 2] = $7_1
                                      }
                                      HEAP32[(($0_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                                      $7_1 = ($0_1 + $3_1) | 0
                                      $4_1 = ($4_1 << 3) | 0
                                      $3_1 = ($4_1 - $3_1) | 0
                                      HEAP32[(($7_1 + 4) | 0) >> 2] = $3_1 | 1 | 0
                                      HEAP32[(($0_1 + $4_1) | 0) >> 2] = $3_1
                                      label$18: {
                                        if (!$6_1) {
                                          break label$18
                                        }
                                        $5_1 = ((($6_1 & -8) | 0) + 68092) | 0
                                        $4_1 = HEAP32[((0 + 68072) | 0) >> 2] | 0
                                        label$19: {
                                          label$20: {
                                            $8_1 = (1 << (($6_1 >>> 3) | 0)) | 0
                                            if (($2_1 & $8_1) | 0) {
                                              break label$20
                                            }
                                            HEAP32[((0 + 68052) | 0) >> 2] = $2_1 | $8_1 | 0
                                            $8_1 = $5_1
                                            break label$19
                                          }
                                          $8_1 = HEAP32[(($5_1 + 8) | 0) >> 2] | 0
                                        }
                                        HEAP32[(($5_1 + 8) | 0) >> 2] = $4_1
                                        HEAP32[(($8_1 + 12) | 0) >> 2] = $4_1
                                        HEAP32[(($4_1 + 12) | 0) >> 2] = $5_1
                                        HEAP32[(($4_1 + 8) | 0) >> 2] = $8_1
                                      }
                                      $0_1 = ($0_1 + 8) | 0
                                      HEAP32[((0 + 68072) | 0) >> 2] = $7_1
                                      HEAP32[((0 + 68060) | 0) >> 2] = $3_1
                                      break label$1
                                    }
                                    $9_1 = HEAP32[((0 + 68056) | 0) >> 2] | 0
                                    if (!$9_1) {
                                      break label$10
                                    }
                                    $7_1 =
                                      HEAP32[
                                        (((((__wasm_ctz_i32($9_1 | 0) | 0) << 2) | 0) + 68356) |
                                          0) >>
                                          2
                                      ] | 0
                                    $4_1 =
                                      ((((HEAP32[(($7_1 + 4) | 0) >> 2] | 0) & -8) | 0) - $3_1) | 0
                                    $5_1 = $7_1
                                    label$21: {
                                      label$22: while (1) {
                                        label$23: {
                                          $0_1 = HEAP32[(($5_1 + 16) | 0) >> 2] | 0
                                          if ($0_1) {
                                            break label$23
                                          }
                                          $0_1 = HEAP32[(($5_1 + 20) | 0) >> 2] | 0
                                          if (!$0_1) {
                                            break label$21
                                          }
                                        }
                                        $5_1 =
                                          ((((HEAP32[(($0_1 + 4) | 0) >> 2] | 0) & -8) | 0) -
                                            $3_1) |
                                          0
                                        $183 = $5_1
                                        $5_1 = $5_1 >>> 0 < $4_1 >>> 0
                                        $4_1 = $5_1 ? $183 : $4_1
                                        $7_1 = $5_1 ? $0_1 : $7_1
                                        $5_1 = $0_1
                                        continue label$22
                                      }
                                    }
                                    $10_1 = HEAP32[(($7_1 + 24) | 0) >> 2] | 0
                                    label$24: {
                                      $0_1 = HEAP32[(($7_1 + 12) | 0) >> 2] | 0
                                      if (($0_1 | 0) == ($7_1 | 0)) {
                                        break label$24
                                      }
                                      $5_1 = HEAP32[(($7_1 + 8) | 0) >> 2] | 0
                                      HEAP32[((0 + 68068) | 0) >> 2] | 0
                                      HEAP32[(($5_1 + 12) | 0) >> 2] = $0_1
                                      HEAP32[(($0_1 + 8) | 0) >> 2] = $5_1
                                      break label$2
                                    }
                                    label$25: {
                                      label$26: {
                                        $5_1 = HEAP32[(($7_1 + 20) | 0) >> 2] | 0
                                        if (!$5_1) {
                                          break label$26
                                        }
                                        $8_1 = ($7_1 + 20) | 0
                                        break label$25
                                      }
                                      $5_1 = HEAP32[(($7_1 + 16) | 0) >> 2] | 0
                                      if (!$5_1) {
                                        break label$9
                                      }
                                      $8_1 = ($7_1 + 16) | 0
                                    }
                                    label$27: while (1) {
                                      $11_1 = $8_1
                                      $0_1 = $5_1
                                      $8_1 = ($0_1 + 20) | 0
                                      $5_1 = HEAP32[(($0_1 + 20) | 0) >> 2] | 0
                                      if ($5_1) {
                                        continue label$27
                                      }
                                      $8_1 = ($0_1 + 16) | 0
                                      $5_1 = HEAP32[(($0_1 + 16) | 0) >> 2] | 0
                                      if ($5_1) {
                                        continue label$27
                                      }
                                      break label$27
                                    }
                                    HEAP32[$11_1 >> 2] = 0
                                    break label$2
                                  }
                                  $3_1 = -1
                                  if ($0_1 >>> 0 > -65 >>> 0) {
                                    break label$10
                                  }
                                  $0_1 = ($0_1 + 11) | 0
                                  $3_1 = ($0_1 & -8) | 0
                                  $10_1 = HEAP32[((0 + 68056) | 0) >> 2] | 0
                                  if (!$10_1) {
                                    break label$10
                                  }
                                  $6_1 = 0
                                  label$28: {
                                    if ($3_1 >>> 0 < 256 >>> 0) {
                                      break label$28
                                    }
                                    $6_1 = 31
                                    if ($3_1 >>> 0 > 16777215 >>> 0) {
                                      break label$28
                                    }
                                    $0_1 = Math_clz32(($0_1 >>> 8) | 0)
                                    $6_1 =
                                      ((((((($3_1 >>> ((38 - $0_1) | 0)) | 0) & 1) | 0) -
                                        (($0_1 << 1) | 0)) |
                                        0) +
                                        62) |
                                      0
                                  }
                                  $4_1 = (0 - $3_1) | 0
                                  label$29: {
                                    label$30: {
                                      label$31: {
                                        label$32: {
                                          $5_1 = HEAP32[(((($6_1 << 2) | 0) + 68356) | 0) >> 2] | 0
                                          if ($5_1) {
                                            break label$32
                                          }
                                          $0_1 = 0
                                          $8_1 = 0
                                          break label$31
                                        }
                                        $0_1 = 0
                                        $7_1 =
                                          ($3_1 <<
                                            (($6_1 | 0) == (31 | 0)
                                              ? 0
                                              : (25 - (($6_1 >>> 1) | 0)) | 0)) |
                                          0
                                        $8_1 = 0
                                        label$33: while (1) {
                                          label$34: {
                                            $2_1 =
                                              ((((HEAP32[(($5_1 + 4) | 0) >> 2] | 0) & -8) | 0) -
                                                $3_1) |
                                              0
                                            if ($2_1 >>> 0 >= $4_1 >>> 0) {
                                              break label$34
                                            }
                                            $4_1 = $2_1
                                            $8_1 = $5_1
                                            if ($4_1) {
                                              break label$34
                                            }
                                            $4_1 = 0
                                            $8_1 = $5_1
                                            $0_1 = $5_1
                                            break label$30
                                          }
                                          $2_1 = HEAP32[(($5_1 + 20) | 0) >> 2] | 0
                                          $11_1 =
                                            HEAP32[
                                              (((($5_1 + (((($7_1 >>> 29) | 0) & 4) | 0)) | 0) +
                                                16) |
                                                0) >>
                                                2
                                            ] | 0
                                          $0_1 = $2_1
                                            ? ($2_1 | 0) == ($11_1 | 0)
                                              ? $0_1
                                              : $2_1
                                            : $0_1
                                          $7_1 = ($7_1 << 1) | 0
                                          $5_1 = $11_1
                                          if ($5_1) {
                                            continue label$33
                                          }
                                          break label$33
                                        }
                                      }
                                      label$35: {
                                        if ($0_1 | $8_1 | 0) {
                                          break label$35
                                        }
                                        $8_1 = 0
                                        $0_1 = (2 << $6_1) | 0
                                        $0_1 = (($0_1 | ((0 - $0_1) | 0) | 0) & $10_1) | 0
                                        if (!$0_1) {
                                          break label$10
                                        }
                                        $0_1 =
                                          HEAP32[
                                            (((((__wasm_ctz_i32($0_1 | 0) | 0) << 2) | 0) + 68356) |
                                              0) >>
                                              2
                                          ] | 0
                                      }
                                      if (!$0_1) {
                                        break label$29
                                      }
                                    }
                                    label$36: while (1) {
                                      $2_1 =
                                        ((((HEAP32[(($0_1 + 4) | 0) >> 2] | 0) & -8) | 0) - $3_1) |
                                        0
                                      $7_1 = $2_1 >>> 0 < $4_1 >>> 0
                                      label$37: {
                                        $5_1 = HEAP32[(($0_1 + 16) | 0) >> 2] | 0
                                        if ($5_1) {
                                          break label$37
                                        }
                                        $5_1 = HEAP32[(($0_1 + 20) | 0) >> 2] | 0
                                      }
                                      $4_1 = $7_1 ? $2_1 : $4_1
                                      $8_1 = $7_1 ? $0_1 : $8_1
                                      $0_1 = $5_1
                                      if ($0_1) {
                                        continue label$36
                                      }
                                      break label$36
                                    }
                                  }
                                  if (!$8_1) {
                                    break label$10
                                  }
                                  if (
                                    $4_1 >>> 0 >=
                                    (((HEAP32[((0 + 68060) | 0) >> 2] | 0) - $3_1) | 0) >>> 0
                                  ) {
                                    break label$10
                                  }
                                  $11_1 = HEAP32[(($8_1 + 24) | 0) >> 2] | 0
                                  label$38: {
                                    $0_1 = HEAP32[(($8_1 + 12) | 0) >> 2] | 0
                                    if (($0_1 | 0) == ($8_1 | 0)) {
                                      break label$38
                                    }
                                    $5_1 = HEAP32[(($8_1 + 8) | 0) >> 2] | 0
                                    HEAP32[((0 + 68068) | 0) >> 2] | 0
                                    HEAP32[(($5_1 + 12) | 0) >> 2] = $0_1
                                    HEAP32[(($0_1 + 8) | 0) >> 2] = $5_1
                                    break label$3
                                  }
                                  label$39: {
                                    label$40: {
                                      $5_1 = HEAP32[(($8_1 + 20) | 0) >> 2] | 0
                                      if (!$5_1) {
                                        break label$40
                                      }
                                      $7_1 = ($8_1 + 20) | 0
                                      break label$39
                                    }
                                    $5_1 = HEAP32[(($8_1 + 16) | 0) >> 2] | 0
                                    if (!$5_1) {
                                      break label$8
                                    }
                                    $7_1 = ($8_1 + 16) | 0
                                  }
                                  label$41: while (1) {
                                    $2_1 = $7_1
                                    $0_1 = $5_1
                                    $7_1 = ($0_1 + 20) | 0
                                    $5_1 = HEAP32[(($0_1 + 20) | 0) >> 2] | 0
                                    if ($5_1) {
                                      continue label$41
                                    }
                                    $7_1 = ($0_1 + 16) | 0
                                    $5_1 = HEAP32[(($0_1 + 16) | 0) >> 2] | 0
                                    if ($5_1) {
                                      continue label$41
                                    }
                                    break label$41
                                  }
                                  HEAP32[$2_1 >> 2] = 0
                                  break label$3
                                }
                                label$42: {
                                  $0_1 = HEAP32[((0 + 68060) | 0) >> 2] | 0
                                  if ($0_1 >>> 0 < $3_1 >>> 0) {
                                    break label$42
                                  }
                                  $4_1 = HEAP32[((0 + 68072) | 0) >> 2] | 0
                                  label$43: {
                                    label$44: {
                                      $5_1 = ($0_1 - $3_1) | 0
                                      if ($5_1 >>> 0 < 16 >>> 0) {
                                        break label$44
                                      }
                                      $7_1 = ($4_1 + $3_1) | 0
                                      HEAP32[(($7_1 + 4) | 0) >> 2] = $5_1 | 1 | 0
                                      HEAP32[(($4_1 + $0_1) | 0) >> 2] = $5_1
                                      HEAP32[(($4_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                                      break label$43
                                    }
                                    HEAP32[(($4_1 + 4) | 0) >> 2] = $0_1 | 3 | 0
                                    $0_1 = ($4_1 + $0_1) | 0
                                    HEAP32[(($0_1 + 4) | 0) >> 2] =
                                      HEAP32[(($0_1 + 4) | 0) >> 2] | 0 | 1 | 0
                                    $7_1 = 0
                                    $5_1 = 0
                                  }
                                  HEAP32[((0 + 68060) | 0) >> 2] = $5_1
                                  HEAP32[((0 + 68072) | 0) >> 2] = $7_1
                                  $0_1 = ($4_1 + 8) | 0
                                  break label$1
                                }
                                label$45: {
                                  $7_1 = HEAP32[((0 + 68064) | 0) >> 2] | 0
                                  if ($7_1 >>> 0 <= $3_1 >>> 0) {
                                    break label$45
                                  }
                                  $4_1 = ($7_1 - $3_1) | 0
                                  HEAP32[((0 + 68064) | 0) >> 2] = $4_1
                                  $0_1 = HEAP32[((0 + 68076) | 0) >> 2] | 0
                                  $5_1 = ($0_1 + $3_1) | 0
                                  HEAP32[((0 + 68076) | 0) >> 2] = $5_1
                                  HEAP32[(($5_1 + 4) | 0) >> 2] = $4_1 | 1 | 0
                                  HEAP32[(($0_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                                  $0_1 = ($0_1 + 8) | 0
                                  break label$1
                                }
                                label$46: {
                                  label$47: {
                                    if (!(HEAP32[((0 + 68524) | 0) >> 2] | 0)) {
                                      break label$47
                                    }
                                    $4_1 = HEAP32[((0 + 68532) | 0) >> 2] | 0
                                    break label$46
                                  }
                                  i64toi32_i32$1 = 0
                                  i64toi32_i32$0 = -1
                                  HEAP32[((i64toi32_i32$1 + 68536) | 0) >> 2] = -1
                                  HEAP32[((i64toi32_i32$1 + 68540) | 0) >> 2] = i64toi32_i32$0
                                  i64toi32_i32$1 = 0
                                  i64toi32_i32$0 = 4096
                                  HEAP32[((i64toi32_i32$1 + 68528) | 0) >> 2] = 4096
                                  HEAP32[((i64toi32_i32$1 + 68532) | 0) >> 2] = i64toi32_i32$0
                                  HEAP32[((0 + 68524) | 0) >> 2] =
                                    ((((($1_1 + 12) | 0) & -16) | 0) ^ 1431655768) | 0
                                  HEAP32[((0 + 68544) | 0) >> 2] = 0
                                  HEAP32[((0 + 68496) | 0) >> 2] = 0
                                  $4_1 = 4096
                                }
                                $0_1 = 0
                                $6_1 = ($3_1 + 47) | 0
                                $2_1 = ($4_1 + $6_1) | 0
                                $11_1 = (0 - $4_1) | 0
                                $8_1 = ($2_1 & $11_1) | 0
                                if ($8_1 >>> 0 <= $3_1 >>> 0) {
                                  break label$1
                                }
                                $0_1 = 0
                                label$48: {
                                  $4_1 = HEAP32[((0 + 68492) | 0) >> 2] | 0
                                  if (!$4_1) {
                                    break label$48
                                  }
                                  $5_1 = HEAP32[((0 + 68484) | 0) >> 2] | 0
                                  $10_1 = ($5_1 + $8_1) | 0
                                  if ($10_1 >>> 0 <= $5_1 >>> 0) {
                                    break label$1
                                  }
                                  if ($10_1 >>> 0 > $4_1 >>> 0) {
                                    break label$1
                                  }
                                }
                                label$49: {
                                  label$50: {
                                    if (((HEAPU8[((0 + 68496) | 0) >> 0] | 0) & 4) | 0) {
                                      break label$50
                                    }
                                    label$51: {
                                      label$52: {
                                        label$53: {
                                          label$54: {
                                            label$55: {
                                              $4_1 = HEAP32[((0 + 68076) | 0) >> 2] | 0
                                              if (!$4_1) {
                                                break label$55
                                              }
                                              $0_1 = 68500
                                              label$56: while (1) {
                                                label$57: {
                                                  $5_1 = HEAP32[$0_1 >> 2] | 0
                                                  if ($5_1 >>> 0 > $4_1 >>> 0) {
                                                    break label$57
                                                  }
                                                  if (
                                                    (($5_1 + (HEAP32[(($0_1 + 4) | 0) >> 2] | 0)) |
                                                      0) >>>
                                                      0 >
                                                    $4_1 >>> 0
                                                  ) {
                                                    break label$54
                                                  }
                                                }
                                                $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                                                if ($0_1) {
                                                  continue label$56
                                                }
                                                break label$56
                                              }
                                            }
                                            $7_1 = $11(0 | 0) | 0
                                            if (($7_1 | 0) == (-1 | 0)) {
                                              break label$51
                                            }
                                            $2_1 = $8_1
                                            label$58: {
                                              $0_1 = HEAP32[((0 + 68528) | 0) >> 2] | 0
                                              $4_1 = ($0_1 + -1) | 0
                                              if (!(($4_1 & $7_1) | 0)) {
                                                break label$58
                                              }
                                              $2_1 =
                                                ((($8_1 - $7_1) | 0) +
                                                  (((($4_1 + $7_1) | 0) & ((0 - $0_1) | 0)) | 0)) |
                                                0
                                            }
                                            if ($2_1 >>> 0 <= $3_1 >>> 0) {
                                              break label$51
                                            }
                                            label$59: {
                                              $0_1 = HEAP32[((0 + 68492) | 0) >> 2] | 0
                                              if (!$0_1) {
                                                break label$59
                                              }
                                              $4_1 = HEAP32[((0 + 68484) | 0) >> 2] | 0
                                              $5_1 = ($4_1 + $2_1) | 0
                                              if ($5_1 >>> 0 <= $4_1 >>> 0) {
                                                break label$51
                                              }
                                              if ($5_1 >>> 0 > $0_1 >>> 0) {
                                                break label$51
                                              }
                                            }
                                            $0_1 = $11($2_1 | 0) | 0
                                            if (($0_1 | 0) != ($7_1 | 0)) {
                                              break label$53
                                            }
                                            break label$49
                                          }
                                          $2_1 = ((($2_1 - $7_1) | 0) & $11_1) | 0
                                          $7_1 = $11($2_1 | 0) | 0
                                          if (
                                            ($7_1 | 0) ==
                                            (((HEAP32[$0_1 >> 2] | 0) +
                                              (HEAP32[(($0_1 + 4) | 0) >> 2] | 0)) |
                                              0 |
                                              0)
                                          ) {
                                            break label$52
                                          }
                                          $0_1 = $7_1
                                        }
                                        if (($0_1 | 0) == (-1 | 0)) {
                                          break label$51
                                        }
                                        label$60: {
                                          if ($2_1 >>> 0 < (($3_1 + 48) | 0) >>> 0) {
                                            break label$60
                                          }
                                          $7_1 = $0_1
                                          break label$49
                                        }
                                        $4_1 = HEAP32[((0 + 68532) | 0) >> 2] | 0
                                        $4_1 =
                                          ((((($6_1 - $2_1) | 0) + $4_1) | 0) & ((0 - $4_1) | 0)) |
                                          0
                                        if (($11($4_1 | 0) | 0 | 0) == (-1 | 0)) {
                                          break label$51
                                        }
                                        $2_1 = ($4_1 + $2_1) | 0
                                        $7_1 = $0_1
                                        break label$49
                                      }
                                      if (($7_1 | 0) != (-1 | 0)) {
                                        break label$49
                                      }
                                    }
                                    HEAP32[((0 + 68496) | 0) >> 2] =
                                      HEAP32[((0 + 68496) | 0) >> 2] | 0 | 4 | 0
                                  }
                                  $7_1 = $11($8_1 | 0) | 0
                                  $0_1 = $11(0 | 0) | 0
                                  if (($7_1 | 0) == (-1 | 0)) {
                                    break label$5
                                  }
                                  if (($0_1 | 0) == (-1 | 0)) {
                                    break label$5
                                  }
                                  if ($7_1 >>> 0 >= $0_1 >>> 0) {
                                    break label$5
                                  }
                                  $2_1 = ($0_1 - $7_1) | 0
                                  if ($2_1 >>> 0 <= (($3_1 + 40) | 0) >>> 0) {
                                    break label$5
                                  }
                                }
                                $0_1 = ((HEAP32[((0 + 68484) | 0) >> 2] | 0) + $2_1) | 0
                                HEAP32[((0 + 68484) | 0) >> 2] = $0_1
                                label$61: {
                                  if ($0_1 >>> 0 <= (HEAP32[((0 + 68488) | 0) >> 2] | 0) >>> 0) {
                                    break label$61
                                  }
                                  HEAP32[((0 + 68488) | 0) >> 2] = $0_1
                                }
                                label$62: {
                                  label$63: {
                                    $4_1 = HEAP32[((0 + 68076) | 0) >> 2] | 0
                                    if (!$4_1) {
                                      break label$63
                                    }
                                    $0_1 = 68500
                                    label$64: while (1) {
                                      $5_1 = HEAP32[$0_1 >> 2] | 0
                                      $8_1 = HEAP32[(($0_1 + 4) | 0) >> 2] | 0
                                      if (($7_1 | 0) == (($5_1 + $8_1) | 0 | 0)) {
                                        break label$62
                                      }
                                      $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                                      if ($0_1) {
                                        continue label$64
                                      }
                                      break label$7
                                    }
                                  }
                                  label$65: {
                                    label$66: {
                                      $0_1 = HEAP32[((0 + 68068) | 0) >> 2] | 0
                                      if (!$0_1) {
                                        break label$66
                                      }
                                      if ($7_1 >>> 0 >= $0_1 >>> 0) {
                                        break label$65
                                      }
                                    }
                                    HEAP32[((0 + 68068) | 0) >> 2] = $7_1
                                  }
                                  $0_1 = 0
                                  HEAP32[((0 + 68504) | 0) >> 2] = $2_1
                                  HEAP32[((0 + 68500) | 0) >> 2] = $7_1
                                  HEAP32[((0 + 68084) | 0) >> 2] = -1
                                  HEAP32[((0 + 68088) | 0) >> 2] =
                                    HEAP32[((0 + 68524) | 0) >> 2] | 0
                                  HEAP32[((0 + 68512) | 0) >> 2] = 0
                                  label$67: while (1) {
                                    $4_1 = ($0_1 << 3) | 0
                                    $5_1 = ($4_1 + 68092) | 0
                                    HEAP32[(($4_1 + 68100) | 0) >> 2] = $5_1
                                    HEAP32[(($4_1 + 68104) | 0) >> 2] = $5_1
                                    $0_1 = ($0_1 + 1) | 0
                                    if (($0_1 | 0) != (32 | 0)) {
                                      continue label$67
                                    }
                                    break label$67
                                  }
                                  $0_1 = ($2_1 + -40) | 0
                                  $4_1 = (((-8 - $7_1) | 0) & 7) | 0
                                  $5_1 = ($0_1 - $4_1) | 0
                                  HEAP32[((0 + 68064) | 0) >> 2] = $5_1
                                  $4_1 = ($7_1 + $4_1) | 0
                                  HEAP32[((0 + 68076) | 0) >> 2] = $4_1
                                  HEAP32[(($4_1 + 4) | 0) >> 2] = $5_1 | 1 | 0
                                  HEAP32[(((($7_1 + $0_1) | 0) + 4) | 0) >> 2] = 40
                                  HEAP32[((0 + 68080) | 0) >> 2] =
                                    HEAP32[((0 + 68540) | 0) >> 2] | 0
                                  break label$6
                                }
                                if ($4_1 >>> 0 >= $7_1 >>> 0) {
                                  break label$7
                                }
                                if ($4_1 >>> 0 < $5_1 >>> 0) {
                                  break label$7
                                }
                                if (((HEAP32[(($0_1 + 12) | 0) >> 2] | 0) & 8) | 0) {
                                  break label$7
                                }
                                HEAP32[(($0_1 + 4) | 0) >> 2] = ($8_1 + $2_1) | 0
                                $0_1 = (((-8 - $4_1) | 0) & 7) | 0
                                $5_1 = ($4_1 + $0_1) | 0
                                HEAP32[((0 + 68076) | 0) >> 2] = $5_1
                                $7_1 = ((HEAP32[((0 + 68064) | 0) >> 2] | 0) + $2_1) | 0
                                $0_1 = ($7_1 - $0_1) | 0
                                HEAP32[((0 + 68064) | 0) >> 2] = $0_1
                                HEAP32[(($5_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                                HEAP32[(((($4_1 + $7_1) | 0) + 4) | 0) >> 2] = 40
                                HEAP32[((0 + 68080) | 0) >> 2] = HEAP32[((0 + 68540) | 0) >> 2] | 0
                                break label$6
                              }
                              $0_1 = 0
                              break label$2
                            }
                            $0_1 = 0
                            break label$3
                          }
                          label$68: {
                            if ($7_1 >>> 0 >= (HEAP32[((0 + 68068) | 0) >> 2] | 0) >>> 0) {
                              break label$68
                            }
                            HEAP32[((0 + 68068) | 0) >> 2] = $7_1
                          }
                          $5_1 = ($7_1 + $2_1) | 0
                          $0_1 = 68500
                          label$69: {
                            label$70: {
                              label$71: while (1) {
                                if ((HEAP32[$0_1 >> 2] | 0 | 0) == ($5_1 | 0)) {
                                  break label$70
                                }
                                $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                                if ($0_1) {
                                  continue label$71
                                }
                                break label$69
                              }
                            }
                            if (!(((HEAPU8[(($0_1 + 12) | 0) >> 0] | 0) & 8) | 0)) {
                              break label$4
                            }
                          }
                          $0_1 = 68500
                          label$72: {
                            label$73: while (1) {
                              label$74: {
                                $5_1 = HEAP32[$0_1 >> 2] | 0
                                if ($5_1 >>> 0 > $4_1 >>> 0) {
                                  break label$74
                                }
                                $5_1 = ($5_1 + (HEAP32[(($0_1 + 4) | 0) >> 2] | 0)) | 0
                                if ($5_1 >>> 0 > $4_1 >>> 0) {
                                  break label$72
                                }
                              }
                              $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                              continue label$73
                            }
                          }
                          $0_1 = ($2_1 + -40) | 0
                          $8_1 = (((-8 - $7_1) | 0) & 7) | 0
                          $11_1 = ($0_1 - $8_1) | 0
                          HEAP32[((0 + 68064) | 0) >> 2] = $11_1
                          $8_1 = ($7_1 + $8_1) | 0
                          HEAP32[((0 + 68076) | 0) >> 2] = $8_1
                          HEAP32[(($8_1 + 4) | 0) >> 2] = $11_1 | 1 | 0
                          HEAP32[(((($7_1 + $0_1) | 0) + 4) | 0) >> 2] = 40
                          HEAP32[((0 + 68080) | 0) >> 2] = HEAP32[((0 + 68540) | 0) >> 2] | 0
                          $0_1 = ((($5_1 + ((((39 - $5_1) | 0) & 7) | 0)) | 0) + -47) | 0
                          $8_1 = $0_1 >>> 0 < (($4_1 + 16) | 0) >>> 0 ? $4_1 : $0_1
                          HEAP32[(($8_1 + 4) | 0) >> 2] = 27
                          i64toi32_i32$2 = 0
                          i64toi32_i32$0 = HEAP32[((i64toi32_i32$2 + 68508) | 0) >> 2] | 0
                          i64toi32_i32$1 = HEAP32[((i64toi32_i32$2 + 68512) | 0) >> 2] | 0
                          $782 = i64toi32_i32$0
                          i64toi32_i32$0 = ($8_1 + 16) | 0
                          HEAP32[i64toi32_i32$0 >> 2] = $782
                          HEAP32[((i64toi32_i32$0 + 4) | 0) >> 2] = i64toi32_i32$1
                          i64toi32_i32$2 = 0
                          i64toi32_i32$1 = HEAP32[((i64toi32_i32$2 + 68500) | 0) >> 2] | 0
                          i64toi32_i32$0 = HEAP32[((i64toi32_i32$2 + 68504) | 0) >> 2] | 0
                          $784 = i64toi32_i32$1
                          i64toi32_i32$1 = $8_1
                          HEAP32[(($8_1 + 8) | 0) >> 2] = $784
                          HEAP32[(($8_1 + 12) | 0) >> 2] = i64toi32_i32$0
                          HEAP32[((0 + 68508) | 0) >> 2] = ($8_1 + 8) | 0
                          HEAP32[((0 + 68504) | 0) >> 2] = $2_1
                          HEAP32[((0 + 68500) | 0) >> 2] = $7_1
                          HEAP32[((0 + 68512) | 0) >> 2] = 0
                          $0_1 = ($8_1 + 24) | 0
                          label$75: while (1) {
                            HEAP32[(($0_1 + 4) | 0) >> 2] = 7
                            $7_1 = ($0_1 + 8) | 0
                            $0_1 = ($0_1 + 4) | 0
                            if ($7_1 >>> 0 < $5_1 >>> 0) {
                              continue label$75
                            }
                            break label$75
                          }
                          if (($8_1 | 0) == ($4_1 | 0)) {
                            break label$6
                          }
                          HEAP32[(($8_1 + 4) | 0) >> 2] =
                            ((HEAP32[(($8_1 + 4) | 0) >> 2] | 0) & -2) | 0
                          $7_1 = ($8_1 - $4_1) | 0
                          HEAP32[(($4_1 + 4) | 0) >> 2] = $7_1 | 1 | 0
                          HEAP32[$8_1 >> 2] = $7_1
                          label$76: {
                            label$77: {
                              if ($7_1 >>> 0 > 255 >>> 0) {
                                break label$77
                              }
                              $0_1 = ((($7_1 & -8) | 0) + 68092) | 0
                              label$78: {
                                label$79: {
                                  $5_1 = HEAP32[((0 + 68052) | 0) >> 2] | 0
                                  $7_1 = (1 << (($7_1 >>> 3) | 0)) | 0
                                  if (($5_1 & $7_1) | 0) {
                                    break label$79
                                  }
                                  HEAP32[((0 + 68052) | 0) >> 2] = $5_1 | $7_1 | 0
                                  $5_1 = $0_1
                                  break label$78
                                }
                                $5_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                              }
                              HEAP32[(($0_1 + 8) | 0) >> 2] = $4_1
                              HEAP32[(($5_1 + 12) | 0) >> 2] = $4_1
                              $7_1 = 12
                              $8_1 = 8
                              break label$76
                            }
                            $0_1 = 31
                            label$80: {
                              if ($7_1 >>> 0 > 16777215 >>> 0) {
                                break label$80
                              }
                              $0_1 = Math_clz32(($7_1 >>> 8) | 0)
                              $0_1 =
                                ((((((($7_1 >>> ((38 - $0_1) | 0)) | 0) & 1) | 0) -
                                  (($0_1 << 1) | 0)) |
                                  0) +
                                  62) |
                                0
                            }
                            HEAP32[(($4_1 + 28) | 0) >> 2] = $0_1
                            i64toi32_i32$1 = $4_1
                            i64toi32_i32$0 = 0
                            HEAP32[(($4_1 + 16) | 0) >> 2] = 0
                            HEAP32[(($4_1 + 20) | 0) >> 2] = i64toi32_i32$0
                            $5_1 = ((($0_1 << 2) | 0) + 68356) | 0
                            label$81: {
                              label$82: {
                                label$83: {
                                  $8_1 = HEAP32[((0 + 68056) | 0) >> 2] | 0
                                  $2_1 = (1 << $0_1) | 0
                                  if (($8_1 & $2_1) | 0) {
                                    break label$83
                                  }
                                  HEAP32[((0 + 68056) | 0) >> 2] = $8_1 | $2_1 | 0
                                  HEAP32[$5_1 >> 2] = $4_1
                                  HEAP32[(($4_1 + 24) | 0) >> 2] = $5_1
                                  break label$82
                                }
                                $0_1 =
                                  ($7_1 <<
                                    (($0_1 | 0) == (31 | 0) ? 0 : (25 - (($0_1 >>> 1) | 0)) | 0)) |
                                  0
                                $8_1 = HEAP32[$5_1 >> 2] | 0
                                label$84: while (1) {
                                  $5_1 = $8_1
                                  if (
                                    (((HEAP32[(($5_1 + 4) | 0) >> 2] | 0) & -8) | 0 | 0) ==
                                    ($7_1 | 0)
                                  ) {
                                    break label$81
                                  }
                                  $8_1 = ($0_1 >>> 29) | 0
                                  $0_1 = ($0_1 << 1) | 0
                                  $2_1 = ((($5_1 + (($8_1 & 4) | 0)) | 0) + 16) | 0
                                  $8_1 = HEAP32[$2_1 >> 2] | 0
                                  if ($8_1) {
                                    continue label$84
                                  }
                                  break label$84
                                }
                                HEAP32[$2_1 >> 2] = $4_1
                                HEAP32[(($4_1 + 24) | 0) >> 2] = $5_1
                              }
                              $7_1 = 8
                              $8_1 = 12
                              $5_1 = $4_1
                              $0_1 = $4_1
                              break label$76
                            }
                            $0_1 = HEAP32[(($5_1 + 8) | 0) >> 2] | 0
                            HEAP32[(($0_1 + 12) | 0) >> 2] = $4_1
                            HEAP32[(($5_1 + 8) | 0) >> 2] = $4_1
                            HEAP32[(($4_1 + 8) | 0) >> 2] = $0_1
                            $0_1 = 0
                            $7_1 = 24
                            $8_1 = 12
                          }
                          HEAP32[(($4_1 + $8_1) | 0) >> 2] = $5_1
                          HEAP32[(($4_1 + $7_1) | 0) >> 2] = $0_1
                        }
                        $0_1 = HEAP32[((0 + 68064) | 0) >> 2] | 0
                        if ($0_1 >>> 0 <= $3_1 >>> 0) {
                          break label$5
                        }
                        $4_1 = ($0_1 - $3_1) | 0
                        HEAP32[((0 + 68064) | 0) >> 2] = $4_1
                        $0_1 = HEAP32[((0 + 68076) | 0) >> 2] | 0
                        $5_1 = ($0_1 + $3_1) | 0
                        HEAP32[((0 + 68076) | 0) >> 2] = $5_1
                        HEAP32[(($5_1 + 4) | 0) >> 2] = $4_1 | 1 | 0
                        HEAP32[(($0_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                        $0_1 = ($0_1 + 8) | 0
                        break label$1
                      }
                      HEAP32[($10() | 0) >> 2] = 48
                      $0_1 = 0
                      break label$1
                    }
                    HEAP32[$0_1 >> 2] = $7_1
                    HEAP32[(($0_1 + 4) | 0) >> 2] = ((HEAP32[(($0_1 + 4) | 0) >> 2] | 0) + $2_1) | 0
                    $0_1 = $13($7_1 | 0, $5_1 | 0, $3_1 | 0) | 0
                    break label$1
                  }
                  label$85: {
                    if (!$11_1) {
                      break label$85
                    }
                    label$86: {
                      label$87: {
                        $7_1 = HEAP32[(($8_1 + 28) | 0) >> 2] | 0
                        $5_1 = ((($7_1 << 2) | 0) + 68356) | 0
                        if (($8_1 | 0) != (HEAP32[$5_1 >> 2] | 0 | 0)) {
                          break label$87
                        }
                        HEAP32[$5_1 >> 2] = $0_1
                        if ($0_1) {
                          break label$86
                        }
                        $10_1 = ($10_1 & (__wasm_rotl_i32(-2 | 0, $7_1 | 0) | 0)) | 0
                        HEAP32[((0 + 68056) | 0) >> 2] = $10_1
                        break label$85
                      }
                      HEAP32[
                        (($11_1 +
                          ((HEAP32[(($11_1 + 16) | 0) >> 2] | 0 | 0) == ($8_1 | 0) ? 16 : 20)) |
                          0) >>
                          2
                      ] = $0_1
                      if (!$0_1) {
                        break label$85
                      }
                    }
                    HEAP32[(($0_1 + 24) | 0) >> 2] = $11_1
                    label$88: {
                      $5_1 = HEAP32[(($8_1 + 16) | 0) >> 2] | 0
                      if (!$5_1) {
                        break label$88
                      }
                      HEAP32[(($0_1 + 16) | 0) >> 2] = $5_1
                      HEAP32[(($5_1 + 24) | 0) >> 2] = $0_1
                    }
                    $5_1 = HEAP32[(($8_1 + 20) | 0) >> 2] | 0
                    if (!$5_1) {
                      break label$85
                    }
                    HEAP32[(($0_1 + 20) | 0) >> 2] = $5_1
                    HEAP32[(($5_1 + 24) | 0) >> 2] = $0_1
                  }
                  label$89: {
                    label$90: {
                      if ($4_1 >>> 0 > 15 >>> 0) {
                        break label$90
                      }
                      $0_1 = ($4_1 + $3_1) | 0
                      HEAP32[(($8_1 + 4) | 0) >> 2] = $0_1 | 3 | 0
                      $0_1 = ($8_1 + $0_1) | 0
                      HEAP32[(($0_1 + 4) | 0) >> 2] = HEAP32[(($0_1 + 4) | 0) >> 2] | 0 | 1 | 0
                      break label$89
                    }
                    HEAP32[(($8_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                    $7_1 = ($8_1 + $3_1) | 0
                    HEAP32[(($7_1 + 4) | 0) >> 2] = $4_1 | 1 | 0
                    HEAP32[(($7_1 + $4_1) | 0) >> 2] = $4_1
                    label$91: {
                      if ($4_1 >>> 0 > 255 >>> 0) {
                        break label$91
                      }
                      $0_1 = ((($4_1 & -8) | 0) + 68092) | 0
                      label$92: {
                        label$93: {
                          $3_1 = HEAP32[((0 + 68052) | 0) >> 2] | 0
                          $4_1 = (1 << (($4_1 >>> 3) | 0)) | 0
                          if (($3_1 & $4_1) | 0) {
                            break label$93
                          }
                          HEAP32[((0 + 68052) | 0) >> 2] = $3_1 | $4_1 | 0
                          $4_1 = $0_1
                          break label$92
                        }
                        $4_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                      }
                      HEAP32[(($0_1 + 8) | 0) >> 2] = $7_1
                      HEAP32[(($4_1 + 12) | 0) >> 2] = $7_1
                      HEAP32[(($7_1 + 12) | 0) >> 2] = $0_1
                      HEAP32[(($7_1 + 8) | 0) >> 2] = $4_1
                      break label$89
                    }
                    $0_1 = 31
                    label$94: {
                      if ($4_1 >>> 0 > 16777215 >>> 0) {
                        break label$94
                      }
                      $0_1 = Math_clz32(($4_1 >>> 8) | 0)
                      $0_1 =
                        ((((((($4_1 >>> ((38 - $0_1) | 0)) | 0) & 1) | 0) - (($0_1 << 1) | 0)) |
                          0) +
                          62) |
                        0
                    }
                    HEAP32[(($7_1 + 28) | 0) >> 2] = $0_1
                    i64toi32_i32$1 = $7_1
                    i64toi32_i32$0 = 0
                    HEAP32[(($7_1 + 16) | 0) >> 2] = 0
                    HEAP32[(($7_1 + 20) | 0) >> 2] = i64toi32_i32$0
                    $3_1 = ((($0_1 << 2) | 0) + 68356) | 0
                    label$95: {
                      label$96: {
                        label$97: {
                          $5_1 = (1 << $0_1) | 0
                          if (($10_1 & $5_1) | 0) {
                            break label$97
                          }
                          HEAP32[((0 + 68056) | 0) >> 2] = $10_1 | $5_1 | 0
                          HEAP32[$3_1 >> 2] = $7_1
                          HEAP32[(($7_1 + 24) | 0) >> 2] = $3_1
                          break label$96
                        }
                        $0_1 =
                          ($4_1 << (($0_1 | 0) == (31 | 0) ? 0 : (25 - (($0_1 >>> 1) | 0)) | 0)) | 0
                        $5_1 = HEAP32[$3_1 >> 2] | 0
                        label$98: while (1) {
                          $3_1 = $5_1
                          if ((((HEAP32[(($5_1 + 4) | 0) >> 2] | 0) & -8) | 0 | 0) == ($4_1 | 0)) {
                            break label$95
                          }
                          $5_1 = ($0_1 >>> 29) | 0
                          $0_1 = ($0_1 << 1) | 0
                          $2_1 = ((($3_1 + (($5_1 & 4) | 0)) | 0) + 16) | 0
                          $5_1 = HEAP32[$2_1 >> 2] | 0
                          if ($5_1) {
                            continue label$98
                          }
                          break label$98
                        }
                        HEAP32[$2_1 >> 2] = $7_1
                        HEAP32[(($7_1 + 24) | 0) >> 2] = $3_1
                      }
                      HEAP32[(($7_1 + 12) | 0) >> 2] = $7_1
                      HEAP32[(($7_1 + 8) | 0) >> 2] = $7_1
                      break label$89
                    }
                    $0_1 = HEAP32[(($3_1 + 8) | 0) >> 2] | 0
                    HEAP32[(($0_1 + 12) | 0) >> 2] = $7_1
                    HEAP32[(($3_1 + 8) | 0) >> 2] = $7_1
                    HEAP32[(($7_1 + 24) | 0) >> 2] = 0
                    HEAP32[(($7_1 + 12) | 0) >> 2] = $3_1
                    HEAP32[(($7_1 + 8) | 0) >> 2] = $0_1
                  }
                  $0_1 = ($8_1 + 8) | 0
                  break label$1
                }
                label$99: {
                  if (!$10_1) {
                    break label$99
                  }
                  label$100: {
                    label$101: {
                      $8_1 = HEAP32[(($7_1 + 28) | 0) >> 2] | 0
                      $5_1 = ((($8_1 << 2) | 0) + 68356) | 0
                      if (($7_1 | 0) != (HEAP32[$5_1 >> 2] | 0 | 0)) {
                        break label$101
                      }
                      HEAP32[$5_1 >> 2] = $0_1
                      if ($0_1) {
                        break label$100
                      }
                      HEAP32[((0 + 68056) | 0) >> 2] =
                        ($9_1 & (__wasm_rotl_i32(-2 | 0, $8_1 | 0) | 0)) | 0
                      break label$99
                    }
                    HEAP32[
                      (($10_1 +
                        ((HEAP32[(($10_1 + 16) | 0) >> 2] | 0 | 0) == ($7_1 | 0) ? 16 : 20)) |
                        0) >>
                        2
                    ] = $0_1
                    if (!$0_1) {
                      break label$99
                    }
                  }
                  HEAP32[(($0_1 + 24) | 0) >> 2] = $10_1
                  label$102: {
                    $5_1 = HEAP32[(($7_1 + 16) | 0) >> 2] | 0
                    if (!$5_1) {
                      break label$102
                    }
                    HEAP32[(($0_1 + 16) | 0) >> 2] = $5_1
                    HEAP32[(($5_1 + 24) | 0) >> 2] = $0_1
                  }
                  $5_1 = HEAP32[(($7_1 + 20) | 0) >> 2] | 0
                  if (!$5_1) {
                    break label$99
                  }
                  HEAP32[(($0_1 + 20) | 0) >> 2] = $5_1
                  HEAP32[(($5_1 + 24) | 0) >> 2] = $0_1
                }
                label$103: {
                  label$104: {
                    if ($4_1 >>> 0 > 15 >>> 0) {
                      break label$104
                    }
                    $0_1 = ($4_1 + $3_1) | 0
                    HEAP32[(($7_1 + 4) | 0) >> 2] = $0_1 | 3 | 0
                    $0_1 = ($7_1 + $0_1) | 0
                    HEAP32[(($0_1 + 4) | 0) >> 2] = HEAP32[(($0_1 + 4) | 0) >> 2] | 0 | 1 | 0
                    break label$103
                  }
                  HEAP32[(($7_1 + 4) | 0) >> 2] = $3_1 | 3 | 0
                  $3_1 = ($7_1 + $3_1) | 0
                  HEAP32[(($3_1 + 4) | 0) >> 2] = $4_1 | 1 | 0
                  HEAP32[(($3_1 + $4_1) | 0) >> 2] = $4_1
                  label$105: {
                    if (!$6_1) {
                      break label$105
                    }
                    $5_1 = ((($6_1 & -8) | 0) + 68092) | 0
                    $0_1 = HEAP32[((0 + 68072) | 0) >> 2] | 0
                    label$106: {
                      label$107: {
                        $8_1 = (1 << (($6_1 >>> 3) | 0)) | 0
                        if (($8_1 & $2_1) | 0) {
                          break label$107
                        }
                        HEAP32[((0 + 68052) | 0) >> 2] = $8_1 | $2_1 | 0
                        $8_1 = $5_1
                        break label$106
                      }
                      $8_1 = HEAP32[(($5_1 + 8) | 0) >> 2] | 0
                    }
                    HEAP32[(($5_1 + 8) | 0) >> 2] = $0_1
                    HEAP32[(($8_1 + 12) | 0) >> 2] = $0_1
                    HEAP32[(($0_1 + 12) | 0) >> 2] = $5_1
                    HEAP32[(($0_1 + 8) | 0) >> 2] = $8_1
                  }
                  HEAP32[((0 + 68072) | 0) >> 2] = $3_1
                  HEAP32[((0 + 68060) | 0) >> 2] = $4_1
                }
                $0_1 = ($7_1 + 8) | 0
              }
              global$0 = ($1_1 + 16) | 0
              return $0_1 | 0
            }

            function $13($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              var $4_1 = 0,
                $5_1 = 0,
                $7_1 = 0,
                $8_1 = 0,
                $9_1 = 0,
                $3_1 = 0,
                $6_1 = 0
              $3_1 = ($0_1 + ((((-8 - $0_1) | 0) & 7) | 0)) | 0
              HEAP32[(($3_1 + 4) | 0) >> 2] = $2_1 | 3 | 0
              $4_1 = ($1_1 + ((((-8 - $1_1) | 0) & 7) | 0)) | 0
              $5_1 = ($3_1 + $2_1) | 0
              $0_1 = ($4_1 - $5_1) | 0
              label$1: {
                label$2: {
                  if (($4_1 | 0) != (HEAP32[((0 + 68076) | 0) >> 2] | 0 | 0)) {
                    break label$2
                  }
                  HEAP32[((0 + 68076) | 0) >> 2] = $5_1
                  $2_1 = ((HEAP32[((0 + 68064) | 0) >> 2] | 0) + $0_1) | 0
                  HEAP32[((0 + 68064) | 0) >> 2] = $2_1
                  HEAP32[(($5_1 + 4) | 0) >> 2] = $2_1 | 1 | 0
                  break label$1
                }
                label$3: {
                  if (($4_1 | 0) != (HEAP32[((0 + 68072) | 0) >> 2] | 0 | 0)) {
                    break label$3
                  }
                  HEAP32[((0 + 68072) | 0) >> 2] = $5_1
                  $2_1 = ((HEAP32[((0 + 68060) | 0) >> 2] | 0) + $0_1) | 0
                  HEAP32[((0 + 68060) | 0) >> 2] = $2_1
                  HEAP32[(($5_1 + 4) | 0) >> 2] = $2_1 | 1 | 0
                  HEAP32[(($5_1 + $2_1) | 0) >> 2] = $2_1
                  break label$1
                }
                label$4: {
                  $1_1 = HEAP32[(($4_1 + 4) | 0) >> 2] | 0
                  if ((($1_1 & 3) | 0 | 0) != (1 | 0)) {
                    break label$4
                  }
                  $6_1 = ($1_1 & -8) | 0
                  $2_1 = HEAP32[(($4_1 + 12) | 0) >> 2] | 0
                  label$5: {
                    label$6: {
                      if ($1_1 >>> 0 > 255 >>> 0) {
                        break label$6
                      }
                      $7_1 = HEAP32[(($4_1 + 8) | 0) >> 2] | 0
                      $8_1 = ($1_1 >>> 3) | 0
                      $1_1 = ((($8_1 << 3) | 0) + 68092) | 0
                      label$7: {
                        if (($2_1 | 0) != ($7_1 | 0)) {
                          break label$7
                        }
                        HEAP32[((0 + 68052) | 0) >> 2] =
                          ((HEAP32[((0 + 68052) | 0) >> 2] | 0) &
                            (__wasm_rotl_i32(-2 | 0, $8_1 | 0) | 0)) |
                          0
                        break label$5
                      }
                      HEAP32[(($7_1 + 12) | 0) >> 2] = $2_1
                      HEAP32[(($2_1 + 8) | 0) >> 2] = $7_1
                      break label$5
                    }
                    $9_1 = HEAP32[(($4_1 + 24) | 0) >> 2] | 0
                    label$8: {
                      label$9: {
                        if (($2_1 | 0) == ($4_1 | 0)) {
                          break label$9
                        }
                        $1_1 = HEAP32[(($4_1 + 8) | 0) >> 2] | 0
                        HEAP32[((0 + 68068) | 0) >> 2] | 0
                        HEAP32[(($1_1 + 12) | 0) >> 2] = $2_1
                        HEAP32[(($2_1 + 8) | 0) >> 2] = $1_1
                        break label$8
                      }
                      label$10: {
                        label$11: {
                          label$12: {
                            $1_1 = HEAP32[(($4_1 + 20) | 0) >> 2] | 0
                            if (!$1_1) {
                              break label$12
                            }
                            $7_1 = ($4_1 + 20) | 0
                            break label$11
                          }
                          $1_1 = HEAP32[(($4_1 + 16) | 0) >> 2] | 0
                          if (!$1_1) {
                            break label$10
                          }
                          $7_1 = ($4_1 + 16) | 0
                        }
                        label$13: while (1) {
                          $8_1 = $7_1
                          $2_1 = $1_1
                          $7_1 = ($2_1 + 20) | 0
                          $1_1 = HEAP32[(($2_1 + 20) | 0) >> 2] | 0
                          if ($1_1) {
                            continue label$13
                          }
                          $7_1 = ($2_1 + 16) | 0
                          $1_1 = HEAP32[(($2_1 + 16) | 0) >> 2] | 0
                          if ($1_1) {
                            continue label$13
                          }
                          break label$13
                        }
                        HEAP32[$8_1 >> 2] = 0
                        break label$8
                      }
                      $2_1 = 0
                    }
                    if (!$9_1) {
                      break label$5
                    }
                    label$14: {
                      label$15: {
                        $7_1 = HEAP32[(($4_1 + 28) | 0) >> 2] | 0
                        $1_1 = ((($7_1 << 2) | 0) + 68356) | 0
                        if (($4_1 | 0) != (HEAP32[$1_1 >> 2] | 0 | 0)) {
                          break label$15
                        }
                        HEAP32[$1_1 >> 2] = $2_1
                        if ($2_1) {
                          break label$14
                        }
                        HEAP32[((0 + 68056) | 0) >> 2] =
                          ((HEAP32[((0 + 68056) | 0) >> 2] | 0) &
                            (__wasm_rotl_i32(-2 | 0, $7_1 | 0) | 0)) |
                          0
                        break label$5
                      }
                      HEAP32[
                        (($9_1 +
                          ((HEAP32[(($9_1 + 16) | 0) >> 2] | 0 | 0) == ($4_1 | 0) ? 16 : 20)) |
                          0) >>
                          2
                      ] = $2_1
                      if (!$2_1) {
                        break label$5
                      }
                    }
                    HEAP32[(($2_1 + 24) | 0) >> 2] = $9_1
                    label$16: {
                      $1_1 = HEAP32[(($4_1 + 16) | 0) >> 2] | 0
                      if (!$1_1) {
                        break label$16
                      }
                      HEAP32[(($2_1 + 16) | 0) >> 2] = $1_1
                      HEAP32[(($1_1 + 24) | 0) >> 2] = $2_1
                    }
                    $1_1 = HEAP32[(($4_1 + 20) | 0) >> 2] | 0
                    if (!$1_1) {
                      break label$5
                    }
                    HEAP32[(($2_1 + 20) | 0) >> 2] = $1_1
                    HEAP32[(($1_1 + 24) | 0) >> 2] = $2_1
                  }
                  $0_1 = ($6_1 + $0_1) | 0
                  $4_1 = ($4_1 + $6_1) | 0
                  $1_1 = HEAP32[(($4_1 + 4) | 0) >> 2] | 0
                }
                HEAP32[(($4_1 + 4) | 0) >> 2] = ($1_1 & -2) | 0
                HEAP32[(($5_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                HEAP32[(($5_1 + $0_1) | 0) >> 2] = $0_1
                label$17: {
                  if ($0_1 >>> 0 > 255 >>> 0) {
                    break label$17
                  }
                  $2_1 = ((($0_1 & -8) | 0) + 68092) | 0
                  label$18: {
                    label$19: {
                      $1_1 = HEAP32[((0 + 68052) | 0) >> 2] | 0
                      $0_1 = (1 << (($0_1 >>> 3) | 0)) | 0
                      if (($1_1 & $0_1) | 0) {
                        break label$19
                      }
                      HEAP32[((0 + 68052) | 0) >> 2] = $1_1 | $0_1 | 0
                      $0_1 = $2_1
                      break label$18
                    }
                    $0_1 = HEAP32[(($2_1 + 8) | 0) >> 2] | 0
                  }
                  HEAP32[(($2_1 + 8) | 0) >> 2] = $5_1
                  HEAP32[(($0_1 + 12) | 0) >> 2] = $5_1
                  HEAP32[(($5_1 + 12) | 0) >> 2] = $2_1
                  HEAP32[(($5_1 + 8) | 0) >> 2] = $0_1
                  break label$1
                }
                $2_1 = 31
                label$20: {
                  if ($0_1 >>> 0 > 16777215 >>> 0) {
                    break label$20
                  }
                  $2_1 = Math_clz32(($0_1 >>> 8) | 0)
                  $2_1 =
                    ((((((($0_1 >>> ((38 - $2_1) | 0)) | 0) & 1) | 0) - (($2_1 << 1) | 0)) | 0) +
                      62) |
                    0
                }
                HEAP32[(($5_1 + 28) | 0) >> 2] = $2_1
                HEAP32[(($5_1 + 16) | 0) >> 2] = 0
                HEAP32[(($5_1 + 20) | 0) >> 2] = 0
                $1_1 = ((($2_1 << 2) | 0) + 68356) | 0
                label$21: {
                  label$22: {
                    label$23: {
                      $7_1 = HEAP32[((0 + 68056) | 0) >> 2] | 0
                      $4_1 = (1 << $2_1) | 0
                      if (($7_1 & $4_1) | 0) {
                        break label$23
                      }
                      HEAP32[((0 + 68056) | 0) >> 2] = $7_1 | $4_1 | 0
                      HEAP32[$1_1 >> 2] = $5_1
                      HEAP32[(($5_1 + 24) | 0) >> 2] = $1_1
                      break label$22
                    }
                    $2_1 =
                      ($0_1 << (($2_1 | 0) == (31 | 0) ? 0 : (25 - (($2_1 >>> 1) | 0)) | 0)) | 0
                    $7_1 = HEAP32[$1_1 >> 2] | 0
                    label$24: while (1) {
                      $1_1 = $7_1
                      if ((((HEAP32[(($1_1 + 4) | 0) >> 2] | 0) & -8) | 0 | 0) == ($0_1 | 0)) {
                        break label$21
                      }
                      $7_1 = ($2_1 >>> 29) | 0
                      $2_1 = ($2_1 << 1) | 0
                      $4_1 = ((($1_1 + (($7_1 & 4) | 0)) | 0) + 16) | 0
                      $7_1 = HEAP32[$4_1 >> 2] | 0
                      if ($7_1) {
                        continue label$24
                      }
                      break label$24
                    }
                    HEAP32[$4_1 >> 2] = $5_1
                    HEAP32[(($5_1 + 24) | 0) >> 2] = $1_1
                  }
                  HEAP32[(($5_1 + 12) | 0) >> 2] = $5_1
                  HEAP32[(($5_1 + 8) | 0) >> 2] = $5_1
                  break label$1
                }
                $2_1 = HEAP32[(($1_1 + 8) | 0) >> 2] | 0
                HEAP32[(($2_1 + 12) | 0) >> 2] = $5_1
                HEAP32[(($1_1 + 8) | 0) >> 2] = $5_1
                HEAP32[(($5_1 + 24) | 0) >> 2] = 0
                HEAP32[(($5_1 + 12) | 0) >> 2] = $1_1
                HEAP32[(($5_1 + 8) | 0) >> 2] = $2_1
              }
              return ($3_1 + 8) | 0 | 0
            }

            function $14($0_1) {
              $0_1 = $0_1 | 0
              var $4_1 = 0,
                $2_1 = 0,
                $1_1 = 0,
                $5_1 = 0,
                $3_1 = 0,
                $6_1 = 0,
                $7_1 = 0
              label$1: {
                if (!$0_1) {
                  break label$1
                }
                $1_1 = ($0_1 + -8) | 0
                $2_1 = HEAP32[(($0_1 + -4) | 0) >> 2] | 0
                $0_1 = ($2_1 & -8) | 0
                $3_1 = ($1_1 + $0_1) | 0
                label$2: {
                  if (($2_1 & 1) | 0) {
                    break label$2
                  }
                  if (!(($2_1 & 2) | 0)) {
                    break label$1
                  }
                  $4_1 = HEAP32[$1_1 >> 2] | 0
                  $1_1 = ($1_1 - $4_1) | 0
                  $5_1 = HEAP32[((0 + 68068) | 0) >> 2] | 0
                  if ($1_1 >>> 0 < $5_1 >>> 0) {
                    break label$1
                  }
                  $0_1 = ($4_1 + $0_1) | 0
                  label$3: {
                    label$4: {
                      label$5: {
                        if (($1_1 | 0) == (HEAP32[((0 + 68072) | 0) >> 2] | 0 | 0)) {
                          break label$5
                        }
                        $2_1 = HEAP32[(($1_1 + 12) | 0) >> 2] | 0
                        label$6: {
                          if ($4_1 >>> 0 > 255 >>> 0) {
                            break label$6
                          }
                          $5_1 = HEAP32[(($1_1 + 8) | 0) >> 2] | 0
                          $6_1 = ($4_1 >>> 3) | 0
                          $4_1 = ((($6_1 << 3) | 0) + 68092) | 0
                          label$7: {
                            if (($2_1 | 0) != ($5_1 | 0)) {
                              break label$7
                            }
                            HEAP32[((0 + 68052) | 0) >> 2] =
                              ((HEAP32[((0 + 68052) | 0) >> 2] | 0) &
                                (__wasm_rotl_i32(-2 | 0, $6_1 | 0) | 0)) |
                              0
                            break label$2
                          }
                          HEAP32[(($5_1 + 12) | 0) >> 2] = $2_1
                          HEAP32[(($2_1 + 8) | 0) >> 2] = $5_1
                          break label$2
                        }
                        $7_1 = HEAP32[(($1_1 + 24) | 0) >> 2] | 0
                        label$8: {
                          if (($2_1 | 0) == ($1_1 | 0)) {
                            break label$8
                          }
                          $4_1 = HEAP32[(($1_1 + 8) | 0) >> 2] | 0
                          HEAP32[(($4_1 + 12) | 0) >> 2] = $2_1
                          HEAP32[(($2_1 + 8) | 0) >> 2] = $4_1
                          break label$3
                        }
                        label$9: {
                          label$10: {
                            $4_1 = HEAP32[(($1_1 + 20) | 0) >> 2] | 0
                            if (!$4_1) {
                              break label$10
                            }
                            $5_1 = ($1_1 + 20) | 0
                            break label$9
                          }
                          $4_1 = HEAP32[(($1_1 + 16) | 0) >> 2] | 0
                          if (!$4_1) {
                            break label$4
                          }
                          $5_1 = ($1_1 + 16) | 0
                        }
                        label$11: while (1) {
                          $6_1 = $5_1
                          $2_1 = $4_1
                          $5_1 = ($2_1 + 20) | 0
                          $4_1 = HEAP32[(($2_1 + 20) | 0) >> 2] | 0
                          if ($4_1) {
                            continue label$11
                          }
                          $5_1 = ($2_1 + 16) | 0
                          $4_1 = HEAP32[(($2_1 + 16) | 0) >> 2] | 0
                          if ($4_1) {
                            continue label$11
                          }
                          break label$11
                        }
                        HEAP32[$6_1 >> 2] = 0
                        break label$3
                      }
                      $2_1 = HEAP32[(($3_1 + 4) | 0) >> 2] | 0
                      if ((($2_1 & 3) | 0 | 0) != (3 | 0)) {
                        break label$2
                      }
                      HEAP32[((0 + 68060) | 0) >> 2] = $0_1
                      HEAP32[(($3_1 + 4) | 0) >> 2] = ($2_1 & -2) | 0
                      HEAP32[(($1_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                      HEAP32[$3_1 >> 2] = $0_1
                      return
                    }
                    $2_1 = 0
                  }
                  if (!$7_1) {
                    break label$2
                  }
                  label$12: {
                    label$13: {
                      $5_1 = HEAP32[(($1_1 + 28) | 0) >> 2] | 0
                      $4_1 = ((($5_1 << 2) | 0) + 68356) | 0
                      if (($1_1 | 0) != (HEAP32[$4_1 >> 2] | 0 | 0)) {
                        break label$13
                      }
                      HEAP32[$4_1 >> 2] = $2_1
                      if ($2_1) {
                        break label$12
                      }
                      HEAP32[((0 + 68056) | 0) >> 2] =
                        ((HEAP32[((0 + 68056) | 0) >> 2] | 0) &
                          (__wasm_rotl_i32(-2 | 0, $5_1 | 0) | 0)) |
                        0
                      break label$2
                    }
                    HEAP32[
                      (($7_1 + ((HEAP32[(($7_1 + 16) | 0) >> 2] | 0 | 0) == ($1_1 | 0) ? 16 : 20)) |
                        0) >>
                        2
                    ] = $2_1
                    if (!$2_1) {
                      break label$2
                    }
                  }
                  HEAP32[(($2_1 + 24) | 0) >> 2] = $7_1
                  label$14: {
                    $4_1 = HEAP32[(($1_1 + 16) | 0) >> 2] | 0
                    if (!$4_1) {
                      break label$14
                    }
                    HEAP32[(($2_1 + 16) | 0) >> 2] = $4_1
                    HEAP32[(($4_1 + 24) | 0) >> 2] = $2_1
                  }
                  $4_1 = HEAP32[(($1_1 + 20) | 0) >> 2] | 0
                  if (!$4_1) {
                    break label$2
                  }
                  HEAP32[(($2_1 + 20) | 0) >> 2] = $4_1
                  HEAP32[(($4_1 + 24) | 0) >> 2] = $2_1
                }
                if ($1_1 >>> 0 >= $3_1 >>> 0) {
                  break label$1
                }
                $4_1 = HEAP32[(($3_1 + 4) | 0) >> 2] | 0
                if (!(($4_1 & 1) | 0)) {
                  break label$1
                }
                label$15: {
                  label$16: {
                    label$17: {
                      label$18: {
                        label$19: {
                          if (($4_1 & 2) | 0) {
                            break label$19
                          }
                          label$20: {
                            if (($3_1 | 0) != (HEAP32[((0 + 68076) | 0) >> 2] | 0 | 0)) {
                              break label$20
                            }
                            HEAP32[((0 + 68076) | 0) >> 2] = $1_1
                            $0_1 = ((HEAP32[((0 + 68064) | 0) >> 2] | 0) + $0_1) | 0
                            HEAP32[((0 + 68064) | 0) >> 2] = $0_1
                            HEAP32[(($1_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                            if (($1_1 | 0) != (HEAP32[((0 + 68072) | 0) >> 2] | 0 | 0)) {
                              break label$1
                            }
                            HEAP32[((0 + 68060) | 0) >> 2] = 0
                            HEAP32[((0 + 68072) | 0) >> 2] = 0
                            return
                          }
                          label$21: {
                            if (($3_1 | 0) != (HEAP32[((0 + 68072) | 0) >> 2] | 0 | 0)) {
                              break label$21
                            }
                            HEAP32[((0 + 68072) | 0) >> 2] = $1_1
                            $0_1 = ((HEAP32[((0 + 68060) | 0) >> 2] | 0) + $0_1) | 0
                            HEAP32[((0 + 68060) | 0) >> 2] = $0_1
                            HEAP32[(($1_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                            HEAP32[(($1_1 + $0_1) | 0) >> 2] = $0_1
                            return
                          }
                          $0_1 = ((($4_1 & -8) | 0) + $0_1) | 0
                          $2_1 = HEAP32[(($3_1 + 12) | 0) >> 2] | 0
                          label$22: {
                            if ($4_1 >>> 0 > 255 >>> 0) {
                              break label$22
                            }
                            $5_1 = HEAP32[(($3_1 + 8) | 0) >> 2] | 0
                            $3_1 = ($4_1 >>> 3) | 0
                            $4_1 = ((($3_1 << 3) | 0) + 68092) | 0
                            label$23: {
                              if (($2_1 | 0) != ($5_1 | 0)) {
                                break label$23
                              }
                              HEAP32[((0 + 68052) | 0) >> 2] =
                                ((HEAP32[((0 + 68052) | 0) >> 2] | 0) &
                                  (__wasm_rotl_i32(-2 | 0, $3_1 | 0) | 0)) |
                                0
                              break label$16
                            }
                            HEAP32[(($5_1 + 12) | 0) >> 2] = $2_1
                            HEAP32[(($2_1 + 8) | 0) >> 2] = $5_1
                            break label$16
                          }
                          $7_1 = HEAP32[(($3_1 + 24) | 0) >> 2] | 0
                          label$24: {
                            if (($2_1 | 0) == ($3_1 | 0)) {
                              break label$24
                            }
                            $4_1 = HEAP32[(($3_1 + 8) | 0) >> 2] | 0
                            HEAP32[((0 + 68068) | 0) >> 2] | 0
                            HEAP32[(($4_1 + 12) | 0) >> 2] = $2_1
                            HEAP32[(($2_1 + 8) | 0) >> 2] = $4_1
                            break label$17
                          }
                          label$25: {
                            label$26: {
                              $4_1 = HEAP32[(($3_1 + 20) | 0) >> 2] | 0
                              if (!$4_1) {
                                break label$26
                              }
                              $5_1 = ($3_1 + 20) | 0
                              break label$25
                            }
                            $4_1 = HEAP32[(($3_1 + 16) | 0) >> 2] | 0
                            if (!$4_1) {
                              break label$18
                            }
                            $5_1 = ($3_1 + 16) | 0
                          }
                          label$27: while (1) {
                            $6_1 = $5_1
                            $2_1 = $4_1
                            $5_1 = ($2_1 + 20) | 0
                            $4_1 = HEAP32[(($2_1 + 20) | 0) >> 2] | 0
                            if ($4_1) {
                              continue label$27
                            }
                            $5_1 = ($2_1 + 16) | 0
                            $4_1 = HEAP32[(($2_1 + 16) | 0) >> 2] | 0
                            if ($4_1) {
                              continue label$27
                            }
                            break label$27
                          }
                          HEAP32[$6_1 >> 2] = 0
                          break label$17
                        }
                        HEAP32[(($3_1 + 4) | 0) >> 2] = ($4_1 & -2) | 0
                        HEAP32[(($1_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                        HEAP32[(($1_1 + $0_1) | 0) >> 2] = $0_1
                        break label$15
                      }
                      $2_1 = 0
                    }
                    if (!$7_1) {
                      break label$16
                    }
                    label$28: {
                      label$29: {
                        $5_1 = HEAP32[(($3_1 + 28) | 0) >> 2] | 0
                        $4_1 = ((($5_1 << 2) | 0) + 68356) | 0
                        if (($3_1 | 0) != (HEAP32[$4_1 >> 2] | 0 | 0)) {
                          break label$29
                        }
                        HEAP32[$4_1 >> 2] = $2_1
                        if ($2_1) {
                          break label$28
                        }
                        HEAP32[((0 + 68056) | 0) >> 2] =
                          ((HEAP32[((0 + 68056) | 0) >> 2] | 0) &
                            (__wasm_rotl_i32(-2 | 0, $5_1 | 0) | 0)) |
                          0
                        break label$16
                      }
                      HEAP32[
                        (($7_1 +
                          ((HEAP32[(($7_1 + 16) | 0) >> 2] | 0 | 0) == ($3_1 | 0) ? 16 : 20)) |
                          0) >>
                          2
                      ] = $2_1
                      if (!$2_1) {
                        break label$16
                      }
                    }
                    HEAP32[(($2_1 + 24) | 0) >> 2] = $7_1
                    label$30: {
                      $4_1 = HEAP32[(($3_1 + 16) | 0) >> 2] | 0
                      if (!$4_1) {
                        break label$30
                      }
                      HEAP32[(($2_1 + 16) | 0) >> 2] = $4_1
                      HEAP32[(($4_1 + 24) | 0) >> 2] = $2_1
                    }
                    $4_1 = HEAP32[(($3_1 + 20) | 0) >> 2] | 0
                    if (!$4_1) {
                      break label$16
                    }
                    HEAP32[(($2_1 + 20) | 0) >> 2] = $4_1
                    HEAP32[(($4_1 + 24) | 0) >> 2] = $2_1
                  }
                  HEAP32[(($1_1 + 4) | 0) >> 2] = $0_1 | 1 | 0
                  HEAP32[(($1_1 + $0_1) | 0) >> 2] = $0_1
                  if (($1_1 | 0) != (HEAP32[((0 + 68072) | 0) >> 2] | 0 | 0)) {
                    break label$15
                  }
                  HEAP32[((0 + 68060) | 0) >> 2] = $0_1
                  return
                }
                label$31: {
                  if ($0_1 >>> 0 > 255 >>> 0) {
                    break label$31
                  }
                  $2_1 = ((($0_1 & -8) | 0) + 68092) | 0
                  label$32: {
                    label$33: {
                      $4_1 = HEAP32[((0 + 68052) | 0) >> 2] | 0
                      $0_1 = (1 << (($0_1 >>> 3) | 0)) | 0
                      if (($4_1 & $0_1) | 0) {
                        break label$33
                      }
                      HEAP32[((0 + 68052) | 0) >> 2] = $4_1 | $0_1 | 0
                      $0_1 = $2_1
                      break label$32
                    }
                    $0_1 = HEAP32[(($2_1 + 8) | 0) >> 2] | 0
                  }
                  HEAP32[(($2_1 + 8) | 0) >> 2] = $1_1
                  HEAP32[(($0_1 + 12) | 0) >> 2] = $1_1
                  HEAP32[(($1_1 + 12) | 0) >> 2] = $2_1
                  HEAP32[(($1_1 + 8) | 0) >> 2] = $0_1
                  return
                }
                $2_1 = 31
                label$34: {
                  if ($0_1 >>> 0 > 16777215 >>> 0) {
                    break label$34
                  }
                  $2_1 = Math_clz32(($0_1 >>> 8) | 0)
                  $2_1 =
                    ((((((($0_1 >>> ((38 - $2_1) | 0)) | 0) & 1) | 0) - (($2_1 << 1) | 0)) | 0) +
                      62) |
                    0
                }
                HEAP32[(($1_1 + 28) | 0) >> 2] = $2_1
                HEAP32[(($1_1 + 16) | 0) >> 2] = 0
                HEAP32[(($1_1 + 20) | 0) >> 2] = 0
                $3_1 = ((($2_1 << 2) | 0) + 68356) | 0
                label$35: {
                  label$36: {
                    label$37: {
                      label$38: {
                        $4_1 = HEAP32[((0 + 68056) | 0) >> 2] | 0
                        $5_1 = (1 << $2_1) | 0
                        if (($4_1 & $5_1) | 0) {
                          break label$38
                        }
                        HEAP32[((0 + 68056) | 0) >> 2] = $4_1 | $5_1 | 0
                        $0_1 = 8
                        $2_1 = 24
                        $5_1 = $3_1
                        break label$37
                      }
                      $2_1 =
                        ($0_1 << (($2_1 | 0) == (31 | 0) ? 0 : (25 - (($2_1 >>> 1) | 0)) | 0)) | 0
                      $5_1 = HEAP32[$3_1 >> 2] | 0
                      label$39: while (1) {
                        $4_1 = $5_1
                        if ((((HEAP32[(($4_1 + 4) | 0) >> 2] | 0) & -8) | 0 | 0) == ($0_1 | 0)) {
                          break label$36
                        }
                        $5_1 = ($2_1 >>> 29) | 0
                        $2_1 = ($2_1 << 1) | 0
                        $3_1 = ((($4_1 + (($5_1 & 4) | 0)) | 0) + 16) | 0
                        $5_1 = HEAP32[$3_1 >> 2] | 0
                        if ($5_1) {
                          continue label$39
                        }
                        break label$39
                      }
                      $0_1 = 8
                      $2_1 = 24
                      $5_1 = $4_1
                    }
                    $4_1 = $1_1
                    $6_1 = $4_1
                    break label$35
                  }
                  $5_1 = HEAP32[(($4_1 + 8) | 0) >> 2] | 0
                  HEAP32[(($5_1 + 12) | 0) >> 2] = $1_1
                  $2_1 = 8
                  $3_1 = ($4_1 + 8) | 0
                  $6_1 = 0
                  $0_1 = 24
                }
                HEAP32[$3_1 >> 2] = $1_1
                HEAP32[(($1_1 + $2_1) | 0) >> 2] = $5_1
                HEAP32[(($1_1 + 12) | 0) >> 2] = $4_1
                HEAP32[(($1_1 + $0_1) | 0) >> 2] = $6_1
                $1_1 = ((HEAP32[((0 + 68084) | 0) >> 2] | 0) + -1) | 0
                HEAP32[((0 + 68084) | 0) >> 2] = $1_1 ? $1_1 : -1
              }
            }

            function $15($0_1) {
              $0_1 = $0_1 | 0
              $14($0_1 | 0)
            }

            function $16($0_1) {
              $0_1 = $0_1 | 0
              return $0_1 | 0
            }

            function $17($0_1) {
              $0_1 = $0_1 | 0
              return fimport$9($16(HEAP32[(($0_1 + 60) | 0) >> 2] | 0 | 0) | 0 | 0) | 0 | 0
            }

            function $18($0_1) {
              $0_1 = $0_1 | 0
              label$1: {
                if ($0_1) {
                  break label$1
                }
                return 0 | 0
              }
              HEAP32[($10() | 0) >> 2] = $0_1
              return -1 | 0
            }

            function $19($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              var $4_1 = 0,
                $3_1 = 0,
                $5_1 = 0,
                $8_1 = 0,
                $6_1 = 0,
                $7_1 = 0,
                $9_1 = 0
              $3_1 = (global$0 - 32) | 0
              global$0 = $3_1
              $4_1 = HEAP32[(($0_1 + 28) | 0) >> 2] | 0
              HEAP32[(($3_1 + 16) | 0) >> 2] = $4_1
              $5_1 = HEAP32[(($0_1 + 20) | 0) >> 2] | 0
              HEAP32[(($3_1 + 28) | 0) >> 2] = $2_1
              HEAP32[(($3_1 + 24) | 0) >> 2] = $1_1
              $1_1 = ($5_1 - $4_1) | 0
              HEAP32[(($3_1 + 20) | 0) >> 2] = $1_1
              $6_1 = ($1_1 + $2_1) | 0
              $4_1 = ($3_1 + 16) | 0
              $7_1 = 2
              label$1: {
                label$2: {
                  label$3: {
                    label$4: {
                      label$5: {
                        if (
                          !(
                            $18(
                              fimport$10(
                                HEAP32[(($0_1 + 60) | 0) >> 2] | 0 | 0,
                                ($3_1 + 16) | 0 | 0,
                                2 | 0,
                                ($3_1 + 12) | 0 | 0
                              ) |
                                0 |
                                0
                            ) | 0
                          )
                        ) {
                          break label$5
                        }
                        $5_1 = $4_1
                        break label$4
                      }
                      label$6: while (1) {
                        $1_1 = HEAP32[(($3_1 + 12) | 0) >> 2] | 0
                        if (($6_1 | 0) == ($1_1 | 0)) {
                          break label$3
                        }
                        label$7: {
                          if (($1_1 | 0) > (-1 | 0)) {
                            break label$7
                          }
                          $5_1 = $4_1
                          break label$2
                        }
                        $8_1 = HEAP32[(($4_1 + 4) | 0) >> 2] | 0
                        $9_1 = $1_1 >>> 0 > $8_1 >>> 0
                        $5_1 = ($4_1 + (($9_1 << 3) | 0)) | 0
                        $8_1 = ($1_1 - ($9_1 ? $8_1 : 0)) | 0
                        HEAP32[$5_1 >> 2] = ((HEAP32[$5_1 >> 2] | 0) + $8_1) | 0
                        $4_1 = ($4_1 + ($9_1 ? 12 : 4)) | 0
                        HEAP32[$4_1 >> 2] = ((HEAP32[$4_1 >> 2] | 0) - $8_1) | 0
                        $6_1 = ($6_1 - $1_1) | 0
                        $4_1 = $5_1
                        $7_1 = ($7_1 - $9_1) | 0
                        if (
                          !(
                            $18(
                              fimport$10(
                                HEAP32[(($0_1 + 60) | 0) >> 2] | 0 | 0,
                                $4_1 | 0,
                                $7_1 | 0,
                                ($3_1 + 12) | 0 | 0
                              ) |
                                0 |
                                0
                            ) | 0
                          )
                        ) {
                          continue label$6
                        }
                        break label$6
                      }
                    }
                    if (($6_1 | 0) != (-1 | 0)) {
                      break label$2
                    }
                  }
                  $1_1 = HEAP32[(($0_1 + 44) | 0) >> 2] | 0
                  HEAP32[(($0_1 + 28) | 0) >> 2] = $1_1
                  HEAP32[(($0_1 + 20) | 0) >> 2] = $1_1
                  HEAP32[(($0_1 + 16) | 0) >> 2] = ($1_1 + (HEAP32[(($0_1 + 48) | 0) >> 2] | 0)) | 0
                  $1_1 = $2_1
                  break label$1
                }
                $1_1 = 0
                HEAP32[(($0_1 + 28) | 0) >> 2] = 0
                HEAP32[(($0_1 + 16) | 0) >> 2] = 0
                HEAP32[(($0_1 + 20) | 0) >> 2] = 0
                HEAP32[$0_1 >> 2] = HEAP32[$0_1 >> 2] | 0 | 32 | 0
                if (($7_1 | 0) == (2 | 0)) {
                  break label$1
                }
                $1_1 = ($2_1 - (HEAP32[(($5_1 + 4) | 0) >> 2] | 0)) | 0
              }
              global$0 = ($3_1 + 32) | 0
              return $1_1 | 0
            }

            function $20($0_1, $1_1, $1$hi, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $1$hi = $1$hi | 0
              $2_1 = $2_1 | 0
              var i64toi32_i32$0 = 0,
                i64toi32_i32$2 = 0,
                $3_1 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$3 = 0
              $3_1 = (global$0 - 16) | 0
              global$0 = $3_1
              i64toi32_i32$0 = $1$hi
              $2_1 =
                $18(
                  $65(
                    $0_1 | 0,
                    $1_1 | 0,
                    i64toi32_i32$0 | 0,
                    ($2_1 & 255) | 0 | 0,
                    ($3_1 + 8) | 0 | 0
                  ) |
                    0 |
                    0
                ) | 0
              i64toi32_i32$2 = $3_1
              i64toi32_i32$0 = HEAP32[((i64toi32_i32$2 + 8) | 0) >> 2] | 0
              i64toi32_i32$1 = HEAP32[((i64toi32_i32$2 + 12) | 0) >> 2] | 0
              $1_1 = i64toi32_i32$0
              $1$hi = i64toi32_i32$1
              global$0 = (i64toi32_i32$2 + 16) | 0
              i64toi32_i32$1 = -1
              i64toi32_i32$0 = $1$hi
              i64toi32_i32$3 = $2_1 ? -1 : $1_1
              i64toi32_i32$2 = $2_1 ? i64toi32_i32$1 : i64toi32_i32$0
              i64toi32_i32$HIGH_BITS = i64toi32_i32$2
              return i64toi32_i32$3 | 0
            }

            function $21($0_1, $1_1, $1$hi, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $1$hi = $1$hi | 0
              $2_1 = $2_1 | 0
              var i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0
              i64toi32_i32$0 = $1$hi
              i64toi32_i32$0 =
                $20(
                  HEAP32[(($0_1 + 60) | 0) >> 2] | 0 | 0,
                  $1_1 | 0,
                  i64toi32_i32$0 | 0,
                  $2_1 | 0
                ) | 0
              i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
              i64toi32_i32$HIGH_BITS = i64toi32_i32$1
              return i64toi32_i32$0 | 0
            }

            function $22($0_1) {
              $0_1 = $0_1 | 0
            }

            function $23($0_1) {
              $0_1 = $0_1 | 0
            }

            function $24() {
              $22(68556 | 0)
              return 68560 | 0
            }

            function $25() {
              $23(68556 | 0)
            }

            function $26($0_1) {
              $0_1 = $0_1 | 0
              return 1 | 0
            }

            function $27($0_1) {
              $0_1 = $0_1 | 0
            }

            function $28($0_1, $1_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              var $3_1 = 0,
                $2_1 = 0
              $2_1 = HEAPU8[$1_1 >> 0] | 0
              label$1: {
                $3_1 = HEAPU8[$0_1 >> 0] | 0
                if (!$3_1) {
                  break label$1
                }
                if (($3_1 | 0) != (($2_1 & 255) | 0 | 0)) {
                  break label$1
                }
                label$2: while (1) {
                  $2_1 = HEAPU8[(($1_1 + 1) | 0) >> 0] | 0
                  $3_1 = HEAPU8[(($0_1 + 1) | 0) >> 0] | 0
                  if (!$3_1) {
                    break label$1
                  }
                  $1_1 = ($1_1 + 1) | 0
                  $0_1 = ($0_1 + 1) | 0
                  if (($3_1 | 0) == (($2_1 & 255) | 0 | 0)) {
                    continue label$2
                  }
                  break label$2
                }
              }
              return ($3_1 - (($2_1 & 255) | 0)) | 0 | 0
            }

            function $29($0_1) {
              $0_1 = $0_1 | 0
              return $50($0_1 | 0) | 0 | 0
            }

            function $30($0_1) {
              $0_1 = $0_1 | 0
            }

            function $31($0_1) {
              $0_1 = $0_1 | 0
            }

            function $32($0_1) {
              $0_1 = $0_1 | 0
              $15($29($0_1 | 0) | 0 | 0)
            }

            function $33($0_1) {
              $0_1 = $0_1 | 0
              $15($29($0_1 | 0) | 0 | 0)
            }

            function $34($0_1) {
              $0_1 = $0_1 | 0
              $15($29($0_1 | 0) | 0 | 0)
            }

            function $35($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              return $36($0_1 | 0, $1_1 | 0, 0 | 0) | 0 | 0
            }

            function $36($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              label$1: {
                if ($2_1) {
                  break label$1
                }
                return (
                  ((HEAP32[(($0_1 + 4) | 0) >> 2] | 0 | 0) ==
                    (HEAP32[(($1_1 + 4) | 0) >> 2] | 0 | 0)) |
                  0
                )
              }
              label$2: {
                if (($0_1 | 0) != ($1_1 | 0)) {
                  break label$2
                }
                return 1 | 0
              }
              return !($28($37($0_1 | 0) | 0 | 0, $37($1_1 | 0) | 0 | 0) | 0) | 0
            }

            function $37($0_1) {
              $0_1 = $0_1 | 0
              return HEAP32[(($0_1 + 4) | 0) >> 2] | 0 | 0
            }

            function $38($0_1, $1_1, $2_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              var $3_1 = 0,
                $4_1 = 0
              $3_1 = (global$0 - 64) | 0
              global$0 = $3_1
              $4_1 = 1
              label$1: {
                if ($36($0_1 | 0, $1_1 | 0, 0 | 0) | 0) {
                  break label$1
                }
                $4_1 = 0
                if (!$1_1) {
                  break label$1
                }
                $4_1 = 0
                $1_1 = $39($1_1 | 0, 67308 | 0, 67356 | 0, 0 | 0) | 0
                if (!$1_1) {
                  break label$1
                }
                $8(($3_1 + 12) | 0 | 0, 0 | 0, 52 | 0) | 0
                HEAP32[(($3_1 + 56) | 0) >> 2] = 1
                HEAP32[(($3_1 + 20) | 0) >> 2] = -1
                HEAP32[(($3_1 + 16) | 0) >> 2] = $0_1
                HEAP32[(($3_1 + 8) | 0) >> 2] = $1_1
                FUNCTION_TABLE[HEAP32[(((HEAP32[$1_1 >> 2] | 0) + 28) | 0) >> 2] | 0 | 0](
                  $1_1,
                  ($3_1 + 8) | 0,
                  HEAP32[$2_1 >> 2] | 0,
                  1
                )
                label$2: {
                  $4_1 = HEAP32[(($3_1 + 32) | 0) >> 2] | 0
                  if (($4_1 | 0) != (1 | 0)) {
                    break label$2
                  }
                  HEAP32[$2_1 >> 2] = HEAP32[(($3_1 + 24) | 0) >> 2] | 0
                }
                $4_1 = ($4_1 | 0) == (1 | 0)
              }
              global$0 = ($3_1 + 64) | 0
              return $4_1 | 0
            }

            function $39($0_1, $1_1, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              var $4_1 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$0 = 0,
                $5_1 = 0,
                $6_1 = 0,
                $9_1 = 0,
                $10_1 = 0,
                wasm2js_i32$0 = 0,
                wasm2js_i32$1 = 0,
                wasm2js_i32$2 = 0,
                wasm2js_i32$3 = 0,
                wasm2js_i32$4 = 0,
                wasm2js_i32$5 = 0,
                wasm2js_i32$6 = 0,
                wasm2js_i32$7 = 0,
                wasm2js_i32$8 = 0
              $4_1 = (global$0 - 112) | 0
              global$0 = $4_1
              $5_1 = HEAP32[$0_1 >> 2] | 0
              $6_1 = HEAP32[(($5_1 + -4) | 0) >> 2] | 0
              $5_1 = HEAP32[(($5_1 + -8) | 0) >> 2] | 0
              i64toi32_i32$1 = ($4_1 + 80) | 0
              i64toi32_i32$0 = 0
              HEAP32[i64toi32_i32$1 >> 2] = 0
              HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
              i64toi32_i32$1 = ($4_1 + 88) | 0
              i64toi32_i32$0 = 0
              HEAP32[i64toi32_i32$1 >> 2] = 0
              HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
              i64toi32_i32$1 = ($4_1 + 96) | 0
              i64toi32_i32$0 = 0
              HEAP32[i64toi32_i32$1 >> 2] = 0
              HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
              i64toi32_i32$1 = ($4_1 + 103) | 0
              i64toi32_i32$0 = 0
              $9_1 = 0
              HEAP8[i64toi32_i32$1 >> 0] = $9_1
              HEAP8[((i64toi32_i32$1 + 1) | 0) >> 0] = ($9_1 >>> 8) | 0
              HEAP8[((i64toi32_i32$1 + 2) | 0) >> 0] = ($9_1 >>> 16) | 0
              HEAP8[((i64toi32_i32$1 + 3) | 0) >> 0] = ($9_1 >>> 24) | 0
              HEAP8[((i64toi32_i32$1 + 4) | 0) >> 0] = i64toi32_i32$0
              HEAP8[((i64toi32_i32$1 + 5) | 0) >> 0] = (i64toi32_i32$0 >>> 8) | 0
              HEAP8[((i64toi32_i32$1 + 6) | 0) >> 0] = (i64toi32_i32$0 >>> 16) | 0
              HEAP8[((i64toi32_i32$1 + 7) | 0) >> 0] = (i64toi32_i32$0 >>> 24) | 0
              i64toi32_i32$1 = $4_1
              i64toi32_i32$0 = 0
              HEAP32[(($4_1 + 72) | 0) >> 2] = 0
              HEAP32[(($4_1 + 76) | 0) >> 2] = i64toi32_i32$0
              HEAP32[(($4_1 + 68) | 0) >> 2] = $3_1
              HEAP32[(($4_1 + 64) | 0) >> 2] = $1_1
              HEAP32[(($4_1 + 60) | 0) >> 2] = $0_1
              HEAP32[(($4_1 + 56) | 0) >> 2] = $2_1
              $1_1 = ($0_1 + $5_1) | 0
              label$1: {
                label$2: {
                  if (!($36($6_1 | 0, $2_1 | 0, 0 | 0) | 0)) {
                    break label$2
                  }
                  label$3: {
                    if (($3_1 | 0) < (0 | 0)) {
                      break label$3
                    }
                    $0_1 = ($5_1 | 0) == ((0 - $3_1) | 0 | 0) ? $1_1 : 0
                    break label$1
                  }
                  $0_1 = 0
                  if (($3_1 | 0) == (-2 | 0)) {
                    break label$1
                  }
                  HEAP32[(($4_1 + 104) | 0) >> 2] = 1
                  FUNCTION_TABLE[HEAP32[(((HEAP32[$6_1 >> 2] | 0) + 20) | 0) >> 2] | 0 | 0](
                    $6_1,
                    ($4_1 + 56) | 0,
                    $1_1,
                    $1_1,
                    1,
                    0
                  )
                  $0_1 = (HEAP32[(($4_1 + 80) | 0) >> 2] | 0 | 0) == (1 | 0) ? $1_1 : 0
                  break label$1
                }
                label$4: {
                  if (($3_1 | 0) < (0 | 0)) {
                    break label$4
                  }
                  $0_1 = ($0_1 - $3_1) | 0
                  if (($0_1 | 0) < ($1_1 | 0)) {
                    break label$4
                  }
                  i64toi32_i32$1 = ($4_1 + 47) | 0
                  i64toi32_i32$0 = 0
                  $10_1 = 0
                  HEAP8[i64toi32_i32$1 >> 0] = $10_1
                  HEAP8[((i64toi32_i32$1 + 1) | 0) >> 0] = ($10_1 >>> 8) | 0
                  HEAP8[((i64toi32_i32$1 + 2) | 0) >> 0] = ($10_1 >>> 16) | 0
                  HEAP8[((i64toi32_i32$1 + 3) | 0) >> 0] = ($10_1 >>> 24) | 0
                  HEAP8[((i64toi32_i32$1 + 4) | 0) >> 0] = i64toi32_i32$0
                  HEAP8[((i64toi32_i32$1 + 5) | 0) >> 0] = (i64toi32_i32$0 >>> 8) | 0
                  HEAP8[((i64toi32_i32$1 + 6) | 0) >> 0] = (i64toi32_i32$0 >>> 16) | 0
                  HEAP8[((i64toi32_i32$1 + 7) | 0) >> 0] = (i64toi32_i32$0 >>> 24) | 0
                  $5_1 = ($4_1 + 24) | 0
                  i64toi32_i32$1 = $5_1
                  i64toi32_i32$0 = 0
                  HEAP32[i64toi32_i32$1 >> 2] = 0
                  HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = ($4_1 + 32) | 0
                  i64toi32_i32$0 = 0
                  HEAP32[i64toi32_i32$1 >> 2] = 0
                  HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = ($4_1 + 40) | 0
                  i64toi32_i32$0 = 0
                  HEAP32[i64toi32_i32$1 >> 2] = 0
                  HEAP32[((i64toi32_i32$1 + 4) | 0) >> 2] = i64toi32_i32$0
                  i64toi32_i32$1 = $4_1
                  i64toi32_i32$0 = 0
                  HEAP32[(($4_1 + 16) | 0) >> 2] = 0
                  HEAP32[(($4_1 + 20) | 0) >> 2] = i64toi32_i32$0
                  HEAP32[(($4_1 + 12) | 0) >> 2] = $3_1
                  HEAP32[(($4_1 + 8) | 0) >> 2] = $2_1
                  HEAP32[(($4_1 + 4) | 0) >> 2] = $0_1
                  HEAP32[$4_1 >> 2] = $6_1
                  HEAP32[(($4_1 + 48) | 0) >> 2] = 1
                  FUNCTION_TABLE[HEAP32[(((HEAP32[$6_1 >> 2] | 0) + 20) | 0) >> 2] | 0 | 0](
                    $6_1,
                    $4_1,
                    $1_1,
                    $1_1,
                    1,
                    0
                  )
                  if (HEAP32[$5_1 >> 2] | 0) {
                    break label$1
                  }
                }
                $0_1 = 0
                FUNCTION_TABLE[HEAP32[(((HEAP32[$6_1 >> 2] | 0) + 24) | 0) >> 2] | 0 | 0](
                  $6_1,
                  ($4_1 + 56) | 0,
                  $1_1,
                  1,
                  0
                )
                label$5: {
                  switch (HEAP32[(($4_1 + 92) | 0) >> 2] | 0 | 0) {
                    case 0:
                      $0_1 =
                        ((wasm2js_i32$0 =
                          ((wasm2js_i32$3 =
                            ((wasm2js_i32$6 = HEAP32[(($4_1 + 76) | 0) >> 2] | 0),
                            (wasm2js_i32$7 = 0),
                            (wasm2js_i32$8 = (HEAP32[(($4_1 + 88) | 0) >> 2] | 0 | 0) == (1 | 0)),
                            wasm2js_i32$8 ? wasm2js_i32$6 : wasm2js_i32$7)),
                          (wasm2js_i32$4 = 0),
                          (wasm2js_i32$5 = (HEAP32[(($4_1 + 84) | 0) >> 2] | 0 | 0) == (1 | 0)),
                          wasm2js_i32$5 ? wasm2js_i32$3 : wasm2js_i32$4)),
                        (wasm2js_i32$1 = 0),
                        (wasm2js_i32$2 = (HEAP32[(($4_1 + 96) | 0) >> 2] | 0 | 0) == (1 | 0)),
                        wasm2js_i32$2 ? wasm2js_i32$0 : wasm2js_i32$1)
                      break label$1
                    case 1:
                      break label$5
                    default:
                      break label$1
                  }
                }
                label$7: {
                  if ((HEAP32[(($4_1 + 80) | 0) >> 2] | 0 | 0) == (1 | 0)) {
                    break label$7
                  }
                  if (HEAP32[(($4_1 + 96) | 0) >> 2] | 0) {
                    break label$1
                  }
                  if ((HEAP32[(($4_1 + 84) | 0) >> 2] | 0 | 0) != (1 | 0)) {
                    break label$1
                  }
                  if ((HEAP32[(($4_1 + 88) | 0) >> 2] | 0 | 0) != (1 | 0)) {
                    break label$1
                  }
                }
                $0_1 = HEAP32[(($4_1 + 72) | 0) >> 2] | 0
              }
              global$0 = ($4_1 + 112) | 0
              return $0_1 | 0
            }

            function $40($0_1, $1_1, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              var $4_1 = 0
              label$1: {
                $4_1 = HEAP32[(($1_1 + 16) | 0) >> 2] | 0
                if ($4_1) {
                  break label$1
                }
                HEAP32[(($1_1 + 36) | 0) >> 2] = 1
                HEAP32[(($1_1 + 24) | 0) >> 2] = $3_1
                HEAP32[(($1_1 + 16) | 0) >> 2] = $2_1
                return
              }
              label$2: {
                label$3: {
                  if (($4_1 | 0) != ($2_1 | 0)) {
                    break label$3
                  }
                  if ((HEAP32[(($1_1 + 24) | 0) >> 2] | 0 | 0) != (2 | 0)) {
                    break label$2
                  }
                  HEAP32[(($1_1 + 24) | 0) >> 2] = $3_1
                  return
                }
                HEAP8[(($1_1 + 54) | 0) >> 0] = 1
                HEAP32[(($1_1 + 24) | 0) >> 2] = 2
                HEAP32[(($1_1 + 36) | 0) >> 2] = ((HEAP32[(($1_1 + 36) | 0) >> 2] | 0) + 1) | 0
              }
            }

            function $41($0_1, $1_1, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, 0 | 0) | 0)) {
                  break label$1
                }
                $40($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0)
              }
            }

            function $42($0_1, $1_1, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, 0 | 0) | 0)) {
                  break label$1
                }
                $40($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0)
                return
              }
              $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
              FUNCTION_TABLE[HEAP32[(((HEAP32[$0_1 >> 2] | 0) + 28) | 0) >> 2] | 0 | 0](
                $0_1,
                $1_1,
                $2_1,
                $3_1
              )
            }

            function $43($0_1, $1_1, $2_1, $3_1, $4_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              HEAP8[(($1_1 + 53) | 0) >> 0] = 1
              label$1: {
                if ((HEAP32[(($1_1 + 4) | 0) >> 2] | 0 | 0) != ($3_1 | 0)) {
                  break label$1
                }
                HEAP8[(($1_1 + 52) | 0) >> 0] = 1
                label$2: {
                  label$3: {
                    $3_1 = HEAP32[(($1_1 + 16) | 0) >> 2] | 0
                    if ($3_1) {
                      break label$3
                    }
                    HEAP32[(($1_1 + 36) | 0) >> 2] = 1
                    HEAP32[(($1_1 + 24) | 0) >> 2] = $4_1
                    HEAP32[(($1_1 + 16) | 0) >> 2] = $2_1
                    if (($4_1 | 0) != (1 | 0)) {
                      break label$1
                    }
                    if ((HEAP32[(($1_1 + 48) | 0) >> 2] | 0 | 0) == (1 | 0)) {
                      break label$2
                    }
                    break label$1
                  }
                  label$4: {
                    if (($3_1 | 0) != ($2_1 | 0)) {
                      break label$4
                    }
                    label$5: {
                      $3_1 = HEAP32[(($1_1 + 24) | 0) >> 2] | 0
                      if (($3_1 | 0) != (2 | 0)) {
                        break label$5
                      }
                      HEAP32[(($1_1 + 24) | 0) >> 2] = $4_1
                      $3_1 = $4_1
                    }
                    if ((HEAP32[(($1_1 + 48) | 0) >> 2] | 0 | 0) != (1 | 0)) {
                      break label$1
                    }
                    if (($3_1 | 0) == (1 | 0)) {
                      break label$2
                    }
                    break label$1
                  }
                  HEAP32[(($1_1 + 36) | 0) >> 2] = ((HEAP32[(($1_1 + 36) | 0) >> 2] | 0) + 1) | 0
                }
                HEAP8[(($1_1 + 54) | 0) >> 0] = 1
              }
            }

            function $44($0_1, $1_1, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              label$1: {
                if ((HEAP32[(($1_1 + 4) | 0) >> 2] | 0 | 0) != ($2_1 | 0)) {
                  break label$1
                }
                if ((HEAP32[(($1_1 + 28) | 0) >> 2] | 0 | 0) == (1 | 0)) {
                  break label$1
                }
                HEAP32[(($1_1 + 28) | 0) >> 2] = $3_1
              }
            }

            function $45($0_1, $1_1, $2_1, $3_1, $4_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, $4_1 | 0) | 0)) {
                  break label$1
                }
                $44($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0)
                return
              }
              label$2: {
                label$3: {
                  if (!($36($0_1 | 0, HEAP32[$1_1 >> 2] | 0 | 0, $4_1 | 0) | 0)) {
                    break label$3
                  }
                  label$4: {
                    label$5: {
                      if ((HEAP32[(($1_1 + 16) | 0) >> 2] | 0 | 0) == ($2_1 | 0)) {
                        break label$5
                      }
                      if ((HEAP32[(($1_1 + 20) | 0) >> 2] | 0 | 0) != ($2_1 | 0)) {
                        break label$4
                      }
                    }
                    if (($3_1 | 0) != (1 | 0)) {
                      break label$2
                    }
                    HEAP32[(($1_1 + 32) | 0) >> 2] = 1
                    return
                  }
                  HEAP32[(($1_1 + 32) | 0) >> 2] = $3_1
                  label$6: {
                    if ((HEAP32[(($1_1 + 44) | 0) >> 2] | 0 | 0) == (4 | 0)) {
                      break label$6
                    }
                    HEAP16[(($1_1 + 52) | 0) >> 1] = 0
                    $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                    FUNCTION_TABLE[HEAP32[(((HEAP32[$0_1 >> 2] | 0) + 20) | 0) >> 2] | 0 | 0](
                      $0_1,
                      $1_1,
                      $2_1,
                      $2_1,
                      1,
                      $4_1
                    )
                    label$7: {
                      if (!(HEAPU8[(($1_1 + 53) | 0) >> 0] | 0)) {
                        break label$7
                      }
                      HEAP32[(($1_1 + 44) | 0) >> 2] = 3
                      if (!(HEAPU8[(($1_1 + 52) | 0) >> 0] | 0)) {
                        break label$6
                      }
                      break label$2
                    }
                    HEAP32[(($1_1 + 44) | 0) >> 2] = 4
                  }
                  HEAP32[(($1_1 + 20) | 0) >> 2] = $2_1
                  HEAP32[(($1_1 + 40) | 0) >> 2] = ((HEAP32[(($1_1 + 40) | 0) >> 2] | 0) + 1) | 0
                  if ((HEAP32[(($1_1 + 36) | 0) >> 2] | 0 | 0) != (1 | 0)) {
                    break label$2
                  }
                  if ((HEAP32[(($1_1 + 24) | 0) >> 2] | 0 | 0) != (2 | 0)) {
                    break label$2
                  }
                  HEAP8[(($1_1 + 54) | 0) >> 0] = 1
                  return
                }
                $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                FUNCTION_TABLE[HEAP32[(((HEAP32[$0_1 >> 2] | 0) + 24) | 0) >> 2] | 0 | 0](
                  $0_1,
                  $1_1,
                  $2_1,
                  $3_1,
                  $4_1
                )
              }
            }

            function $46($0_1, $1_1, $2_1, $3_1, $4_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, $4_1 | 0) | 0)) {
                  break label$1
                }
                $44($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0)
                return
              }
              label$2: {
                if (!($36($0_1 | 0, HEAP32[$1_1 >> 2] | 0 | 0, $4_1 | 0) | 0)) {
                  break label$2
                }
                label$3: {
                  label$4: {
                    if ((HEAP32[(($1_1 + 16) | 0) >> 2] | 0 | 0) == ($2_1 | 0)) {
                      break label$4
                    }
                    if ((HEAP32[(($1_1 + 20) | 0) >> 2] | 0 | 0) != ($2_1 | 0)) {
                      break label$3
                    }
                  }
                  if (($3_1 | 0) != (1 | 0)) {
                    break label$2
                  }
                  HEAP32[(($1_1 + 32) | 0) >> 2] = 1
                  return
                }
                HEAP32[(($1_1 + 20) | 0) >> 2] = $2_1
                HEAP32[(($1_1 + 32) | 0) >> 2] = $3_1
                HEAP32[(($1_1 + 40) | 0) >> 2] = ((HEAP32[(($1_1 + 40) | 0) >> 2] | 0) + 1) | 0
                label$5: {
                  if ((HEAP32[(($1_1 + 36) | 0) >> 2] | 0 | 0) != (1 | 0)) {
                    break label$5
                  }
                  if ((HEAP32[(($1_1 + 24) | 0) >> 2] | 0 | 0) != (2 | 0)) {
                    break label$5
                  }
                  HEAP8[(($1_1 + 54) | 0) >> 0] = 1
                }
                HEAP32[(($1_1 + 44) | 0) >> 2] = 4
              }
            }

            function $47($0_1, $1_1, $2_1, $3_1, $4_1, $5_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              $5_1 = $5_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, $5_1 | 0) | 0)) {
                  break label$1
                }
                $43($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0, $4_1 | 0)
                return
              }
              $0_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
              FUNCTION_TABLE[HEAP32[(((HEAP32[$0_1 >> 2] | 0) + 20) | 0) >> 2] | 0 | 0](
                $0_1,
                $1_1,
                $2_1,
                $3_1,
                $4_1,
                $5_1
              )
            }

            function $48($0_1, $1_1, $2_1, $3_1, $4_1, $5_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              $5_1 = $5_1 | 0
              label$1: {
                if (!($36($0_1 | 0, HEAP32[(($1_1 + 8) | 0) >> 2] | 0 | 0, $5_1 | 0) | 0)) {
                  break label$1
                }
                $43($1_1 | 0, $1_1 | 0, $2_1 | 0, $3_1 | 0, $4_1 | 0)
              }
            }

            function $49($0_1) {
              $0_1 = $0_1 | 0
              label$1: {
                if ($0_1) {
                  break label$1
                }
                return 0 | 0
              }
              return (($39($0_1 | 0, 67308 | 0, 67452 | 0, 0 | 0) | 0 | 0) != (0 | 0)) | 0
            }

            function $50($0_1) {
              $0_1 = $0_1 | 0
              return $0_1 | 0
            }

            function $51($0_1) {
              $0_1 = $0_1 | 0
              global$1 = $0_1
            }

            function $53($0_1) {
              $0_1 = $0_1 | 0
              var $1_1 = 0,
                i64toi32_i32$1 = 0,
                $2_1 = 0,
                i64toi32_i32$0 = 0,
                $3_1 = 0
              label$1: {
                if ($0_1) {
                  break label$1
                }
                $1_1 = 0
                label$2: {
                  if (!(HEAP32[((0 + 68564) | 0) >> 2] | 0)) {
                    break label$2
                  }
                  $1_1 = $53(HEAP32[((0 + 68564) | 0) >> 2] | 0 | 0) | 0
                }
                label$3: {
                  if (!(HEAP32[((0 + 68032) | 0) >> 2] | 0)) {
                    break label$3
                  }
                  $1_1 = $53(HEAP32[((0 + 68032) | 0) >> 2] | 0 | 0) | 0 | $1_1 | 0
                }
                label$4: {
                  $0_1 = HEAP32[($24() | 0) >> 2] | 0
                  if (!$0_1) {
                    break label$4
                  }
                  label$5: while (1) {
                    $2_1 = 0
                    label$6: {
                      if ((HEAP32[(($0_1 + 76) | 0) >> 2] | 0 | 0) < (0 | 0)) {
                        break label$6
                      }
                      $2_1 = $26($0_1 | 0) | 0
                    }
                    label$7: {
                      if (
                        (HEAP32[(($0_1 + 20) | 0) >> 2] | 0 | 0) ==
                        (HEAP32[(($0_1 + 28) | 0) >> 2] | 0 | 0)
                      ) {
                        break label$7
                      }
                      $1_1 = $53($0_1 | 0) | 0 | $1_1 | 0
                    }
                    label$8: {
                      if (!$2_1) {
                        break label$8
                      }
                      $27($0_1 | 0)
                    }
                    $0_1 = HEAP32[(($0_1 + 56) | 0) >> 2] | 0
                    if ($0_1) {
                      continue label$5
                    }
                    break label$5
                  }
                }
                $25()
                return $1_1 | 0
              }
              label$9: {
                label$10: {
                  if ((HEAP32[(($0_1 + 76) | 0) >> 2] | 0 | 0) >= (0 | 0)) {
                    break label$10
                  }
                  $2_1 = 1
                  break label$9
                }
                $2_1 = !($26($0_1 | 0) | 0)
              }
              label$11: {
                label$12: {
                  label$13: {
                    if (
                      (HEAP32[(($0_1 + 20) | 0) >> 2] | 0 | 0) ==
                      (HEAP32[(($0_1 + 28) | 0) >> 2] | 0 | 0)
                    ) {
                      break label$13
                    }
                    FUNCTION_TABLE[HEAP32[(($0_1 + 36) | 0) >> 2] | 0 | 0]($0_1, 0, 0) | 0
                    if (HEAP32[(($0_1 + 20) | 0) >> 2] | 0) {
                      break label$13
                    }
                    $1_1 = -1
                    if (!$2_1) {
                      break label$12
                    }
                    break label$11
                  }
                  label$14: {
                    $1_1 = HEAP32[(($0_1 + 4) | 0) >> 2] | 0
                    $3_1 = HEAP32[(($0_1 + 8) | 0) >> 2] | 0
                    if (($1_1 | 0) == ($3_1 | 0)) {
                      break label$14
                    }
                    i64toi32_i32$1 = ($1_1 - $3_1) | 0
                    i64toi32_i32$0 = (i64toi32_i32$1 >> 31) | 0
                    i64toi32_i32$0 =
                      FUNCTION_TABLE[HEAP32[(($0_1 + 40) | 0) >> 2] | 0 | 0](
                        $0_1,
                        i64toi32_i32$1,
                        i64toi32_i32$0,
                        1
                      ) | 0
                    i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
                  }
                  $1_1 = 0
                  HEAP32[(($0_1 + 28) | 0) >> 2] = 0
                  i64toi32_i32$0 = $0_1
                  i64toi32_i32$1 = 0
                  HEAP32[(($0_1 + 16) | 0) >> 2] = 0
                  HEAP32[(($0_1 + 20) | 0) >> 2] = i64toi32_i32$1
                  i64toi32_i32$0 = $0_1
                  i64toi32_i32$1 = 0
                  HEAP32[(($0_1 + 4) | 0) >> 2] = 0
                  HEAP32[(($0_1 + 8) | 0) >> 2] = i64toi32_i32$1
                  if ($2_1) {
                    break label$11
                  }
                }
                $27($0_1 | 0)
              }
              return $1_1 | 0
            }

            function $54() {
              global$3 = 65536
              global$2 = (((0 + 15) | 0) & -16) | 0
            }

            function $55() {
              return (global$0 - global$2) | 0 | 0
            }

            function $56() {
              return global$3 | 0
            }

            function $57() {
              return global$2 | 0
            }

            function $58() {
              return global$0 | 0
            }

            function $59($0_1) {
              $0_1 = $0_1 | 0
              global$0 = $0_1
            }

            function $60($0_1) {
              $0_1 = $0_1 | 0
              var $1_1 = 0
              $1_1 = (((global$0 - $0_1) | 0) & -16) | 0
              global$0 = $1_1
              return $1_1 | 0
            }

            function $61() {
              return global$0 | 0
            }

            function $62($0_1, $1_1, $2_1, $2$hi, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $2$hi = $2$hi | 0
              $3_1 = $3_1 | 0
              var i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0
              i64toi32_i32$0 = $2$hi
              i64toi32_i32$0 = FUNCTION_TABLE[$0_1 | 0]($1_1, $2_1, i64toi32_i32$0, $3_1) | 0
              i64toi32_i32$1 = i64toi32_i32$HIGH_BITS
              i64toi32_i32$HIGH_BITS = i64toi32_i32$1
              return i64toi32_i32$0 | 0
            }

            function $63($0_1, $1_1, $2_1, $3_1, $4_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $4_1 = $4_1 | 0
              var i64toi32_i32$2 = 0,
                i64toi32_i32$4 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$3 = 0,
                $17_1 = 0,
                $18_1 = 0,
                $6_1 = 0,
                $7_1 = 0,
                $9_1 = 0,
                $9$hi = 0,
                $12$hi = 0,
                $5_1 = 0,
                $5$hi = 0
              $6_1 = $0_1
              $7_1 = $1_1
              i64toi32_i32$0 = 0
              $9_1 = $2_1
              $9$hi = i64toi32_i32$0
              i64toi32_i32$0 = 0
              i64toi32_i32$2 = $3_1
              i64toi32_i32$1 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                $17_1 = 0
              } else {
                i64toi32_i32$1 =
                  (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                    ((i64toi32_i32$2 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                  0 |
                  ((i64toi32_i32$0 << i64toi32_i32$4) | 0) |
                  0
                $17_1 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
              }
              $12$hi = i64toi32_i32$1
              i64toi32_i32$1 = $9$hi
              i64toi32_i32$0 = $9_1
              i64toi32_i32$2 = $12$hi
              i64toi32_i32$3 = $17_1
              i64toi32_i32$2 = i64toi32_i32$1 | i64toi32_i32$2 | 0
              i64toi32_i32$2 =
                $62(
                  $6_1 | 0,
                  $7_1 | 0,
                  i64toi32_i32$0 | i64toi32_i32$3 | 0 | 0,
                  i64toi32_i32$2 | 0,
                  $4_1 | 0
                ) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              $5_1 = i64toi32_i32$2
              $5$hi = i64toi32_i32$0
              i64toi32_i32$1 = i64toi32_i32$2
              i64toi32_i32$2 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $18_1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                $18_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$1 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $51($18_1 | 0)
              i64toi32_i32$2 = $5$hi
              return $5_1 | 0
            }

            function $64($0_1, $1_1, $2_1, $3_1, $3$hi, $4_1, $4$hi) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              $3$hi = $3$hi | 0
              $4_1 = $4_1 | 0
              $4$hi = $4$hi | 0
              var i64toi32_i32$4 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$3 = 0,
                i64toi32_i32$2 = 0,
                $18_1 = 0,
                $19_1 = 0,
                $5_1 = 0,
                $6_1 = 0,
                $7_1 = 0,
                $9_1 = 0,
                $12_1 = 0,
                $14_1 = 0
              $5_1 = $0_1
              $6_1 = $1_1
              $7_1 = $2_1
              i64toi32_i32$0 = $3$hi
              $9_1 = $3_1
              i64toi32_i32$2 = $3_1
              i64toi32_i32$1 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = 0
                $18_1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                $18_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $12_1 = $18_1
              i64toi32_i32$1 = $4$hi
              $14_1 = $4_1
              i64toi32_i32$0 = $4_1
              i64toi32_i32$2 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $19_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                $19_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                  0
              }
              fimport$11($5_1 | 0, $6_1 | 0, $7_1 | 0, $9_1 | 0, $12_1 | 0, $14_1 | 0, $19_1 | 0)
            }

            function $65($0_1, $1_1, $1$hi, $2_1, $3_1) {
              $0_1 = $0_1 | 0
              $1_1 = $1_1 | 0
              $1$hi = $1$hi | 0
              $2_1 = $2_1 | 0
              $3_1 = $3_1 | 0
              var i64toi32_i32$4 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0,
                i64toi32_i32$3 = 0,
                $12_1 = 0,
                $4_1 = 0,
                $6_1 = 0,
                i64toi32_i32$2 = 0
              $4_1 = $0_1
              i64toi32_i32$0 = $1$hi
              $6_1 = $1_1
              i64toi32_i32$2 = $1_1
              i64toi32_i32$1 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = 0
                $12_1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                $12_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$4) | 0) |
                  0
              }
              return fimport$12($4_1 | 0, $6_1 | 0, $12_1 | 0, $2_1 | 0, $3_1 | 0) | 0 | 0
            }

            function _ZN17compiler_builtins3int3mul3Mul3mul17h070e9a1c69faec5bE(
              var$0,
              var$0$hi,
              var$1,
              var$1$hi
            ) {
              var$0 = var$0 | 0
              var$0$hi = var$0$hi | 0
              var$1 = var$1 | 0
              var$1$hi = var$1$hi | 0
              var i64toi32_i32$4 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0,
                var$2 = 0,
                i64toi32_i32$2 = 0,
                i64toi32_i32$3 = 0,
                var$3 = 0,
                var$4 = 0,
                var$5 = 0,
                $21_1 = 0,
                $22_1 = 0,
                var$6 = 0,
                $24_1 = 0,
                $17_1 = 0,
                $18_1 = 0,
                $23_1 = 0,
                $29_1 = 0,
                $45_1 = 0,
                $56$hi = 0,
                $62$hi = 0
              i64toi32_i32$0 = var$1$hi
              var$2 = var$1
              var$4 = (var$2 >>> 16) | 0
              i64toi32_i32$0 = var$0$hi
              var$3 = var$0
              var$5 = (var$3 >>> 16) | 0
              $17_1 = Math_imul(var$4, var$5)
              $18_1 = var$2
              i64toi32_i32$2 = var$3
              i64toi32_i32$1 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = 0
                $21_1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$1 = (i64toi32_i32$0 >>> i64toi32_i32$4) | 0
                $21_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$0) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$2 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $23_1 = ($17_1 + Math_imul($18_1, $21_1)) | 0
              i64toi32_i32$1 = var$1$hi
              i64toi32_i32$0 = var$1
              i64toi32_i32$2 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $22_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                $22_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $29_1 = ($23_1 + Math_imul($22_1, var$3)) | 0
              var$2 = (var$2 & 65535) | 0
              var$3 = (var$3 & 65535) | 0
              var$6 = Math_imul(var$2, var$3)
              var$2 = (((var$6 >>> 16) | 0) + Math_imul(var$2, var$5)) | 0
              $45_1 = ($29_1 + ((var$2 >>> 16) | 0)) | 0
              var$2 = (((var$2 & 65535) | 0) + Math_imul(var$4, var$3)) | 0
              i64toi32_i32$2 = 0
              i64toi32_i32$1 = ($45_1 + ((var$2 >>> 16) | 0)) | 0
              i64toi32_i32$0 = 0
              i64toi32_i32$3 = 32
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$0 = (i64toi32_i32$1 << i64toi32_i32$4) | 0
                $24_1 = 0
              } else {
                i64toi32_i32$0 =
                  (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                    ((i64toi32_i32$1 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                  0 |
                  ((i64toi32_i32$2 << i64toi32_i32$4) | 0) |
                  0
                $24_1 = (i64toi32_i32$1 << i64toi32_i32$4) | 0
              }
              $56$hi = i64toi32_i32$0
              i64toi32_i32$0 = 0
              $62$hi = i64toi32_i32$0
              i64toi32_i32$0 = $56$hi
              i64toi32_i32$2 = $24_1
              i64toi32_i32$1 = $62$hi
              i64toi32_i32$3 = (var$2 << 16) | 0 | ((var$6 & 65535) | 0) | 0
              i64toi32_i32$1 = i64toi32_i32$0 | i64toi32_i32$1 | 0
              i64toi32_i32$2 = i64toi32_i32$2 | i64toi32_i32$3 | 0
              i64toi32_i32$HIGH_BITS = i64toi32_i32$1
              return i64toi32_i32$2 | 0
            }

            function __wasm_ctz_i32(var$0) {
              var$0 = var$0 | 0
              if (var$0) {
                return (31 - Math_clz32((((var$0 + -1) | 0) ^ var$0) | 0)) | 0 | 0
              }
              return 32 | 0
            }

            function __wasm_i64_mul(var$0, var$0$hi, var$1, var$1$hi) {
              var$0 = var$0 | 0
              var$0$hi = var$0$hi | 0
              var$1 = var$1 | 0
              var$1$hi = var$1$hi | 0
              var i64toi32_i32$0 = 0,
                i64toi32_i32$1 = 0
              i64toi32_i32$0 = var$0$hi
              i64toi32_i32$0 = var$1$hi
              i64toi32_i32$0 = var$0$hi
              i64toi32_i32$1 = var$1$hi
              i64toi32_i32$1 =
                _ZN17compiler_builtins3int3mul3Mul3mul17h070e9a1c69faec5bE(
                  var$0 | 0,
                  i64toi32_i32$0 | 0,
                  var$1 | 0,
                  i64toi32_i32$1 | 0
                ) | 0
              i64toi32_i32$0 = i64toi32_i32$HIGH_BITS
              i64toi32_i32$HIGH_BITS = i64toi32_i32$0
              return i64toi32_i32$1 | 0
            }

            function __wasm_rotl_i32(var$0, var$1) {
              var$0 = var$0 | 0
              var$1 = var$1 | 0
              var var$2 = 0
              var$2 = (var$1 & 31) | 0
              var$1 = (((0 - var$1) | 0) & 31) | 0
              return (
                (((((-1 >>> var$2) | 0) & var$0) | 0) << var$2) |
                0 |
                ((((((-1 << var$1) | 0) & var$0) | 0) >>> var$1) | 0) |
                0 |
                0
              )
            }

            function __wasm_rotl_i64(var$0, var$0$hi, var$1, var$1$hi) {
              var$0 = var$0 | 0
              var$0$hi = var$0$hi | 0
              var$1 = var$1 | 0
              var$1$hi = var$1$hi | 0
              var i64toi32_i32$1 = 0,
                i64toi32_i32$0 = 0,
                i64toi32_i32$2 = 0,
                i64toi32_i32$3 = 0,
                i64toi32_i32$5 = 0,
                i64toi32_i32$4 = 0,
                var$2$hi = 0,
                var$2 = 0,
                $19_1 = 0,
                $20_1 = 0,
                $21_1 = 0,
                $22_1 = 0,
                $6$hi = 0,
                $8$hi = 0,
                $10_1 = 0,
                $10$hi = 0,
                $15$hi = 0,
                $17$hi = 0,
                $19$hi = 0
              i64toi32_i32$0 = var$1$hi
              i64toi32_i32$2 = var$1
              i64toi32_i32$1 = 0
              i64toi32_i32$3 = 63
              i64toi32_i32$1 = (i64toi32_i32$0 & i64toi32_i32$1) | 0
              var$2 = (i64toi32_i32$2 & i64toi32_i32$3) | 0
              var$2$hi = i64toi32_i32$1
              i64toi32_i32$1 = -1
              i64toi32_i32$0 = -1
              i64toi32_i32$2 = var$2$hi
              i64toi32_i32$3 = var$2
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$2 = 0
                $19_1 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
              } else {
                i64toi32_i32$2 = (i64toi32_i32$1 >>> i64toi32_i32$4) | 0
                $19_1 =
                  (((((((1 << i64toi32_i32$4) | 0) - 1) | 0) & i64toi32_i32$1) | 0) <<
                    ((32 - i64toi32_i32$4) | 0)) |
                  0 |
                  ((i64toi32_i32$0 >>> i64toi32_i32$4) | 0) |
                  0
              }
              $6$hi = i64toi32_i32$2
              i64toi32_i32$2 = var$0$hi
              i64toi32_i32$2 = $6$hi
              i64toi32_i32$1 = $19_1
              i64toi32_i32$0 = var$0$hi
              i64toi32_i32$3 = var$0
              i64toi32_i32$0 = (i64toi32_i32$2 & i64toi32_i32$0) | 0
              $8$hi = i64toi32_i32$0
              i64toi32_i32$0 = var$2$hi
              i64toi32_i32$0 = $8$hi
              i64toi32_i32$2 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
              i64toi32_i32$1 = var$2$hi
              i64toi32_i32$3 = var$2
              i64toi32_i32$4 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
                $20_1 = 0
              } else {
                i64toi32_i32$1 =
                  (((((1 << i64toi32_i32$4) | 0) - 1) | 0) &
                    ((i64toi32_i32$2 >>> ((32 - i64toi32_i32$4) | 0)) | 0)) |
                  0 |
                  ((i64toi32_i32$0 << i64toi32_i32$4) | 0) |
                  0
                $20_1 = (i64toi32_i32$2 << i64toi32_i32$4) | 0
              }
              $10_1 = $20_1
              $10$hi = i64toi32_i32$1
              i64toi32_i32$1 = var$1$hi
              i64toi32_i32$1 = 0
              i64toi32_i32$0 = 0
              i64toi32_i32$2 = var$1$hi
              i64toi32_i32$3 = var$1
              i64toi32_i32$4 = (i64toi32_i32$0 - i64toi32_i32$3) | 0
              i64toi32_i32$5 = ((i64toi32_i32$0 >>> 0 < i64toi32_i32$3 >>> 0) + i64toi32_i32$2) | 0
              i64toi32_i32$5 = (i64toi32_i32$1 - i64toi32_i32$5) | 0
              i64toi32_i32$1 = i64toi32_i32$4
              i64toi32_i32$0 = 0
              i64toi32_i32$3 = 63
              i64toi32_i32$0 = (i64toi32_i32$5 & i64toi32_i32$0) | 0
              var$1 = (i64toi32_i32$1 & i64toi32_i32$3) | 0
              var$1$hi = i64toi32_i32$0
              i64toi32_i32$0 = -1
              i64toi32_i32$5 = -1
              i64toi32_i32$1 = var$1$hi
              i64toi32_i32$3 = var$1
              i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$1 = (i64toi32_i32$5 << i64toi32_i32$2) | 0
                $21_1 = 0
              } else {
                i64toi32_i32$1 =
                  (((((1 << i64toi32_i32$2) | 0) - 1) | 0) &
                    ((i64toi32_i32$5 >>> ((32 - i64toi32_i32$2) | 0)) | 0)) |
                  0 |
                  ((i64toi32_i32$0 << i64toi32_i32$2) | 0) |
                  0
                $21_1 = (i64toi32_i32$5 << i64toi32_i32$2) | 0
              }
              $15$hi = i64toi32_i32$1
              i64toi32_i32$1 = var$0$hi
              i64toi32_i32$1 = $15$hi
              i64toi32_i32$0 = $21_1
              i64toi32_i32$5 = var$0$hi
              i64toi32_i32$3 = var$0
              i64toi32_i32$5 = (i64toi32_i32$1 & i64toi32_i32$5) | 0
              $17$hi = i64toi32_i32$5
              i64toi32_i32$5 = var$1$hi
              i64toi32_i32$5 = $17$hi
              i64toi32_i32$1 = (i64toi32_i32$0 & i64toi32_i32$3) | 0
              i64toi32_i32$0 = var$1$hi
              i64toi32_i32$3 = var$1
              i64toi32_i32$2 = (i64toi32_i32$3 & 31) | 0
              if (32 >>> 0 <= ((i64toi32_i32$3 & 63) | 0) >>> 0) {
                i64toi32_i32$0 = 0
                $22_1 = (i64toi32_i32$5 >>> i64toi32_i32$2) | 0
              } else {
                i64toi32_i32$0 = (i64toi32_i32$5 >>> i64toi32_i32$2) | 0
                $22_1 =
                  (((((((1 << i64toi32_i32$2) | 0) - 1) | 0) & i64toi32_i32$5) | 0) <<
                    ((32 - i64toi32_i32$2) | 0)) |
                  0 |
                  ((i64toi32_i32$1 >>> i64toi32_i32$2) | 0) |
                  0
              }
              $19$hi = i64toi32_i32$0
              i64toi32_i32$0 = $10$hi
              i64toi32_i32$5 = $10_1
              i64toi32_i32$1 = $19$hi
              i64toi32_i32$3 = $22_1
              i64toi32_i32$1 = i64toi32_i32$0 | i64toi32_i32$1 | 0
              i64toi32_i32$5 = i64toi32_i32$5 | i64toi32_i32$3 | 0
              i64toi32_i32$HIGH_BITS = i64toi32_i32$1
              return i64toi32_i32$5 | 0
            }

            // EMSCRIPTEN_END_FUNCS
            bufferView = HEAPU8
            initActiveSegments(imports)
            var FUNCTION_TABLE = Table([
              null,
              $6,
              $17,
              $19,
              $21,
              $29,
              $32,
              $30,
              $31,
              $35,
              $33,
              $38,
              $48,
              $46,
              $41,
              $34,
              $47,
              $45,
              $42
            ])
            function __wasm_memory_size() {
              return (buffer.byteLength / 65536) | 0
            }

            return {
              __wasm_call_ctors: $0,
              new_uint64: $1,
              malloc: $12,
              heap_malloc: $2,
              CalcCityHash64: $3,
              __indirect_function_table: FUNCTION_TABLE,
              fflush: $53,
              free: $14,
              emscripten_stack_init: $54,
              emscripten_stack_get_free: $55,
              emscripten_stack_get_base: $56,
              emscripten_stack_get_end: $57,
              stackSave: $58,
              stackRestore: $59,
              stackAlloc: $60,
              emscripten_stack_get_current: $61,
              __cxa_is_pointer_type: $49,
              dynCall_jiji: $63
            }
          }

          return asmFunc(info)
        })(info)
      },

      instantiate: /** @suppress{checkTypes} */ function (binary, info) {
        return {
          then: function (ok) {
            var module = new WebAssembly.Module(binary)
            ok({
              instance: new WebAssembly.Instance(module, info)
            })
            // Emulate a simple WebAssembly.instantiate(..).then(()=>{}).catch(()=>{}) syntax.
            return { catch: function () {} }
          }
        }
      },

      RuntimeError: Error
    }

    // We don't need to actually download a wasm binary, mark it as present but empty.
    wasmBinary = []
    // end include: wasm2js.js
    if (typeof WebAssembly != 'object') {
      abort('no native wasm support detected')
    }

    // include: base64Utils.js
    // Converts a string of base64 into a byte array (Uint8Array).
    function intArrayFromBase64(s) {
      var decoded = atob(s)
      var bytes = new Uint8Array(decoded.length)
      for (var i = 0; i < decoded.length; ++i) {
        bytes[i] = decoded.charCodeAt(i)
      }
      return bytes
    }

    // If filename is a base64 data URI, parses and returns data (Buffer on node,
    // Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
    function tryParseAsDataURI(filename) {
      if (!isDataURI(filename)) {
        return
      }

      return intArrayFromBase64(filename.slice(dataURIPrefix.length))
    }
    // end include: base64Utils.js
    // Wasm globals

    var wasmMemory

    //========================================
    // Runtime essentials
    //========================================

    // whether we are quitting the application. no code should run after this.
    // set in exit() and abort()
    var ABORT = false

    // set by exit() and abort().  Passed to 'onExit' handler.
    // NOTE: This is also used as the process return code code in shell environments
    // but only when noExitRuntime is false.
    var EXITSTATUS

    // In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
    // don't define it at all in release modes.  This matches the behaviour of
    // MINIMAL_RUNTIME.
    // TODO(sbc): Make this the default even without STRICT enabled.
    /** @type {function(*, string=)} */
    function assert(condition, text) {
      if (!condition) {
        abort('Assertion failed' + (text ? ': ' + text : ''))
      }
    }

    // We used to include malloc/free by default in the past. Show a helpful error in
    // builds with assertions.

    // Memory management

    var HEAP,
      /** @type {!Int8Array} */
      HEAP8,
      /** @type {!Uint8Array} */
      HEAPU8,
      /** @type {!Int16Array} */
      HEAP16,
      /** @type {!Uint16Array} */
      HEAPU16,
      /** @type {!Int32Array} */
      HEAP32,
      /** @type {!Uint32Array} */
      HEAPU32,
      /** @type {!Float32Array} */
      HEAPF32,
      /** @type {!Float64Array} */
      HEAPF64

    function updateMemoryViews() {
      var b = wasmMemory.buffer
      Module['HEAP8'] = HEAP8 = new Int8Array(b)
      Module['HEAP16'] = HEAP16 = new Int16Array(b)
      Module['HEAPU8'] = HEAPU8 = new Uint8Array(b)
      Module['HEAPU16'] = HEAPU16 = new Uint16Array(b)
      Module['HEAP32'] = HEAP32 = new Int32Array(b)
      Module['HEAPU32'] = HEAPU32 = new Uint32Array(b)
      Module['HEAPF32'] = HEAPF32 = new Float32Array(b)
      Module['HEAPF64'] = HEAPF64 = new Float64Array(b)
    }

    assert(
      !Module['STACK_SIZE'],
      'STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time'
    )

    assert(
      typeof Int32Array != 'undefined' &&
        typeof Float64Array !== 'undefined' &&
        Int32Array.prototype.subarray != undefined &&
        Int32Array.prototype.set != undefined,
      'JS engine does not provide full typed array support'
    )

    // In non-standalone/normal mode, we create the memory here.
    // include: runtime_init_memory.js
    // Create the wasm memory. (Note: this only applies if IMPORTED_MEMORY is defined)

    var INITIAL_MEMORY = Module['INITIAL_MEMORY'] || 16777216
    legacyModuleProp('INITIAL_MEMORY', 'INITIAL_MEMORY')

    assert(
      INITIAL_MEMORY >= 65536,
      'INITIAL_MEMORY should be larger than STACK_SIZE, was ' +
        INITIAL_MEMORY +
        '! (STACK_SIZE=' +
        65536 +
        ')'
    )

    // check for full engine support (use string 'subarray' to avoid closure compiler confusion)

    if (Module['wasmMemory']) {
      wasmMemory = Module['wasmMemory']
    } else {
      wasmMemory = new WebAssembly.Memory({
        initial: INITIAL_MEMORY / 65536,
        maximum: INITIAL_MEMORY / 65536
      })
    }

    updateMemoryViews()

    // If the user provides an incorrect length, just use that length instead rather than providing the user to
    // specifically provide the memory length with Module['INITIAL_MEMORY'].
    INITIAL_MEMORY = wasmMemory.buffer.byteLength
    assert(INITIAL_MEMORY % 65536 === 0)
    // end include: runtime_init_memory.js

    // include: runtime_stack_check.js
    // Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
    function writeStackCookie() {
      var max = _emscripten_stack_get_end()
      assert((max & 3) == 0)
      // If the stack ends at address zero we write our cookies 4 bytes into the
      // stack.  This prevents interference with SAFE_HEAP and ASAN which also
      // monitor writes to address zero.
      if (max == 0) {
        max += 4
      }
      // The stack grow downwards towards _emscripten_stack_get_end.
      // We write cookies to the final two words in the stack and detect if they are
      // ever overwritten.
      HEAPU32[max >> 2] = 0x02135467
      HEAPU32[(max + 4) >> 2] = 0x89bacdfe
      // Also test the global address 0 for integrity.
      HEAPU32[0 >> 2] = 1668509029
    }

    function checkStackCookie() {
      if (ABORT) return
      var max = _emscripten_stack_get_end()
      // See writeStackCookie().
      if (max == 0) {
        max += 4
      }
      var cookie1 = HEAPU32[max >> 2]
      var cookie2 = HEAPU32[(max + 4) >> 2]
      if (cookie1 != 0x02135467 || cookie2 != 0x89bacdfe) {
        abort(
          `Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`
        )
      }
      // Also test the global address 0 for integrity.
      if (HEAPU32[0 >> 2] != 0x63736d65 /* 'emsc' */) {
        abort('Runtime error: The application has corrupted its heap memory area (address zero)!')
      }
    }
    // end include: runtime_stack_check.js
    // include: runtime_assertions.js
    // Endianness check
    ;(function () {
      var h16 = new Int16Array(1)
      var h8 = new Int8Array(h16.buffer)
      h16[0] = 0x6373
      if (h8[0] !== 0x73 || h8[1] !== 0x63)
        throw 'Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)'
    })()

    // end include: runtime_assertions.js
    var __ATPRERUN__ = [] // functions called before the runtime is initialized
    var __ATINIT__ = [] // functions called during startup
    var __ATEXIT__ = [] // functions called during shutdown
    var __ATPOSTRUN__ = [] // functions called after the main() is called

    var runtimeInitialized = false

    function preRun() {
      if (Module['preRun']) {
        if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']]
        while (Module['preRun'].length) {
          addOnPreRun(Module['preRun'].shift())
        }
      }
      callRuntimeCallbacks(__ATPRERUN__)
    }

    function initRuntime() {
      assert(!runtimeInitialized)
      runtimeInitialized = true

      checkStackCookie()

      callRuntimeCallbacks(__ATINIT__)
    }

    function postRun() {
      checkStackCookie()

      if (Module['postRun']) {
        if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']]
        while (Module['postRun'].length) {
          addOnPostRun(Module['postRun'].shift())
        }
      }

      callRuntimeCallbacks(__ATPOSTRUN__)
    }

    function addOnPreRun(cb) {
      __ATPRERUN__.unshift(cb)
    }

    function addOnInit(cb) {
      __ATINIT__.unshift(cb)
    }

    function addOnExit(cb) {}

    function addOnPostRun(cb) {
      __ATPOSTRUN__.unshift(cb)
    }

    // include: runtime_math.js
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc

    assert(
      Math.imul,
      'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill'
    )
    assert(
      Math.fround,
      'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill'
    )
    assert(
      Math.clz32,
      'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill'
    )
    assert(
      Math.trunc,
      'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill'
    )
    // end include: runtime_math.js
    // A counter of dependencies for calling run(). If we need to
    // do asynchronous work before running, increment this and
    // decrement it. Incrementing must happen in a place like
    // Module.preRun (used by emcc to add file preloading).
    // Note that you can add dependencies in preRun, even though
    // it happens right before run - run will be postponed until
    // the dependencies are met.
    var runDependencies = 0
    var runDependencyWatcher = null
    var dependenciesFulfilled = null // overridden to take different actions when all run dependencies are fulfilled
    var runDependencyTracking = {}

    function getUniqueRunDependency(id) {
      var orig = id
      while (1) {
        if (!runDependencyTracking[id]) return id
        id = orig + Math.random()
      }
    }

    function addRunDependency(id) {
      runDependencies++

      Module['monitorRunDependencies']?.(runDependencies)

      if (id) {
        assert(!runDependencyTracking[id])
        runDependencyTracking[id] = 1
        if (runDependencyWatcher === null && typeof setInterval != 'undefined') {
          // Check for missing dependencies every few seconds
          runDependencyWatcher = setInterval(() => {
            if (ABORT) {
              clearInterval(runDependencyWatcher)
              runDependencyWatcher = null
              return
            }
            var shown = false
            for (var dep in runDependencyTracking) {
              if (!shown) {
                shown = true
                err('still waiting on run dependencies:')
              }
              err(`dependency: ${dep}`)
            }
            if (shown) {
              err('(end of list)')
            }
          }, 10000)
        }
      } else {
        err('warning: run dependency added without ID')
      }
    }

    function removeRunDependency(id) {
      runDependencies--

      Module['monitorRunDependencies']?.(runDependencies)

      if (id) {
        assert(runDependencyTracking[id])
        delete runDependencyTracking[id]
      } else {
        err('warning: run dependency removed without ID')
      }
      if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher)
          runDependencyWatcher = null
        }
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled
          dependenciesFulfilled = null
          callback() // can add another dependenciesFulfilled
        }
      }
    }

    /** @param {string|number=} what */
    function abort(what) {
      Module['onAbort']?.(what)

      what = 'Aborted(' + what + ')'
      // TODO(sbc): Should we remove printing and leave it up to whoever
      // catches the exception?
      err(what)

      ABORT = true
      EXITSTATUS = 1

      // Use a wasm runtime error, because a JS error might be seen as a foreign
      // exception, which means we'd run destructors on it. We need the error to
      // simply make the program stop.
      // FIXME This approach does not work in Wasm EH because it currently does not assume
      // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
      // a trap or not based on a hidden field within the object. So at the moment
      // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
      // allows this in the wasm spec.

      // Suppress closure compiler warning here. Closure compiler's builtin extern
      // defintion for WebAssembly.RuntimeError claims it takes no arguments even
      // though it can.
      // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
      /** @suppress {checkTypes} */
      var e = new WebAssembly.RuntimeError(what)

      readyPromiseReject(e)
      // Throw the error whether or not MODULARIZE is set because abort is used
      // in code paths apart from instantiation where an exception is expected
      // to be thrown when abort is called.
      throw e
    }

    // include: memoryprofiler.js
    // end include: memoryprofiler.js
    // show errors on likely calls to FS when it was not included
    var FS = {
      error() {
        abort(
          'Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with -sFORCE_FILESYSTEM'
        )
      },
      init() {
        FS.error()
      },
      createDataFile() {
        FS.error()
      },
      createPreloadedFile() {
        FS.error()
      },
      createLazyFile() {
        FS.error()
      },
      open() {
        FS.error()
      },
      mkdev() {
        FS.error()
      },
      registerDevice() {
        FS.error()
      },
      analyzePath() {
        FS.error()
      },

      ErrnoError() {
        FS.error()
      }
    }
    Module['FS_createDataFile'] = FS.createDataFile
    Module['FS_createPreloadedFile'] = FS.createPreloadedFile

    // include: URIUtils.js
    // Prefix of data URIs emitted by SINGLE_FILE and related options.
    var dataURIPrefix = 'data:application/octet-stream;base64,'

    /**
     * Indicates whether filename is a base64 data URI.
     * @noinline
     */
    var isDataURI = (filename) => filename.startsWith(dataURIPrefix)

    /**
     * Indicates whether filename is delivered via file protocol (as opposed to http/https)
     * @noinline
     */
    var isFileURI = (filename) => filename.startsWith('file://')
    // end include: URIUtils.js
    function createExportWrapper(name) {
      return function () {
        assert(
          runtimeInitialized,
          `native function \`${name}\` called before runtime initialization`
        )
        var f = wasmExports[name]
        assert(f, `exported native function \`${name}\` not found`)
        return f.apply(null, arguments)
      }
    }

    // include: runtime_exceptions.js
    // end include: runtime_exceptions.js
    var wasmBinaryFile
    wasmBinaryFile = 'export.wasm'
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile)
    }

    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary)
      }
      var binary = tryParseAsDataURI(file)
      if (binary) {
        return binary
      }
      if (readBinary) {
        return readBinary(file)
      }
      throw 'both async and sync fetching of the wasm failed'
    }

    function getBinaryPromise(binaryFile) {
      // If we don't have the binary yet, try to load it asynchronously.
      // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
      // See https://github.com/github/fetch/pull/92#issuecomment-140665932
      // Cordova or Electron apps are typically loaded from a file:// url.
      // So use fetch if it is available and the url is not a file, otherwise fall back to XHR.
      if (!wasmBinary && !isDataURI(binaryFile) && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch == 'function') {
          return fetch(binaryFile, { credentials: 'same-origin' })
            .then((response) => {
              if (!response['ok']) {
                throw `failed to load wasm binary file at '${binaryFile}'`
              }
              return response['arrayBuffer']()
            })
            .catch(() => getBinarySync(binaryFile))
        }
      }

      // Otherwise, getBinarySync should be able to get it synchronously
      return Promise.resolve().then(() => getBinarySync(binaryFile))
    }

    function instantiateArrayBuffer(binaryFile, imports, receiver) {
      return getBinaryPromise(binaryFile)
        .then((binary) => {
          return WebAssembly.instantiate(binary, imports)
        })
        .then((instance) => {
          return instance
        })
        .then(receiver, (reason) => {
          err(`failed to asynchronously prepare wasm: ${reason}`)

          // Warn on some common problems.
          if (isFileURI(wasmBinaryFile)) {
            err(
              `warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`
            )
          }
          abort(reason)
        })
    }

    function instantiateAsync(binary, binaryFile, imports, callback) {
      if (
        !binary &&
        typeof WebAssembly.instantiateStreaming == 'function' &&
        !isDataURI(binaryFile) &&
        typeof fetch == 'function'
      ) {
        return fetch(binaryFile, { credentials: 'same-origin' }).then((response) => {
          // Suppress closure warning here since the upstream definition for
          // instantiateStreaming only allows Promise<Repsponse> rather than
          // an actual Response.
          // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure is fixed.
          /** @suppress {checkTypes} */
          var result = WebAssembly.instantiateStreaming(response, imports)

          return result.then(callback, function (reason) {
            // We expect the most common failure cause to be a bad MIME type for the binary,
            // in which case falling back to ArrayBuffer instantiation should work.
            err(`wasm streaming compile failed: ${reason}`)
            err('falling back to ArrayBuffer instantiation')
            return instantiateArrayBuffer(binaryFile, imports, callback)
          })
        })
      }
      return instantiateArrayBuffer(binaryFile, imports, callback)
    }

    // Create the wasm instance.
    // Receives the wasm imports, returns the exports.
    function createWasm() {
      // prepare imports
      var info = {
        env: wasmImports,
        wasi_snapshot_preview1: wasmImports
      }
      // Load the wasm module and create an instance of using native support in the JS engine.
      // handle a generated wasm instance, receiving its exports and
      // performing other necessary setup
      /** @param {WebAssembly.Module=} module*/
      function receiveInstance(instance, module) {
        wasmExports = instance.exports

        addOnInit(wasmExports['__wasm_call_ctors'])

        removeRunDependency('wasm-instantiate')
        return wasmExports
      }
      // wait for the pthread pool (if any)
      addRunDependency('wasm-instantiate')

      // Prefer streaming instantiation if available.
      // Async compilation can be confusing when an error on the page overwrites Module
      // (for example, if the order of elements is wrong, and the one defining Module is
      // later), so we save Module and check it later.
      var trueModule = Module
      function receiveInstantiationResult(result) {
        // 'result' is a ResultObject object which has both the module and instance.
        // receiveInstance() will swap in the exports (to Module.asm) so they can be called
        assert(
          Module === trueModule,
          'the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?'
        )
        trueModule = null
        // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
        // When the regression is fixed, can restore the above PTHREADS-enabled path.
        receiveInstance(result['instance'])
      }

      // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
      // to manually instantiate the Wasm module themselves. This allows pages to
      // run the instantiation parallel to any other async startup actions they are
      // performing.
      // Also pthreads and wasm workers initialize the wasm instance through this
      // path.
      if (Module['instantiateWasm']) {
        try {
          return Module['instantiateWasm'](info, receiveInstance)
        } catch (e) {
          err(`Module.instantiateWasm callback failed with error: ${e}`)
          // If instantiation fails, reject the module ready promise.
          readyPromiseReject(e)
        }
      }

      // If instantiation fails, reject the module ready promise.
      instantiateAsync(wasmBinary, wasmBinaryFile, info, receiveInstantiationResult).catch(
        readyPromiseReject
      )
      return {} // no exports yet; we'll fill them in later
    }

    // Globals used by JS i64 conversions (see makeSetValue)
    var tempDouble
    var tempI64

    // include: runtime_debug.js
    function legacyModuleProp(prop, newName, incomming = true) {
      if (!Object.getOwnPropertyDescriptor(Module, prop)) {
        Object.defineProperty(Module, prop, {
          configurable: true,
          get() {
            let extra = incomming
              ? ' (the initial value can be provided on Module, but after startup the value is only looked for on a local variable of that name)'
              : ''
            abort(`\`Module.${prop}\` has been replaced by \`${newName}\`` + extra)
          }
        })
      }
    }

    function ignoredModuleProp(prop) {
      if (Object.getOwnPropertyDescriptor(Module, prop)) {
        abort(
          `\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`
        )
      }
    }

    // forcing the filesystem exports a few things by default
    function isExportedByForceFilesystem(name) {
      return (
        name === 'FS_createPath' ||
        name === 'FS_createDataFile' ||
        name === 'FS_createPreloadedFile' ||
        name === 'FS_unlink' ||
        name === 'addRunDependency' ||
        // The old FS has some functionality that WasmFS lacks.
        name === 'FS_createLazyFile' ||
        name === 'FS_createDevice' ||
        name === 'removeRunDependency'
      )
    }

    function missingGlobal(sym, msg) {
      if (typeof globalThis !== 'undefined') {
        Object.defineProperty(globalThis, sym, {
          configurable: true,
          get() {
            warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`)
            return undefined
          }
        })
      }
    }

    missingGlobal('buffer', 'Please use HEAP8.buffer or wasmMemory.buffer')
    missingGlobal('asm', 'Please use wasmExports instead')

    function missingLibrarySymbol(sym) {
      if (typeof globalThis !== 'undefined' && !Object.getOwnPropertyDescriptor(globalThis, sym)) {
        Object.defineProperty(globalThis, sym, {
          configurable: true,
          get() {
            // Can't `abort()` here because it would break code that does runtime
            // checks.  e.g. `if (typeof SDL === 'undefined')`.
            var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`
            // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
            // library.js, which means $name for a JS name with no prefix, or name
            // for a JS name like _name.
            var librarySymbol = sym
            if (!librarySymbol.startsWith('_')) {
              librarySymbol = '$' + sym
            }
            msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`
            if (isExportedByForceFilesystem(sym)) {
              msg +=
                '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you'
            }
            warnOnce(msg)
            return undefined
          }
        })
      }
      // Any symbol that is not included from the JS libary is also (by definition)
      // not exported on the Module object.
      unexportedRuntimeSymbol(sym)
    }

    function unexportedRuntimeSymbol(sym) {
      if (!Object.getOwnPropertyDescriptor(Module, sym)) {
        Object.defineProperty(Module, sym, {
          configurable: true,
          get() {
            var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`
            if (isExportedByForceFilesystem(sym)) {
              msg +=
                '. Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you'
            }
            abort(msg)
          }
        })
      }
    }

    // Used by XXXXX_DEBUG settings to output debug messages.
    function dbg(text) {
      // TODO(sbc): Make this configurable somehow.  Its not always convenient for
      // logging to show up as warnings.
      console.warn.apply(console, arguments)
    }
    // end include: runtime_debug.js
    // === Body ===

    // end include: preamble.js

    /** @constructor */
    function ExitStatus(status) {
      this.name = 'ExitStatus'
      this.message = `Program terminated with exit(${status})`
      this.status = status
    }

    var callRuntimeCallbacks = (callbacks) => {
      while (callbacks.length > 0) {
        // Pass the module as the first argument.
        callbacks.shift()(Module)
      }
    }

    /**
     * @param {number} ptr
     * @param {string} type
     */
    function getValue(ptr, type = 'i8') {
      if (type.endsWith('*')) type = '*'
      switch (type) {
        case 'i1':
          return HEAP8[ptr >> 0]
        case 'i8':
          return HEAP8[ptr >> 0]
        case 'i16':
          return HEAP16[ptr >> 1]
        case 'i32':
          return HEAP32[ptr >> 2]
        case 'i64':
          abort('to do getValue(i64) use WASM_BIGINT')
        case 'float':
          return HEAPF32[ptr >> 2]
        case 'double':
          return HEAPF64[ptr >> 3]
        case '*':
          return HEAPU32[ptr >> 2]
        default:
          abort(`invalid type for getValue: ${type}`)
      }
    }

    var noExitRuntime = Module['noExitRuntime'] || true

    var ptrToString = (ptr) => {
      assert(typeof ptr === 'number')
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      ptr >>>= 0
      return '0x' + ptr.toString(16).padStart(8, '0')
    }

    /**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */
    function setValue(ptr, value, type = 'i8') {
      if (type.endsWith('*')) type = '*'
      switch (type) {
        case 'i1':
          HEAP8[ptr >> 0] = value
          break
        case 'i8':
          HEAP8[ptr >> 0] = value
          break
        case 'i16':
          HEAP16[ptr >> 1] = value
          break
        case 'i32':
          HEAP32[ptr >> 2] = value
          break
        case 'i64':
          abort('to do setValue(i64) use WASM_BIGINT')
        case 'float':
          HEAPF32[ptr >> 2] = value
          break
        case 'double':
          HEAPF64[ptr >> 3] = value
          break
        case '*':
          HEAPU32[ptr >> 2] = value
          break
        default:
          abort(`invalid type for setValue: ${type}`)
      }
    }

    var warnOnce = (text) => {
      warnOnce.shown ||= {}
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1
        err(text)
      }
    }

    var __embind_register_bigint = (primitiveType, name, size, minRange, maxRange) => {}

    var embind_init_charCodes = () => {
      var codes = new Array(256)
      for (var i = 0; i < 256; ++i) {
        codes[i] = String.fromCharCode(i)
      }
      embind_charCodes = codes
    }
    var embind_charCodes
    var readLatin1String = (ptr) => {
      var ret = ''
      var c = ptr
      while (HEAPU8[c]) {
        ret += embind_charCodes[HEAPU8[c++]]
      }
      return ret
    }

    var awaitingDependencies = {}

    var registeredTypes = {}

    var typeDependencies = {}

    var BindingError
    var throwBindingError = (message) => {
      throw new BindingError(message)
    }

    var InternalError
    var throwInternalError = (message) => {
      throw new InternalError(message)
    }
    var whenDependentTypesAreResolved = (myTypes, dependentTypes, getTypeConverters) => {
      myTypes.forEach(function (type) {
        typeDependencies[type] = dependentTypes
      })

      function onComplete(typeConverters) {
        var myTypeConverters = getTypeConverters(typeConverters)
        if (myTypeConverters.length !== myTypes.length) {
          throwInternalError('Mismatched type converter count')
        }
        for (var i = 0; i < myTypes.length; ++i) {
          registerType(myTypes[i], myTypeConverters[i])
        }
      }

      var typeConverters = new Array(dependentTypes.length)
      var unregisteredTypes = []
      var registered = 0
      dependentTypes.forEach((dt, i) => {
        if (registeredTypes.hasOwnProperty(dt)) {
          typeConverters[i] = registeredTypes[dt]
        } else {
          unregisteredTypes.push(dt)
          if (!awaitingDependencies.hasOwnProperty(dt)) {
            awaitingDependencies[dt] = []
          }
          awaitingDependencies[dt].push(() => {
            typeConverters[i] = registeredTypes[dt]
            ++registered
            if (registered === unregisteredTypes.length) {
              onComplete(typeConverters)
            }
          })
        }
      })
      if (0 === unregisteredTypes.length) {
        onComplete(typeConverters)
      }
    }
    /** @param {Object=} options */
    function sharedRegisterType(rawType, registeredInstance, options = {}) {
      var name = registeredInstance.name
      if (!rawType) {
        throwBindingError(`type "${name}" must have a positive integer typeid pointer`)
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
        if (options.ignoreDuplicateRegistrations) {
          return
        } else {
          throwBindingError(`Cannot register type '${name}' twice`)
        }
      }

      registeredTypes[rawType] = registeredInstance
      delete typeDependencies[rawType]

      if (awaitingDependencies.hasOwnProperty(rawType)) {
        var callbacks = awaitingDependencies[rawType]
        delete awaitingDependencies[rawType]
        callbacks.forEach((cb) => cb())
      }
    }
    /** @param {Object=} options */
    function registerType(rawType, registeredInstance, options = {}) {
      if (!('argPackAdvance' in registeredInstance)) {
        throw new TypeError('registerType registeredInstance requires argPackAdvance')
      }
      return sharedRegisterType(rawType, registeredInstance, options)
    }

    var GenericWireTypeSize = 8
    /** @suppress {globalThis} */
    var __embind_register_bool = (rawType, name, trueValue, falseValue) => {
      name = readLatin1String(name)
      registerType(rawType, {
        name,
        fromWireType: function (wt) {
          // ambiguous emscripten ABI: sometimes return values are
          // true or false, and sometimes integers (0 or 1)
          return !!wt
        },
        toWireType: function (destructors, o) {
          return o ? trueValue : falseValue
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: function (pointer) {
          return this['fromWireType'](HEAPU8[pointer])
        },
        destructorFunction: null // This type does not need a destructor
      })
    }

    class HandleAllocator {
      constructor() {
        // TODO(sbc): Use class fields once we allow/enable es2022 in
        // JavaScript input to acorn and closure.
        // Reserve slot 0 so that 0 is always an invalid handle
        this.allocated = [undefined]
        this.freelist = []
      }
      get(id) {
        assert(this.allocated[id] !== undefined, `invalid handle: ${id}`)
        return this.allocated[id]
      }
      has(id) {
        return this.allocated[id] !== undefined
      }
      allocate(handle) {
        var id = this.freelist.pop() || this.allocated.length
        this.allocated[id] = handle
        return id
      }
      free(id) {
        assert(this.allocated[id] !== undefined)
        // Set the slot to `undefined` rather than using `delete` here since
        // apparently arrays with holes in them can be less efficient.
        this.allocated[id] = undefined
        this.freelist.push(id)
      }
    }
    var emval_handles = new HandleAllocator()
    var __emval_decref = (handle) => {
      if (handle >= emval_handles.reserved && 0 === --emval_handles.get(handle).refcount) {
        emval_handles.free(handle)
      }
    }

    var count_emval_handles = () => {
      var count = 0
      for (var i = emval_handles.reserved; i < emval_handles.allocated.length; ++i) {
        if (emval_handles.allocated[i] !== undefined) {
          ++count
        }
      }
      return count
    }

    var init_emval = () => {
      // reserve some special values. These never get de-allocated.
      // The HandleAllocator takes care of reserving zero.
      emval_handles.allocated.push(
        { value: undefined },
        { value: null },
        { value: true },
        { value: false }
      )
      Object.assign(
        emval_handles,
        /** @lends {emval_handles} */ { reserved: emval_handles.allocated.length }
      ),
        (Module['count_emval_handles'] = count_emval_handles)
    }
    var Emval = {
      toValue: (handle) => {
        if (!handle) {
          throwBindingError('Cannot use deleted val. handle = ' + handle)
        }
        return emval_handles.get(handle).value
      },
      toHandle: (value) => {
        switch (value) {
          case undefined:
            return 1
          case null:
            return 2
          case true:
            return 3
          case false:
            return 4
          default: {
            return emval_handles.allocate({ refcount: 1, value: value })
          }
        }
      }
    }

    /** @suppress {globalThis} */
    function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAP32[pointer >> 2])
    }

    var EmValType = {
      name: 'emscripten::val',
      fromWireType: (handle) => {
        var rv = Emval.toValue(handle)
        __emval_decref(handle)
        return rv
      },
      toWireType: (destructors, value) => Emval.toHandle(value),
      argPackAdvance: GenericWireTypeSize,
      readValueFromPointer: simpleReadValueFromPointer,
      destructorFunction: null // This type does not need a destructor

      // TODO: do we need a deleteObject here?  write a test where
      // emval is passed into JS via an interface
    }
    var __embind_register_emval = (rawType) => registerType(rawType, EmValType)

    var embindRepr = (v) => {
      if (v === null) {
        return 'null'
      }
      var t = typeof v
      if (t === 'object' || t === 'array' || t === 'function') {
        return v.toString()
      } else {
        return '' + v
      }
    }

    var floatReadValueFromPointer = (name, width) => {
      switch (width) {
        case 4:
          return function (pointer) {
            return this['fromWireType'](HEAPF32[pointer >> 2])
          }
        case 8:
          return function (pointer) {
            return this['fromWireType'](HEAPF64[pointer >> 3])
          }
        default:
          throw new TypeError(`invalid float width (${width}): ${name}`)
      }
    }

    var __embind_register_float = (rawType, name, size) => {
      name = readLatin1String(name)
      registerType(rawType, {
        name,
        fromWireType: (value) => value,
        toWireType: (destructors, value) => {
          if (typeof value != 'number' && typeof value != 'boolean') {
            throw new TypeError(`Cannot convert ${embindRepr(value)} to ${this.name}`)
          }
          // The VM will perform JS to Wasm value conversion, according to the spec:
          // https://www.w3.org/TR/wasm-js-api-1/#towebassemblyvalue
          return value
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: floatReadValueFromPointer(name, size),
        destructorFunction: null // This type does not need a destructor
      })
    }

    var integerReadValueFromPointer = (name, width, signed) => {
      // integers are quite common, so generate very specialized functions
      switch (width) {
        case 1:
          return signed ? (pointer) => HEAP8[pointer >> 0] : (pointer) => HEAPU8[pointer >> 0]
        case 2:
          return signed ? (pointer) => HEAP16[pointer >> 1] : (pointer) => HEAPU16[pointer >> 1]
        case 4:
          return signed ? (pointer) => HEAP32[pointer >> 2] : (pointer) => HEAPU32[pointer >> 2]
        default:
          throw new TypeError(`invalid integer width (${width}): ${name}`)
      }
    }

    /** @suppress {globalThis} */
    var __embind_register_integer = (primitiveType, name, size, minRange, maxRange) => {
      name = readLatin1String(name)
      // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come
      // out as 'i32 -1'. Always treat those as max u32.
      if (maxRange === -1) {
        maxRange = 4294967295
      }

      var fromWireType = (value) => value

      if (minRange === 0) {
        var bitshift = 32 - 8 * size
        fromWireType = (value) => (value << bitshift) >>> bitshift
      }

      var isUnsignedType = name.includes('unsigned')
      var checkAssertions = (value, toTypeName) => {
        if (typeof value != 'number' && typeof value != 'boolean') {
          throw new TypeError(`Cannot convert "${embindRepr(value)}" to ${toTypeName}`)
        }
        if (value < minRange || value > maxRange) {
          throw new TypeError(
            `Passing a number "${embindRepr(value)}" from JS side to C/C++ side to an argument of type "${name}", which is outside the valid range [${minRange}, ${maxRange}]!`
          )
        }
      }
      var toWireType
      if (isUnsignedType) {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name)
          return value >>> 0
        }
      } else {
        toWireType = function (destructors, value) {
          checkAssertions(value, this.name)
          // The VM will perform JS to Wasm value conversion, according to the spec:
          // https://www.w3.org/TR/wasm-js-api-1/#towebassemblyvalue
          return value
        }
      }
      registerType(primitiveType, {
        name,
        fromWireType: fromWireType,
        toWireType: toWireType,
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: integerReadValueFromPointer(name, size, minRange !== 0),
        destructorFunction: null // This type does not need a destructor
      })
    }

    var __embind_register_memory_view = (rawType, dataTypeIndex, name) => {
      var typeMapping = [
        Int8Array,
        Uint8Array,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array
      ]

      var TA = typeMapping[dataTypeIndex]

      function decodeMemoryView(handle) {
        var size = HEAPU32[handle >> 2]
        var data = HEAPU32[(handle + 4) >> 2]
        return new TA(HEAP8.buffer, data, size)
      }

      name = readLatin1String(name)
      registerType(
        rawType,
        {
          name,
          fromWireType: decodeMemoryView,
          argPackAdvance: GenericWireTypeSize,
          readValueFromPointer: decodeMemoryView
        },
        {
          ignoreDuplicateRegistrations: true
        }
      )
    }

    /** @suppress {globalThis} */
    function readPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2])
    }

    var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
      assert(typeof str === 'string', `stringToUTF8Array expects a string (got ${typeof str})`)
      // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
      // undefined and false each don't write out any bytes.
      if (!(maxBytesToWrite > 0)) return 0

      var startIdx = outIdx
      var endIdx = outIdx + maxBytesToWrite - 1 // -1 for string null terminator.
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
        // and https://www.ietf.org/rfc/rfc2279.txt
        // and https://tools.ietf.org/html/rfc3629
        var u = str.charCodeAt(i) // possibly a lead surrogate
        if (u >= 0xd800 && u <= 0xdfff) {
          var u1 = str.charCodeAt(++i)
          u = (0x10000 + ((u & 0x3ff) << 10)) | (u1 & 0x3ff)
        }
        if (u <= 0x7f) {
          if (outIdx >= endIdx) break
          heap[outIdx++] = u
        } else if (u <= 0x7ff) {
          if (outIdx + 1 >= endIdx) break
          heap[outIdx++] = 0xc0 | (u >> 6)
          heap[outIdx++] = 0x80 | (u & 63)
        } else if (u <= 0xffff) {
          if (outIdx + 2 >= endIdx) break
          heap[outIdx++] = 0xe0 | (u >> 12)
          heap[outIdx++] = 0x80 | ((u >> 6) & 63)
          heap[outIdx++] = 0x80 | (u & 63)
        } else {
          if (outIdx + 3 >= endIdx) break
          if (u > 0x10ffff)
            warnOnce(
              'Invalid Unicode code point ' +
                ptrToString(u) +
                ' encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).'
            )
          heap[outIdx++] = 0xf0 | (u >> 18)
          heap[outIdx++] = 0x80 | ((u >> 12) & 63)
          heap[outIdx++] = 0x80 | ((u >> 6) & 63)
          heap[outIdx++] = 0x80 | (u & 63)
        }
      }
      // Null-terminate the pointer to the buffer.
      heap[outIdx] = 0
      return outIdx - startIdx
    }
    var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
      assert(
        typeof maxBytesToWrite == 'number',
        'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!'
      )
      return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
    }

    var lengthBytesUTF8 = (str) => {
      var len = 0
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
        // unit, not a Unicode code point of the character! So decode
        // UTF16->UTF32->UTF8.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var c = str.charCodeAt(i) // possibly a lead surrogate
        if (c <= 0x7f) {
          len++
        } else if (c <= 0x7ff) {
          len += 2
        } else if (c >= 0xd800 && c <= 0xdfff) {
          len += 4
          ++i
        } else {
          len += 3
        }
      }
      return len
    }

    var UTF8Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf8') : undefined

    /**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */
    var UTF8ArrayToString = (heapOrArray, idx, maxBytesToRead) => {
      var endIdx = idx + maxBytesToRead
      var endPtr = idx
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.  Also, use the length info to avoid running tiny
      // strings through TextDecoder, since .subarray() allocates garbage.
      // (As a tiny code save trick, compare endPtr against endIdx using a negation,
      // so that undefined means Infinity)
      while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr

      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr))
      }
      var str = ''
      // If building with TextDecoder, we have already computed the string length
      // above, so test loop end condition against that
      while (idx < endPtr) {
        // For UTF8 byte structure, see:
        // http://en.wikipedia.org/wiki/UTF-8#Description
        // https://www.ietf.org/rfc/rfc2279.txt
        // https://tools.ietf.org/html/rfc3629
        var u0 = heapOrArray[idx++]
        if (!(u0 & 0x80)) {
          str += String.fromCharCode(u0)
          continue
        }
        var u1 = heapOrArray[idx++] & 63
        if ((u0 & 0xe0) == 0xc0) {
          str += String.fromCharCode(((u0 & 31) << 6) | u1)
          continue
        }
        var u2 = heapOrArray[idx++] & 63
        if ((u0 & 0xf0) == 0xe0) {
          u0 = ((u0 & 15) << 12) | (u1 << 6) | u2
        } else {
          if ((u0 & 0xf8) != 0xf0)
            warnOnce(
              'Invalid UTF-8 leading byte ' +
                ptrToString(u0) +
                ' encountered when deserializing a UTF-8 string in wasm memory to a JS string!'
            )
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63)
        }

        if (u0 < 0x10000) {
          str += String.fromCharCode(u0)
        } else {
          var ch = u0 - 0x10000
          str += String.fromCharCode(0xd800 | (ch >> 10), 0xdc00 | (ch & 0x3ff))
        }
      }
      return str
    }

    /**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */
    var UTF8ToString = (ptr, maxBytesToRead) => {
      assert(typeof ptr == 'number', `UTF8ToString expects a number (got ${typeof ptr})`)
      return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : ''
    }
    var __embind_register_std_string = (rawType, name) => {
      name = readLatin1String(name)
      var stdStringIsUTF8 =
        //process only std::string bindings with UTF8 support, in contrast to e.g. std::basic_string<unsigned char>
        name === 'std::string'

      registerType(rawType, {
        name,
        // For some method names we use string keys here since they are part of
        // the public/external API and/or used by the runtime-generated code.
        fromWireType(value) {
          var length = HEAPU32[value >> 2]
          var payload = value + 4

          var str
          if (stdStringIsUTF8) {
            var decodeStartPtr = payload
            // Looping here to support possible embedded '0' bytes
            for (var i = 0; i <= length; ++i) {
              var currentBytePtr = payload + i
              if (i == length || HEAPU8[currentBytePtr] == 0) {
                var maxRead = currentBytePtr - decodeStartPtr
                var stringSegment = UTF8ToString(decodeStartPtr, maxRead)
                if (str === undefined) {
                  str = stringSegment
                } else {
                  str += String.fromCharCode(0)
                  str += stringSegment
                }
                decodeStartPtr = currentBytePtr + 1
              }
            }
          } else {
            var a = new Array(length)
            for (var i = 0; i < length; ++i) {
              a[i] = String.fromCharCode(HEAPU8[payload + i])
            }
            str = a.join('')
          }

          _free(value)

          return str
        },
        toWireType(destructors, value) {
          if (value instanceof ArrayBuffer) {
            value = new Uint8Array(value)
          }

          var length
          var valueIsOfTypeString = typeof value == 'string'

          if (
            !(
              valueIsOfTypeString ||
              value instanceof Uint8Array ||
              value instanceof Uint8ClampedArray ||
              value instanceof Int8Array
            )
          ) {
            throwBindingError('Cannot pass non-string to std::string')
          }
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            length = lengthBytesUTF8(value)
          } else {
            length = value.length
          }

          // assumes POINTER_SIZE alignment
          var base = _malloc(4 + length + 1)
          var ptr = base + 4
          HEAPU32[base >> 2] = length
          if (stdStringIsUTF8 && valueIsOfTypeString) {
            stringToUTF8(value, ptr, length + 1)
          } else {
            if (valueIsOfTypeString) {
              for (var i = 0; i < length; ++i) {
                var charCode = value.charCodeAt(i)
                if (charCode > 255) {
                  _free(ptr)
                  throwBindingError('String has UTF-16 code units that do not fit in 8 bits')
                }
                HEAPU8[ptr + i] = charCode
              }
            } else {
              for (var i = 0; i < length; ++i) {
                HEAPU8[ptr + i] = value[i]
              }
            }
          }

          if (destructors !== null) {
            destructors.push(_free, base)
          }
          return base
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: readPointer,
        destructorFunction(ptr) {
          _free(ptr)
        }
      })
    }

    var UTF16Decoder = typeof TextDecoder != 'undefined' ? new TextDecoder('utf-16le') : undefined
    var UTF16ToString = (ptr, maxBytesToRead) => {
      assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!')
      var endPtr = ptr
      // TextDecoder needs to know the byte length in advance, it doesn't stop on
      // null terminator by itself.
      // Also, use the length info to avoid running tiny strings through
      // TextDecoder, since .subarray() allocates garbage.
      var idx = endPtr >> 1
      var maxIdx = idx + maxBytesToRead / 2
      // If maxBytesToRead is not passed explicitly, it will be undefined, and this
      // will always evaluate to true. This saves on code size.
      while (!(idx >= maxIdx) && HEAPU16[idx]) ++idx
      endPtr = idx << 1

      if (endPtr - ptr > 32 && UTF16Decoder)
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr))

      // Fallback: decode without UTF16Decoder
      var str = ''

      // If maxBytesToRead is not passed explicitly, it will be undefined, and the
      // for-loop's condition will always evaluate to true. The loop is then
      // terminated on the first null char.
      for (var i = 0; !(i >= maxBytesToRead / 2); ++i) {
        var codeUnit = HEAP16[(ptr + i * 2) >> 1]
        if (codeUnit == 0) break
        // fromCharCode constructs a character from a UTF-16 code unit, so we can
        // pass the UTF16 string right through.
        str += String.fromCharCode(codeUnit)
      }

      return str
    }

    var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
      assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!')
      assert(
        typeof maxBytesToWrite == 'number',
        'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!'
      )
      // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
      maxBytesToWrite ??= 0x7fffffff
      if (maxBytesToWrite < 2) return 0
      maxBytesToWrite -= 2 // Null terminator.
      var startPtr = outPtr
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length
      for (var i = 0; i < numCharsToWrite; ++i) {
        // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
        var codeUnit = str.charCodeAt(i) // possibly a lead surrogate
        HEAP16[outPtr >> 1] = codeUnit
        outPtr += 2
      }
      // Null-terminate the pointer to the HEAP.
      HEAP16[outPtr >> 1] = 0
      return outPtr - startPtr
    }

    var lengthBytesUTF16 = (str) => {
      return str.length * 2
    }

    var UTF32ToString = (ptr, maxBytesToRead) => {
      assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!')
      var i = 0

      var str = ''
      // If maxBytesToRead is not passed explicitly, it will be undefined, and this
      // will always evaluate to true. This saves on code size.
      while (!(i >= maxBytesToRead / 4)) {
        var utf32 = HEAP32[(ptr + i * 4) >> 2]
        if (utf32 == 0) break
        ++i
        // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        if (utf32 >= 0x10000) {
          var ch = utf32 - 0x10000
          str += String.fromCharCode(0xd800 | (ch >> 10), 0xdc00 | (ch & 0x3ff))
        } else {
          str += String.fromCharCode(utf32)
        }
      }
      return str
    }

    var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
      assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!')
      assert(
        typeof maxBytesToWrite == 'number',
        'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!'
      )
      // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
      maxBytesToWrite ??= 0x7fffffff
      if (maxBytesToWrite < 4) return 0
      var startPtr = outPtr
      var endPtr = startPtr + maxBytesToWrite - 4
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var codeUnit = str.charCodeAt(i) // possibly a lead surrogate
        if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) {
          var trailSurrogate = str.charCodeAt(++i)
          codeUnit = (0x10000 + ((codeUnit & 0x3ff) << 10)) | (trailSurrogate & 0x3ff)
        }
        HEAP32[outPtr >> 2] = codeUnit
        outPtr += 4
        if (outPtr + 4 > endPtr) break
      }
      // Null-terminate the pointer to the HEAP.
      HEAP32[outPtr >> 2] = 0
      return outPtr - startPtr
    }

    var lengthBytesUTF32 = (str) => {
      var len = 0
      for (var i = 0; i < str.length; ++i) {
        // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
        // See http://unicode.org/faq/utf_bom.html#utf16-3
        var codeUnit = str.charCodeAt(i)
        if (codeUnit >= 0xd800 && codeUnit <= 0xdfff) ++i // possibly a lead surrogate, so skip over the tail surrogate.
        len += 4
      }

      return len
    }
    var __embind_register_std_wstring = (rawType, charSize, name) => {
      name = readLatin1String(name)
      var decodeString, encodeString, getHeap, lengthBytesUTF, shift
      if (charSize === 2) {
        decodeString = UTF16ToString
        encodeString = stringToUTF16
        lengthBytesUTF = lengthBytesUTF16
        getHeap = () => HEAPU16
        shift = 1
      } else if (charSize === 4) {
        decodeString = UTF32ToString
        encodeString = stringToUTF32
        lengthBytesUTF = lengthBytesUTF32
        getHeap = () => HEAPU32
        shift = 2
      }
      registerType(rawType, {
        name,
        fromWireType: (value) => {
          // Code mostly taken from _embind_register_std_string fromWireType
          var length = HEAPU32[value >> 2]
          var HEAP = getHeap()
          var str

          var decodeStartPtr = value + 4
          // Looping here to support possible embedded '0' bytes
          for (var i = 0; i <= length; ++i) {
            var currentBytePtr = value + 4 + i * charSize
            if (i == length || HEAP[currentBytePtr >> shift] == 0) {
              var maxReadBytes = currentBytePtr - decodeStartPtr
              var stringSegment = decodeString(decodeStartPtr, maxReadBytes)
              if (str === undefined) {
                str = stringSegment
              } else {
                str += String.fromCharCode(0)
                str += stringSegment
              }
              decodeStartPtr = currentBytePtr + charSize
            }
          }

          _free(value)

          return str
        },
        toWireType: (destructors, value) => {
          if (!(typeof value == 'string')) {
            throwBindingError(`Cannot pass non-string to C++ string type ${name}`)
          }

          // assumes POINTER_SIZE alignment
          var length = lengthBytesUTF(value)
          var ptr = _malloc(4 + length + charSize)
          HEAPU32[ptr >> 2] = length >> shift

          encodeString(value, ptr + 4, length + charSize)

          if (destructors !== null) {
            destructors.push(_free, ptr)
          }
          return ptr
        },
        argPackAdvance: GenericWireTypeSize,
        readValueFromPointer: simpleReadValueFromPointer,
        destructorFunction(ptr) {
          _free(ptr)
        }
      })
    }

    var __embind_register_void = (rawType, name) => {
      name = readLatin1String(name)
      registerType(rawType, {
        isVoid: true, // void return values can be optimized out sometimes
        name,
        argPackAdvance: 0,
        fromWireType: () => undefined,
        // TODO: assert if anything else is given?
        toWireType: (destructors, o) => undefined
      })
    }

    var getHeapMax = () => HEAPU8.length

    var abortOnCannotGrowMemory = (requestedSize) => {
      abort(
        `Cannot enlarge memory arrays to size ${requestedSize} bytes (OOM). Either (1) compile with -sINITIAL_MEMORY=X with X higher than the current value ${HEAP8.length}, (2) compile with -sALLOW_MEMORY_GROWTH which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with -sABORTING_MALLOC=0`
      )
    }
    var _emscripten_resize_heap = (requestedSize) => {
      var oldSize = HEAPU8.length
      // With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
      requestedSize >>>= 0
      abortOnCannotGrowMemory(requestedSize)
    }

    var SYSCALLS = {
      varargs: undefined,
      get() {
        assert(SYSCALLS.varargs != undefined)
        // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
        var ret = HEAP32[+SYSCALLS.varargs >> 2]
        SYSCALLS.varargs += 4
        return ret
      },
      getp() {
        return SYSCALLS.get()
      },
      getStr(ptr) {
        var ret = UTF8ToString(ptr)
        return ret
      }
    }
    var _fd_close = (fd) => {
      abort('fd_close called without SYSCALLS_REQUIRE_FILESYSTEM')
    }

    var convertI32PairToI53Checked = (lo, hi) => {
      assert(lo == lo >>> 0 || lo == (lo | 0)) // lo should either be a i32 or a u32
      assert(hi === (hi | 0)) // hi should be a i32
      return (hi + 0x200000) >>> 0 < 0x400001 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN
    }
    function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
      var offset = convertI32PairToI53Checked(offset_low, offset_high)

      return 70
    }

    var printCharBuffers = [null, [], []]

    var printChar = (stream, curr) => {
      var buffer = printCharBuffers[stream]
      assert(buffer)
      if (curr === 0 || curr === 10) {
        ;(stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0))
        buffer.length = 0
      } else {
        buffer.push(curr)
      }
    }

    var flush_NO_FILESYSTEM = () => {
      // flush anything remaining in the buffers during shutdown
      _fflush(0)
      if (printCharBuffers[1].length) printChar(1, 10)
      if (printCharBuffers[2].length) printChar(2, 10)
    }

    var _fd_write = (fd, iov, iovcnt, pnum) => {
      // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
      var num = 0
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAPU32[iov >> 2]
        var len = HEAPU32[(iov + 4) >> 2]
        iov += 8
        for (var j = 0; j < len; j++) {
          printChar(fd, HEAPU8[ptr + j])
        }
        num += len
      }
      HEAPU32[pnum >> 2] = num
      return 0
    }

    var getCFunc = (ident) => {
      var func = Module['_' + ident] // closure exported function
      assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported')
      return func
    }

    var writeArrayToMemory = (array, buffer) => {
      assert(
        array.length >= 0,
        'writeArrayToMemory array must have a length (should be an array or typed array)'
      )
      HEAP8.set(array, buffer)
    }

    var stringToUTF8OnStack = (str) => {
      var size = lengthBytesUTF8(str) + 1
      var ret = stackAlloc(size)
      stringToUTF8(str, ret, size)
      return ret
    }

    /**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Arguments|Array=} args
     * @param {Object=} opts
     */
    var ccall = (ident, returnType, argTypes, args, opts) => {
      // For fast lookup of conversion functions
      var toC = {
        string: (str) => {
          var ret = 0
          if (str !== null && str !== undefined && str !== 0) {
            // null string
            // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
            ret = stringToUTF8OnStack(str)
          }
          return ret
        },
        array: (arr) => {
          var ret = stackAlloc(arr.length)
          writeArrayToMemory(arr, ret)
          return ret
        }
      }

      function convertReturnValue(ret) {
        if (returnType === 'string') {
          return UTF8ToString(ret)
        }
        if (returnType === 'boolean') return Boolean(ret)
        return ret
      }

      var func = getCFunc(ident)
      var cArgs = []
      var stack = 0
      assert(returnType !== 'array', 'Return type should not be "array".')
      if (args) {
        for (var i = 0; i < args.length; i++) {
          var converter = toC[argTypes[i]]
          if (converter) {
            if (stack === 0) stack = stackSave()
            cArgs[i] = converter(args[i])
          } else {
            cArgs[i] = args[i]
          }
        }
      }
      var ret = func.apply(null, cArgs)
      function onDone(ret) {
        if (stack !== 0) stackRestore(stack)
        return convertReturnValue(ret)
      }

      ret = onDone(ret)
      return ret
    }

    /**
     * @param {string=} returnType
     * @param {Array=} argTypes
     * @param {Object=} opts
     */
    var cwrap = (ident, returnType, argTypes, opts) => {
      return function () {
        return ccall(ident, returnType, argTypes, arguments, opts)
      }
    }

    embind_init_charCodes()
    BindingError = Module['BindingError'] = class BindingError extends Error {
      constructor(message) {
        super(message)
        this.name = 'BindingError'
      }
    }
    InternalError = Module['InternalError'] = class InternalError extends Error {
      constructor(message) {
        super(message)
        this.name = 'InternalError'
      }
    }
    init_emval()
    function checkIncomingModuleAPI() {
      ignoredModuleProp('fetchSettings')
    }
    var wasmImports = {
      /** @export */
      _embind_register_bigint: __embind_register_bigint,
      /** @export */
      _embind_register_bool: __embind_register_bool,
      /** @export */
      _embind_register_emval: __embind_register_emval,
      /** @export */
      _embind_register_float: __embind_register_float,
      /** @export */
      _embind_register_integer: __embind_register_integer,
      /** @export */
      _embind_register_memory_view: __embind_register_memory_view,
      /** @export */
      _embind_register_std_string: __embind_register_std_string,
      /** @export */
      _embind_register_std_wstring: __embind_register_std_wstring,
      /** @export */
      _embind_register_void: __embind_register_void,
      /** @export */
      emscripten_resize_heap: _emscripten_resize_heap,
      /** @export */
      fd_close: _fd_close,
      /** @export */
      fd_seek: _fd_seek,
      /** @export */
      fd_write: _fd_write,
      /** @export */
      memory: wasmMemory
    }
    var wasmExports = createWasm()
    var ___wasm_call_ctors = createExportWrapper('__wasm_call_ctors')
    var _new_uint64 = (Module['_new_uint64'] = createExportWrapper('new_uint64'))
    var _malloc = createExportWrapper('malloc')
    var _heap_malloc = (Module['_heap_malloc'] = createExportWrapper('heap_malloc'))
    var _CalcCityHash64 = (Module['_CalcCityHash64'] = createExportWrapper('CalcCityHash64'))
    var _fflush = createExportWrapper('fflush')
    var _free = (Module['_free'] = createExportWrapper('free'))
    var _emscripten_stack_init = () =>
      (_emscripten_stack_init = wasmExports['emscripten_stack_init'])()
    var _emscripten_stack_get_free = () =>
      (_emscripten_stack_get_free = wasmExports['emscripten_stack_get_free'])()
    var _emscripten_stack_get_base = () =>
      (_emscripten_stack_get_base = wasmExports['emscripten_stack_get_base'])()
    var _emscripten_stack_get_end = () =>
      (_emscripten_stack_get_end = wasmExports['emscripten_stack_get_end'])()
    var stackSave = createExportWrapper('stackSave')
    var stackRestore = createExportWrapper('stackRestore')
    var stackAlloc = createExportWrapper('stackAlloc')
    var _emscripten_stack_get_current = () =>
      (_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'])()
    var ___cxa_is_pointer_type = createExportWrapper('__cxa_is_pointer_type')
    var dynCall_jiji = (Module['dynCall_jiji'] = createExportWrapper('dynCall_jiji'))

    // include: postamble.js
    // === Auto-generated postamble setup entry stuff ===

    Module['ccall'] = ccall
    Module['cwrap'] = cwrap
    Module['stringToUTF16'] = stringToUTF16
    var missingLibrarySymbols = [
      'writeI53ToI64',
      'writeI53ToI64Clamped',
      'writeI53ToI64Signaling',
      'writeI53ToU64Clamped',
      'writeI53ToU64Signaling',
      'readI53FromI64',
      'readI53FromU64',
      'convertI32PairToI53',
      'convertU32PairToI53',
      'zeroMemory',
      'exitJS',
      'growMemory',
      'isLeapYear',
      'ydayFromDate',
      'arraySum',
      'addDays',
      'inetPton4',
      'inetNtop4',
      'inetPton6',
      'inetNtop6',
      'readSockaddr',
      'writeSockaddr',
      'initRandomFill',
      'randomFill',
      'getCallstack',
      'emscriptenLog',
      'convertPCtoSourceLocation',
      'readEmAsmArgs',
      'jstoi_q',
      'getExecutableName',
      'listenOnce',
      'autoResumeAudioContext',
      'dynCallLegacy',
      'getDynCaller',
      'dynCall',
      'handleException',
      'keepRuntimeAlive',
      'runtimeKeepalivePush',
      'runtimeKeepalivePop',
      'callUserCallback',
      'maybeExit',
      'asmjsMangle',
      'asyncLoad',
      'alignMemory',
      'mmapAlloc',
      'getNativeTypeSize',
      'STACK_SIZE',
      'STACK_ALIGN',
      'POINTER_SIZE',
      'ASSERTIONS',
      'uleb128Encode',
      'sigToWasmTypes',
      'generateFuncType',
      'convertJsFunctionToWasm',
      'getEmptyTableSlot',
      'updateTableMap',
      'getFunctionAddress',
      'addFunction',
      'removeFunction',
      'reallyNegative',
      'unSign',
      'strLen',
      'reSign',
      'formatString',
      'intArrayFromString',
      'intArrayToString',
      'AsciiToString',
      'stringToAscii',
      'stringToNewUTF8',
      'registerKeyEventCallback',
      'maybeCStringToJsString',
      'findEventTarget',
      'getBoundingClientRect',
      'fillMouseEventData',
      'registerMouseEventCallback',
      'registerWheelEventCallback',
      'registerUiEventCallback',
      'registerFocusEventCallback',
      'fillDeviceOrientationEventData',
      'registerDeviceOrientationEventCallback',
      'fillDeviceMotionEventData',
      'registerDeviceMotionEventCallback',
      'screenOrientation',
      'fillOrientationChangeEventData',
      'registerOrientationChangeEventCallback',
      'fillFullscreenChangeEventData',
      'registerFullscreenChangeEventCallback',
      'JSEvents_requestFullscreen',
      'JSEvents_resizeCanvasForFullscreen',
      'registerRestoreOldStyle',
      'hideEverythingExceptGivenElement',
      'restoreHiddenElements',
      'setLetterbox',
      'softFullscreenResizeWebGLRenderTarget',
      'doRequestFullscreen',
      'fillPointerlockChangeEventData',
      'registerPointerlockChangeEventCallback',
      'registerPointerlockErrorEventCallback',
      'requestPointerLock',
      'fillVisibilityChangeEventData',
      'registerVisibilityChangeEventCallback',
      'registerTouchEventCallback',
      'fillGamepadEventData',
      'registerGamepadEventCallback',
      'registerBeforeUnloadEventCallback',
      'fillBatteryEventData',
      'battery',
      'registerBatteryEventCallback',
      'setCanvasElementSize',
      'getCanvasElementSize',
      'demangle',
      'jsStackTrace',
      'stackTrace',
      'getEnvStrings',
      'checkWasiClock',
      'wasiRightsToMuslOFlags',
      'wasiOFlagsToMuslOFlags',
      'createDyncallWrapper',
      'safeSetTimeout',
      'setImmediateWrapped',
      'clearImmediateWrapped',
      'polyfillSetImmediate',
      'getPromise',
      'makePromise',
      'idsToPromises',
      'makePromiseCallback',
      'ExceptionInfo',
      'findMatchingCatch',
      'Browser_asyncPrepareDataCounter',
      'setMainLoop',
      'getSocketFromFD',
      'getSocketAddress',
      'FS_createPreloadedFile',
      'FS_modeStringToFlags',
      'FS_getMode',
      'FS_stdin_getChar',
      'FS_createDataFile',
      'FS_unlink',
      'FS_mkdirTree',
      '_setNetworkCallback',
      'heapObjectForWebGLType',
      'heapAccessShiftForWebGLHeap',
      'webgl_enable_ANGLE_instanced_arrays',
      'webgl_enable_OES_vertex_array_object',
      'webgl_enable_WEBGL_draw_buffers',
      'webgl_enable_WEBGL_multi_draw',
      'emscriptenWebGLGet',
      'computeUnpackAlignedImageSize',
      'colorChannelsInGlTextureFormat',
      'emscriptenWebGLGetTexPixelData',
      '__glGenObject',
      'emscriptenWebGLGetUniform',
      'webglGetUniformLocation',
      'webglPrepareUniformLocationsBeforeFirstUse',
      'webglGetLeftBracePos',
      'emscriptenWebGLGetVertexAttrib',
      '__glGetActiveAttribOrUniform',
      'writeGLArray',
      'registerWebGlEventCallback',
      'runAndAbortIfError',
      'SDL_unicode',
      'SDL_ttfContext',
      'SDL_audio',
      'ALLOC_NORMAL',
      'ALLOC_STACK',
      'allocate',
      'writeStringToMemory',
      'writeAsciiToMemory',
      'setErrNo',
      'getTypeName',
      'getFunctionName',
      'getFunctionArgsName',
      'heap32VectorToArray',
      'requireRegisteredType',
      'usesDestructorStack',
      'createJsInvokerSignature',
      'createJsInvoker',
      'init_embind',
      'throwUnboundTypeError',
      'ensureOverloadTable',
      'exposePublicSymbol',
      'replacePublicSymbol',
      'extendError',
      'createNamedFunction',
      'getBasestPointer',
      'registerInheritedInstance',
      'unregisterInheritedInstance',
      'getInheritedInstance',
      'getInheritedInstanceCount',
      'getLiveInheritedInstances',
      'enumReadValueFromPointer',
      'runDestructors',
      'newFunc',
      'craftInvokerFunction',
      'embind__requireFunction',
      'genericPointerToWireType',
      'constNoSmartPtrRawPointerToWireType',
      'nonConstNoSmartPtrRawPointerToWireType',
      'init_RegisteredPointer',
      'RegisteredPointer',
      'RegisteredPointer_fromWireType',
      'runDestructor',
      'releaseClassHandle',
      'detachFinalizer',
      'attachFinalizer',
      'makeClassHandle',
      'init_ClassHandle',
      'ClassHandle',
      'throwInstanceAlreadyDeleted',
      'flushPendingDeletes',
      'setDelayFunction',
      'RegisteredClass',
      'shallowCopyInternalPointer',
      'downcastPointer',
      'upcastPointer',
      'validateThis',
      'char_0',
      'char_9',
      'makeLegalFunctionName',
      'getStringOrSymbol',
      'emval_get_global',
      'emval_returnValue',
      'emval_lookupTypes',
      'emval_addMethodCaller'
    ]
    missingLibrarySymbols.forEach(missingLibrarySymbol)

    var unexportedSymbols = [
      'run',
      'addOnPreRun',
      'addOnInit',
      'addOnPreMain',
      'addOnExit',
      'addOnPostRun',
      'addRunDependency',
      'removeRunDependency',
      'FS_createFolder',
      'FS_createPath',
      'FS_createLazyFile',
      'FS_createLink',
      'FS_createDevice',
      'FS_readFile',
      'out',
      'err',
      'callMain',
      'abort',
      'wasmMemory',
      'wasmExports',
      'stackAlloc',
      'stackSave',
      'stackRestore',
      'getTempRet0',
      'setTempRet0',
      'writeStackCookie',
      'checkStackCookie',
      'intArrayFromBase64',
      'tryParseAsDataURI',
      'convertI32PairToI53Checked',
      'ptrToString',
      'getHeapMax',
      'abortOnCannotGrowMemory',
      'ENV',
      'MONTH_DAYS_REGULAR',
      'MONTH_DAYS_LEAP',
      'MONTH_DAYS_REGULAR_CUMULATIVE',
      'MONTH_DAYS_LEAP_CUMULATIVE',
      'ERRNO_CODES',
      'ERRNO_MESSAGES',
      'DNS',
      'Protocols',
      'Sockets',
      'timers',
      'warnOnce',
      'UNWIND_CACHE',
      'readEmAsmArgsArray',
      'jstoi_s',
      'HandleAllocator',
      'wasmTable',
      'noExitRuntime',
      'getCFunc',
      'freeTableIndexes',
      'functionsInTableMap',
      'setValue',
      'getValue',
      'PATH',
      'PATH_FS',
      'UTF8Decoder',
      'UTF8ArrayToString',
      'UTF8ToString',
      'stringToUTF8Array',
      'stringToUTF8',
      'lengthBytesUTF8',
      'UTF16Decoder',
      'UTF16ToString',
      'lengthBytesUTF16',
      'UTF32ToString',
      'stringToUTF32',
      'lengthBytesUTF32',
      'stringToUTF8OnStack',
      'writeArrayToMemory',
      'JSEvents',
      'specialHTMLTargets',
      'findCanvasEventTarget',
      'currentFullscreenStrategy',
      'restoreOldWindowedStyle',
      'ExitStatus',
      'flush_NO_FILESYSTEM',
      'promiseMap',
      'uncaughtExceptionCount',
      'exceptionLast',
      'exceptionCaught',
      'Browser',
      'wget',
      'SYSCALLS',
      'preloadPlugins',
      'FS_stdin_getChar_buffer',
      'FS',
      'MEMFS',
      'TTY',
      'PIPEFS',
      'SOCKFS',
      'tempFixedLengthArray',
      'miniTempWebGLFloatBuffers',
      'miniTempWebGLIntBuffers',
      'GL',
      'emscripten_webgl_power_preferences',
      'AL',
      'GLUT',
      'EGL',
      'GLEW',
      'IDBStore',
      'SDL',
      'SDL_gfx',
      'allocateUTF8',
      'allocateUTF8OnStack',
      'InternalError',
      'BindingError',
      'throwInternalError',
      'throwBindingError',
      'registeredTypes',
      'awaitingDependencies',
      'typeDependencies',
      'tupleRegistrations',
      'structRegistrations',
      'sharedRegisterType',
      'whenDependentTypesAreResolved',
      'embind_charCodes',
      'embind_init_charCodes',
      'readLatin1String',
      'UnboundTypeError',
      'PureVirtualError',
      'GenericWireTypeSize',
      'EmValType',
      'embindRepr',
      'registeredInstances',
      'registeredPointers',
      'registerType',
      'integerReadValueFromPointer',
      'floatReadValueFromPointer',
      'simpleReadValueFromPointer',
      'readPointer',
      'finalizationRegistry',
      'detachFinalizer_deps',
      'deletionQueue',
      'delayFunction',
      'emval_handles',
      'emval_symbols',
      'init_emval',
      'count_emval_handles',
      'Emval',
      'emval_methodCallers',
      'reflectConstruct'
    ]
    unexportedSymbols.forEach(unexportedRuntimeSymbol)

    var calledRun

    dependenciesFulfilled = function runCaller() {
      // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
      if (!calledRun) run()
      if (!calledRun) dependenciesFulfilled = runCaller // try this again later, after new deps are fulfilled
    }

    function stackCheckInit() {
      // This is normally called automatically during __wasm_call_ctors but need to
      // get these values before even running any of the ctors so we call it redundantly
      // here.
      _emscripten_stack_init()
      // TODO(sbc): Move writeStackCookie to native to to avoid this.
      writeStackCookie()
    }

    function run() {
      if (runDependencies > 0) {
        return
      }

      stackCheckInit()

      preRun()

      // a preRun added a dependency, run will be called later
      if (runDependencies > 0) {
        return
      }

      function doRun() {
        // run may have just been called through dependencies being fulfilled just in this very frame,
        // or while the async setStatus time below was happening
        if (calledRun) return
        calledRun = true
        Module['calledRun'] = true

        if (ABORT) return

        initRuntime()

        readyPromiseResolve(Module)
        if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']()

        assert(
          !Module['_main'],
          'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]'
        )

        postRun()
      }

      if (Module['setStatus']) {
        Module['setStatus']('Running...')
        setTimeout(function () {
          setTimeout(function () {
            Module['setStatus']('')
          }, 1)
          doRun()
        }, 1)
      } else {
        doRun()
      }
      checkStackCookie()
    }

    function checkUnflushedContent() {
      // Compiler settings do not allow exiting the runtime, so flushing
      // the streams is not possible. but in ASSERTIONS mode we check
      // if there was something to flush, and if so tell the user they
      // should request that the runtime be exitable.
      // Normally we would not even include flush() at all, but in ASSERTIONS
      // builds we do so just for this check, and here we see if there is any
      // content to flush, that is, we check if there would have been
      // something a non-ASSERTIONS build would have not seen.
      // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
      // mode (which has its own special function for this; otherwise, all
      // the code is inside libc)
      var oldOut = out
      var oldErr = err
      var has = false
      out = err = (x) => {
        has = true
      }
      try {
        // it doesn't matter if it fails
        flush_NO_FILESYSTEM()
      } catch (e) {}
      out = oldOut
      err = oldErr
      if (has) {
        warnOnce(
          'stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.'
        )
        warnOnce(
          '(this may also be due to not including full filesystem support - try building with -sFORCE_FILESYSTEM)'
        )
      }
    }

    if (Module['preInit']) {
      if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']]
      while (Module['preInit'].length > 0) {
        Module['preInit'].pop()()
      }
    }

    run()

    // end include: postamble.js

    return moduleArg.ready
  }
})()
if (typeof exports === 'object' && typeof module === 'object') module.exports = Module
else if (typeof define === 'function' && define['amd']) define([], () => Module)
export { Module }
