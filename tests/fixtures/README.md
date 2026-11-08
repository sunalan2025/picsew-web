# Test media

`recording.webm` is an original, synthetic three-second test video generated with FFmpeg's `testsrc2` filter. It contains no user screenshots, names, conversations, or third-party video.

Reproduce with:

```sh
ffmpeg -f lavfi -i testsrc2=size=160x240:rate=8 -t 3 -c:v libvpx-vp9 -b:v 80k -an -y tests/fixtures/recording.webm
```

Browser tests exercise actual metadata loading, seeking, interval extraction, a supplemental frame, and cancellation. This fixture does not establish accuracy on real iOS/Android screen recordings.
