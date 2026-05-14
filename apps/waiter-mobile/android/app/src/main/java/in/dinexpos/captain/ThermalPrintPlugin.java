package in.dinexpos.captain;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * ThermalPrintPlugin — direct TCP printing from Android to ESC/POS thermal printer.
 *
 * Sends raw ESC/POS bytes directly to the printer on port 9100.
 * No proxy, no POS machine dependency — same as Square's approach.
 *
 * JS usage:
 *   import { ThermalPrint } from './lib/thermalPrint';
 *   await ThermalPrint.send({ ip: "192.168.1.200", data: escPosString });
 */
@CapacitorPlugin(name = "ThermalPrint")
public class ThermalPrintPlugin extends Plugin {

    private static final int DEFAULT_PORT    = 9100;
    private static final int CONNECT_TIMEOUT = 5000;  // 5s connect
    private static final int WRITE_TIMEOUT   = 10000; // 10s write

    @PluginMethod
    public void send(final PluginCall call) {
        final String ip          = call.getString("ip", "").trim();
        final int    port        = call.getInt("port", DEFAULT_PORT);
        final String escPosData  = call.getString("data", "");

        if (ip.isEmpty()) {
            call.reject("NO_IP", "No printer IP configured. Set printer IP in Settings.");
            return;
        }
        if (escPosData.isEmpty()) {
            call.reject("NO_DATA", "Nothing to print.");
            return;
        }

        // Run TCP on a background thread — never block the UI thread
        new Thread(() -> {
            Socket socket = null;
            try {
                // latin1 (ISO-8859-1) = 1:1 byte mapping, correct for ESC/POS
                final byte[] bytes = escPosData.getBytes("ISO-8859-1");

                socket = new Socket();
                socket.setSoTimeout(WRITE_TIMEOUT);
                socket.connect(new InetSocketAddress(ip, port), CONNECT_TIMEOUT);

                final OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();

                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);

            } catch (java.net.ConnectException e) {
                call.reject("CONNECT_FAILED",
                    "Cannot reach printer at " + ip + ":" + port +
                    ". Check printer is on and connected to WiFi.");
            } catch (java.net.SocketTimeoutException e) {
                call.reject("TIMEOUT",
                    "Printer at " + ip + " did not respond in time. Check network.");
            } catch (Exception e) {
                call.reject("PRINT_ERROR", "Print failed: " + e.getMessage());
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }).start();
    }

    /**
     * Quick connectivity check — tries to open a TCP connection without sending data.
     * Useful for "Test connection" button in Settings.
     */
    @PluginMethod
    public void ping(final PluginCall call) {
        final String ip   = call.getString("ip", "").trim();
        final int    port = call.getInt("port", DEFAULT_PORT);

        if (ip.isEmpty()) {
            call.reject("NO_IP", "No printer IP provided.");
            return;
        }

        new Thread(() -> {
            Socket socket = null;
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(ip, port), CONNECT_TIMEOUT);
                JSObject result = new JSObject();
                result.put("ok", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("UNREACHABLE", "Printer not reachable: " + e.getMessage());
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        }).start();
    }
}
