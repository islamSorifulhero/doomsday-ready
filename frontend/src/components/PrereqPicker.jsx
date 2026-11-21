export default function PrereqPicker({ movies, selected, onChange, excludeId }) {
  const options = movies.filter((m) => m.id !== excludeId);
  if (options.length === 0) return <p className="muted">Add another movie to link prerequisites.</p>;

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <fieldset className="picker">
      <legend>Watch these first</legend>
      {options.map((m) => (
        <label key={m.id} className="check">
          <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
          {m.title}
        </label>
      ))}
    </fieldset>
  );
}
