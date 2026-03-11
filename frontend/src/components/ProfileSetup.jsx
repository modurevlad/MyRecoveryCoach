import { useState } from "react";

export default function ProfileSetup({
  onComplete,
  onCancel,
  existingProfile,
}) {
  const [form, setForm] = useState({
    age: existingProfile?.age ?? "",
    weight_kg: existingProfile?.weight_kg ?? "",
    height_cm: existingProfile?.height_cm ?? "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.age || form.age < 10 || form.age > 100)
      e.age = "Enter a valid age";
    if (!form.weight_kg || form.weight_kg < 30 || form.weight_kg > 300)
      e.weight_kg = "Enter a valid weight";
    if (!form.height_cm || form.height_cm < 100 || form.height_cm > 250)
      e.height_cm = "Enter a valid height";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setIsLoading(true);
    await fetch("/api/profile", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setIsLoading(false);
    onComplete(form);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: null }));
  };

  return (
    <div className="profile-page">
      <h2 className="profile-heading">
        {existingProfile ? "Edit Profile" : "Complete Your Profile"}
      </h2>
      <p className="profile-subtext">
        This helps us personalize your plans more accurately.
      </p>

      <div className="profile-form">
        <div className="form-field">
          <label className="form-label">Age</label>
          <input
            className="form-input"
            type="number"
            value={form.age}
            onChange={(e) => handleChange("age", e.target.value)}
            placeholder="Years"
          />
          {errors.age && <small className="form-error">{errors.age}</small>}
        </div>

        <div className="form-field">
          <label className="form-label">Weight (kg)</label>
          <input
            className="form-input"
            type="number"
            value={form.weight_kg}
            onChange={(e) => handleChange("weight_kg", e.target.value)}
            placeholder="kg"
          />
          {errors.weight_kg && (
            <small className="form-error">{errors.weight_kg}</small>
          )}
        </div>

        <div className="form-field">
          <label className="form-label">Height (cm)</label>
          <input
            className="form-input"
            type="number"
            value={form.height_cm}
            onChange={(e) => handleChange("height_cm", e.target.value)}
            placeholder="cm"
          />
          {errors.height_cm && (
            <small className="form-error">{errors.height_cm}</small>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {onCancel && (
            <button className="btn btn-outline" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button className="btn" onClick={handleSubmit} disabled={isLoading}>
            {isLoading
              ? "Saving..."
              : existingProfile
              ? "Save Changes"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
