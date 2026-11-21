"""JSON-only beat analysis using the kinetic-type-music-video HPSS method."""

import json
import sys


def measure(audio, start_bpm):
    import librosa
    import numpy as np

    y, sr = librosa.load(audio, sr=22050, mono=True)
    duration = len(y) / sr
    _, percussive = librosa.effects.hpss(y)
    tempo, beats = librosa.beat.beat_track(
        y=percussive, sr=sr, start_bpm=start_bpm, units="time"
    )

    def normalize(values):
        return (values - values.min()) / (values.max() - values.min() + 1e-9)

    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_t = librosa.times_like(rms, sr=sr, hop_length=hop)
    grid = np.arange(0, duration, 0.1)
    energy = normalize(np.interp(grid, rms_t, rms))
    low = librosa.feature.rms(y=librosa.effects.preemphasis(y, coef=-0.95), hop_length=hop)[0]
    beat_low = np.interp(beats, rms_t, normalize(low))
    phases = range(min(4, len(beats)))
    phase = max(phases, key=lambda offset: beat_low[offset::4].mean(), default=0)
    return {
        "status": "measured",
        "duration_s": round(duration, 3),
        "tempo_bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "downbeat_phase": phase,
        "beats": [
            {
                "t": round(float(t), 3),
                "index": i,
                "bar": (i - phase) // 4 + 1,
                "beat_in_bar": (i - phase) % 4 + 1,
                "energy": round(float(np.interp(t, grid, energy)), 3),
            }
            for i, t in enumerate(beats)
        ],
    }


if __name__ == "__main__":
    try:
        print(json.dumps(measure(sys.argv[1], float(sys.argv[2])), allow_nan=False))
    except ImportError as error:
        print(str(error), file=sys.stderr)
        sys.exit(78)
