package io.github.soomin007.workoutcoach;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 운동 중 알림 (docs/NATIVE_APP.md, docs/research/notification_controls.md).
 * 잠금 화면의 알림에서 남은 휴식을 보고 '세트 완료'로 다음 세트를 기록한다.
 *
 * 웹 코드(app/js/core/notice.js)가 남은 세트 순서, 세트마다의 휴식, 문구를 계획(plan)으로 넘기면
 * 여기서는 계산하지 않고 그 목록을 한 칸씩 넘긴다. 폰이 잠긴 동안 웹뷰는 자바스크립트를 처리하지 않으므로(known-issues 50)
 * 버튼과 알람은 이 클래스가 앱 화면 없이 처리하고, 누른 기록을 기록장(events)에 적어 둔다.
 * 앱이 다시 열리면 웹 코드가 그 기록을 세트 완료 전이에 누른 시각 그대로 넣고, 넣은 번호(ack)까지 지우라고 알린다.
 * 남은 시간은 알림의 크로노미터를 시스템이 그리므로 앱이 매초 알림을 고치지 않는다.
 */
final class WorkoutNotice {
    static final String TAG = "WorkoutNotice";
    // 휴식 끝 알림(7001), 시험 알림(7002), 측정 스크립트의 시험 알림(7100 부터)과 겹치지 않는 번호
    static final int NOTICE_ID = 7010;
    static final int TEST_ID = 7002;
    // 중요도 높음(화면 위에 뜸), 잠금 화면 공개, 채널 자체의 소리와 진동은 없음. 휴식이 끝날 때와 버티기 단계가 바뀔 때의
    // 소리와 진동은 앱이 직접 낸다(AlertSound, 이어폰으로 나가는 안내음). 삼성 무음 모드는 알림 채널의 소리를 알람 용도여도 막았다(11/23 실측).
    // 채널 설정은 처음 만들 때 정해져 바꿀 수 없으므로 새 id 를 쓰고 예전 채널은 지운다(known-issues 47, 58).
    static final String CHANNEL = "workout";
    static final String[] LEGACY_CHANNELS = { "rest-end", "rest-alarm" };
    static final String ACTION_PRESS = "workoutcoach.notice.PRESS";
    static final String ACTION_ALARM = "workoutcoach.notice.ALARM";
    static final String ACTION_TEST = "workoutcoach.notice.TEST";
    static final String EXTRA_TOKEN = "token";
    static final String EXTRA_ID = "id";
    static final String EXTRA_SECS = "secs";
    // 크로노미터의 카운트다운은 남은 시간을 내림해 보인다(59.9초가 0:59). 앱 화면은 올림(1:00)이라 알림이 1초 앞서 보였다(11/23 세션 메모).
    // 기준 시각을 0.999초 늦춰 올림과 같은 숫자를 보이게 한다. 알람 시각은 그대로라 0:00 이 되는 때와 소리가 같다(known-issues 57).
    static final long CEIL_MS = 999;
    private static final String PREFS = "workout_notice";
    // 플러그인 호출(백그라운드 스레드)과 리시버(메인 스레드)가 같은 기록장을 고치므로 읽고 쓰는 동안 잠근다
    private static final Object LOCK = new Object();

    private WorkoutNotice() {}

    /** 저장소에 두는 상태. 앱 프로세스가 죽었다 버튼으로 다시 떠도 이어 가도록 매번 읽고 쓴다. */
    static final class State {
        JSONObject plan; // 웹 코드가 넘긴 계획. null 이면 진행 중인 세션이 없다
        int cursor; // plan.steps 에서 다음 단계의 위치
        long restStart; // 0 이면 휴식이 없다
        int restSecs;
        JSONArray events = new JSONArray(); // 웹 코드가 아직 지우지 않은 버튼 기록
        long seq; // 마지막으로 매긴 기록 번호. 세션이 바뀌어도 줄지 않는다
        JSONObject hold; // 버티기 진행 { uid, i, phase, phaseStart, one | left | right } 또는 null
        long alerted; // 진동과 소리를 낸 휴식 끝 시각. 같은 휴식에 두 번 울리지 않게 한다

        JSONObject step() {
            JSONArray steps = plan == null ? null : plan.optJSONArray("steps");
            return steps == null ? null : steps.optJSONObject(cursor);
        }

        String sid() {
            return plan == null ? "" : plan.optString("sid");
        }

        long restEnd() {
            return restStart + restSecs * 1000L;
        }

        // 알림 버튼이 가리키는 단계. 버튼을 두 번 누르거나 지난 알림의 버튼이 늦게 와도 한 번만 처리한다.
        String token() {
            return sid() + ":" + cursor + ":" + (hold == null ? -1 : hold.optInt("phase"));
        }

        JSONObject phase() {
            JSONObject s = step();
            JSONArray phases = s == null || hold == null ? null : s.optJSONArray("phases");
            return phases == null ? null : phases.optJSONObject(hold.optInt("phase"));
        }

        long phaseEnd() {
            JSONObject ph = phase();
            return ph == null ? 0 : hold.optLong("phaseStart") + ph.optInt("secs") * 1000L;
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject obj(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    static State load(Context ctx) {
        SharedPreferences p = prefs(ctx);
        State st = new State();
        st.plan = obj(p.getString("plan", null));
        st.cursor = p.getInt("cursor", 0);
        st.restStart = p.getLong("restStart", 0);
        st.restSecs = p.getInt("restSecs", 0);
        st.seq = p.getLong("seq", 0);
        st.hold = obj(p.getString("hold", null));
        st.alerted = p.getLong("alerted", 0);
        try {
            st.events = new JSONArray(p.getString("events", "[]"));
        } catch (JSONException e) {
            st.events = new JSONArray();
        }
        return st;
    }

    // 버튼 기록이 사라지지 않게 commit 으로 바로 쓴다 (리시버가 끝나면 프로세스가 곧 멈출 수 있다)
    static void save(Context ctx, State st) {
        prefs(ctx)
            .edit()
            .putString("plan", st.plan == null ? null : st.plan.toString())
            .putInt("cursor", st.cursor)
            .putLong("restStart", st.restStart)
            .putInt("restSecs", st.restSecs)
            .putLong("seq", st.seq)
            .putString("hold", st.hold == null ? null : st.hold.toString())
            .putLong("alerted", st.alerted)
            .putString("events", st.events.toString())
            .commit();
    }

    private static boolean same(JSONObject a, JSONObject b) {
        return a != null && b != null && a.optString("uid").equals(b.optString("uid")) && a.optInt("i", -1) == b.optInt("i", -2);
    }

    /**
     * 웹 코드가 계획을 넘긴다(렌더마다, 바뀐 때만). plan 이 null 이면 세션이 끝났으므로 알림과 기록장을 비운다.
     * 반환: 웹 코드가 아직 적용하지 않은 기록 수.
     */
    static int sync(Context ctx, JSONObject plan) {
        State st;
        synchronized (LOCK) {
            st = load(ctx);
            if (plan == null) {
                st.plan = null;
                st.cursor = 0;
                st.restStart = 0;
                st.hold = null;
                st.events = new JSONArray();
            } else {
                String sid = plan.optString("sid");
                long ack = plan.optLong("ack");
                // 이미 적용한 기록과 다른 세션의 기록은 지운다
                JSONArray keep = new JSONArray();
                for (int k = 0; k < st.events.length(); k++) {
                    JSONObject ev = st.events.optJSONObject(k);
                    if (ev != null && sid.equals(ev.optString("sid")) && ev.optLong("seq") > ack) keep.put(ev);
                }
                st.events = keep;
                st.plan = plan;
                st.cursor = 0;
                JSONObject rest = plan.optJSONObject("rest");
                st.restStart = rest == null ? 0 : rest.optLong("startedAt");
                st.restSecs = rest == null ? 0 : rest.optInt("seconds");
                // 웹 코드가 계획을 만든 뒤에 누른 기록은 새 계획 위에서 다시 넘긴다. 웹 코드가 적용하면 다음 계획에 반영된다.
                for (int k = 0; k < keep.length(); k++) {
                    JSONObject ev = keep.optJSONObject(k);
                    JSONObject step = st.step();
                    if (!same(step, ev)) break;
                    st.cursor++;
                    st.restStart = ev.optLong("at");
                    st.restSecs = step.optInt("rest");
                }
                // 진행 중인 버티기는 그 세트가 여전히 다음 단계일 때만 이어 간다
                if (st.hold != null && !same(st.step(), st.hold)) st.hold = null;
            }
            save(ctx, st);
            // 그리기와 알람도 잠근 채로 한다. 버튼과 동기화가 겹쳐도 나중에 저장한 상태가 마지막으로 그려진다.
            render(ctx, st, false);
            schedule(ctx, st);
        }
        return st.events.length();
    }

    static JSONArray pending(Context ctx) {
        synchronized (LOCK) {
            return load(ctx).events;
        }
    }

    // 알림 버튼. token 이 지금 단계와 다르면(두 번 누름, 지난 알림) 아무것도 하지 않는다.
    static void press(Context ctx, String token) {
        State st;
        boolean recorded = false;
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            st = load(ctx);
            JSONObject step = st.step();
            if (step == null || token == null || !token.equals(st.token())) {
                Log.i(TAG, "press ignored token=" + token + " now=" + st.token());
                return;
            }
            String kind = step.optString("kind");
            if ("set".equals(kind)) {
                record(st, step, now, null);
                recorded = true;
            } else if ("hold".equals(kind)) {
                if (st.hold == null) {
                    // 버티기 시작: 준비 단계부터. 휴식은 여기서 끝난다
                    try {
                        st.hold = new JSONObject().put("uid", step.optString("uid")).put("i", step.optInt("i")).put("phase", 0).put("phaseStart", now);
                    } catch (JSONException e) {
                        return;
                    }
                } else recorded = advanceHold(st, now, true);
            } else return;
            save(ctx, st);
            render(ctx, st, false);
            schedule(ctx, st);
        }
        Log.i(TAG, "press token=" + token + " recorded=" + recorded + " cursor=" + st.cursor);
        if (recorded) WorkoutNoticePlugin.onRecorded();
    }

    // 예약한 시각이 됐다: 휴식 끝이면 알리고, 버티기면 다음 단계로 넘긴다.
    // 반환: 소리와 진동을 낼 때인지. 리시버가 AlertSound 로 낸다(알림 채널은 조용하다).
    static boolean alarm(Context ctx) {
        State st;
        boolean alert = false;
        boolean recorded = false;
        long now = System.currentTimeMillis();
        long due;
        synchronized (LOCK) {
            st = load(ctx);
            if (st.plan == null) return false;
            due = st.hold != null ? st.phaseEnd() : st.restEnd(); // 늦은 시간은 단계가 넘어가기 전의 예정 시각으로 잰다
            if (st.hold != null) {
                long end = st.phaseEnd();
                if (end > 0 && now >= end - 500) {
                    recorded = advanceHold(st, end, false);
                    alert = true;
                }
            } else if (st.restStart > 0) {
                long end = st.restEnd();
                if (now >= end - 1000 && st.alerted != end) {
                    st.alerted = end;
                    alert = true;
                }
            }
            save(ctx, st);
            render(ctx, st, alert);
            schedule(ctx, st);
        }
        Log.i(TAG, "alarm alert=" + alert + " recorded=" + recorded + " late=" + (now - due) + "ms");
        if (recorded) WorkoutNoticePlugin.onRecorded();
        return alert;
    }

    // 세트 하나를 끝냈다: 기록장에 적고 다음 단계와 그 뒤 휴식으로 넘긴다
    private static void record(State st, JSONObject step, long at, JSONObject hold) {
        try {
            JSONObject ev = new JSONObject()
                .put("seq", ++st.seq)
                .put("sid", st.sid())
                .put("uid", step.optString("uid"))
                .put("i", step.optInt("i"))
                .put("at", at)
                .put("kind", step.optString("kind"));
            if (hold != null) {
                if (hold.has("left") || hold.has("right")) {
                    if (hold.has("left")) ev.put("left", hold.optInt("left"));
                    if (hold.has("right")) ev.put("right", hold.optInt("right"));
                } else ev.put("secs", hold.optInt("one", step.optInt("secs")));
            }
            st.events.put(ev);
        } catch (JSONException e) {
            Log.w(TAG, "record", e);
            return;
        }
        st.cursor++;
        st.restStart = at;
        st.restSecs = step.optInt("rest");
        st.hold = null;
    }

    // 버티기 다음 단계로. early 면 사용자가 버튼으로 넘긴 것(버티던 쪽은 그때까지 버틴 초로 적는다).
    // 마지막 단계가 끝나면 세트를 기록하고 true 를 돌려준다.
    private static boolean advanceHold(State st, long at, boolean early) {
        JSONObject step = st.step();
        JSONObject ph = st.phase();
        if (step == null || ph == null) {
            st.hold = null;
            return false;
        }
        try {
            if ("hold".equals(ph.optString("kind"))) {
                int secs = early ? (int) Math.max(0, (at - st.hold.optLong("phaseStart")) / 1000) : ph.optInt("secs");
                String side = ph.isNull("side") ? "one" : ph.optString("side", "one");
                st.hold.put(side, secs);
            }
            int next = st.hold.optInt("phase") + 1;
            JSONArray phases = step.optJSONArray("phases");
            if (phases == null || next >= phases.length()) {
                record(st, step, at, st.hold);
                return true;
            }
            st.hold.put("phase", next).put("phaseStart", at);
        } catch (JSONException e) {
            Log.w(TAG, "advanceHold", e);
            st.hold = null;
        }
        return false;
    }

    // 휴식 끝이나 버티기 단계 끝에 알람 하나를 건다. 화면이 꺼진 동안에도 울리게 기기를 깨우는 정확한 알람을 쓴다(known-issues 47).
    static void schedule(Context ctx, State st) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx,
            2,
            new Intent(ctx, WorkoutNoticeReceiver.class).setAction(ACTION_ALARM),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        long at = 0;
        if (st.plan != null) {
            if (st.hold != null) at = st.phaseEnd();
            else if (st.restStart > 0 && st.restEnd() > System.currentTimeMillis() && st.alerted != st.restEnd()) at = st.restEnd();
        }
        if (am == null) return;
        if (at <= 0) {
            am.cancel(pi);
            return;
        }
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    static boolean canPost(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    // 알림 채널을 만든다(플러그인을 불러올 때와 알림을 올릴 때). 예전 채널은 이 APK 에서 쓰지 않으므로 지운다.
    // 웹 코드도 이 APK 에서는 예전 채널을 다시 만들지 않는다(ui/native.js 의 notice.alarm). 다만 APK 를 새로 깐 첫 실행에서는
    // 서비스 워커가 옛 웹 코드를 먼저 띄워 'rest-end' 를 다시 만들 수 있어, 다음 실행의 이 함수가 한 번 더 지운다.
    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;
        for (String id : LEGACY_CHANNELS) if (nm.getNotificationChannel(id) != null) nm.deleteNotificationChannel(id);
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "운동 중 알림", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("남은 휴식과 다음 세트를 보이고, 휴식이 끝나면 화면 위에 띄웁니다. 소리는 앱이 미디어 볼륨으로 내서 무음 모드에서도 이어폰으로 들립니다.");
        ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.enableLights(false);
        nm.createNotificationChannel(ch);
    }

    /** 설정 탭의 시험 알림. 운동 중 알림과 같은 채널로 seconds 초 뒤에 울린다. 예약한 시각(ms)을 돌려준다. */
    static long scheduleTest(Context ctx, int seconds, int id) {
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return 0;
        long at = System.currentTimeMillis() + seconds * 1000L;
        // 번호마다 주소(data)가 달라 측정 스크립트가 연달아 예약해도 앞 예약을 덮지 않는다
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx,
            4,
            new Intent(ctx, WorkoutNoticeReceiver.class)
                .setAction(ACTION_TEST)
                .setData(Uri.parse("wcnotice://test/" + id))
                .putExtra(EXTRA_ID, id)
                .putExtra(EXTRA_SECS, seconds),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        return at;
    }

    static void postTest(Context ctx, int id, int seconds) {
        if (!canPost(ctx)) return;
        try {
            NotificationManagerCompat.from(ctx).notify(id, testNotice(ctx, seconds));
        } catch (SecurityException e) {
            Log.w(TAG, "postTest", e);
        }
    }

    /** 시험 알림. 소리 서비스(CueService)도 같은 번호로 잠깐 포그라운드 알림으로 쓴다. */
    static Notification testNotice(Context ctx, int seconds) {
        ensureChannel(ctx);
        return new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setColor(0xFF3449D6)
            .setContentTitle("시험 알림")
            .setContentText(seconds + "초 뒤에 울리도록 예약한 알림입니다. 소리는 무음 모드에서도 이어폰으로 납니다.")
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openApp(ctx))
            .setAutoCancel(true)
            .build();
    }

    /** 소리 서비스용: 저장된 상태로 지금의 운동 중 알림을 만든다. 세션이 없으면 시험 알림 모양으로 대신한다. */
    static Notification current(Context ctx) {
        synchronized (LOCK) {
            Notification n = build(ctx, load(ctx), false);
            return n != null ? n : testNotice(ctx, 0);
        }
    }

    private static String text(JSONObject t, String key) {
        return t == null ? "" : t.optString(key);
    }

    /** 지금 상태로 알림을 그린다. alert 가 아니면 조용히 바꾼다(화면 위 팝업 없음). */
    static void render(Context ctx, State st, boolean alert) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (st.plan == null) {
            nm.cancel(NOTICE_ID);
            return;
        }
        if (!canPost(ctx)) return;
        try {
            nm.notify(NOTICE_ID, build(ctx, st, alert));
        } catch (SecurityException e) {
            Log.w(TAG, "notify", e);
        }
    }

    /** 지금 상태의 운동 중 알림. plan 이 없으면 null. 소리 서비스도 같은 알림을 쓴다(current). */
    static Notification build(Context ctx, State st, boolean alert) {
        if (st.plan == null) return null;
        ensureChannel(ctx);
        JSONObject t = st.plan.optJSONObject("texts");
        JSONObject step = st.step();
        long now = System.currentTimeMillis();
        String title;
        String body;
        String button = null;
        long when = 0;
        boolean countDown = false;
        JSONObject ph = st.phase();
        if (step != null && ph != null) {
            // 버티기 중: 단계 이름과 그 단계의 남은 시간. 버튼은 준비와 자세 바꾸기에서 '바로 시작', 버티는 동안 '여기까지'
            title = ph.optString("label");
            body = step.optString("text");
            when = st.phaseEnd();
            countDown = true;
            button = text(t, "hold".equals(ph.optString("kind")) ? "stop" : "skip");
        } else {
            boolean resting = st.restStart > 0;
            boolean over = resting && now >= st.restEnd();
            if (resting) {
                when = st.restEnd();
                countDown = !over; // 끝난 뒤에는 끝난 시각부터 지난 시간을 센다 (앱 화면의 +0:12 와 같다)
            }
            String restTitle = over ? text(t, "over") : text(t, "resting");
            if (step == null) {
                title = resting ? restTitle : text(t, "end");
                body = resting ? text(t, "endRest") : text(t, "endBody");
            } else if ("ask".equals(step.optString("kind"))) {
                title = text(t, "ask");
                body = step.optString("text");
            } else {
                title = resting ? restTitle : text(t, "idle");
                body = resting ? text(t, "prefix") + step.optString("text") : step.optString("text");
                button = text(t, "hold".equals(step.optString("kind")) ? "hold" : "done");
            }
        }
        boolean hasButton = button != null && !button.isEmpty();
        PendingIntent press = hasButton ? pressIntent(ctx, st.token()) : null;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_workout)
            .setColor(0xFF3449D6)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openApp(ctx))
            // 안드로이드 16 라이브 업데이트: 상태 바 칩과 잠금 화면 맨 위에 펼친 카드로 올려 달라고 청한다. 제조사가 받지 않아도 보통 알림으로 동작한다.
            .setRequestPromotedOngoing(true)
            .setSilent(!alert)
            .setOnlyAlertOnce(!alert);
        if (when > 0) b.setWhen(when + (countDown ? CEIL_MS : 0)).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(countDown);
        else b.setShowWhen(false);
        if (promotable(ctx)) {
            // 라이브 업데이트로 올라가면 늘 펼친 카드로 보이므로 기본 모양(본문 여러 줄, 아래 버튼)을 쓴다. 사용자 정의 화면은 승격 조건에 어긋난다.
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            if (hasButton) b.addAction(new NotificationCompat.Action.Builder(R.drawable.ic_stat_rest, button, press).build());
        } else {
            // 승격이 안 되는 폰(One UI 8.0 등)은 잠금 화면에서 알림이 접힌 채로 보여 버튼을 누르려면 먼저 펼쳐야 한다.
            // 접힌 줄에 남은 시간과 버튼을 함께 두어 펼치지 않고 바로 누르게 한다 (2026-11-21 갤럭시 S22+ 실측).
            // 남은 시간은 첫 줄의 큰 시계 하나로 보인다(상태 말은 그 옆에 옅게). 펼치면 위쪽 머리글에도 시각이 겹쳐 보이므로 머리글 시각은 끈다.
            b.setStyle(new NotificationCompat.DecoratedCustomViewStyle())
                .setShowWhen(false)
                .setUsesChronometer(false)
                .setCustomContentView(views(ctx, R.layout.notice_collapsed, title, body, button, press, when, countDown, now))
                .setCustomBigContentView(views(ctx, R.layout.notice_expanded, title, body, button, press, when, countDown, now));
        }
        return b.build();
    }

    // 이 폰에서 라이브 업데이트(승격)를 쓸 수 있는지. 안드로이드 16 이상이고 제조사와 사용자가 막지 않았을 때만 참이다.
    static boolean promotable(Context ctx) {
        if (Build.VERSION.SDK_INT < 36) return false;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        return nm != null && nm.canPostPromotedNotifications();
    }

    // 사용자 정의 알림 화면(접힌 모양, 펼친 모양)에 글, 남은 시간, 버튼을 채운다
    private static RemoteViews views(Context ctx, int layout, String title, String body, String button, PendingIntent press, long when, boolean countDown, long now) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        v.setTextViewText(R.id.notice_title, title);
        v.setTextViewText(R.id.notice_label, title);
        v.setTextViewText(R.id.notice_text, body);
        if (when > 0) {
            // 크로노미터는 부팅 뒤 경과 시각(elapsedRealtime)을 기준으로 센다. 휴식이 끝난 뒤에는 앱 화면처럼 +0:12 로 지난 시간을 보인다.
            // 시간이 있으면 시간을 크게 두고 상태 말(휴식 중)은 옆의 옅은 글(notice_label)로 보인다(2026-11-22).
            v.setChronometer(R.id.notice_clock, SystemClock.elapsedRealtime() + (when - now) + (countDown ? CEIL_MS : 0), countDown ? null : "+%s", true);
            v.setChronometerCountDown(R.id.notice_clock, countDown);
            v.setViewVisibility(R.id.notice_clock, View.VISIBLE);
            v.setViewVisibility(R.id.notice_label, View.VISIBLE);
            v.setViewVisibility(R.id.notice_title, View.GONE);
        } else {
            v.setViewVisibility(R.id.notice_clock, View.GONE);
            v.setViewVisibility(R.id.notice_label, View.GONE);
            v.setViewVisibility(R.id.notice_title, View.VISIBLE);
        }
        if (press != null) {
            v.setTextViewText(R.id.notice_button, button);
            v.setOnClickPendingIntent(R.id.notice_button, press);
            v.setViewVisibility(R.id.notice_button, View.VISIBLE);
        } else v.setViewVisibility(R.id.notice_button, View.GONE);
        return v;
    }

    private static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return PendingIntent.getActivity(ctx, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // 버튼은 앱 화면을 열지 않는 브로드캐스트라 잠금을 풀지 않고 동작한다. 단계마다 주소(data)가 달라 PendingIntent 가 따로 생긴다.
    private static PendingIntent pressIntent(Context ctx, String token) {
        Intent i = new Intent(ctx, WorkoutNoticeReceiver.class)
            .setAction(ACTION_PRESS)
            .setData(Uri.parse("wcnotice://press/" + Uri.encode(token)))
            .putExtra(EXTRA_TOKEN, token);
        return PendingIntent.getBroadcast(ctx, 3, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** 설정 탭 표시용: 알림 허용, 라이브 업데이트(승격) 허용, 정확한 알람 허용. */
    static JSONObject status(Context ctx) {
        JSONObject r = new JSONObject();
        try {
            r.put("enabled", canPost(ctx));
            r.put("promoted", promotable(ctx));
            AlarmManager am = ctx.getSystemService(AlarmManager.class);
            r.put("exact", Build.VERSION.SDK_INT < 31 || (am != null && am.canScheduleExactAlarms()));
        } catch (JSONException e) {
            Log.w(TAG, "status", e);
        }
        return r;
    }
}
