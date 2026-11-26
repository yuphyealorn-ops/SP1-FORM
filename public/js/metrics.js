/**
 * Measurement-based estimates and camera framing checks.
 * RFM is an adult population estimate; pose landmarks do not measure body fat.
 */

const PROFILE_RANGES = {
  age: [20, 69, 'Age'],
  heightCm: [120, 230, 'Height (cm)'],
  weightKg: [30, 300, 'Weight (kg)'],
  waistCm: [45, 200, 'Waist (cm)'],
};

/** Return an allowlisted numeric profile, throwing when a measurement is invalid. */
export function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new TypeError('Enter your age, height, weight, waist and equation sex.');
  }
  const normalized = {};
  for (const [field, [min, max, label]] of Object.entries(PROFILE_RANGES)) {
    const value = profile[field];
    if (!['number', 'string'].includes(typeof value) ||
        (typeof value === 'string' && value.trim() === '') ||
        !Number.isFinite(Number(value))) {
      throw new TypeError(`${label} must be a finite number.`);
    }
    const number = Number(value);
    if (number < min || number > max) {
      throw new RangeError(`${label} must be between ${min} and ${max}.`);
    }
    normalized[field] = number;
  }
  if (profile.sex !== 'male' && profile.sex !== 'female') {
    throw new TypeError('Select male or female for the published RFM equation.');
  }
  normalized.sex = profile.sex;
  return normalized;
}

/**
 * Optional body-part tape measurements in centimetres (storage v2, see docs/storage-v2.md).
 * Waist stays in the profile because RFM needs it; left and right sides are separate so imbalances show.
 *
 * `hint` is the short "where to put the tape" text for the check-in form; the full instructions
 * are in docs/measuring-guide.md. Keep the two in sync.
 *
 * `range` is deliberately wide. It catches typing mistakes (a missing or misplaced decimal point, many values
 * typed in inches), not unusual bodies: a real measurement must never be rejected.
 */
export const BODY_PARTS = [
  { id: 'chestCm', label: 'Chest', hint: 'Fullest part, arms relaxed', range: [50, 200] },
  { id: 'shouldersCm', label: 'Shoulders', hint: 'Widest point', range: [60, 200] },
  { id: 'upperArmLeftCm', label: 'Upper arm (L)', hint: 'Halfway between shoulder and elbow', range: [15, 70] },
  { id: 'upperArmRightCm', label: 'Upper arm (R)', hint: 'Halfway between shoulder and elbow', range: [15, 70] },
  { id: 'hipCm', label: 'Hip', hint: 'Widest part', range: [50, 200] },
  { id: 'thighLeftCm', label: 'Thigh (L)', hint: 'Halfway between hip and knee', range: [25, 100] },
  { id: 'thighRightCm', label: 'Thigh (R)', hint: 'Halfway between hip and knee', range: [25, 100] },
  { id: 'calfLeftCm', label: 'Calf (L)', hint: 'Widest part', range: [15, 70] },
  { id: 'calfRightCm', label: 'Calf (R)', hint: 'Widest part', range: [15, 70] },
];

const BODY_PART_BY_ID = new Map(BODY_PARTS.map(part => [part.id, part]));

/**
 * Check one body-part field. Returns the number in centimetres, or undefined when the field is blank.
 * Throws a message that names the body part, so a form can show it next to that field.
 */
export function normalizeMeasurement(id, value) {
  const part = BODY_PART_BY_ID.get(id);
  if (!part) throw new TypeError(`Unknown body-part measurement: ${id}.`);
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return undefined;
  const { label, range: [min, max] } = part;
  if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  const number = Number(value);
  if (number < min || number > max) {
    throw new RangeError(`${label} must be between ${min} and ${max} cm.`);
  }
  return number;
}

/**
 * Return only the body-part measurements that were entered. Blank fields are skipped and
 * unknown keys are ignored; typos such as a 350 cm arm throw instead of being saved.
 */
export function normalizeMeasurements(values) {
  if (values === undefined || values === null) return {};
  if (typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('Body-part measurements must be an object.');
  }
  const normalized = {};
  for (const { id } of BODY_PARTS) {
    const number = normalizeMeasurement(id, values[id]);
    if (number !== undefined) normalized[id] = number;
  }
  return normalized;
}

/**
 * Calculate unrounded RFM and BMI summaries from tape measurements.
 * Lean mass means all non-fat mass, not skeletal muscle mass.
 */
export function calculateComposition(profile) {
  const { heightCm, weightKg, waistCm, sex } = normalizeProfile(profile);
  const bodyFatPercent = 64 - 20 * (heightCm / waistCm) + (sex === 'female' ? 12 : 0);
  if (bodyFatPercent <= 0 || bodyFatPercent >= 65) {
    throw new RangeError('These measurements give an implausible RFM estimate. Check your height and waist.');
  }
  const fatMassKg = weightKg * bodyFatPercent / 100;
  return {
    bmi: weightKg / ((heightCm / 100) ** 2),
    bodyFatPercent,
    fatMassKg,
    leanMassKg: weightKg - fatMassKg,
    waistHeightRatio: waistCm / heightCm,
    method: 'rfm',
    source: 'tape-measurements',
  };
}

const REQUIRED_LANDMARKS = [0, 11, 12, 23, 24, 25, 26, 27, 28];
const VISIBILITY_THRESHOLD = 0.65;
const FRAME_MARGIN = 0.03;

function finiteLandmark(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.visibility) && point.visibility >= 0 && point.visibility <= 1 &&
    (point.z === undefined || Number.isFinite(point.z));
}

/**
 * Assess framing from MediaPipe's 33 normalized landmarks.
 * visibleLandmarks counts the 9 required landmarks; score is a framing score,
 * never confidence in a body-composition measurement. No images are retained.
 */
export function assessPose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length === 0) {
    return { ready: false, score: 0, issues: ['No person detected. Step into the frame.'], visibleLandmarks: 0 };
  }

  const issues = [];
  if (landmarks.length !== 33) {
    issues.push('Full-body tracking is incomplete. Step back and try again.');
  }
  let visibleLandmarks = 0;
  let incomplete = false;
  let obscured = false;
  let cropped = false;
  for (const index of REQUIRED_LANDMARKS) {
    const point = landmarks[index];
    if (!finiteLandmark(point)) {
      incomplete = true;
      continue;
    }
    const visible = point.visibility >= VISIBILITY_THRESHOLD;
    const inFrame = point.x >= FRAME_MARGIN && point.x <= 1 - FRAME_MARGIN &&
      point.y >= FRAME_MARGIN && point.y <= 1 - FRAME_MARGIN;
    if (!visible) obscured = true;
    if (!inFrame) cropped = true;
    if (visible && inFrame) visibleLandmarks += 1;
  }
  if (incomplete) issues.push('Pose tracking is incomplete. Hold still and try again.');
  if (obscured) issues.push('Make sure your face, shoulders, hips, knees and ankles are visible.');
  if (cropped) issues.push('Step back so your full body fits inside the guide.');

  let facingForward = false;
  let upright = false;
  let largeEnough = false;
  if (!incomplete) {
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const hipWidth = Math.abs(leftHip.x - rightHip.x);
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const kneeY = (landmarks[25].y + landmarks[26].y) / 2;
    const ankleY = (landmarks[27].y + landmarks[28].y) / 2;
    facingForward = shoulderWidth >= 0.10 && hipWidth >= 0.06 &&
      Math.abs(leftShoulder.y - rightShoulder.y) <= 0.065;
    upright = nose.y < shoulderY && shoulderY < hipY && hipY < kneeY && kneeY < ankleY;
    largeEnough = ankleY - nose.y >= 0.45;
    if (!facingForward || !upright) issues.push('Stand upright with level shoulders and face the camera.');
    if (!largeEnough) issues.push('Move a little closer while keeping your whole body in the frame.');
  }

  const score = Math.round((visibleLandmarks / REQUIRED_LANDMARKS.length) * 70 +
    (facingForward ? 10 : 0) + (upright ? 10 : 0) + (largeEnough ? 10 : 0));
  return { ready: issues.length === 0, score, issues, visibleLandmarks };
}
