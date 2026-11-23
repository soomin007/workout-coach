package io.github.soomin007.workoutcoach;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 운동 중 알림의 버튼과 알람을 받는다 (WorkoutNotice). 앱 화면을 열지 않으므로 잠금 화면에서도 잠금을 풀지 않고 동작하고,
 * 앱 프로세스가 없으면 시스템이 이 리시버를 위해 잠깐 띄운다. 다른 앱이 보낼 수 없게 exported=false 로 둔다.
 * 휴식 끝과 시험 알림의 소리는 짧은 포그라운드 서비스(CueService)가 낸다. 화면이 꺼져 있어도 음악을 줄이는 오디오 포커스를 얻기 위해서다.
 * 서비스를 띄우지 못하면 재생이 끝날 때까지 브로드캐스트를 붙잡아 두고(goAsync) 여기서 바로 낸다.
 */
public class WorkoutNoticeReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (WorkoutNotice.ACTION_PRESS.equals(action)) WorkoutNotice.press(ctx, intent.getStringExtra(WorkoutNotice.EXTRA_TOKEN));
        else if (WorkoutNotice.ACTION_ALARM.equals(action)) {
            if (WorkoutNotice.alarm(ctx)) cue(ctx, WorkoutNotice.NOTICE_ID, 0);
        } else if (WorkoutNotice.ACTION_TEST.equals(action)) {
            int id = intent.getIntExtra(WorkoutNotice.EXTRA_ID, WorkoutNotice.TEST_ID);
            int secs = intent.getIntExtra(WorkoutNotice.EXTRA_SECS, 10);
            WorkoutNotice.postTest(ctx, id, secs);
            cue(ctx, id, secs);
        }
    }

    private void cue(Context ctx, int noticeId, int secs) {
        if (AlertSound.startService(ctx, noticeId, secs)) return;
        PendingResult pr = goAsync();
        AlertSound.play(ctx, pr::finish);
    }
}
