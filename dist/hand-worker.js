// Classic worker: the MediaPipe WASM loader may use importScripts.
let landmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const { HandLandmarker, FilesetResolver } = await import('./vendor/mediapipe/vision_bundle.mjs');
      const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', self.location.href).href);
      landmarker = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/hand_landmarker.task', self.location.href).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .55, minTrackingConfidence: .55,
        canvas: new OffscreenCanvas(640, 480)
      });
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
  }
  if (data.type === 'frame') {
    try {
      if (!landmarker) throw new Error('Hand model is not ready');
      const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'hands', landmarks: result.landmarks, timestamp: data.timestamp });
    } catch (error) { self.postMessage({ type: 'error', message: String(error.message || error) }); }
    finally { data.bitmap.close(); }
  }
};
