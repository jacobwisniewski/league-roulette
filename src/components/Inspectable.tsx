import styles from "./Inspectable.module.css";

interface InspectableProps {
  image: string;
  name: string;
  meta?: string;
  description: string;
  compact?: boolean;
}

export function Inspectable({ image, name, meta, description, compact = false }: InspectableProps) {
  return (
    <div
      className={`${styles.root} ${compact ? styles.compact : ""}`}
      tabIndex={0}
      aria-label={`${name}. ${description}`}
    >
      <img crossOrigin="anonymous" src={image} alt="" />
      {!compact && <span className={styles.name}>{name}</span>}
      <div className={styles.tooltip} role="tooltip">
        <div className={styles.head}>
          <img crossOrigin="anonymous" src={image} alt="" />
          <div>
            <strong>{name}</strong>
            {meta && <small>{meta}</small>}
          </div>
        </div>
        <p>{description}</p>
      </div>
    </div>
  );
}
