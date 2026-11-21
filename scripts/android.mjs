// 안드로이드 앱 빌드와 설치 (docs/NATIVE_APP.md). Android Studio 없이 명령줄 도구만 쓴다.
//   node scripts/android.mjs build     capacitor.config.json 과 플러그인을 android/ 에 맞추고(cap sync) 디버그 APK 를 만든다
//   node scripts/android.mjs install   USB 로 연결한 폰에 APK 를 덮어 설치한다 (앱의 기록은 그대로 남는다)
//   node scripts/android.mjs run       build, install 뒤 앱을 띄운다
// --dev 를 붙이면 시험용 앱 'Coach 시험'(패키지 끝 .dev)을 만든다. 쓰는 앱과 따로 깔리고 기록도 따로라서,
// push 하기 전의 웹 코드와 새 네이티브 코드를 실제 기록에 손대지 않고 시험한다. 웹 화면은 PC 의 로컬 서버에서 받는다:
//   npm run serve 를 켜 두고 install --dev 를 하면 adb reverse 로 폰의 localhost:8080 을 PC 에 잇는다.
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
const dev = process.argv.includes('--dev');
const APP_ID = `io.github.soomin007.workoutcoach${dev ? '.dev' : ''}`;
const VARIANT = dev ? 'dev' : 'debug';
const APK = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', VARIANT, `app-${VARIANT}.apk`);
const DEV_URL = 'http://localhost:8080/';
const win = process.platform === 'win32';
const adb = path.join(SDK, 'platform-tools', win ? 'adb.exe' : 'adb');
const env = { ...process.env, JAVA_HOME, ANDROID_HOME: SDK, PATH: `${path.join(JAVA_HOME, 'bin')}${path.delimiter}${process.env.PATH}` };

// .bat 와 npx 는 셸로 띄워야 해서 명령을 한 줄로 이어 넘긴다 (인자는 이 파일의 고정 값뿐이고 경로에 공백이 없다).
function sh(cmd, args, { cwd = root, shell = false } = {}) {
  const r = shell ? spawnSync([cmd, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true }) : spawnSync(cmd, args, { cwd, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`실패: ${cmd} ${args.join(' ')}`); process.exit(r.status ?? 1); }
}

// 시험용 앱은 같은 설정에서 server.url 만 PC 의 로컬 서버로 바꾼 사본을 쓴다 (src/dev/assets 가 main 의 같은 파일을 덮는다)
function writeDevConfig() {
  const main = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  const cfg = JSON.parse(fs.readFileSync(main, 'utf8'));
  cfg.appName = 'Coach 시험';
  cfg.server = { ...cfg.server, url: DEV_URL, cleartext: true };
  const out = path.join(root, 'android', 'app', 'src', 'dev', 'assets');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'capacitor.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
}

function build() {
  if (!fs.existsSync(path.join(JAVA_HOME, 'bin'))) { console.error(`JDK 21 이 없습니다: ${JAVA_HOME} (WC_JAVA_HOME 으로 지정)`); process.exit(1); }
  // Gradle 이 SDK 를 찾게 한다. local.properties 는 PC 마다 다른 값이라 커밋하지 않는다(android/.gitignore).
  const lp = path.join(root, 'android', 'local.properties');
  if (!fs.existsSync(lp)) fs.writeFileSync(lp, `sdk.dir=${SDK.split(path.sep).join('/')}\n`);
  sh('npx', ['cap', 'sync', 'android'], { shell: win });
  if (dev) writeDevConfig();
  // 절대 경로로 부른다: cmd 는 NoDefaultCurrentDirectoryInExePath 가 켜져 있으면 현재 폴더의 gradlew.bat 를 찾지 않는다
  sh(path.join(root, 'android', win ? 'gradlew.bat' : 'gradlew'), [dev ? 'assembleDev' : 'assembleDebug'], { cwd: path.join(root, 'android'), shell: win });
  console.log(`APK: ${APK}`);
}

function install() {
  if (!fs.existsSync(APK)) { console.error(`APK 가 없습니다. 먼저 build${dev ? ' --dev' : ''} 를 돌리세요.`); process.exit(1); }
  const list = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout || '';
  if (!/\tdevice\b/.test(list)) { console.error(`연결된 폰이 없습니다. USB 디버깅을 켜고 PC 를 허용했는지 확인하세요.\n${list}`); process.exit(1); }
  sh(adb, ['install', '-r', APK]);
  if (dev) {
    sh(adb, ['reverse', 'tcp:8080', 'tcp:8080']);
    console.log(`시험용 앱은 ${DEV_URL} 에서 화면을 받습니다. PC 에서 npm run serve 를 켜 두세요.`);
  }
}

const cmd = process.argv[2];
if (cmd === 'build') build();
else if (cmd === 'install') install();
else if (cmd === 'run') { build(); install(); sh(adb, ['shell', 'am', 'start', '-n', `${APP_ID}/io.github.soomin007.workoutcoach.MainActivity`]); }
else { console.error('사용법: node scripts/android.mjs build | install | run [--dev]'); process.exit(1); }
