// Coordinates: x = initial vehicle right, y = initial vehicle forward.
// Heading and steering are positive clockwise. Rear axle is the reference.
export const WHEELBASE = 2.7;
export const TRACK = 1.54;
export const STEERING_RATIO = 12;
export const MAX_HAND_ANGLE = 360;
export const SPEED = 0.8;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const rad = degrees => degrees * Math.PI / 180;
export const deg = radians => radians * 180 / Math.PI;
export const roadAngle = handAngle => rad(clamp(handAngle, -MAX_HAND_ANGLE, MAX_HAND_ANGLE) / STEERING_RATIO);

export function stepPose(pose, handAngle, gear, dt, speed = SPEED) {
  const ds = gear * speed * dt;
  const k = Math.tan(roadAngle(handAngle)) / WHEELBASE;
  const h = pose.heading;
  if (Math.abs(k) < 1e-9) return { x: pose.x + ds * Math.sin(h), y: pose.y + ds * Math.cos(h), heading: h };
  const heading = h + k * ds;
  return { x: pose.x + (Math.cos(h) - Math.cos(heading)) / k, y: pose.y + (Math.sin(heading) - Math.sin(h)) / k, heading };
}

export function vehiclePoint(pose, along, right = 0) {
  return { x: pose.x + along * Math.sin(pose.heading) + right * Math.cos(pose.heading), y: pose.y + along * Math.cos(pose.heading) - right * Math.sin(pose.heading) };
}

export function projectedPath(pose, handAngle, gear, along, distance = 2.6) {
  const points = []; let current = { ...pose };
  for (let i = 0; i <= 48; i++) {
    points.push(vehiclePoint(current, along));
    current = stepPose(current, handAngle, gear, distance / SPEED / 48);
  }
  return points;
}

export function frontWheelAngles(handAngle) {
  const d = roadAngle(handAngle);
  if (Math.abs(d) < 1e-9) return { left: 0, right: 0 };
  const radius = WHEELBASE / Math.tan(Math.abs(d));
  const inner = Math.atan(WHEELBASE / (radius - TRACK / 2));
  const outer = Math.atan(WHEELBASE / (radius + TRACK / 2));
  return d > 0 ? { left: outer, right: inner } : { left: -inner, right: -outer };
}

export function steeringWords(angle) {
  if (Math.abs(angle) < 3) return '가운데';
  return `${angle > 0 ? '오른쪽' : '왼쪽'} ${Math.round(Math.abs(angle))}°`;
}

export function motionWords(handAngle, gear) {
  if (Math.abs(handAngle) < 3) return `${gear < 0 ? '후진' : '전진'} · 바퀴가 가운데면 현재 차체 방향을 따라 곧게 움직여요.`;
  const side = handAngle > 0 ? '오른쪽' : '왼쪽';
  const other = handAngle > 0 ? '왼쪽' : '오른쪽';
  return gear < 0 ? `차 기준으로 뒤는 ${side}으로 휘고, 앞은 처음에 ${other}으로 돌아나와요.` : `차 앞과 뒤가 ${side}으로 휘어요. 앞과 뒤의 경로는 서로 달라요.`;
}

export const LESSONS = [
  { title: '오른쪽으로 돌리고 후진하면,\n차 뒤는 어디로 갈까요?', description: '앞바퀴가 꺾인 방향을 보고 먼저 예상해보세요. 좌우는 차에 앉은 사람을 기준으로 해요.', choices: ['← 왼쪽', '오른쪽 →'], answer: 1, handAngle: 288, heading: 0, gear: -1, feedback: '차 뒤는 오른쪽으로 휘고, 차 앞은 처음에 왼쪽으로 돌아나와요. 둘을 따로 살펴보세요.' },
  { title: '왼쪽으로 돌리고 후진하면,\n차 앞은 어디로 갈까요?', description: '이번에는 차 앞부분에 집중해보세요. 뒤쪽이 휘는 방향과 같을까요?', choices: ['← 왼쪽', '오른쪽 →'], answer: 1, handAngle: -288, heading: 0, gear: -1, feedback: '뒤는 왼쪽으로 휘지만, 차 앞부분은 처음에 오른쪽으로 돌아나와요.' },
  { title: '핸들을 가운데로 풀면,\n차는 어떻게 후진할까요?', description: '차체가 이미 왼쪽으로 돌아간 상태예요. 앞바퀴만 가운데로 돌렸어요.', choices: ['처음 출발한 방향으로 저절로 복귀', '현재 차체 방향을 따라 곧게 후진'], answer: 1, handAngle: 0, heading: -Math.PI / 5, gear: -1, feedback: '핸들을 풀어도 차체가 원래 방향으로 돌아오지는 않아요. 현재 차체 방향을 따라 곧게 후진해요.' }
];
