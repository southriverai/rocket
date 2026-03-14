import { useEffect } from 'react';
import { useStore } from '../../state/store';

export function AchievementToasts() {
  const { achievementNotifications, removeAchievementNotification } = useStore();

  if (achievementNotifications.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 1000,
      }}
    >
      {achievementNotifications.map((n) => (
        <AchievementToast
          key={n.id}
          id={n.id}
          title={n.title}
          message={n.message}
          onClose={() => removeAchievementNotification(n.id)}
        />
      ))}
    </div>
  );
}

interface AchievementToastProps {
  id: string;
  title: string;
  message: string;
  onClose: () => void;
}

function AchievementToast({ title, message, onClose }: AchievementToastProps) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 4000);
    return () => clearTimeout(timeout);
  }, [onClose]);

  return (
    <div
      style={{
        minWidth: '220px',
        maxWidth: '320px',
        padding: '0.75rem 1rem',
        borderRadius: '6px',
        backgroundColor: '#1b5e20',
        color: '#e8f5e9',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
        fontSize: '0.9rem',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Achievement unlocked</div>
      <div style={{ fontWeight: 500 }}>{title}</div>
      <div style={{ marginTop: '0.25rem', opacity: 0.9 }}>{message}</div>
    </div>
  );
}

