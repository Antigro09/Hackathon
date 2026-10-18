/** Import-free research diagnostic bootstrap. Copy beside qualified static assets.
 * No classifier, probabilities, source labels, activation or promotion.
 */
const REVISION = 'c28f2883575e590e04d3146ff0713c2448d691ba';
const MODEL_SHA = '3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f';
const GENERATOR_SHA = 'cf4c6a95f4b5108c4c906829385f062a66ccf363a2ece78c49da31b634af4105';
const REFERENCE_SHA = '6d5414df3b9413283c88f599887d149314c9c8fb189c5324205b452e33a2212d';
// Byte pins are independent of the served manifest and message payloads.
export const WORKER_V3_ASSETS = Object.freeze(Object.fromEntries([
  ['canonicalEncoder.mjs', '6cda0b9db5fee7c1612629d014ead11a93d6e369b101a68af9e32d82c031ebb4', 4625],
  ['transformers.web.js', 'f2da43b6b960ca15ae8678e4899a5df0031125c38e94a03e458bd762751d6367', 1156772],
  ['ort.wasm.bundle.min.mjs', '17b52c1ac62b421dc508b4c28b9a9675251c6e25dd512ef54b83a5e2c4242869', 73123],
  ['runtime/ort-wasm-simd-threaded.mjs', 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f', 24381],
  ['runtime/ort-wasm-simd-threaded.wasm', '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3', 14264838],
  ['app/resample.js', '2ab0e2e2a8d3bbc8dc2d3608993c7b27c2df4726a20411e5054414f4223d0477', 4233],
  ['app/model.js', 'a082366e74a74302ca4b55b3a333b53320d619bdc5f2a17a824cfd1b898f25b0', 1308],
  ['app/model', 'a082366e74a74302ca4b55b3a333b53320d619bdc5f2a17a824cfd1b898f25b0', 1308],
  [`models/${REVISION}/config.json`, '39c6d90fe29cf2cce650dd5c92c38a1e35b130d9ce0bb98585222ad687ad979b', 699],
  [`models/${REVISION}/preprocessor_config.json`, '9739f58296aa6f9ac18008fd0150fb2649bc554985fbde86d0a4041c882ac753', 541],
  ['selfTestV3.mjs', GENERATOR_SHA, 1775],
  ['self-test-v3-reference.json', REFERENCE_SHA, 36622],
].map(([name, sha256, bytes]) => [name, Object.freeze({sha256, bytes})])));
const MODEL = Object.freeze({sha256: MODEL_SHA, bytes: 34301667});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const arrayBytes = values => values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength);
const actualSha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
class WorkerFailure extends Error { constructor(code, message) {super(message); this.code = code;} }
const fail = (condition, code, message) => {if (!condition) throw new WorkerFailure(code, message);};
const pcmIsEligible = (pcm, rate) => {
  if (!(pcm instanceof Float32Array) || ![44100,48000].includes(rate) || pcm.length !== rate*5) return false;
  let squares=0;
  for(const sample of pcm) {if(!Number.isFinite(sample)||Math.abs(sample)>=.999)return false;squares+=sample*sample;}
  return Math.sqrt(squares/pcm.length)>=1e-5;
};

/** Exported for isolated protocol tests; message senders cannot replace these dependencies. */
export function createProductionWorkerV3({post, fetchImpl = globalThis.fetch, shaImpl = actualSha, makeEncoder, makeProcessor,
  moduleLoader = async (_name, _source, url) => import(url),
  createModuleUrl = (bytes,type) => URL.createObjectURL(new Blob([bytes],{type})), revokeModuleUrl = url => URL.revokeObjectURL(url),
  baseUrl = new URL('./', import.meta.url).href} = {}) {
  if (typeof post !== 'function') throw new Error('A local message sink is required');
  const base = new URL(baseUrl);
  fail(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash, 'invalid-base', 'A static HTTP asset directory is required.');
  let phase = 'idle', encoder = null, modules = null, provenance = null, active = null, generation = 0, shuttingDown = false, disposal = null;
  const moduleUrls = new Set();
  const send = value => post(value);
  const current = operation => !shuttingDown && !operation.cancelled && operation.generation === generation;
  const guard = operation => fail(current(operation), 'cancelled', 'Operation cancelled.');
  const makeUrl = (bytes,type='text/javascript') => {const url=createModuleUrl(bytes,type);moduleUrls.add(url);return url;};
  const cleanupModules = () => {if(modules)modules.ort.env.wasm.wasmBinary=undefined;modules=null;for(const url of moduleUrls)revokeModuleUrl(url);moduleUrls.clear();};

  async function loadModules(resources, operation) {
    const decode=bytes=>new TextDecoder().decode(bytes);
    const bindings={};
    const load=async(name,source=decode(resources.get(name)),rewrites=0)=>{
      guard(operation);const executedModuleSha256=await shaImpl(new TextEncoder().encode(source));guard(operation);
      const url=makeUrl(source),exports=await moduleLoader(name,source,url);guard(operation);
      bindings[name]={verifiedSourceSha256:WORKER_V3_ASSETS[name].sha256,executedModuleSha256,importSpecifierRewrites:rewrites};return{url,exports};
    };
    const ort=await load('ort.wasm.bundle.min.mjs');
    const transformerSource=decode(resources.get('transformers.web.js'));
    fail(transformerSource.split('"./ort.wasm.bundle.min.mjs"').length===3,'import-contract','Expected exactly two preprocessing imports.');
    const transformers=await load('transformers.web.js',transformerSource.replaceAll('"./ort.wasm.bundle.min.mjs"',JSON.stringify(ort.url)),2);
    const model=await load('app/model.js');
    const resamplerSource=decode(resources.get('app/resample.js'));
    fail(resamplerSource.split("'./model'").length===2,'import-contract','Expected exactly one compiled resampler import.');
    const resampler=await load('app/resample.js',resamplerSource.replace("'./model'",JSON.stringify(model.url)),1);
    const canonical=await load('canonicalEncoder.mjs'),selfTest=await load('selfTestV3.mjs');
    const loaderUrl=makeUrl(resources.get('runtime/ort-wasm-simd-threaded.mjs'));
    const wasmUrl=makeUrl(resources.get('runtime/ort-wasm-simd-threaded.wasm'),'application/wasm');
    return{ort:ort.exports,transformers:transformers.exports,canonical:canonical.exports,resampler:resampler.exports,selfTest:selfTest.exports,loaderUrl,wasmUrl,bindings};
  }

  async function readResource(name, expected, operation, maximum = expected?.bytes) {
    const allowed = name === 'asset-manifest.json' || name === 'audio_model_quantized.onnx' || Object.hasOwn(WORKER_V3_ASSETS, name);
    fail(allowed, 'invalid-resource', 'Resource is not allowlisted.');
    guard(operation);
    const url = new URL(name, base);
    fail(url.origin === base.origin && url.href.startsWith(base.href), 'invalid-resource', 'Resource left its static directory.');
    const response = await fetchImpl(url.href, {method:'GET', credentials:'omit', redirect:'error', cache:'no-store', referrerPolicy:'no-referrer', signal:operation.abort.signal});
    guard(operation);
    fail(response.ok, 'asset-unavailable', 'A required runtime asset is unavailable.');
    const declared = response.headers?.get('content-length');
    if (declared !== null && declared !== undefined) fail(/^\d+$/.test(declared) && Number(declared) <= maximum, 'asset-size', 'Runtime asset size exceeded its bound.');
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = []; let total = 0;
      try {
        while (true) {
          const {done, value} = await reader.read();
          guard(operation);
          if (done) break;
          total += value.byteLength;
          fail(total <= maximum, 'asset-size', 'Runtime asset size exceeded its bound.');
          chunks.push(value);
        }
      } catch (error) {await reader.cancel().catch(() => {}); throw error;}
      finally {reader.releaseLock();}
      bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    } else {
      // Test doubles may omit streaming; real browser Fetch streams are bounded above.
      bytes = new Uint8Array(await response.arrayBuffer());
      fail(bytes.length <= maximum, 'asset-size', 'Runtime asset size exceeded its bound.');
    }
    guard(operation);
    const sha256 = await shaImpl(bytes);
    if (expected) fail(bytes.length === expected.bytes && sha256 === expected.sha256, 'asset-mismatch', 'Runtime asset verification failed.');
    return {bytes, sha256};
  }

  async function stages(result, input) {
    return {inputSha256:await shaImpl(arrayBytes(input)), resampledPcmSha256:await shaImpl(arrayBytes(result.resampled)),
      featureSha256:await shaImpl(arrayBytes(result.features)), embeddingSha256:await shaImpl(arrayBytes(result.embedding))};
  }

  async function initialize(operation) {
    if (encoder) return;
    phase = 'loading'; send({type:'status',requestId:operation.id,phase});
    const manifestAsset = await readResource('asset-manifest.json', null, operation, 131072);
    const manifest = JSON.parse(new TextDecoder().decode(manifestAsset.bytes));
    fail(manifest.schemaVersion === 1 && manifest.packageKind === 'tw-canonical-v3-runtime-assets' && manifest.researchOnly === true
      && manifest.activationReady === false && manifest.promotionAllowed === false, 'manifest-mismatch', 'Unpromoted research runtime manifest required.');
    fail(manifest.canonicalEncoder?.modelSha256 === MODEL_SHA && manifest.canonicalEncoder.revision === REVISION
      && manifest.syntheticSelfTest?.moduleSha256 === GENERATOR_SHA && manifest.syntheticSelfTest.referenceSha256 === REFERENCE_SHA
      && manifest.syntheticSelfTest.softwareOnly === true && manifest.syntheticSelfTest.fieldEvidence === false, 'manifest-mismatch', 'Runtime or synthetic startup identity mismatch.');
    const resources = new Map();
    for (const [name, expected] of Object.entries(WORKER_V3_ASSETS)) {
      fail(manifest.files?.[name]?.sha256 === expected.sha256 && manifest.files[name].bytes === expected.bytes, 'manifest-mismatch', 'Runtime dependency manifest mismatch.');
      resources.set(name, (await readResource(name, expected, operation)).bytes);
    }
    const reference = JSON.parse(new TextDecoder().decode(resources.get('self-test-v3-reference.json')));
    fail(reference.formatVersion === 1 && reference.fieldEvidence === false && reference.promotionAllowed === false && reference.classifierIncluded === false
      && reference.generator?.sha256 === GENERATOR_SHA && Array.isArray(reference.cases) && reference.cases.length === 2, 'self-test-mismatch', 'Synthetic startup reference is invalid.');
    const model = await readResource('audio_model_quantized.onnx', MODEL, operation);
    guard(operation);
    let candidate, startupError;
    try {
      modules=await loadModules(resources,operation);
      const {ort,transformers,canonical,resampler,selfTest}=modules;
      const {CANONICAL_ENCODER}=canonical,{env}=transformers;
      fail(CANONICAL_ENCODER.modelSha256 === MODEL_SHA && env.version === '4.3.1' && selfTest.SELF_TEST_V3.cases.length === 2, 'runtime-mismatch', 'Unexpected canonical encoder or preprocessing version.');
      fail(new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4, 'runtime-mismatch', 'Little-endian Float32 is required.');
      env.allowRemoteModels = false; env.allowLocalModels = true; env.useBrowserCache = false; env.useFSCache = false;
      ort.env.wasm.wasmBinary = resources.get('runtime/ort-wasm-simd-threaded.wasm');
      const config=JSON.parse(new TextDecoder().decode(resources.get(`models/${REVISION}/preprocessor_config.json`)));
      const processor=makeProcessor?makeProcessor(config):new transformers.ClapFeatureExtractor(config);
      candidate = await (makeEncoder??canonical.createCanonicalEncoder)({ort,processor,resample:resampler.resampleForSoundHints,modelBytes:model.bytes,
        wasmPaths:{mjs:modules.loaderUrl,wasm:modules.wasmUrl}});
      guard(operation);
      phase = 'self-test'; send({type:'status',requestId:operation.id,phase});
      for (const [index, expected] of reference.cases.entries()) {
        const input = selfTest.generateSelfTestV3Input(expected.id);
        fail(input.id === selfTest.SELF_TEST_V3.cases[index].id && input.sampleRate === expected.sampleRate && input.samples.length === expected.sampleCount, 'self-test-mismatch', 'Synthetic startup input mismatch.');
        const before = await shaImpl(arrayBytes(input.samples));
        guard(operation);
        const result = await candidate.extract(input.samples, input.sampleRate);
        guard(operation);
        const actual = await stages(result, input.samples);
        fail(before === actual.inputSha256 && Object.keys(actual).every(key => actual[key] === expected[key]), 'self-test-mismatch', 'Synthetic startup stage mismatch; diagnostics unavailable.');
      }
      guard(operation);
      provenance = Object.freeze({implementation:'tw-v3-static-worker-diagnostic-v1',modelSha256:MODEL_SHA,revision:REVISION,
        assetManifestSha256:manifestAsset.sha256,syntheticReferenceSha256:REFERENCE_SHA,generatorSha256:GENERATOR_SHA,
        runtimeFingerprintSha256:reference.embeddingContract.runtimeFingerprintSha256,preprocessingContractSha256:reference.embeddingContract.preprocessingContractSha256,
        selfTestCases:2,selfTestPassed:true,normalization:CANONICAL_ENCODER.normalization,dimension:512,fieldEvidence:false,classifierIncluded:false,promotionAllowed:false});
      provenance=Object.freeze({...provenance,moduleBindings:modules.bindings,moduleLoading:'verified bytes executed as Blob modules; only two Transformers and one resampler import specifiers redirected'});
      encoder = candidate; candidate = null; phase = 'ready';
    } catch(error) {startupError=error;throw error;}
    finally {
      try {if(candidate)await candidate.dispose();}
      catch(error) {if(!startupError)throw error;}
      finally {if(!encoder)cleanupModules();}
    }
  }

  function validateMessage(value) {
    fail(record(value) && validId(value.requestId), 'invalid-request', 'A bounded request ID is required.');
    const fields = {initialize:['type','requestId'],extract:['type','requestId','pcm','sampleRateHz'],cancel:['type','requestId','targetRequestId'],dispose:['type','requestId']}[value.type];
    fail(fields && Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key)), 'invalid-request', 'Unknown request type or fields.');
    if (value.type === 'cancel') fail(validId(value.targetRequestId), 'invalid-request', 'A bounded cancellation target is required.');
    if (value.type === 'extract') {
      fail(!(typeof SharedArrayBuffer !== 'undefined' && value.pcm?.buffer instanceof SharedArrayBuffer), 'invalid-pcm', 'Shared mutable PCM is unsupported.');
      fail(pcmIsEligible(value.pcm,value.sampleRateHz),'invalid-pcm','Exactly five seconds of eligible mono Float32 PCM at 44100 or 48000 Hz is required.');
    }
  }

  async function handle(value) {
    const id = validId(value?.requestId) ? value.requestId : null;
    try {
      validateMessage(value);
      if (value.type === 'dispose') {
        if (!disposal) {
          shuttingDown = true; generation++; phase = 'disposing';
          if (active) {active.cancelled = true; active.abort.abort();}
          disposal = (async () => {
            try {if(active)await active.promise;if(encoder){const old=encoder;encoder=null;await old.dispose();}}
            finally {cleanupModules();provenance=null;phase='disposed';}
          })();
        }
        try {await disposal;}catch {throw new WorkerFailure('dispose-failed','Runtime release failed; terminate this worker.');}
        send({type:'disposed',requestId:id}); return;
      }
      fail(!shuttingDown, 'disposed', 'Worker is disposed.');
      if (value.type === 'cancel') {
        const matched = active?.id === value.targetRequestId;
        if (matched) {active.cancelled=true; generation++; active.abort.abort();}
        send({type:'cancel-ack',requestId:id,targetRequestId:value.targetRequestId,cancelled:matched}); return;
      }
      fail(!active, 'busy', 'Worker is busy; finish or cancel the active request.');
      const operation = {id,generation,cancelled:false,abort:new AbortController(),promise:null};
      active = operation;
      operation.promise = (async () => {
        try {
          await initialize(operation); guard(operation);
          if (value.type === 'initialize') send({type:'ready',requestId:id,provenance});
          else {
            phase='extracting';
            modules.canonical.requirePcm(value.pcm,value.sampleRateHz);
            const input=value.pcm.slice(), before=await shaImpl(arrayBytes(input));
            guard(operation);
            const result=await encoder.extract(input,value.sampleRateHz); guard(operation);
            const hashes=await stages(result,input); guard(operation);
            fail(hashes.inputSha256 === before, 'input-mutated', 'Encoder mutated its diagnostic input.');
            send({type:'embedding',requestId:id,embedding:result.embedding,
              provenance:{...provenance,...hashes,sampleRateHz:value.sampleRateHz,sampleCount:input.length,durationSeconds:5}});
          }
        } catch (error) {
          if (!current(operation) || error?.name === 'AbortError' || error?.code === 'cancelled') send({type:'cancelled',requestId:id});
          else {phase=encoder?'ready':'unavailable';send({type:'error',requestId:id,code:error instanceof WorkerFailure?error.code:'runtime-failed',message:error instanceof WorkerFailure?error.message:'Canonical diagnostics are unavailable.'});}
        } finally {if(active===operation) active=null; if(!shuttingDown && encoder) phase='ready';}
      })();
      await operation.promise;
    } catch (error) {send({type:'error',requestId:id,code:error instanceof WorkerFailure?error.code:'invalid-request',message:error instanceof WorkerFailure?error.message:'Invalid diagnostic request.'});}
  }
  return Object.freeze({handle,getState:()=>({phase,busy:active!==null,ready:encoder!==null,disposed:shuttingDown})});
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  const worker=createProductionWorkerV3({post:value=>globalThis.postMessage(value)});
  globalThis.addEventListener('message',event=>{void worker.handle(event.data);});
}
