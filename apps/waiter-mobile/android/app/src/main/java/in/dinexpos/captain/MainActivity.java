package in.dinexpos.captain;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Register custom native plugins before super.onCreate
        registerPlugin(ThermalPrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
