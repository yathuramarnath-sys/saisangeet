package in.dinexpos.captain;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.LinkAddress;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.util.List;

/**
 * DeviceInfoPlugin — reads this device's own LAN IP (WiFi or Ethernet).
 *
 * Browsers can't read a device's local network address, so the drawer's
 * "Device IP" footer (used by managers/support to find this tablet on the
 * network) needs a small native bridge instead.
 *
 * JS usage:
 *   import { getDeviceLocalIp } from './lib/deviceIp';
 *   const ip = await getDeviceLocalIp(); // "192.168.29.137" | null
 */
@CapacitorPlugin(name = "DeviceInfo")
public class DeviceInfoPlugin extends Plugin {

    @PluginMethod
    public void getLocalIp(final PluginCall call) {
        JSObject result = new JSObject();
        result.put("ip", findLocalIpv4());
        call.resolve(result);
    }

    private String findLocalIpv4() {
        try {
            ConnectivityManager cm =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;

            Network network = cm.getActiveNetwork();
            if (network == null) return null;

            LinkProperties props = cm.getLinkProperties(network);
            if (props == null) return null;

            List<LinkAddress> addresses = props.getLinkAddresses();
            for (LinkAddress addr : addresses) {
                if (addr.getAddress() instanceof Inet4Address) {
                    String ip = addr.getAddress().getHostAddress();
                    if (ip != null && !ip.startsWith("127.")) return ip;
                }
            }
        } catch (Exception ignored) {}
        return null;
    }
}
