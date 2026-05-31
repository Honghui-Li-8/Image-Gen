import { useEffect, useState } from "react";

interface NotificationProps {
  message: string | null;
  durationMs?: number;
}

export const Notification = ({ message, durationMs = 5000 }: NotificationProps) => {
  const [visibleMessage, setVisibleMessage] = useState<string | null>(message);

  useEffect(() => {
    setVisibleMessage(message);
    if (!message) return;
    const timeout = window.setTimeout(() => setVisibleMessage(null), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, message]);

  if (!visibleMessage) return null;

  return (
    <div className="notification" role="status">
      {visibleMessage}
    </div>
  );
};
