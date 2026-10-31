import test from 'node:test';
import assert from 'node:assert/strict';
import { clampOverlapsToVisibleImages, clampCropValue } from '../src/utils/imageState.ts';

const img=(id,changes={})=>({
  id,name:id,src:'',width:900,height:1600,
  cropTop:0,cropBottom:0,cropLeft:0,cropRight:0,...changes
});
test('cropping every side remains independent and cannot collapse image',()=>{
  let v=img('x',{cropTop:700,cropBottom:700,cropLeft:400,cropRight:400});
  assert.equal(clampCropValue(v,'cropTop',900),890);
  assert.equal(clampCropValue(v,'cropLeft',900),490);
  assert.equal(clampCropValue(v,'cropBottom',-30),0);
});
test('overlap never exceeds the source or target visible height',()=>{
  const images=[img('a',{cropBottom:1000}),img('b',{cropTop:1000})];
  assert.deepEqual(clampOverlapsToVisibleImages(images,[1125],'vertical'),[599]);
});
test('overlap adapts to different cropped image widths after normalization',()=>{
  const images=[img('a',{cropLeft:300,cropRight:300}),img('b')];
  // The next slice scales 3x less than the prior in normalized output.
  assert.deepEqual(clampOverlapsToVisibleImages(images,[1500],'vertical'),[1500]);
  assert.deepEqual(clampOverlapsToVisibleImages(images.reverse(),[1300],'vertical'),[532]);
});
test('horizontal layout clamps width overlap and preserves valid values',()=>{
  const imgs=[img('a',{cropLeft:800}),img('b',{cropRight:300})];
  assert.deepEqual(clampOverlapsToVisibleImages(imgs,[500],'horizontal'),[99]);
  assert.deepEqual(clampOverlapsToVisibleImages([img('a'),img('b')],[300],'vertical'),[300]);
});
