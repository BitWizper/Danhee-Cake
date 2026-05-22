import './Button.css';

const Button = ({ children, variant = 'gold', size = 'md', onClick, type = 'button', disabled, fullWidth, id }) => {
  return (
    <button
      id={id}
      type={type}
      className={`btn btn--${variant} btn--${size} ${fullWidth ? 'btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
