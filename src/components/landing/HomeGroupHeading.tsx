export function HomeGroupHeading({ id, label, title, description }: { id: string; label: string; title: string; description: string }) {
  return <header className="home-group-heading">
    <div><p className="house-eyebrow">{label}</p><h2 id={id}>{title}</h2></div>
    <p className="home-group-description">{description}</p>
  </header>;
}
