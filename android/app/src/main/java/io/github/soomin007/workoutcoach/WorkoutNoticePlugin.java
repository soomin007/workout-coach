package io.github.soomin007.workoutcoach;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

/**
 * 운동 중 알림을 웹 코드(app/js/ui/native.js)와 잇는 플러그인. 이 APK 안에 들어 있어 npm 패키지가 없다.
 * 웹 코드는 부르기 전에 PluginHeaders 로 이 플러그인이 있는지 본다(known-issues 49).
 *
 * sync({ plan })    계획을 넘긴다. plan 이 null 이면 세션이 끝난 것이라 알림과 기록장을 비운다. 반환 { pending }
 * pending()         웹 코드가 아직 적용하지 않은 버튼 기록 { events }
 * status()          알림 허용, 라이브 업데이트 허용, 정확한 알람 허용
 * test({ seconds, id }) 설정 탭의 시험 알림을 운동 중 알림과 같은 채널(무음 모드에서도 알람 소리)로 예약한다. 반환 { at }
 * 'recorded' 이벤트  앱이 떠 있는 동안 버튼으로 세트가 기록되면 알린다. 웹 코드는 그때 pending 을 읽는다.
 * 웹 코드는 test 메서드가 있는지(PluginHeaders)로 알람 소리 채널이 든 APK(2026-11-23 이후)인지 가른다.
 */
@CapacitorPlugin(name = "WorkoutNotice")
public class WorkoutNoticePlugin extends Plugin {

    private static WeakReference<WorkoutNoticePlugin> current = new WeakReference<>(null);

    @Override
    public void load() {
        current = new WeakReference<>(this);
        // 운동을 시작하기 전에 채널을 맞춰 둔다. 휴대전화 설정의 앱 알림에 새 채널만 보인다.
        WorkoutNotice.ensureChannel(getContext());
    }

    @PluginMethod
    public void test(PluginCall call) {
        int seconds = call.getInt("seconds", 10);
        int id = call.getInt("id", WorkoutNotice.TEST_ID);
        JSObject r = new JSObject();
        r.put("at", WorkoutNotice.scheduleTest(getContext(), seconds, id));
        call.resolve(r);
    }

    // 앱이 떠 있으면 웹 코드에 알린다. 잠긴 동안에는 웹뷰가 받지 못하므로 웹 코드가 화면 복귀 때 기록장을 읽는다.
    static void onRecorded() {
        WorkoutNoticePlugin p = current.get();
        if (p != null) p.notifyListeners("recorded", new JSObject());
    }

    @PluginMethod
    public void sync(PluginCall call) {
        JSONObject plan = call.getObject("plan", null);
        try {
            JSObject r = new JSObject();
            r.put("pending", WorkoutNotice.sync(getContext(), plan));
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("events", WorkoutNotice.pending(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(WorkoutNotice.status(getContext())));
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
