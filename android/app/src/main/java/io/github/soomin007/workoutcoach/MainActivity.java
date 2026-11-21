package io.github.soomin007.workoutcoach;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 이 APK 안에 든 플러그인은 브리지가 만들어지기 전에 등록해야 PluginHeaders 에 실린다
        registerPlugin(WorkoutNoticePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
