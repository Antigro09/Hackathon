// Prepared candidate. Activation requires the frozen live-baseline comparison.
export const SOUND_HINT_MODEL_V3 = Object.freeze({
  id: 'Xenova/clap-htsat-unfused + TonalWatch v3 head',
  revision: 'c28f2883575e590e04d3146ff0713c2448d691ba',
  modelUrl: 'https://huggingface.co/Xenova/clap-htsat-unfused',
  upstreamLicenseUrl: 'https://huggingface.co/laion/clap-htsat-unfused',
  workerUrl: '/ai/canonical-v3/productionWorkerV3.mjs',
  headUrl: '/ai/canonical-v3/tonalwatch-head-v3.json',
  scorerUrl: '/ai/canonical-v3/integerHeadV3.js',
  headSha256: '1e373cd18cbd706812dac10b19a320b73a568e6ee40e3f34236e03ae6122f491',
  headParametersSha256: '6f1119be47ffeea7fcf8b3e1b4212af7d387cdef14667c3c871f46e9c98c8a92',
  scorerSha256: '5b969fa736aad8b336c198d24f20bf59bbe4e788ef7878ea86dd8126c20ed25f',
  workerSha256: 'f622383fb66b1090f98f59739eea13971915eabe419af090ad833b1b436a5713',
  modelSha256: '3fcff2c8824e7bcb83a983f2a49edab3b60cbcf4872ac70efee517355173bd1f',
  runtimeFingerprintSha256: 'f28a76756690691b355ee60359aaed7460b2c9674be6e8e10df2dd0159acdac9',
  preprocessingContractSha256: '8a3c23901e5ef9b122ae5170c7da1d92c0d92aeea0c1aa8552997dc64b5a8fc8',
  observationSeconds: 5,
  downloadMegabytes: 51,
});

export const SOUND_FAMILY_DISPLAY_V3 = Object.freeze({
  buzz: 'Buzz-like sound',
  mechanical_fan: 'Mechanical fan-like sound',
  speech: 'Speech-like sound',
  traffic: 'Traffic-like sound',
  wind: 'Wind-like sound',
});
export type SoundFamilyV3 = keyof typeof SOUND_FAMILY_DISPLAY_V3;
