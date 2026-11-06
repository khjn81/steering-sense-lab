import { handSteering, measureHands, trackingIsFresh } from './hand-math.mjs?v=4';

export class HandController {
  constructor({ onAngle, onChange, onLost }) {
    Object.assign(this, { onAngle, onChange, onLost });
    this.video = document.getElementById('handVideo'); this.overlay = document.getElementById('handOverlay');
    this.active = false; this.calibrated = false; this.lastSeen = null; this.neutral = 0; this.angle = 0;
    this.measurement = null; this.busy = false; this.generation = 0; this.samples = [];
  }
  get ready() { return this.active && trackingIsFresh(this.lastSeen, performance.now(), this.calibrated); }
  async start() {
    const generation = ++this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('이 주소에서는 카메라를 열 수 없어요. HTTPS 또는 localhost에서 열어주세요.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream;
      await this.video.play();
      if (generation !== this.generation) return;
      this.active = true; this.onChange('loading');
      this.worker = new Worker(new URL('./hand-worker.js', import.meta.url));
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('손 인식 준비가 오래 걸리고 있어요. 직접 조작으로 먼저 연습하고 다시 시도해주세요.')), 45000);
        this.pendingInit = { reject, timer };
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'ready') { clearTimeout(timer); this.pendingInit = null; resolve(); }
          if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
        };
        this.worker.onerror = () => { clearTimeout(timer); reject(new Error('손 인식을 실행하지 못했어요. Chrome에서 다시 시도해주세요.')); };
        this.worker.postMessage({ type: 'init' });
      });
      if (generation !== this.generation) return;
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        if (data.type === 'error') { this.stop(); this.onChange('error', '손 인식이 멈췄어요. 카메라를 다시 켜거나 직접 조작해주세요.'); return; }
        if (data.type === 'hands') this.process(data.landmarks, data.timestamp);
      };
      this.worker.onerror = () => { this.stop(); this.onChange('error', '손 인식이 멈췄어요. 카메라를 다시 켜거나 직접 조작해주세요.'); };
      this.onChange('tracking'); this.lastTick = 0; this.lastVideoTime = -1;
      this.tick(generation);
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      if (error.name === 'NotAllowedError') throw new Error('카메라 권한이 꺼져 있어요. 주소창의 카메라 권한을 허용한 뒤 다시 눌러주세요. 직접 조작도 가능해요.');
      if (error.name === 'NotFoundError') throw new Error('사용할 카메라를 찾지 못했어요. 마우스나 터치로 먼저 연습해보세요.');
      if (error.name === 'NotReadableError') throw new Error('다른 앱에서 카메라를 쓰고 있을 수 있어요. 확인한 뒤 다시 켜주세요.');
      throw error;
    }
  }
  stop() {
    this.generation++; cancelAnimationFrame(this.raf);
    if (this.pendingInit) { clearTimeout(this.pendingInit.timer); this.pendingInit.reject(new Error('Camera stopped')); this.pendingInit = null; }
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.video.pause(); this.video.srcObject = null;
    this.worker?.terminate(); this.worker = null;
    this.active = false; this.calibrated = false; this.lastSeen = null; this.measurement = null; this.busy = false; this.samples = []; this.previousTimestamp = 0;
    this.onLost(); this.onChange('off');
  }
  calibrate() {
    if (!this.measurement || this.samples.length < 8 || performance.now() - this.lastSeen > 200) return false;
    const angles = this.samples.slice(-12);
    if (Math.max(...angles) - Math.min(...angles) > 9) { this.onChange('unsteady'); return false; }
    this.neutral = angles.reduce((a, b) => a + b, 0) / angles.length;
    this.angle = 0; this.calibrated = true; this.onAngle(0); this.onChange('calibrated'); return true;
  }
  tick(generation) {
    if (generation !== this.generation || !this.active) return;
    const now = performance.now();
    if (!this.busy && now - this.lastTick >= 50 && this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.busy = true; this.lastTick = now; this.lastVideoTime = this.video.currentTime;
      createImageBitmap(this.video).then(bitmap => {
        if (generation !== this.generation || !this.worker) { bitmap.close(); return; }
        this.worker.postMessage({ type: 'frame', bitmap, timestamp: now }, [bitmap]);
      }).catch(() => { this.busy = false; this.onLost(); });
    }
    if (this.calibrated && !this.ready) { this.onLost(); this.onChange('lost'); }
    this.raf = requestAnimationFrame(() => this.tick(generation));
  }
  process(landmarks, timestamp) {
    const now = performance.now();
    this.measurement = measureHands(landmarks, this.video.videoWidth, this.video.videoHeight);
    this.drawHands(landmarks);
    if (!this.measurement || now - timestamp > 300) {
      this.samples = [];
      if (!this.ready) { this.onLost(); this.onChange(this.calibrated ? 'lost' : 'tracking'); }
      return;
    }
    this.lastSeen = now; this.samples.push(this.measurement.angle); this.samples = this.samples.slice(-16);
    if (this.calibrated) {
      this.angle = handSteering(this.measurement.angle, this.neutral, this.angle, this.previousTimestamp ? (timestamp - this.previousTimestamp) / 1000 : .05);
      this.onAngle(this.angle); this.onChange('calibrated');
    } else this.onChange(this.samples.length >= 8 ? 'can-calibrate' : 'tracking');
    this.previousTimestamp = timestamp;
  }
  drawHands(hands) {
    const canvas = this.overlay, video = this.video;
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height);
    const connections = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [17, 0]];
    c.lineWidth = 3; c.strokeStyle = '#dce9ad'; c.fillStyle = '#f5ffe9';
    for (const hand of hands || []) {
      for (const chain of connections) { c.beginPath(); chain.forEach((index, i) => { const p = hand[index]; i ? c.lineTo(p.x * canvas.width, p.y * canvas.height) : c.moveTo(p.x * canvas.width, p.y * canvas.height); }); c.stroke(); }
      for (const point of hand) { c.beginPath(); c.arc(point.x * canvas.width, point.y * canvas.height, 3.3, 0, Math.PI * 2); c.fill(); }
    }
  }
}
