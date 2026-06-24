/**
 * deviceIp.js — this device's own LAN IP (e.g. "192.168.29.137"), shown in
 * the drawer's "Device IP" footer so support/managers can find this tablet
 * on the network.
 *
 * On Android (native): calls DeviceInfoPlugin.java, which reads the active
 * network's link address via ConnectivityManager — works for WiFi/Ethernet.
 *
 * On web (fallback): there's no browser API for "what's my LAN IP". We try
 * the WebRTC host-candidate trick, but modern Chromium hides the real
 * address behind an mDNS hostname by default, so this will usually resolve
 * to null in a plain browser tab — only the native path is reliable.
 */
import { registerPlugin } from "@capacitor/core";

const DeviceInfo = registerPlugin("DeviceInfo", {
  web: () => ({
    getLocalIp: () => webRtcLocalIp().then((ip) => ({ ip })),
  }),
});

function webRtcLocalIp(timeoutMs = 1500) {
  return new Promise((resolve) => {
    if (typeof RTCPeerConnection === "undefined") {
      resolve(null);
      return;
    }

    const pc = new RTCPeerConnection({ iceServers: [] });
    let resolved = false;

    function finish(ip) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      pc.onicecandidate = null;
      pc.close();
      resolve(ip);
    }

    const timer = setTimeout(() => finish(null), timeoutMs);

    pc.onicecandidate = (e) => {
      if (!e.candidate) { finish(null); return; }
      const match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(e.candidate.candidate);
      if (match && match[1] !== "0.0.0.0") finish(match[1]);
    };

    pc.createDataChannel("ip-probe");
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(null));
  });
}

export async function getDeviceLocalIp() {
  try {
    const { ip } = await DeviceInfo.getLocalIp();
    return ip || null;
  } catch {
    return null;
  }
}
