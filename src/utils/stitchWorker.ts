import { analyzeOverlapSamples } from './overlapSamples';
self.onmessage = ({ data: s }) =>
  self.postMessage(
    analyzeOverlapSamples(s.a, s.b, s.span, s.max, s.axis, s.scale)
  );
