import { useState, useEffect } from "react";
import { Trash2 } from "lucide-react";

export default function WorkoutLogger({
  workoutType,
  planId,
  recoveryScore,
  onSaved,
  suggestedExercises = [],
}) {
  const [exercises, setExercises] = useState(
    suggestedExercises.length > 0
      ? suggestedExercises.map((name) => ({
          name,
          sets: [{ reps: "", weight_kg: "" }],
        }))
      : [{ name: "", sets: [{ reps: "", weight_kg: "" }] }]
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [alreadyLogged, setAlreadyLogged] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch("/api/workout-logs/today", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setAlreadyLogged(true);
          if (data.exercises) setExercises(data.exercises);
          if (data.notes) setNotes(data.notes);
        }
      });
  }, []);

  const addExercise = () => {
    setExercises([
      ...exercises,
      { name: "", sets: [{ reps: "", weight_kg: "" }] },
    ]);
  };

  const removeExercise = (exIdx) => {
    setExercises(exercises.filter((_, i) => i !== exIdx));
  };

  const addSet = (exIdx) => {
    const updated = [...exercises];
    updated[exIdx].sets.push({ reps: "", weight_kg: "" });
    setExercises(updated);
  };

  const removeSet = (exIdx, setIdx) => {
    const updated = [...exercises];
    updated[exIdx].sets = updated[exIdx].sets.filter((_, i) => i !== setIdx);
    setExercises(updated);
  };

  const updateExercise = (exIdx, value) => {
    const updated = [...exercises];
    updated[exIdx].name = value;
    setExercises(updated);
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    if (value !== "" && Number(value) < 0) return;
    const updated = [...exercises];
    updated[exIdx].sets[setIdx][field] = value;
    setExercises(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/workout-logs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId ?? null,
        workout_type: workoutType,
        recovery_score: recoveryScore ?? null,
        exercises,
        notes,
      }),
    });
    setSaving(false);
    setSaved(true);
    if (onSaved) onSaved();
  };

  const handleUpdate = async () => {
    setSaving(true);
    await fetch("/api/workout-logs/today", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercises, notes }),
    });
    setSaving(false);
    setEditing(false);
  };

  if (alreadyLogged && !editing) {
    return (
      <div className="workout-logged-header">
        <div className="workout-logged-meta">
          <p className="workout-logged-success-text">
            ✓ Workout logged for today.
          </p>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
        {exercises.map((ex, i) => (
          <div key={i} className="workout-logged-exercise">
            <strong className="workout-logged-exercise-name">
              {ex.name}
            </strong>
            {ex.sets.map((set, j) => (
              <div key={j} className="workout-logged-set">
                Set {j + 1}: {set.reps} reps @ {set.weight_kg}kg
              </div>
            ))}
          </div>
        ))}

        {notes && (
          <p className="workout-logged-notes">Notes: {notes}</p>
        )}
      </div>
    );
  }

  if (saved) {
    return (
      <div className="workout-logged-header">
        <p className="workout-logged-success-text">✓ Workout logged!</p>
      </div>
    );
  }

  if (alreadyLogged && editing) {
    return (
      <div className="workout-logger">
        <h3 className="workout-logger-title">Edit Workout Log</h3>

        {exercises.map((ex, exIdx) => (
          <div key={exIdx} className="exercise-card">
            <div className="exercise-header">
              <input
                value={ex.name}
                onChange={(e) => updateExercise(exIdx, e.target.value)}
                placeholder="Exercise name"
                className="exercise-input"
              />
              <button
                onClick={() => removeExercise(exIdx)}
                className="exercise-remove-btn"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {ex.sets.map((set, setIdx) => (
              <div key={setIdx} className="set-row">
                <span className="set-label">Set {setIdx + 1}</span>
                <input
                  type="number"
                  min="0"
                  value={set.reps}
                  onChange={(e) =>
                    updateSet(exIdx, setIdx, "reps", e.target.value)
                  }
                  placeholder="Reps"
                  className="set-input"
                />
                <input
                  type="number"
                  min="0"
                  value={set.weight_kg}
                  onChange={(e) =>
                    updateSet(exIdx, setIdx, "weight_kg", e.target.value)
                  }
                  placeholder="kg"
                  className="set-input"
                />
                {ex.sets.length > 1 && (
                  <button
                    onClick={() => removeSet(exIdx, setIdx)}
                    className="set-remove-btn"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            <button onClick={() => addSet(exIdx)} className="add-set-btn">
              + Add set
            </button>
          </div>
        ))}

        <button onClick={addExercise} className="add-exercise-btn">
          + Add exercise
        </button>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes..."
          rows={2}
          className="workout-notes-textarea"
        />

        <div className="workout-logger-actions">
          <button className="btn" onClick={handleUpdate} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button className="btn btn-outline" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workout-logger">
      <h3 className="workout-logger-title">Log Your Workout</h3>
      <p className="workout-logger-subtitle">
        Fill in what you actually did today.
      </p>

      {exercises.map((ex, exIdx) => (
        <div key={exIdx} className="exercise-card">
          <div className="exercise-header">
            <input
              value={ex.name}
              onChange={(e) => updateExercise(exIdx, e.target.value)}
              placeholder="Exercise name"
              className="exercise-input"
            />
            <button
              onClick={() => removeExercise(exIdx)}
              className="exercise-remove-btn"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {ex.sets.map((set, setIdx) => (
            <div key={setIdx} className="set-row">
              <span className="set-label">Set {setIdx + 1}</span>
              <input
                type="number"
                min="0"
                value={set.reps}
                onChange={(e) =>
                  updateSet(exIdx, setIdx, "reps", e.target.value)
                }
                placeholder="Reps"
                className="set-input"
              />
              <input
                type="number"
                min="0"
                value={set.weight_kg}
                onChange={(e) =>
                  updateSet(exIdx, setIdx, "weight_kg", e.target.value)
                }
                placeholder="kg"
                className="set-input"
              />
              {ex.sets.length > 1 && (
                <button
                  onClick={() => removeSet(exIdx, setIdx)}
                  className="set-remove-btn"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <button onClick={() => addSet(exIdx)} className="add-set-btn">
            + Add set
          </button>
        </div>
      ))}

      <button onClick={addExercise} className="add-exercise-btn">
        + Add exercise
      </button>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (e.g. felt strong, shoulder pain...)"
        rows={2}
        className="workout-notes-textarea"
      />

      <button
        onClick={handleSave}
        disabled={saving}
        className="btn workout-save-btn"
      >
        {saving ? "Saving..." : "Log Workout"}
      </button>
    </div>
  );
}
