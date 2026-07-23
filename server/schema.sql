-- ============================================================
--  DANHEE – Schema completo MySQL (Clever Cloud)
--  Ejecutar en MySQL Workbench conectado a Clever Cloud
-- ============================================================

USE bvtdjsmypbwpngczasgf;

-- ── Usuarios ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(150)  NOT NULL,
  email        VARCHAR(150)  UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role         ENUM('cliente','repostero') DEFAULT 'cliente',
  address      VARCHAR(255)  DEFAULT NULL,
  phone        VARCHAR(20)   DEFAULT NULL,
  avatar_url   VARCHAR(500)  DEFAULT NULL,
  is_active    TINYINT(1)    DEFAULT 1,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ── Perfiles de repostero ────────────────────────────────────
CREATE TABLE IF NOT EXISTS baker_profiles (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNIQUE NOT NULL,
  business_name VARCHAR(150)  NOT NULL,
  location      VARCHAR(150)  DEFAULT NULL,
  specialty     VARCHAR(255)  DEFAULT NULL,
  bio           TEXT          DEFAULT NULL,
  portfolio_url VARCHAR(500)  DEFAULT NULL,
  business_hours VARCHAR(255) DEFAULT NULL,
  is_verified   TINYINT(1)    DEFAULT 0,
  rating_avg    DECIMAL(3,2)  DEFAULT 0.00,
  total_reviews INT           DEFAULT 0,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── Categorías ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  icon        VARCHAR(10)  NOT NULL,
  description TEXT         DEFAULT NULL,
  is_active   TINYINT(1)   DEFAULT 1,
  sort_order  INT          DEFAULT 0
);

-- ── Pasteles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cakes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  baker_id      INT          NOT NULL,
  category_id   INT          DEFAULT NULL,
  name          VARCHAR(150) NOT NULL,
  description   TEXT         DEFAULT NULL,
  price         DECIMAL(10,2) DEFAULT 0.00,
  rating        DECIMAL(3,2)  DEFAULT 0.00,
  reviews_count INT           DEFAULT 0,
  image_url     VARCHAR(500)  DEFAULT NULL,
  is_featured   TINYINT(1)    DEFAULT 0,
  created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (baker_id)    REFERENCES baker_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ── Citas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  client_id  INT  NOT NULL,
  baker_id   INT  NOT NULL,
  date       DATE NOT NULL,
  time_slot  TIME NOT NULL,
  notes      TEXT DEFAULT NULL,
  status     ENUM('pending','confirmed','cancelled','completed') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (baker_id)  REFERENCES baker_profiles(id) ON DELETE CASCADE
);

-- ── Reseñas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  client_id  INT          NOT NULL,
  baker_id   INT          NOT NULL,
  rating     DECIMAL(3,1) NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT         DEFAULT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (baker_id)  REFERENCES baker_profiles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_review (client_id, baker_id)
);

-- ── Diseños personalizados ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cake_designs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  client_id   INT          NOT NULL,
  sponge      VARCHAR(50)  DEFAULT 'vanilla',
  filling     VARCHAR(50)  DEFAULT 'cream',
  decoration  VARCHAR(50)  DEFAULT 'flowers',
  size        ENUM('sm','md','lg') DEFAULT 'md',
  notes       TEXT         DEFAULT NULL,
  status      ENUM('draft','sent','accepted') DEFAULT 'draft',
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
--  SEED – Categorías (datos iniciales)
-- ============================================================
-- ── Memoria del Chatbot ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
  conversation_id VARCHAR(50) PRIMARY KEY,
  client_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES chat_sessions(conversation_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO categories (name, slug, icon, description, sort_order) VALUES
('XV Años',     'xv-anos',      '👑', 'Pasteles elegantes y memorables para la gran celebración de quince años',         1),
('Boda',        'boda',         '💍', 'Pasteles nupciales de lujo, diseñados para el día más especial de tu vida',        2),
('Baby Shower', 'baby-shower',  '🍼', 'Diseños tiernos y coloridos para dar la bienvenida a un nuevo integrante',         3),
('Cumpleaños',  'cumpleanos',   '🎂', 'Pasteles totalmente personalizados para celebrar un año más de vida',               4),
('Aniversario', 'aniversario',  '💑', 'Celebra el amor con pasteles románticos y sofisticados',                           5),
('Graduación',  'graduacion',   '🎓', 'El logro merece un pastel tan especial como tú',                                   6),
('Corporativo', 'corporativo',  '🏢', 'Pasteles profesionales para eventos y celebraciones empresariales',                 7),
('Sin Ocasión', 'sin-ocasion',  '✨', 'Porque cualquier día es una buena razón para disfrutar un pastel único',            8);
