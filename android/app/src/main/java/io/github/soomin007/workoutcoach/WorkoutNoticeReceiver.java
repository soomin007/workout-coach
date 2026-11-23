package io.github.soomin007.workoutcoach;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 운동 중 알림의 버튼과 알람을 받는다 (WorkoutNotice). 앱 화면을 열지 않으므로 잠금 화면에서도 잠금을 풀지 않고 동작하고,
 * 앱 프로세스가 없으면 시스템이 이 리시버를 위해 잠깐 띄운다. 다른 앱이 보낼 수 없게 exported=false 로 둔다.
 */
public class WorkoutNoticeReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (WorkoutNotice.ACTION_PRESS.equals(action)) WorkoutNotice.press(ctx, intent.getStringExtra(WorkoutNotice.EXTRA_TOKEN));
        else if (WorkoutNotice.ACTION_ALARM.equals(action)) WorkoutNotice.alarm(ctx);
        else if (WorkoutNotice.ACTION_TEST.equals(action)) {
            WorkoutNotice.postTest(ctx, intent.getIntExtra(WorkoutNotice.EXTRA_ID, WorkoutNotice.TEST_ID), intent.getIntExtra(WorkoutNotice.EXTRA_SECS, 10));
        }
    }
}
