import './StarRating.css';

const StarRating = ({ rating = 0, max = 5, size = 'md' }) => {
  return (
    <div className={`star-rating star-rating--${size}`} aria-label={`${rating} de ${max} estrellas`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i + 1 <= Math.floor(rating);
        const partial = !filled && i < rating;
        return (
          <span key={i} className={`star ${filled ? 'star--filled' : partial ? 'star--partial' : 'star--empty'}`}>
            ★
          </span>
        );
      })}
      <span className="star-rating__value">{rating.toFixed(1)}</span>
    </div>
  );
};

export default StarRating;
