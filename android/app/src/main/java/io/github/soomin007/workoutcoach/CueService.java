package io.github.soomin007.workoutcoach;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * 휴식 끝 소리를 내는 몇 초 동안만 도는 포그라운드 서비스 (AlertSound). 화면이 꺼진 동안에도 오디오 포커스를 얻어 음악을 줄이려고 둔다.
 * 안드로이드 15 부터 화면에 없고 포그라운드 서비스도 없는 앱의 포커스 요청은 거절된다(2026-11-24 사용자 폰 로그).
 * 포그라운드 알림은 이미 떠 있는 알림(운동 중 알림이나 시험 알림)을 같은 번호로 다시 써서 새 알림이 생기지 않고,
 * 소리가 끝나면 알림을 남긴 채(DETACH) 서비스만 멈춘다.
 */
public class CueService extends Service {
    static final String EXTRA_ID = "notice_id";
    static final String EXTRA_SECS = "test_secs";
    private static final String TAG = "WorkoutNotice";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int id = intent == null ? WorkoutNotice.NOTICE_ID : intent.getIntExtra(EXTRA_ID, WorkoutNotice.NOTICE_ID);
        int secs = intent == null ? 0 : intent.getIntExtra(EXTRA_SECS, 0);
        Notification n = id == WorkoutNotice.NOTICE_ID ? WorkoutNotice.current(this) : WorkoutNotice.testNotice(this, secs);
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(id, n);
        } catch (RuntimeException e) {
            // 포그라운드로 서지 못했다. 포커스 없이라도 소리를 내고 멈춘다
            Log.w(TAG, "cue service foreground failed", e);
            AlertSound.play(this, () -> stopSelf(startId));
            return START_NOT_STICKY;
        }
        AlertSound.play(this, () -> {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_DETACH);
            else stopForeground(false);
            stopSelf(startId);
        });
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
