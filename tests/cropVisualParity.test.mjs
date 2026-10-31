import test from 'node:test';
import assert from 'node:assert/strict';
import { getCropRect, getCropFractions, clampCropValue, clampOverlapsToVisibleImages } from '../src/utils/imageState.ts';
function image(overrides={}) {
  return {id:'i',name:'example.png',src:'',width:900,height:1600,
    cropTop:0,cropBottom:0,cropLeft:0,cropRight:0,...overrides};
}
test('editor shade and stitched Canvas use exactly the same original pixel rectangle',()=>{
  const im=image({cropTop:100,cropBottom:240,cropLeft:72,cropRight:228});
  const r=getCropRect(im),p=getCropFractions(im);
  assert.deepEqual(r,{left:72,top:100,width:600,height:1260});
  assert.equal(p.left*im.width,r.left);
  assert.equal(p.top*im.height,r.top);
  assert.ok(Math.abs((1-p.left-p.right)*im.width-r.width)<1e-9);
  assert.ok(Math.abs((1-p.top-p.bottom)*im.height-r.height)<1e-9);
});
test('all four cropping directions retain independent original coordinates',()=>{
  let x=image();
  for(const [key,amount] of [['cropTop',160],['cropBottom',310],['cropLeft',130],['cropRight',150]]) {
    x={...x,[key]:clampCropValue(x,key,amount)};
  }
  assert.deepEqual(getCropRect(x),{left:130,top:160,width:620,height:1130});
  assert.equal(clampCropValue(x,'cropRight',900),760);
});
test('cropped images preserve safe overlap bounds for stitched output',()=>{
  const p=[image({cropBottom:1250}),image({cropTop:1200})];
  assert.deepEqual(clampOverlapsToVisibleImages(p,[1125],'vertical'),[349]);
});
