import { useEffect, useState } from "react";

// navigator.onLine plus reacting to online/offline events, per SPEC02 §6.4.
// A failed NVD fetch can also flip this via the returned setter.
export function useOnlineStatus(): [boolean, (online: boolean) => void] {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return [isOnline, setIsOnline];
}
