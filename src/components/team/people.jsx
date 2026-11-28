// Small shared bits for the Team gallery tiles and profile pages.

export function initialsOf(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export function roleLabel(person) {
  if (person.role === 'admin') return 'Owner';
  if (person.role === 'manager') return person.is_coach === false ? 'Office admin' : 'Manager';
  return person.is_coach === false ? 'Staff' : 'Coach';
}

export function PersonAvatar({ person, size = 'h-14 w-14 text-lg' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border-4 border-white bg-gray-900 font-semibold text-white shadow-sm ${size}`}>
      {initialsOf(person.full_name)}
    </span>
  );
}
