import { useEffect, useState } from "react";
import { api, type Profile as ProfileData, type UpsertProfileInput } from "../lib/api";
import { LoadingScreen } from "../components/LoadingScreen";

const PRONOUN_OPTIONS = ["she/her", "he/him", "they/them", "other"];

const SINGLE_SELECT_SECTIONS: {
  key: "work" | "work_rhythm" | "diet";
  title: string;
  hint: string;
  options: string[];
}[] = [
  {
    key: "work",
    title: "Work",
    hint: "What kind of work fills your days?",
    options: [
      "Creative",
      "Tech",
      "Healthcare",
      "Education",
      "Service",
      "Student",
      "Trades",
      "Other",
    ],
  },
  {
    key: "work_rhythm",
    title: "Daily rhythm",
    hint: "The shape of a typical working day.",
    options: ["Standard 9–5", "Shift work", "Flexible", "Night owl", "Freelance"],
  },
  {
    key: "diet",
    title: "Diet",
    hint: "How you tend to eat.",
    options: [
      "No restrictions",
      "Vegetarian",
      "Vegan",
      "Pescatarian",
      "Low-carb",
      "Gluten-free",
    ],
  },
];

const MULTI_SELECT_SECTIONS: {
  key: "exercise" | "hobbies";
  title: string;
  hint: string;
  options: string[];
}[] = [
  {
    key: "exercise",
    title: "Movement",
    hint: "How you like to move — pick any that fit.",
    options: [
      "Running",
      "Walking",
      "Yoga",
      "Cycling",
      "Strength",
      "Swimming",
      "Dance",
      "Climbing",
      "Team sports",
    ],
  },
  {
    key: "hobbies",
    title: "Hobbies & interests",
    hint: "What you reach for in your free time.",
    options: [
      "Reading",
      "Photography",
      "Cooking",
      "Music",
      "Gaming",
      "Gardening",
      "Writing",
      "Art",
      "Travel",
      "Crafts",
    ],
  },
];

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-sm transition"
      style={{
        background: active ? "var(--accent)" : "var(--surface)",
        borderColor: active ? "var(--accent)" : "var(--border-3)",
        color: active ? "var(--on-accent)" : "var(--ink-soft)",
      }}
    >
      {label}
    </button>
  );
}

export function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        setProfile(p);
        setName(p?.name ?? "");
        setAge(p?.age ?? "");
        setNote(p?.note ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(input: UpsertProfileInput): Promise<void> {
    const updated = await api.upsertProfile(input);
    setProfile(updated);
  }

  function toggleMulti(key: "exercise" | "hobbies", value: string): void {
    const current = profile?.[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    void save({ [key]: next });
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase();

  if (loading) return <LoadingScreen />;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 font-heading text-2xl font-semibold text-ink">Profile</h1>
      <p className="mb-6 text-sm text-muted">
        A little context helps Orium notice more meaningful patterns.
      </p>

      <div className="mb-6 rounded-2xl border border-border-1 bg-surface p-6">
        <div className="mb-5 flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full font-heading text-xl font-bold text-on-accent"
            style={{ background: "var(--accent)" }}
          >
            {initial}
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void save({ name })}
              className="w-full rounded-lg border border-border-2 bg-field px-3 py-1.5 text-ink outline-none focus:border-accent"
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs text-muted">Age</label>
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              onBlur={() => void save({ age })}
              className="w-full rounded-lg border border-border-2 bg-field px-3 py-1.5 text-ink outline-none focus:border-accent"
            />
          </div>
        </div>

        <p className="mb-2 text-xs text-muted">Pronouns</p>
        <div className="flex flex-wrap gap-2">
          {PRONOUN_OPTIONS.map((option) => (
            <Chip
              key={option}
              label={option}
              active={profile?.pronouns === option}
              onClick={() => void save({ pronouns: option })}
            />
          ))}
        </div>
      </div>

      {SINGLE_SELECT_SECTIONS.map((section) => (
        <div
          key={section.key}
          className="mb-6 rounded-2xl border border-border-1 bg-surface p-6"
        >
          <p className="font-heading font-semibold text-ink">{section.title}</p>
          <p className="mb-3 text-sm text-muted">{section.hint}</p>
          <div className="flex flex-wrap gap-2">
            {section.options.map((option) => (
              <Chip
                key={option}
                label={option}
                active={profile?.[section.key] === option}
                onClick={() => void save({ [section.key]: option })}
              />
            ))}
          </div>
        </div>
      ))}

      {MULTI_SELECT_SECTIONS.map((section) => (
        <div
          key={section.key}
          className="mb-6 rounded-2xl border border-border-1 bg-surface p-6"
        >
          <p className="font-heading font-semibold text-ink">{section.title}</p>
          <p className="mb-3 text-sm text-muted">{section.hint}</p>
          <div className="flex flex-wrap gap-2">
            {section.options.map((option) => (
              <Chip
                key={option}
                label={option}
                active={(profile?.[section.key] ?? []).includes(option)}
                onClick={() => toggleMulti(section.key, option)}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mb-6 rounded-2xl border border-border-1 bg-surface p-6">
        <p className="mb-2 font-heading font-semibold text-ink">Anything else</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void save({ note })}
          rows={4}
          className="w-full rounded-lg border border-border-2 bg-field px-3 py-2 text-ink outline-none focus:border-accent"
        />
      </div>

      <p className="text-xs text-faint">
        This information is private to your account and only used to help Orium surface
        more relevant patterns for you.
      </p>
    </div>
  );
}
