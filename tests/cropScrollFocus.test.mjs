import test from 'node:test';
import assert from 'node:assert/strict';
import { getStitchedImageLocation } from '../src/utils/imageState.ts';

const image=(id,changes={})=>({id,name:id,src:'',width:900,height:1600,
 cropTop:0,cropBottom:0,cropLeft:0,cropRight:0,...changes});

test('eight original scroll screenshots map to their exact positions in the export',()=>{
  const shots=Array.from({length:8},(_,i)=>image(String(i+1)));
  const seams=[1125,1095,1085,1080,1060,1045,1030];
  const expected=[0,475,980,1495,2015,2555,3110,3680];
  for(let i=0;i<8;i++) {
    assert.deepEqual(getStitchedImageLocation(shots,seams,0,'vertical',i),
      {start:expected[i],total:5280});
  }
});
test('crop changes the normalized source location and output length',()=>{
  const shots=[image('a',{cropLeft:100,cropRight:100,cropBottom:100}),
    image('b',{cropTop:200,cropLeft:150,cropRight:150})];
  const {start,total}=getStitchedImageLocation(shots,[600],0,'vertical',1);
  // first visible image has width 700 => second is scaled 700/600.
  assert.ok(Math.abs(start-(1500-600*700/600))<1e-9);
  assert.ok(Math.abs(total-(start+1400*700/600))<1e-9);
});
test('horizontal source position tracks image width instead of height',()=>{
  const imgs=[image('a'),image('b')];
  const out=getStitchedImageLocation(imgs,[350],0,'horizontal',1);
  assert.deepEqual(out,{start:550,total:1450});
});
