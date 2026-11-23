package io.github.soomin007.workoutcoach;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.util.Log;

/**
 * 휴식 끝과 버티기 단계 끝의 소리와 진동을 앱이 직접 낸다 (11/23 세션 메모: 폰을 늘 무음으로 두는데 알림은 울리기를 바람).
 *
 * 사용자는 운동할 때 늘 무선 이어폰(갤럭시 버즈)을 끼고 있어서, 소리는 휴대폰 스피커가 아니라 이어폰에서 들려야 한다(11/23 사용자 설명).
 * 알림 채널의 소리는 무음 모드에서 꺼지고, 채널을 알람 용도로 바꿔도 갤럭시 S22+(One UI 8.0) 무음 모드에서는 나지 않았다(2026-11-23 실측).
 * 알람 용도로 앱이 직접 내면 무음에서도 나지만 이어폰이 연결돼 있어도 스피커로 같이 울린다. 그래서 내비게이션 안내 음성처럼
 * 미디어 쪽 소리(USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)로 낸다. 이 소리는 무음과 진동 모드의 영향을 받지 않고 연결된 이어폰으로만 나가며
 * (연결이 없으면 스피커), 크기는 미디어 볼륨을 따른다. 음악을 듣는 중이면 잠깐 줄였다가(오디오 포커스 duck) 끝나면 되돌린다.
 * 통화 중처럼 포커스를 얻지 못하면 소리는 내지 않고 진동만 한다. 알림 채널은 소리와 진동 없이 화면 위에만 띄운다(WorkoutNotice.CHANNEL).
 */
final class AlertSound {
    private static final String TAG = "WorkoutNotice";
    private static final long[] PATTERN = {0, 150, 80, 150}; // 앱 화면의 휴식 끝 진동과 같다
    private static final long MAX_MS = 6000; // 브로드캐스트를 붙잡아 둘 수 있는 10초 안에서 끊는다

    private AlertSound() {}

    static AudioAttributes cue() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    /** 소리와 진동을 낸다. 재생이 끝나거나 MAX_MS 가 지나면 done 을 한 번 부른다(리시버의 goAsync 를 끝낸다). */
    static void play(Context ctx, Runnable done) {
        vibrate(ctx);
        AudioManager am = ctx.getSystemService(AudioManager.class);
        Object focus = requestFocus(am);
        if (focus == null) {
            Log.i(TAG, "sound skipped: no audio focus");
            if (done != null) done.run();
            return;
        }
        Handler h = new Handler(Looper.getMainLooper());
        MediaPlayer mp = new MediaPlayer();
        final boolean[] over = { false };
        Runnable finish = () -> {
            if (over[0]) return;
            over[0] = true;
            try {
                mp.release();
            } catch (RuntimeException ignored) {
                // 이미 풀렸다
            }
            abandonFocus(am, focus);
            if (done != null) done.run();
        };
        try {
            mp.setAudioAttributes(cue());
            mp.setDataSource(ctx, Settings.System.DEFAULT_NOTIFICATION_URI);
            mp.setOnCompletionListener((p) -> finish.run());
            mp.setOnErrorListener((p, what, extra) -> {
                Log.w(TAG, "sound error " + what + "/" + extra);
                finish.run();
                return true;
            });
            mp.prepare();
            mp.start();
            h.postDelayed(finish, MAX_MS);
            Log.i(TAG, "sound cue started");
        } catch (Exception e) {
            Log.w(TAG, "sound fallback beep", e);
            beep(h);
            h.postDelayed(finish, 700);
        }
    }

    // 음악을 잠깐 줄이고 그 위에 낸다. 얻지 못하면(통화 중 등) null.
    private static Object requestFocus(AudioManager am) {
        if (am == null) return null;
        if (Build.VERSION.SDK_INT >= 26) {
            AudioFocusRequest req = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(cue())
                .build();
            return am.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? req : null;
        }
        AudioManager.OnAudioFocusChangeListener l = (c) -> {};
        return am.requestAudioFocus(l, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED ? l : null;
    }

    private static void abandonFocus(AudioManager am, Object focus) {
        if (am == null || focus == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focus instanceof AudioFocusRequest) am.abandonAudioFocusRequest((AudioFocusRequest) focus);
        else if (focus instanceof AudioManager.OnAudioFocusChangeListener) am.abandonAudioFocus((AudioManager.OnAudioFocusChangeListener) focus);
    }

    // 기본 알림음을 열 수 없을 때(알림음을 '없음'으로 둔 경우 등) 같은 미디어 쪽 소리로 짧게 두 번 울린다
    private static void beep(Handler h) {
        try {
            ToneGenerator tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 80);
            tg.startTone(ToneGenerator.TONE_PROP_BEEP2, 400);
            h.postDelayed(tg::release, 600);
        } catch (RuntimeException e) {
            Log.w(TAG, "beep", e);
        }
    }

    // 무음 모드에서는 시스템이 알림 진동을 끄므로 알람 용도로 한 번 진동한다(주머니 속 폰으로도 알 수 있게)
    private static void vibrate(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        Vibrator v = Build.VERSION.SDK_INT >= 31
            ? ctx.getSystemService(VibratorManager.class).getDefaultVibrator()
            : ctx.getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        VibrationEffect effect = VibrationEffect.createWaveform(PATTERN, -1);
        if (Build.VERSION.SDK_INT >= 33) v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
        else v.vibrate(effect, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
    }
}
