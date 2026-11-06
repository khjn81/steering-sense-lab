// Synthetic project-owned video/landmarks. Never requests a physical camera.
export async function installCameraFixture(page, options = {}) {
  await page.addInitScript(({ unstable = false, deferPermission = false }) => {
    window.__cameraFixture = { stoppedTracks: 0, stoppedWorkers: 0, frames: 0, pending: [] };
    window.__unstableHands = unstable;
    window.__deferPermission = deferPermission;
    function stream() {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d'); let phase = 0;
      ctx.fillRect(0,0,640,480); const media = canvas.captureStream(20);
      const timer = setInterval(() => { ctx.fillStyle = ++phase % 2 ? '#334' : '#445'; ctx.fillRect(0,0,640,480); }, 40);
      for (const track of media.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); window.__cameraFixture.stoppedTracks++; stop(); }; }
      window.__currentFixtureStream = media; return media;
    }
    navigator.mediaDevices.getUserMedia = () => window.__deferPermission ? new Promise(resolve => window.__cameraFixture.pending.push(() => resolve(stream()))) : Promise.resolve(stream());
    window.Worker = class {
      constructor() { this.closed = false; window.__currentFixtureWorker = this; }
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => { if (!this.closed) this.onmessage?.({ data: { type: 'ready' } }); }); return; }
        data.bitmap.close();
        if (window.__stallHandWorker) return;
        setTimeout(() => {
          if (this.closed) return;
          const n = ++window.__cameraFixture.frames;
          const y = window.__unstableHands ? n % 2 ? .33 : .67 : .5;
          const hand = (x, yy) => Array.from({ length: 21 }, () => ({ x, y: yy, z: 0 }));
          this.onmessage?.({ data: { type: 'hands', landmarks: [hand(.75,y), hand(.25,1-y)], timestamp: data.timestamp + (window.__timestampOffset || 0) } });
        }, 2);
      }
      terminate() { this.closed = true; window.__cameraFixture.stoppedWorkers++; }
    };
  }, options);
}
