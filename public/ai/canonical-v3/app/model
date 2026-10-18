// Hub API and pinned files checked 2026-10-18. These are download sizes, not
// working-memory estimates. ONNX Runtime/WASM is downloaded separately.
export const SOUND_HINT_MODEL = {
    id: 'Xenova/clap-htsat-unfused',
    revision: 'c28f2883575e590e04d3146ff0713c2448d691ba',
    packageVersion: '4.3.1',
    dtype: 'q8',
    device: 'wasm',
    weightsFile: 'onnx/model_quantized.onnx',
    weightsBytes: 161_024_085,
    approximateDownloadMb: 165,
    sampleRateHz: 48_000,
    observationSeconds: 5,
    processorSeconds: 10,
    featureMinHz: 50,
    featureMaxHz: 14_000,
    configuredPadding: 'repeatpad',
    // Transformers.js 4.3.1's repeatpad loop leaves the second half at zero for
    // an exact five-second input. This describes the actual runtime behavior.
    padding: 'zero-pad',
    paddingDescription: 'Five seconds of observation followed by five seconds of zero padding; no additional observation.',
    // The conversion repository points to this upstream model. Its own card does
    // not separately declare a license; preserve that distinction in attribution.
    upstreamLicense: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/laion/clap-htsat-unfused',
    modelUrl: 'https://huggingface.co/Xenova/clap-htsat-unfused',
    evaluatedForSourceIdentification: false,
};
