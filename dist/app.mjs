import { clamp, deg, LESSONS, motionWords, roadAngle, SPEED, steeringWords, stepPose } from './simulation.mjs';
import { createScene } from './scene.mjs?v=4';
import { HandController } from './hand-control.mjs?v=4';
import { SCENARIOS, getScenario, obstaclesFor, proximity, inTarget, nextHazardTime, withinBounds } from './scenarios.mjs?v=4';

const $ = id => document.getElementById(id);
const text = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
const state = {
  pose: { x: 0, y: 1, heading: 0 }, handAngle: 0, gear: -1,
  running: false, replaying: false, history: [], historyIndex: 0, historyVersion: 0,
  showPaths: true, showWheels: false, mode: 'free', lessonIndex: 0, phase: 'question',
  choice: null, time: 0, runDistance: 0, lastFrame: 0, pendingDriveUntil: 0,
  scenarioId: 'apt-bay', showMirrors: true, showRear: true, travelled: 0,
  modelView: false, modelPlaying: false, modelFinished: false, modelStep: 0, modelElapsed: 0,
  hazardTime: -1, contact: false, complete: false, attention: 'all', nearObstacleId: null, inspecting: false
};
let scene, steeringPointer = null, lastDrag = 0, cameraBusy = false, cameraState = 'off', activeDriveKey = null, lastCoachKey = '', cameraRequest = 0;
const camera = new HandController({
  onAngle(angle) { if (state.mode === 'free' && !state.replaying && !state.modelView) setSteering(angle, true); },
  onLost() { if (state.running && !state.modelView) pause('양손이 안 보여서 멈췄어요. 다시 손을 맞춘 뒤 출발해주세요.'); },
  onChange: updateCamera
});

function frame() { return { pose: { ...state.pose }, handAngle: state.handAngle, gear: state.gear, time: state.time, travelled: state.travelled, hazardTime: state.hazardTime, contact: state.contact, complete: state.complete, modelStep: state.modelStep, modelElapsed: state.modelElapsed }; }
function record() { state.history.push(frame()); if (state.history.length > 3200) state.history.splice(0, state.history.length - 3200); state.historyIndex = state.history.length - 1; state.historyVersion++; }
function reset(heading = null, keepAngle = true) {
  state.running = false; state.replaying = false; state.modelView = false; state.modelPlaying = false; state.modelFinished = false; state.modelStep = 0; state.modelElapsed = 0;
  state.pendingDriveUntil = 0; activeDriveKey = null;
  state.pose = state.mode === 'quiz' ? { x: 0, y: 1, heading: heading ?? LESSONS[state.lessonIndex].heading } : { ...getScenario(state.scenarioId).start };
  state.time = 0; state.runDistance = 0; state.travelled = 0; state.hazardTime = -1; state.contact = false; state.complete = false; state.inspecting = false;
  if (!keepAngle) state.handAngle = 0;
  if (state.mode === 'free') state.gear = getScenario(state.scenarioId).gear;
  state.history = [frame()]; state.historyIndex = 0; state.historyVersion++;
  text('runStatus', 'R / D를 누르면 바로 움직여요'); renderLesson(); renderUI();
}
function pause(message) {
  state.running = false; state.replaying = false;
  state.pendingDriveUntil = 0; activeDriveKey = null;
  state.modelPlaying = false;
  if (message) text('runStatus', message);
  renderLesson(); renderUI();
}
function userStop(message) {
  const manual = state.mode === 'free' && !state.modelView && !state.replaying;
  pause(message);
  if (manual && !state.contact) {
    const s = getScenario(state.scenarioId);
    state.complete = inTarget(state.pose, s) && (!s.traffic || state.hazardTime >= s.traffic.duration);
    if (state.complete) text('runStatus', s.garage ? `${s.garage.targetLabel} 주차 완료 · 앞뒤 간격을 다시 확인해요.` : '목표 자리에서 멈췄어요. 모범 경로와 비교해보세요.');
    if (state.historyIndex < state.history.length - 1) state.history = state.history.slice(0, state.historyIndex + 1);
    record(); renderLesson(); renderUI();
  }
}
function setSteering(angle, fromHands = false) {
  if (state.mode !== 'free' || state.modelView || (camera.active && !fromHands)) return;
  if (!fromHands && state.replaying) pause('재생을 멈췄어요. 이 위치에서 다시 움직일 수 있어요.');
  state.handAngle = clamp(angle, -360, 360); renderUI();
}
function canMove() {
  if (state.mode === 'quiz') return state.phase === 'answered' || state.phase === 'demo';
  return !cameraBusy && (!camera.active || camera.ready);
}
function canRequestMove() {
  return !state.modelView && !cameraBusy && (!camera.active || camera.calibrated);
}
function beginMovement() {
  if (!canMove()) return;
  if (!withinBounds(state.pose, getScenario(state.scenarioId))) { pause('연습장 끝에 도착했어요. 처음 위치에서 다시 시작해주세요.'); return; }
  if (state.mode === 'quiz') state.phase = 'demo';
  if (state.historyIndex < state.history.length - 1) state.history = state.history.slice(0, state.historyIndex + 1);
  state.runDistance = state.mode === 'quiz' ? state.travelled : 0; state.running = true; state.replaying = false; state.pendingDriveUntil = 0; state.contact = false; state.complete = false; state.inspecting = false;
  text('runStatus', '멈추기 버튼으로 언제든 멈출 수 있어요'); renderLesson(); renderUI();
}
function requestDirection(gear, key = null) {
  if (state.mode !== 'free' || !canRequestMove()) return;
  activeDriveKey = key; state.gear = gear; state.replaying = false;
  if (camera.active && !camera.ready) {
    state.running = false; state.pendingDriveUntil = performance.now() + 3000;
    text('runStatus', '3초 안에 양손을 다시 들면 출발해요. 멈추기로 취소할 수 있어요.'); renderUI(); return;
  }
  if (state.running) { text('runStatus', '움직이면서 핸들을 계속 돌릴 수 있어요'); renderUI(); return; }
  beginMovement();
}
function startMoving() {
  if (state.running || state.replaying || state.pendingDriveUntil || state.modelPlaying) { userStop('잠깐 멈췄어요. 움직임을 살펴보세요.'); return; }
  if (state.modelView) return startModel();
  if (state.mode === 'free') requestDirection(state.gear);
  else beginMovement();
}
function goFree() {
  if (camera.active || cameraBusy) cancelCameraInput();
  state.mode = 'free'; state.phase = 'question'; state.handAngle = 0; state.gear = -1;
  state.scenarioId = state.previousScenarioId || state.scenarioId;
  reset(0); renderLesson();
}
function selectScenario(id) {
  state.mode = 'free'; state.scenarioId = getScenario(id).id; state.previousScenarioId = state.scenarioId;
  state.handAngle = 0; state.showPaths = true; $('showPaths').checked = true;
  reset(null, false);
}
function startModel() {
  if (state.modelPlaying) return pause('모범 동작을 잠깐 멈췄어요. 계속 보거나 직접 해보세요.');
  if (!state.modelView || state.modelFinished) { reset(null, false); state.modelView = true; }
  if (state.historyIndex < state.history.length - 1) state.history = state.history.slice(0, state.historyIndex + 1);
  state.modelPlaying = true; state.replaying = false; state.pendingDriveUntil = 0; state.inspecting = false; activeDriveKey = null;
  state.showPaths = true; $('showPaths').checked = true;
  const step = getScenario(state.scenarioId).steps[state.modelStep];
  state.handAngle = step.angle; state.gear = step.gear; state.running = step.drive;
  text('runStatus', '모범 동작 · 멈추기 버튼으로 잠깐 멈출 수 있어요'); renderLesson(); renderUI();
}
function goQuiz(index = 0) {
  if (camera.active || cameraBusy) cancelCameraInput();
  if (state.mode === 'free') state.previousScenarioId = state.scenarioId;
  state.scenarioId = 'free';
  state.mode = 'quiz'; state.lessonIndex = index; state.phase = 'question'; state.choice = null;
  const lesson = LESSONS[index]; state.handAngle = lesson.handAngle; state.gear = lesson.gear;
  state.showPaths = false; $('showPaths').checked = false;
  reset(lesson.heading); renderLesson(); renderUI();
}
function answer(index) {
  if (state.phase !== 'question') return;
  state.choice = index; state.phase = 'answered'; renderLesson(); renderUI();
}
function renderLesson() {
  const free = state.mode === 'free', s = getScenario(state.scenarioId);
  const coachKey = [state.mode, s.id, state.modelView, state.modelStep, state.lessonIndex].join('|');
  if (coachKey !== lastCoachKey) { $('coachScroll').scrollTop = 0; lastCoachKey = coachKey; }
  $('freeMode').classList.toggle('active', state.mode === 'free'); $('freeMode').setAttribute('aria-pressed', state.mode === 'free');
  $('quizMode').classList.toggle('active', state.mode === 'quiz'); $('quizMode').setAttribute('aria-pressed', state.mode === 'quiz');
  $('quizAnswers').hidden = state.mode === 'free'; $('lessonProgress').hidden = state.mode === 'free';
  $('lessonFeedback').hidden = state.mode === 'free' || state.phase === 'question';
  $('missionBox').hidden = !free || state.modelView; $('cautionBox').hidden = !free;
  $('modelButtons').hidden = !free; $('lessonAction').hidden = free;
  $('practiceStatus').hidden = !free; $('scenarioSelect').disabled = !free;
  $('modelSteps').hidden = !free || !state.modelView;
  text('sceneName', free ? s.garage ? `지하 2층 B구역 · ${s.garage.targetLabel}` : s.short : '움직임 예상하기');
  $('targetLegend').hidden = !free || !s.target;
  $('lessonAction').disabled = false;
  if (state.mode === 'free') {
    $('scenarioSelect').value = s.id;
    const step = s.steps[state.modelStep];
    text('lessonEyebrow', state.modelView ? `모범 동작 · ${state.modelStep + 1} / ${s.steps.length}` : s.tag);
    text('lessonTitle', state.modelView ? step.title : s.title);
    text('lessonDescription', state.modelView ? step.note : s.description);
    text('missionText', s.goal); text('cautionText', s.caution);
    text('practiceStatus', state.modelView ? state.modelFinished ? '보기 완료' : state.modelPlaying ? '보는 중' : '일시 정지' : state.complete ? '목표 완료' : state.contact ? '가까워요' : '직접 연습');
    $('practiceStatus').classList.toggle('complete', state.complete); $('practiceStatus').classList.toggle('contact', state.contact);
    text('modelButton', state.modelPlaying ? 'Ⅱ 모범 동작 잠깐 멈추기' : state.modelView && !state.modelFinished ? '▷ 모범 동작 계속 보기' : state.modelFinished ? '↶ 모범 동작 다시 보기' : '▷ 모범 동작 보기');
    $('practiceButton').hidden = !state.modelView;
    $('modelSteps').replaceChildren(...s.steps.map((step, i) => {
      const item = document.createElement('li'); item.textContent = step.title;
      item.classList.toggle('active', i === state.modelStep); item.classList.toggle('done', i < state.modelStep); return item;
    }));
    text('quizNote', '모범 동작은 이 연습장에 맞춘 예시예요.');
    return;
  }
  const lesson = LESSONS[state.lessonIndex];
  text('lessonEyebrow', '움직임을 예상해보세요'); text('lessonProgress', `${state.lessonIndex + 1} / ${LESSONS.length}`);
  $('lessonTitle').replaceChildren(...lesson.title.split('\n').flatMap((line, i) => i ? [document.createElement('br'), document.createTextNode(line)] : [document.createTextNode(line)]));
  text('lessonDescription', lesson.description);
  $('quizAnswers').replaceChildren(...lesson.choices.map((choice, i) => {
    const button = document.createElement('button'); button.textContent = choice;
    button.disabled = state.phase !== 'question'; button.classList.toggle('selected', state.choice === i);
    button.setAttribute('aria-pressed', state.choice === i); button.addEventListener('click', () => answer(i)); return button;
  }));
  if (state.phase === 'question') { text('lessonAction', '예상하는 답을 먼저 골라주세요'); $('lessonAction').disabled = true; }
  if (state.phase === 'answered') {
    text('lessonFeedback', '예상을 골랐어요. 이제 차가 움직이는 모습을 확인해보세요.'); text('lessonAction', '움직임 확인하기 ↓');
  }
  if (state.phase === 'demo') { text('lessonAction', state.running ? '천천히 움직임을 보고 있어요…' : '계속 움직임 확인하기 ↓'); $('lessonAction').disabled = state.running; }
  if (state.phase === 'review') {
    text('lessonFeedback', `${state.choice === lesson.answer ? '맞게 예상했어요. ' : '예상과 달랐던 부분을 살펴봐요. '}${lesson.feedback}`);
    text('lessonAction', state.lessonIndex === LESSONS.length - 1 ? '자유롭게 다시 연습하기 ↗' : '다음 상황 예상하기 →');
  }
  text('quizNote', '이 장면은 같은 핸들 각도로 움직여요. 손 조작은 자유 연습에서 해보세요.');
}
function renderUI() {
  const free = state.mode === 'free', manual = free && !state.modelView && !camera.active && !cameraBusy;
  $('steeringWheel').style.transform = `rotate(${state.handAngle}deg)`;
  $('steerRange').value = Math.round(state.handAngle); $('steerRange').disabled = !manual;
  $('steerRange').setAttribute('aria-valuetext', steeringWords(state.handAngle));
  $('wheelPad').setAttribute('aria-disabled', !manual);
  $('centerWheel').disabled = !manual; $('resetPosition').disabled = !free;
  text('steeringReadout', steeringWords(state.handAngle));
  text('roadReadout', `앞바퀴 ${Math.round(Math.abs(deg(roadAngle(state.handAngle))))}°`);
  text('inputBadge', state.modelView ? '모범 동작' : camera.active ? '손으로 조작' : '마우스·터치');
  $('reverseGear').classList.toggle('active', state.gear === -1); $('forwardGear').classList.toggle('active', state.gear === 1);
  $('reverseGear').setAttribute('aria-pressed', state.gear === -1); $('forwardGear').setAttribute('aria-pressed', state.gear === 1);
  $('reverseGear').disabled = !free || !canRequestMove(); $('forwardGear').disabled = !free || !canRequestMove();
  const movingOrWaiting = state.running || state.replaying || state.modelPlaying || !!state.pendingDriveUntil;
  $('driveButton').disabled = !movingOrWaiting && !(state.modelView ? !state.modelFinished : free ? canRequestMove() : canMove());
  $('driveButton').classList.toggle('running', movingOrWaiting);
  text('driveIcon', movingOrWaiting ? 'Ⅱ' : state.gear < 0 ? '↓' : '↑');
  text('driveButtonText', state.pendingDriveUntil ? '출발 취소' : movingOrWaiting ? '멈추기' : state.modelView ? state.modelFinished ? '보기 완료' : '계속 보기' : free ? state.gear < 0 ? '후진하기' : '전진하기' : state.phase === 'review' ? '확인 완료' : '움직임 확인');
  const hasHistory = state.history.length > 1;
  $('timeline').max = state.history.length - 1; $('timeline').value = state.historyIndex;
  $('timeline').disabled = !hasHistory || state.running || state.modelPlaying || (state.mode === 'quiz' && state.phase !== 'review');
  $('replayButton').disabled = !hasHistory || state.running || state.modelPlaying || (state.mode === 'quiz' && state.phase !== 'review');
  text('travelReadout', `${(state.travelled || 0).toFixed(1)} m`);
  updateViewsAndNotice();
  text('motionText', state.mode === 'quiz' && ['question', 'answered'].includes(state.phase) ? '차의 앞과 뒤를 따로 생각해보세요. 좌우는 차를 기준으로 해요.' : motionWords(state.handAngle, state.gear));
}
function updateViewsAndNotice() {
  const s = getScenario(state.scenarioId), p = proximity(state.pose, obstaclesFor(s, state.hazardTime));
  state.attention = state.modelView ? s.steps[state.modelStep].attention : s.attention;
  if (!state.modelView && p.distance < .65 && p.obstacle) {
    const dx = p.obstacle.x - state.pose.x, dy = p.obstacle.y - state.pose.y;
    const along = dx * Math.sin(state.pose.heading) + dy * Math.cos(state.pose.heading), right = dx * Math.cos(state.pose.heading) - dy * Math.sin(state.pose.heading);
    state.attention = along < .5 ? 'rear' : right < 0 ? 'front-left' : 'front-right';
  }
  state.nearObstacleId = p.distance < .65 || state.contact ? p.obstacle?.id : null;
  $('leftMirror').hidden = !state.showMirrors; $('rightMirror').hidden = !state.showMirrors; $('rearCamera').hidden = !state.showRear;
  $('mirrorStrip').hidden = !state.showMirrors && !state.showRear;
  $('scene').classList.toggle('no-views', !state.showMirrors && !state.showRear);
  $('rearEmpty').hidden = state.gear === -1;
  $('demoBadge').hidden = !state.modelPlaying;
  for (const [id, match] of [['leftMirror', ['all', 'front-left']], ['rightMirror', ['all', 'front-right']], ['rearCamera', ['rear']]]) $(id).classList.toggle('attention', state.modelView && match.includes(state.attention));
  let notice = '';
  if (state.contact) notice = '닿을 수 있어요 · 접촉 전에 멈췄어요';
  else if (state.complete) notice = s.garage ? `${s.garage.targetLabel} 주차 완료` : '목표 자리에서 멈췄어요';
  else if (s.traffic && state.hazardTime >= 0 && state.hazardTime < s.traffic.duration) notice = '통로 차량 접근 · 멈춰서 먼저 보내요';
  else if (p.distance < .65) notice = ({ column: '기둥과 가까워요 · 옆 간격을 확인해요', car: '옆 차와 가까워요 · 앞뒤 모서리를 확인해요', stopper: '주차턱이 가까워요 · 뒤 공간을 확인해요' })[p.obstacle?.kind] || '장애물과 가까워요 · 앞뒤 간격을 확인해요';
  else if (state.modelView) notice = ({ 'front-left': '주의 지점 · 왼쪽 앞코', 'front-right': '주의 지점 · 오른쪽 앞코', rear: '주의 지점 · 뒤쪽 간격', front: '주의 지점 · 진행할 앞 공간', all: '양쪽 미러와 주변을 함께 확인해요' })[state.attention];
  $('sceneNotice').hidden = !notice; text('sceneNoticeText', notice);
  $('sceneNotice').classList.toggle('contact', state.contact); $('sceneNotice').classList.toggle('success', state.complete);
}
function updateCamera(status, message) {
  const changed = cameraState !== status; cameraState = status;
  const active = camera.active;
  $('handVideo').hidden = !active; $('handOverlay').hidden = !active; $('cameraPoster').hidden = active;
  $('trackingPrompt').hidden = !active; $('calibrateButton').hidden = !active || status === 'loading';
  $('calibrateButton').disabled = !['can-calibrate', 'calibrated', 'unsteady'].includes(status);
  $('cameraButton').hidden = active; $('stopCamera').hidden = !active && !cameraBusy;
  $('cameraStatus').classList.toggle('active', active);
  const messages = {
    off: ['카메라 꺼짐', '양손이 함께 보이게 들어주세요'],
    loading: ['손 인식 준비 중', '처음에는 손 인식 준비에 잠깐 시간이 걸려요'],
    tracking: ['양손을 찾고 있어요', '양손을 벌리고 가운데 자세로 잠깐 멈춰주세요'],
    'can-calibrate': ['가운데 자세를 맞춰요', '아래 버튼을 눌러 이 자세를 가운데로 정해주세요'],
    calibrated: ['손으로 조작 중', '양손을 천천히 돌려보세요 · 작은 동작을 확대해요'],
    lost: ['잠깐 멈췄어요', '양손이 다시 보이면 출발 버튼을 눌러주세요'],
    unsteady: ['잠깐 가만히 있어요', '양손을 편하게 벌리고 잠깐 멈춘 뒤 다시 눌러주세요'],
    error: ['손 인식 중단', '직접 조작으로도 연습할 수 있어요']
  };
  const copy = messages[status] || messages.off;
  text('cameraStatus', copy[0]); text('trackingPrompt', copy[1]);
  text('calibrateButton', status === 'calibrated' ? '가운데 자세 다시 맞추기' : '이 자세를 핸들 가운데로');
  if (message) { $('cameraError').hidden = false; text('cameraError', message); }
  if (changed) renderUI();
}

$('freeMode').addEventListener('click', () => { goFree(); state.showPaths = true; $('showPaths').checked = true; });
$('scenarioSelect').addEventListener('change', e => selectScenario(e.target.value));
$('nextScenario').addEventListener('click', () => selectScenario(SCENARIOS[(SCENARIOS.findIndex(s => s.id === state.scenarioId) + 1) % SCENARIOS.length].id));
$('modelButton').addEventListener('click', startModel);
$('practiceButton').addEventListener('click', () => { reset(null, false); text('runStatus', '이번에는 직접 해보세요. R / D를 누르면 출발해요.'); });
for (const [id, key] of [['showMirrors', 'showMirrors'], ['showRear', 'showRear']]) $(id).addEventListener('change', e => { state[key] = e.target.checked; renderUI(); });
$('aboutButton').addEventListener('click', () => { pause('안내를 보는 동안 멈췄어요'); $('aboutDialog').showModal(); });
$('closeAbout').addEventListener('click', () => $('aboutDialog').close());
$('quizMode').addEventListener('click', () => goQuiz());
$('lessonAction').addEventListener('click', () => {
  if (state.mode === 'free') return goQuiz();
  if (state.phase === 'answered' || state.phase === 'demo') return startMoving();
  if (state.phase === 'review') return state.lessonIndex < LESSONS.length - 1 ? goQuiz(state.lessonIndex + 1) : goFree();
});
$('steerRange').addEventListener('input', e => setSteering(Number(e.target.value)));
$('centerWheel').addEventListener('click', () => setSteering(0));
$('resetPosition').addEventListener('click', () => reset(null, false));
$('driveButton').addEventListener('click', startMoving);
for (const [id, gear] of [['reverseGear', -1], ['forwardGear', 1]]) {
  $(id).addEventListener('pointerdown', e => { if (e.button === 0) requestDirection(gear); });
  $(id).addEventListener('click', e => { if (e.detail === 0) requestDirection(gear); });
}
$('showPaths').addEventListener('change', e => { state.showPaths = e.target.checked; });
$('showWheels').addEventListener('change', e => { state.showWheels = e.target.checked; });
for (const [id, value] of [['view3d', '3d'], ['viewTop', 'top'], ['viewFollow', 'follow']]) $(id).addEventListener('click', () => {
  scene?.setView(value);
  for (const [buttonId, v] of [['view3d', '3d'], ['viewTop', 'top'], ['viewFollow', 'follow']]) { $(buttonId).classList.toggle('active', v === value); $(buttonId).setAttribute('aria-pressed', v === value); }
});
function restoreFrame(index) {
  state.historyIndex = clamp(index, 0, state.history.length - 1);
  const f = state.history[state.historyIndex]; state.pose = { ...f.pose }; state.handAngle = f.handAngle; state.gear = f.gear; state.time = f.time;
  state.travelled = f.travelled; state.hazardTime = f.hazardTime; state.contact = f.contact; state.complete = f.complete; state.modelStep = f.modelStep;
  state.modelElapsed = f.modelElapsed;
  if (state.modelView) { const steps = getScenario(state.scenarioId).steps; state.modelFinished = state.modelStep === steps.length - 1 && state.modelElapsed >= steps[state.modelStep].duration - 1e-8; }
  renderLesson(); renderUI();
}
$('timeline').addEventListener('input', e => { const index = Number(e.target.value); pause('이 위치에서 움직임을 살펴보세요'); state.inspecting = true; restoreFrame(index); });
$('replayButton').addEventListener('click', () => {
  if (state.replaying) return pause('다시 보기를 멈췄어요');
  state.running = false; state.modelPlaying = false; state.replaying = true; state.inspecting = true; restoreFrame(0); state.replayCursor = 0; text('runStatus', '기록한 움직임을 다시 보고 있어요'); renderUI();
});
function pointerAngle(e) { const box = $('wheelPad').getBoundingClientRect(); return Math.atan2(e.clientY - box.y - box.height / 2, e.clientX - box.x - box.width / 2) * 180 / Math.PI; }
$('wheelPad').addEventListener('pointerdown', e => {
  if (e.button !== 0 || steeringPointer !== null || $('wheelPad').getAttribute('aria-disabled') === 'true') return;
  e.preventDefault(); steeringPointer = e.pointerId; lastDrag = pointerAngle(e); $('wheelPad').setPointerCapture(e.pointerId); $('wheelPad').classList.add('dragging');
});
$('wheelPad').addEventListener('pointermove', e => {
  if (e.pointerId !== steeringPointer) return; const angle = pointerAngle(e); let difference = angle - lastDrag;
  if (difference > 180) difference -= 360; if (difference < -180) difference += 360;
  lastDrag = angle; setSteering(state.handAngle + difference);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('wheelPad').addEventListener(event, e => {
  if (e.pointerId !== steeringPointer) return;
  steeringPointer = null; $('wheelPad').classList.remove('dragging');
});
document.addEventListener('keydown', e => {
  if ($('aboutDialog').open) return;
  if (e.code === 'Escape' && (state.running || state.replaying || state.modelPlaying || state.pendingDriveUntil)) {
    e.preventDefault(); userStop('Escape로 멈췄어요. 준비되면 다시 출발해주세요.'); return;
  }
  const editing = e.target.isContentEditable || ['TEXTAREA', 'SELECT', 'INPUT', 'SUMMARY'].includes(e.target.tagName);
  if (e.ctrlKey || e.metaKey || e.altKey || editing) return;
  if (state.mode === 'free' && ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) {
    e.preventDefault(); if (!e.repeat) requestDirection(['ArrowUp', 'KeyW'].includes(e.code) ? 1 : -1, e.code); return;
  }
  if (['INPUT', 'SUMMARY'].includes(e.target.tagName)) return;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); setSteering(state.handAngle + (e.code === 'ArrowLeft' ? -18 : 18)); }
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); startMoving(); }
});
document.addEventListener('keyup', e => {
  if (activeDriveKey !== e.code) return;
  e.preventDefault(); userStop('전후진 키에서 손을 떼어 멈췄어요');
});
function cancelCameraInput() {
  cameraRequest++; cameraBusy = false; camera.stop();
  $('cameraButton').disabled = false;
  $('cameraButton').querySelector('span').textContent = '카메라 켜고 손으로 조작';
  updateCamera('off'); renderUI();
}
$('cameraButton').addEventListener('click', async () => {
  if (cameraBusy || camera.active) return;
  if (state.mode !== 'free') goFree();
  if (state.modelView) reset(null, false);
  const request = ++cameraRequest;
  pause('카메라를 준비하고 있어요'); cameraBusy = true; $('cameraError').hidden = true;
  $('cameraButton').disabled = true; $('cameraButton').querySelector('span').textContent = '카메라 준비 중…';
  $('stopCamera').hidden = false; renderUI();
  try { await camera.start(); }
  catch (error) { if (request === cameraRequest) { $('cameraError').hidden = false; text('cameraError', error.message || '카메라를 켜지 못했어요. 직접 조작으로 연습해주세요.'); } }
  finally { if (request === cameraRequest) { cameraBusy = false; $('cameraButton').disabled = false; $('cameraButton').querySelector('span').textContent = '카메라 켜고 손으로 조작'; updateCamera(camera.active ? cameraState : 'off'); renderUI(); } }
});
$('calibrateButton').addEventListener('click', () => {
  pause('가운데 자세를 확인하고 있어요.');
  text('runStatus', camera.calibrate() ? '가운데 자세를 맞췄어요. 출발 버튼을 눌러주세요.' : '아직 가운데 자세를 맞추지 못했어요. 양손을 잠깐 고정하고 다시 눌러주세요.');
});
$('stopCamera').addEventListener('click', () => { pause(); cancelCameraInput(); text('runStatus', '마우스나 터치로 이어서 조작할 수 있어요'); renderUI(); });
window.addEventListener('blur', () => { if (state.running || state.replaying || state.modelPlaying || state.pendingDriveUntil) pause('화면을 벗어나서 잠깐 멈췄어요'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause('화면을 벗어나서 잠깐 멈췄어요'); if (camera.active || cameraBusy) cancelCameraInput(); } });
window.addEventListener('pagehide', event => { pause('페이지를 떠나서 잠깐 멈췄어요. 돌아오면 직접 다시 출발해주세요.'); cancelCameraInput(); if (!event.persisted) scene?.dispose?.(); });

function advanceWorld(dt, drive) {
  const s = getScenario(state.scenarioId), next = drive ? stepPose(state.pose, state.handAngle, state.gear, dt) : state.pose;
  const hazard = nextHazardTime(s, state.hazardTime, next, state.gear, dt);
  const p = proximity(next, obstaclesFor(s, hazard));
  if (p.contact && state.mode !== 'quiz') {
    state.contact = true; state.complete = false;
    pause('차체가 닿기 전에 멈췄어요. 기록을 되감거나 반대 방향으로 조금 움직여보세요.'); record(); renderUI(); return false;
  }
  state.pose = next; state.hazardTime = hazard; state.time += dt;
  if (drive) { state.travelled += dt * SPEED; state.runDistance += dt * SPEED; }
  record(); return true;
}
function advanceModel(dt) {
  const s = getScenario(state.scenarioId);
  let remaining = Math.min(dt, 1 / 30);
  while (remaining > 1e-8 && state.modelPlaying) {
    const seg = s.steps[state.modelStep], step = Math.min(remaining, seg.duration - state.modelElapsed);
    state.handAngle = seg.angle; state.gear = seg.gear; state.running = seg.drive;
    state.modelElapsed += step;
    if (!advanceWorld(step, seg.drive)) { state.modelElapsed -= step; return; }
    remaining -= step;
    if (state.modelElapsed >= seg.duration - 1e-8) {
      if (state.modelStep === s.steps.length - 1) {
        state.modelPlaying = false; state.modelFinished = true; state.running = false;
        text('runStatus', '모범 동작을 봤어요. 직접 해보기로 처음부터 연습해보세요.');
      } else { state.modelStep++; state.modelElapsed = 0; }
      renderLesson();
    }
  }
  renderUI();
}
function advance(dt) {
  if (state.pendingDriveUntil) {
    if (performance.now() > state.pendingDriveUntil || !camera.active || !camera.calibrated) pause('출발 대기가 끝났어요. 양손을 맞추고 다시 눌러주세요.');
    else if (camera.ready) beginMovement();
  }
  if (state.modelPlaying) { advanceModel(dt); return; }
  if (state.running) {
    if (camera.active && !camera.ready) { pause('양손이 안 보여서 멈췄어요. 손을 다시 맞춘 뒤 출발해주세요.'); return; }
    const step = Math.min(dt, 1 / 30), scenario = getScenario(state.scenarioId);
    if (!advanceWorld(step, true)) return;
    if (state.runDistance >= (state.mode === 'quiz' ? 1.6 : scenario.maxTrip || 5) || !withinBounds(state.pose, scenario)) {
      state.running = false; activeDriveKey = null;
      if (state.mode === 'quiz') { state.phase = 'review'; state.showPaths = true; $('showPaths').checked = true; renderLesson(); }
      text('runStatus', state.mode === 'quiz' ? '이동 기록을 되감아 다시 볼 수 있어요' : '조금 움직였어요. 멈춰서 앞뒤 경로를 살펴보세요');
    }
    renderUI();
  }
  else if (!state.replaying && !state.modelView && !state.inspecting && !state.contact && state.hazardTime >= 0 && state.hazardTime < (getScenario(state.scenarioId).traffic?.duration || 0)) {
    advanceWorld(Math.min(dt, 1 / 30), false); renderUI();
  }
  if (state.replaying) {
    const firstTime = state.history[0].time; state.replayCursor += dt;
    while (state.historyIndex < state.history.length - 1 && state.history[state.historyIndex + 1].time - firstTime <= state.replayCursor) state.historyIndex++;
    restoreFrame(state.historyIndex);
    if (state.historyIndex === state.history.length - 1) pause('다시 보기가 끝났어요');
  }
}
function animate(now) {
  if (document.hidden) { state.lastFrame = now; requestAnimationFrame(animate); return; }
  const dt = state.lastFrame ? Math.max(0, Math.min((now - state.lastFrame) / 1000, .2)) : 0; state.lastFrame = now;
  let remaining = dt;
  while (remaining > 1e-8) { const step = Math.min(remaining, 1 / 60); advance(step); remaining -= step; }
  scene?.render(state); requestAnimationFrame(animate);
}
function useFlatView(lost = false) {
  state.showMirrors = state.showRear = false; $('showMirrors').checked = $('showRear').checked = false; $('showMirrors').disabled = $('showRear').disabled = true;
  text('runStatus', lost ? '3D 화면이 멈춰 2D로 바꿨어요. 직접 다시 출발할 수 있어요.' : '2D 화면에서는 가상 미러를 지원하지 않아요');
  for (const id of ['view3d','viewFollow']) { $(id).disabled = true; $(id).classList.remove('active'); $(id).setAttribute('aria-pressed','false'); }
  $('viewTop').classList.add('active'); $('viewTop').setAttribute('aria-pressed','true'); $('scene').setAttribute('aria-label','자동차와 장애물의 위에서 본 2D 연습장'); renderUI();
}
reset(); renderLesson();
createScene($('scene'), () => { pause(); if (camera.active || cameraBusy) cancelCameraInput(); useFlatView(true); }).then(value => {
  scene = value; $('sceneLoading').hidden = true;
  if (scene.kind === '2d') useFlatView();
  requestAnimationFrame(animate);
}).catch(error => { text('sceneLoading', '화면을 준비하지 못했어요. 새로고침해서 다시 시도해주세요.'); console.error(error); });
