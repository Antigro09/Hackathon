/** Research-only independent 16kHz anti-aliasing path. Does not modify frozen CLAP preprocessing. */
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
function i0(x) {
  let sum=1, term=1;
  for(let k=1;k<64;k++){term*=x*x/(4*k*k);sum+=term;if(term<=sum*Number.EPSILON)break;}
  return sum;
}
function tapsFor(up,down) {
  const rate=Math.max(up,down), half=10*rate, taps=new Float64Array(2*half+1), denominator=i0(5);
  let sum=0;
  for(let i=0;i<taps.length;i++) {
    const offset=i-half, x=offset/rate, relative=offset/half;
    taps[i]=(x===0?1:Math.sin(Math.PI*x)/(Math.PI*x))*i0(5*Math.sqrt(Math.max(0,1-relative*relative)))/denominator/rate;
    sum+=taps[i];
  }
  return Float32Array.from(taps,tap=>Math.fround(Math.fround(tap/sum)*up));
}
export function resample16k(pcm,rate) {
  if(!(pcm instanceof Float32Array)||![16000,44100,48000].includes(rate)||!pcm.length||pcm.length>rate*30||pcm.some(x=>!Number.isFinite(x)))throw new Error('Invalid bounded mono PCM');
  if(rate===16000)return pcm.slice();
  const divisor=gcd(rate,16000), up=16000/divisor, down=rate/divisor, filter=tapsFor(up,down), half=(filter.length-1)/2;
  const output=new Float32Array(Math.ceil(pcm.length*up/down));
  for(let i=0;i<output.length;i++) {
    const center=half+i*down, first=Math.max(0,Math.ceil((center-2*half)/up)), last=Math.min(pcm.length-1,Math.floor(center/up));
    let sum=0;
    for(let j=first;j<=last;j++)sum=Math.fround(sum+Math.fround(pcm[j]*filter[center-j*up]));
    output[i]=sum;
  }
  return output;
}
