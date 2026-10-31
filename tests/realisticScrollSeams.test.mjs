import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeOverlapSamples } from '../src/utils/stitching.ts';

function documentPixel(x,y) {
  // Light page, sparse text, repeated card edges: deliberately unlike
  // random-noise fixtures used by older matcher tests.
  const section=Math.floor(y/120);
  const row=y%120;
  if (row<7) return [225+(section%3)*5,232,245,255];
  if (row<30 && x>5 && x<86 && (Math.floor(x/5)+section*13+Math.floor(row/4))%7 < 4) {
    const shade=(section*37+x*3+row*11)%90;
    return [35+shade,45+shade,58+shade,255];
  }
  if (row>36 && row<66 && x>8 && x<89 && (Math.floor(x/7)+row+section)%13 < 5) {
    return [141,169,200,255];
  }
  return [250,251,253,255];
}
const SPAN=96,MAX=1552;
function documentBands(overlap) {
  const a=new Uint8ClampedArray(MAX*SPAN*4);
  const b=new Uint8ClampedArray(MAX*SPAN*4);
  for(let y=0;y<MAX;y++)for(let x=0;x<SPAN;x++){
    const index=(y*SPAN+x)*4;
    a.set(documentPixel(x,y),index);
    b.set(documentPixel(x,y+MAX-overlap),index);
  }
  return {a,b};
}
test('sparse, nearly white screenshot: exact 1085px seam wins over short blank false matches',()=>{
  const {a,b}=documentBands(1085);
  const result=analyzeOverlapSamples(a,b,SPAN,MAX,'vertical');
  assert.equal(result.overlap,1085,JSON.stringify(result));
  assert.equal(result.confidence,'high');
});
test('sparse screenshot: all seven known offsets accepted, even without a global score gap',()=>{
  for(const overlap of [1125,1095,1085,1080,1060,1045,1030]){
    const {a,b}=documentBands(overlap);
    const result=analyzeOverlapSamples(a,b,SPAN,MAX,'vertical');
    assert.equal(result.overlap,overlap,JSON.stringify(result));
  }
});
test('plain image is still rejected instead of treated as a long exact seam',()=>{
  const blank=new Uint8ClampedArray(SPAN*MAX*4).fill(248);
  assert.equal(analyzeOverlapSamples(blank,blank,SPAN,MAX,'vertical').overlap,0);
});
