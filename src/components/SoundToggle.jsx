import { setSoundEnabled, useSoundEnabled } from "../soundPreference";

export default function SoundToggle() {
  const enabled = useSoundEnabled();
  return (
    <button
      type="button"
      className="sound-toggle"
      aria-pressed={enabled}
      aria-label={enabled ? "Turn video sound off" : "Turn video sound on (plays when you hover a video)"}
      onClick={() => setSoundEnabled(!enabled)}
    >
      {enabled ? "Sound off" : "Sound on"}
    </button>
  );
}
