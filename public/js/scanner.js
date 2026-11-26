/** Single-frame inference: camera frames and uploads use the same IMAGE pipeline. */
import { assessPose } from './metrics.js';

export const SDK_VERSION = '1.1.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${SDK_VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const CONNECTIONS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[29,31],[28,30],[30,32]];
let modelPromise;
let stream;
let cameraRequest = 0;

export function stopCamera() {
  cameraRequest += 1;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
}

export async function startCamera(video) {
  stopCamera();
  const request = cameraRequest;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera access needs localhost or HTTPS. You can upload a photo instead.');
  }
  try {
    const incoming = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
    });
    if (request !== cameraRequest || !video.isConnected) {
      incoming.getTracks().forEach(track => track.stop());
      return false;
    }
    stream = incoming;
    video.srcObject = incoming;
    await video.play();
    if (request !== cameraRequest || !video.isConnected) {
      incoming.getTracks().forEach(track => track.stop());
      if (stream === incoming) stream = null;
      return false;
    }
    return true;
  } catch (error) {
    if (request === cameraRequest) stopCamera();
    if (error.name === 'NotAllowedError') throw new Error('Camera permission was declined. Allow it in your browser or upload a photo.');
    if (error.name === 'NotFoundError') throw new Error('No camera found. Upload a full-body photo to continue.');
    if (error.name === 'NotReadableError') throw new Error('The camera is busy. Close other camera apps or upload a photo.');
    throw new Error('Could not start the camera. Upload a photo instead.');
  }
}

async function loadModel(onStatus) {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    let local = false;
    try {
      const response = await fetch('/api/model-status', { signal: AbortSignal.timeout(3000) });
      if (response.ok) local = (await response.json()).local === true;
    } catch { /* A plain static server can also use the CDN fallback. */ }
    onStatus(local ? 'Loading the model from this device…' : 'Downloading the pose model for this session… First load may take a minute.');
    const base = local ? '/vendor/mediapipe' : CDN;
    const { FilesetResolver, PoseLandmarker } = await import(`${base}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${base}/wasm`);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: local ? '/models/pose_landmarker_lite.task' : MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE', numPoses: 2,
      minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6,
      outputSegmentationMasks: false,
    });
  })();
  try { return await modelPromise; }
  catch {
    modelPromise = null;
    throw new Error('The pose model could not load. Check your connection and retry, or use measurements only. For offline scans, run python3 scripts/setup_models.py first.');
  }
}

export async function loadPhoto(file) {
  if (!file) throw new Error('Choose a photo first.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP photo.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a photo smaller than 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
    return sourceCanvas(image, image.naturalWidth, image.naturalHeight);
  } catch { throw new Error('This photo could not be opened. Try a different JPG, PNG, or WebP file.'); }
  finally { URL.revokeObjectURL(url); }
}

function sourceCanvas(source, width, height) {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function captureCamera(video) {
  if (!video.videoWidth || video.readyState < 2) throw new Error('Wait for the camera preview before capturing.');
  const canvas = sourceCanvas(video, video.videoWidth, video.videoHeight);
  stopCamera();
  return canvas;
}

export function drawPhoto(target, source) {
  target.width = source.width;
  target.height = source.height;
  target.getContext('2d').drawImage(source, 0, 0);
}

export async function analyzePhoto(source, target, onStatus = () => {}, signal) {
  if (signal?.aborted) return { cancelled: true };
  const model = await loadModel(onStatus);
  if (signal?.aborted) return { cancelled: true };
  onStatus('Checking full-body landmarks…');
  await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 30)));
  if (signal?.aborted) return { cancelled: true };
  const result = model.detect(source);
  if (signal?.aborted) return { cancelled: true };
  drawPhoto(target, source);
  if (result.landmarks.length > 1) {
    return { ready: false, score: 0, visibleLandmarks: 0, issues: ['Use a photo with only one person in the frame.'] };
  }
  const landmarks = result.landmarks[0] || [];
  const assessment = assessPose(landmarks);
  const ctx = target.getContext('2d');
  const w = target.width, h = target.height;
  ctx.lineWidth = Math.max(2, w / 350);
  ctx.strokeStyle = '#b6f59b';
  ctx.fillStyle = '#ed583f';
  const visible = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.visibility >= 0.65;
  for (const [a, b] of CONNECTIONS) {
    if (!visible(landmarks[a]) || !visible(landmarks[b])) continue;
    ctx.beginPath(); ctx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
    ctx.lineTo(landmarks[b].x * w, landmarks[b].y * h); ctx.stroke();
  }
  for (const point of landmarks) {
    if (!visible(point)) continue;
    ctx.beginPath(); ctx.arc(point.x * w, point.y * h, Math.max(3, w / 200), 0, Math.PI * 2); ctx.fill();
  }
  return assessment;
}

