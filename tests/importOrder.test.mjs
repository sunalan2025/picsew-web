import test from 'node:test';
import assert from 'node:assert/strict';
import { sortScreenshotFiles } from '../src/utils/importOrder.ts';
import { analyzeOverlapSamples } from '../src/utils/stitching.ts';

test('shuffled image selection uses natural filename order, without changing picker array', () => {
  const names=['08_scroll_3680.png','03_scroll_0980.png','01_scroll_0000.png',
    '07_scroll_3110.png','02_scroll_0475.png','04_scroll_1495.png',
    '06_scroll_2555.png','05_scroll_2015.png'];
  const items=names.map(name=>({name}));
  assert.deepEqual(sortScreenshotFiles(items).map(x=>x.name),[...names].sort());
  assert.equal(items[0].name,names[0]);
  assert.deepEqual(sortScreenshotFiles(['10.png','2.png','1.png'].map(name=>({name}))).map(x=>x.name),
    ['1.png','2.png','10.png']);
});

test('the seven sample offsets can all be matched without row rounding', ()=>{
  const overlaps=[1125,1095,1085,1080,1060,1045,1030],max=1552,span=48;
  const hash=(x,y)=>((x*73+y*53+x*y*11+Math.floor(y/21)*97)^(x*7+y*13))&255;
  for(const overlap of overlaps){
    const a=new Uint8ClampedArray(max*span*4),b=new Uint8ClampedArray(max*span*4);
    for(let y=0;y<max;y++)for(let x=0;x<span;x++){
      const va=hash(x,y),vb=hash(x,y+max-overlap),p=(y*span+x)*4;
      a.set([va,va^83,va^213,255],p);
      b.set([vb,vb^83,vb^213,255],p);
    }
    const out=analyzeOverlapSamples(a,b,span,max,'vertical');
    assert.equal(out.overlap,overlap,'expected '+overlap+', got '+JSON.stringify(out));
  }
});
