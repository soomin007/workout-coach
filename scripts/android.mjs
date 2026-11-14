// 안드로이드 앱 빌드와 설치 (docs/NATIVE_APP.md). Android Studio 없이 명령줄 도구만 쓴다.
//   node scripts/android.mjs build     capacitor.config.json 과 플러그인을 android/ 에 맞추고(cap sync) 디버그 APK 를 만든다
//   node scripts/android.mjs install   USB 로 연결한 폰에 APK 를 덮어 설치한다 (앱의 기록은 그대로 남는다)
//   node scripts/android.mjs run       build, install 뒤 앱을 띄운다
// 웹 화면(app/)만 고쳤으면 다시 빌드할 필요가 없다. main 에 push 하면 앱이 GitHub Pages 에서 새 화면을 받는다.
// JDK 21 과 Android SDK 위치는 환경 변수 WC_JAVA_HOME, ANDROID_HOME 으로 바꿀 수 있다.
// 시스템 JAVA_HOME 은 건드리지 않고 이 스크립트가 띄우는 Gradle 에만 넘긴다 (Godot 안드로이드 내보내기는 JDK 17 을 쓴다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const JAVA_HOME = process.env.WC_JAVA_HOME || 'C:/Users/soomi/Android/jdk-21.0.13+9';
const SDK = process.env.ANDROID_HOME || 'C:/Users/soomi/Android/sdk';
const APP_ID = 'io.github.soomin007.workoutcoach';
const APK = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const win = process.platform === 'win32';
const adb = path.join(SDK, 'platform-tools', win ? 'adb.exe' : 'adb');
const env = { ...process.env, JAVA_HOME, ANDROID_HOME: SDK, PATH: `${path.join(JAVA_HOME, 'bin')}${path.delimiter}${process.env.PATH}` };

// .bat 와 npx 는 셸로 띄워야 해서 명령을 한 줄로 이어 넘긴다 (인자는 이 파일의 고정 값뿐이고 경로에 공백이 없다).
function sh(cmd, args, { cwd = root, shell = false } = {}) {
  const r = shell ? spawnSync([cmd, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true }) : spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`실패: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
}

function build() {
  if (!fs.existsSync(path.join(JAVA_HOME, 'bin'))) { console.error(`JDK 21 이 없습니다: ${JAVA_HOME} (WC_JAVA_HOME 으로 지정)`); process.exit(1); }
  // Gradle 이 SDK 를 찾게 한다. local.properties 는 PC 마다 다른 값이라 커밋하지 않는다(android/.gitignore).
  const lp = path.join(root, 'android', 'local.properties');
  if (!fs.existsSync(lp)) fs.writeFileSync(lp, `sdk.dir=${SDK.split(path.sep).join('/')}\n`);
  sh('npx', ['cap', 'sync', 'android'], { shell: win });
  // 절대 경로로 부른다: cmd 는 NoDefaultCurrentDirectoryInExePath 가 켜져 있으면 현재 폴더의 gradlew.bat 를 찾지 않는다
  sh(path.join(root, 'android', win ? 'gradlew.bat' : 'gradlew'), ['assembleDebug'], { cwd: path.join(root, 'android'), shell: win });
  console.log(`APK: ${APK}`);
}

function install() {
  if (!fs.existsSync(APK)) { console.error('APK 가 없습니다. 먼저 build 를 돌리세요.'); process.exit(1); }
  const dev = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout || '';
  if (!/\tdevice\b/.test(dev)) { console.error(`연결된 폰이 없습니다. USB 디버깅을 켜고 PC 를 허용했는지 확인하세요.\n${dev}`); process.exit(1); }
  sh(adb, ['install', '-r', APK]);
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'install') install();
else if (cmd === 'run') { build(); install(); sh(adb, ['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]); }
else { console.error('사용법: node scripts/android.mjs build | install | run'); process.exit(1); }
