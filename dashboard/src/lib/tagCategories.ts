/**
 * Groups the shared tag vocabulary into themed categories for the tag
 * picker, purely a display concern — the `tags` table itself has no
 * category column. Any tag not in `CATEGORY_MAP` (a user's own custom tag)
 * falls into the trailing "Custom" bucket automatically.
 */
export const TAG_CATEGORIES: { name: string; tags: string[] }[] = [
  {
    name: "Mood — positive",
    tags: [
      "grateful",
      "happy",
      "calm",
      "content",
      "hopeful",
      "excited",
      "motivated",
      "proud",
      "relieved",
      "confident",
      "optimistic",
      "inspired",
      "energetic",
    ],
  },
  {
    name: "Mood — negative",
    tags: [
      "anxious",
      "sad",
      "stressed",
      "angry",
      "overwhelmed",
      "lonely",
      "tired",
      "frustrated",
      "guilty",
      "disappointed",
      "insecure",
      "exhausted",
    ],
  },
  {
    name: "Activities",
    tags: [
      "exercise",
      "running",
      "yoga",
      "meditation",
      "reading",
      "cooking",
      "gardening",
      "gaming",
      "music",
      "art",
      "writing",
      "traveling",
      "hiking",
      "self-care",
      "journaling",
    ],
  },
  {
    name: "People & relationships",
    tags: [
      "family",
      "friends",
      "relationship",
      "date night",
      "party",
      "conflict",
      "alone time",
      "socializing",
    ],
  },
  {
    name: "Health",
    tags: [
      "sleep",
      "insomnia",
      "sick",
      "headache",
      "health",
      "therapy",
      "medication",
      "doctor appointment",
    ],
  },
  {
    name: "Work & life",
    tags: ["work", "school", "finances"],
  },
  {
    name: "Time & occasions",
    tags: ["morning", "weekend", "holiday", "birthday", "vacation", "milestone"],
  },
  {
    name: "How the day went",
    tags: ["good day", "bad day", "productive", "lazy day", "breakthrough", "setback"],
  },
  {
    name: "Growth & reflection",
    tags: ["gratitude", "reflection", "achievement", "nostalgic"],
  },
];

const CUSTOM_CATEGORY = "Custom";

/**
 * Buckets `allTags` (the full shared vocabulary) into `TAG_CATEGORIES`,
 * appending a trailing "Custom" category for anything not in the map —
 * always shown last, and omitted entirely if empty.
 */
export function categorizeTags(allTags: string[]): { name: string; tags: string[] }[] {
  const categorized = new Set<string>();
  const categories = TAG_CATEGORIES.map(({ name, tags }) => {
    const present = tags.filter((tag) => allTags.includes(tag));
    for (const tag of present) categorized.add(tag);
    return { name, tags: present };
  }).filter((category) => category.tags.length > 0);

  const custom = allTags.filter((tag) => !categorized.has(tag));
  if (custom.length > 0) categories.push({ name: CUSTOM_CATEGORY, tags: custom });

  return categories;
}
