// Shared localStorage key — POS / Captain / KDS read station→printer routing from here
// The POS terminal writes to this key after printer config is saved in Settings → Printers.
// Owner-web reads from this key to show the status board.
export const DEVICES_SHARED_KEY = "pos_devices_assignments";
