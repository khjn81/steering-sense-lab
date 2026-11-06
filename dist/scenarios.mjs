import { SPEED, stepPose, vehiclePoint, WHEELBASE, roadAngle } from './simulation.mjs';

const move = (distance, angle, gear, title, note, attention) => ({ duration: distance / SPEED, distance, angle, gear, drive: true, title, note, attention });
const wait = (duration, angle, gear, title, note, attention) => ({ duration, angle, gear, drive: false, title, note, attention });
const finishPose = (start, steps) => steps.reduce((pose, s) => s.drive ? stepPose(pose, s.angle, s.gear, s.duration) : pose, start);
const TURN_RADIUS = WHEELBASE / Math.tan(roadAngle(360));
const TURN_DISTANCE = TURN_RADIUS * Math.PI / 2;
const TURN_END_Y = -3.15;
const SETUP_Y = TURN_END_Y + TURN_RADIUS;
const PALETTE = ['#e0e3de', '#3f4b57', '#a5afb6', '#5d6973', '#bfc3b7', '#c5b29e', '#7f928b'];

function parkingLot(targetX, pillar) {
  const bays = [], obstacles = [];
  for (const row of [-1, 1]) for (let column = -5; column <= 7; column++) {
    const x = column * 2.6, target = row === -1 && Math.abs(x - targetX) < .01;
    const index = column + 5 + (row === 1 ? 13 : 0), suv = index % 4 === 1 || (pillar && row === -1 && Math.abs(x - targetX + 2.6) < .01);
    bays.push({ x, y: row * 6.2, width: 2.5, length: 5.4, heading: 0, label: `${row < 0 ? 'B' : 'A'}${column + 12}`, target });
    if (!target) obstacles.push({ id: `parked-${row}-${column}`, kind: 'car', x, y: row * (6.25 + (index % 3 - 1) * .1), width: suv ? 1.95 : 1.8, length: suv ? 4.7 : 4.4, height: suv ? 1.7 : 1.43, heading: row < 0 ? 0 : Math.PI, color: PALETTE[index % PALETTE.length] });
  }
  for (const x of [-9.1, -1.3, 6.5, 14.3]) for (const row of [-1, 1]) obstacles.push({ id: `column-${x}-${row}`, kind: 'column', x, y: row * 9.02, width: .58, length: .58, height: 3.25, heading: 0, color: '#c6c8c0' });
  if (pillar) obstacles.push({ id: 'bay-pillar', kind: 'column', x: targetX + 1.3, y: -3.8, width: .56, length: .64, height: 3.25, heading: 0, color: '#c6c8c0', label: 'B2' });
  obstacles.push({ id: 'stopper', kind: 'stopper', x: targetX, y: -8.58, width: 1.8, length: .18, height: .16, heading: 0 });
  obstacles.push({ id: 'back-wall', kind: 'wall', x: 2.6, y: -9.6, width: 35.6, length: .25, height: 1.45, heading: 0, color: '#b6bcb6' });
  obstacles.push({ id: 'far-wall', kind: 'wall', x: 2.6, y: 9.6, width: 35.6, length: .25, height: 1.45, heading: 0, color: '#b6bcb6' });
  return { bays, obstacles, parkedCount: 25, totalBays: 26 };
}
function parkingSteps(label, traffic, pillar) {
  return [
    wait(1.6, 0, 1, `${label}, 빈자리 한 칸을 발견했어요`, '통로 양쪽이 주차 차량으로 가득해요. 목표 칸과 양옆 차량부터 확인해요.', 'all'),
    move(TURN_RADIUS - 1.15, 0, 1, '빈자리를 조금 지나 출발 위치 잡기', '점선 차 모양까지 D로 전진한 뒤 멈춰요. 이 배치에서 뒤를 돌려 넣을 공간을 잡는 예시예요.', 'front'),
    wait(traffic ? 8.2 : 1.5, 360, -1, traffic ? '다가오는 차량을 먼저 보내기' : '멈춰서, 뒤와 통로를 다시 확인', traffic ? '통로를 따라 차가 와요. 그 차가 완전히 지나갈 때까지 움직이지 않아요. 오른쪽 미러도 봐요.' : pillar ? '목표 칸 오른쪽에 기둥이 있어요. 뒤 범퍼가 기둥 쪽으로 붙지 않는지 살펴요.' : '오른쪽 미러로 빈자리 입구와 옆 차를 확인해요. 뒤쪽 사각지대도 직접 확인해야 해요.', traffic ? 'front-right' : 'rear'),
    move(TURN_DISTANCE, 360, -1, '오른쪽으로 꺾어, 90도로 후진', '뒤를 빈자리로 보내는 동안 왼쪽 앞코가 맞은편 차량 쪽으로 돌아나와요. 앞뒤를 번갈아 살펴요.', 'front-left'),
    wait(.8, 0, -1, '주차선과 나란하면 멈춰 핸들 풀기', pillar ? '오른쪽 기둥과 왼쪽 차량 사이에 차체가 나란한지 양쪽 미러로 비교해요.' : '차가 주차선과 나란해졌어요. 이제 바퀴를 가운데로 하고 양쪽 간격을 비교해요.', 'all'),
    move(4.1, 0, -1, '양옆 간격을 보며 안쪽으로 후진', pillar ? '오른쪽 뒤 모서리와 기둥, 왼쪽 옆 차를 함께 살펴요. 한 화면만 계속 보지 않아요.' : '옆 차와 내 차 사이가 좁아요. 양쪽 미러와 뒤 주차턱을 번갈아 확인해요.', 'rear'),
    wait(1.8, 0, -1, `${label} 안에 들어왔으면 정지`, '주차턱 앞에 공간을 남기고 멈췄어요. 이번에는 직접 해보세요.', 'rear')
  ];
}
function apartmentScenario({ id, label, x = 0, pillar = false, traffic = false, title, description, tag }) {
  const lot = parkingLot(x, pillar);
  const scenario = {
    id, short: `${label} · ${pillar ? '기둥 옆 자리' : traffic ? '통로 차량 기다리기' : '양옆 차량 사이'}`,
    title, description, tag, environment: 'garage', garage: { ...lot, targetLabel: label, aisleWidth: 7 },
    goal: `${label} 칸 안에 차체를 나란히 넣고, 뒤 주차턱 앞에서 정지`,
    start: { x: x + 1.15, y: SETUP_Y, heading: Math.PI / 2 }, gear: 1,
    setup: { x: x + TURN_RADIUS, y: SETUP_Y, heading: Math.PI / 2 },
    focus: { x: x + 2.2, y: -1.5, width: 19, height: 16.5 },
    obstacles: lot.obstacles, target: { x, y: -6.2, heading: 0, width: 2.5, length: 5.4 },
    bounds: { left: -14.4, right: 19.5, bottom: -9.3, top: 9.3 }, maxTrip: 20,
    caution: pillar ? '오른쪽 기둥·왼쪽 옆 차. 뒤만 볼 때는 맞은편 차량 쪽으로 나오는 앞코를 놓치기 쉬워요.' : traffic ? '후진을 시작하기 전에 통로 차량이 다 지나갔는지 확인해요. 정지한 뒤에도 주변을 계속 봐요.' : '뒤는 양옆 차 사이로, 앞코는 맞은편 차 쪽으로 움직여요. 차 앞과 뒤를 번갈아 확인해요.',
    attention: pillar ? 'front-right' : 'front-left', steps: parkingSteps(label, traffic, pillar)
  };
  if (traffic) scenario.traffic = { id: 'passing-car', triggerX: x + 4, startX: x - 9, endX: x + 15, y: -.65, duration: 7.5, width: 1.85, length: 4.5 };
  scenario.end = finishPose(scenario.start, scenario.steps);
  return scenario;
}

export const SCENARIOS = [
  apartmentScenario({ id: 'apt-bay', label: 'B12', tag: '01 · 아파트 지하 2층', title: '양옆이 꽉 찬 빈자리 한 칸', description: '지하 2층 B구역. 양쪽에 25대가 세워져 있고 B12만 비어 있어요. 통로에서 자리를 지나친 뒤 90도로 후진해 들어가보세요.' }),
  apartmentScenario({ id: 'apt-pillar', label: 'B14', x: 5.2, pillar: true, tag: '02 · 기둥 옆 주차', title: '이번 빈자리는 기둥 바로 옆', description: '옆에는 SUV, 입구 오른쪽에는 기둥. 맞은편 차량도 있어 크게 돌아나가기 어려워요. B14에 나란히 넣어보세요.' }),
  apartmentScenario({ id: 'apt-traffic', label: 'B12', traffic: true, tag: '03 · 통로에 다른 차', title: '후진하려는데, 뒤에서 차가 와요', description: '자리를 잡으면 뒤쪽 통로에서 황색 차가 다가와요. 차를 먼저 보낸 다음 같은 B12 자리에 후진 주차해보세요.' }),
  { id: 'free', short: '기초 조향 연습', title: '핸들과 차의 앞뒤를 연결해요', tag: '기초 · 움직임의 원리',
    description: '주차 전에 원리부터 보고 싶다면, 빈 연습장에서 차 앞뒤의 움직임을 비교해보세요.', goal: '핸들을 돌린 채 R / D를 눌러 앞뒤 움직임 비교',
    start: { x: 0, y: 1, heading: 0 }, gear: -1, focus: { x: 0, y: .6, width: 12, height: 11 }, obstacles: [],
    caution: '핸들을 가운데로 풀어도 돌아간 차체 방향은 그대로예요.', attention: 'all',
    steps: [wait(1.3, 288, -1, '오른쪽으로 돌린 앞바퀴를 봐요', '바퀴와 핸들의 방향을 먼저 연결해보세요.', 'front'), move(2.3, 288, -1, '후진하면, 앞과 뒤가 갈라져요', '차 뒤는 오른쪽으로, 앞코는 처음에 왼쪽으로 나와요.', 'front-left'), wait(1, 0, -1, '이제 바퀴를 가운데로', '차체는 돌아간 채예요. 다음 움직임을 예상해보세요.', 'all'), move(1.3, 0, -1, '돌아간 방향으로 곧게 후진', '바퀴를 바로 해도 처음 방향으로 자동 복귀하지 않아요.', 'rear'), wait(1.5, 0, -1, '이번에는 직접 해보세요', '예상 경로를 끄고 다시 해봐도 좋아요.', 'all')] }
];
for (const s of SCENARIOS) s.end ||= finishPose(s.start, s.steps);
export const getScenario = id => SCENARIOS.find(s => s.id === id) || SCENARIOS[0];

export function obstaclesFor(scenario, hazardTime = -1) {
  if (!scenario.traffic) return scenario.obstacles;
  const t = scenario.traffic, progress = hazardTime < 0 ? 0 : Math.min(1, hazardTime / t.duration);
  return [...scenario.obstacles, { id: t.id, kind: 'car', x: t.startX + (t.endX - t.startX) * progress, y: t.y, width: t.width, length: t.length, height: 1.5, heading: Math.PI / 2, color: '#c59b49', dynamic: true }];
}
export function nextHazardTime(scenario, current, nextPose, gear, dt) {
  const t = scenario.traffic; if (!t) return -1;
  if (current < 0 && gear === 1 && nextPose.x >= t.triggerX) current = 0;
  return current < 0 ? -1 : Math.min(t.duration, current + dt);
}
export function withinBounds(pose, scenario) {
  if (!scenario.bounds) return Math.abs(pose.x) <= 5.8 && Math.abs(pose.y) <= 6.8;
  const b = scenario.bounds;
  return bodyCorners(pose).every(p => p.x >= b.left && p.x <= b.right && p.y >= b.bottom && p.y <= b.top);
}

// Rectangles include the whole body, not just the rear axle or wheel tracks.
export function rectangleCorners(rect) {
  const pose = { x: rect.x, y: rect.y, heading: rect.heading || 0 };
  return [[-1,-1], [-1,1], [1,1], [1,-1]].map(([a, r]) => vehiclePoint(pose, a * rect.length / 2, r * rect.width / 2));
}
export function bodyCorners(pose) {
  return [[-.9,-.9], [-.9,.9], [3.5,.9], [3.5,-.9]].map(([a, r]) => vehiclePoint(pose, a, r));
}
export function polygonsOverlap(a, b) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = { x: -(q.y - p.y), y: q.x - p.x };
    const pa = a.map(v => v.x * axis.x + v.y * axis.y), pb = b.map(v => v.x * axis.x + v.y * axis.y);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}
function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = dx * dx + dy * dy;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function polygonDistance(a, b) {
  if (polygonsOverlap(a, b)) return 0;
  let d = Infinity;
  for (const [points, edges] of [[a, b], [b, a]]) for (const p of points) for (let i = 0; i < edges.length; i++) d = Math.min(d, pointSegmentDistance(p, edges[i], edges[(i + 1) % edges.length]));
  return d;
}
export function proximity(pose, obstacles) {
  const body = bodyCorners(pose);
  let distance = Infinity, obstacle = null;
  for (const o of obstacles) {
    const d = polygonDistance(body, rectangleCorners(o));
    if (d < distance) { distance = d; obstacle = o; }
  }
  return { distance, obstacle, contact: distance < .025 };
}
export function inTarget(pose, scenario) {
  if (!scenario.target) return false;
  const angle = Math.atan2(Math.sin(pose.heading - scenario.target.heading), Math.cos(pose.heading - scenario.target.heading));
  if (Math.abs(angle) > .14) return false;
  // Every body corner must be inside the marked bay, with a small margin.
  const t = scenario.target, c = Math.cos(t.heading), s = Math.sin(t.heading);
  return bodyCorners(pose).every(p => Math.abs((p.x - t.x) * c - (p.y - t.y) * s) <= t.width / 2 - .03 && Math.abs((p.x - t.x) * s + (p.y - t.y) * c) <= t.length / 2 - .03);
}
